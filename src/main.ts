import "./style.css";
import {
  checkEntitlement,
  entitledDownloadUrl,
  isCancellation,
  loadBilling,
  pickPackage,
  presentCurrentPaywall,
  purchasePackage,
  type BillingState
} from "./revenuecat";

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];

const toast = $("#toast") as HTMLDivElement;
let toastTimer = 0;
function notify(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 4600);
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.13 });
$$<HTMLElement>(".reveal").forEach((element) => observer.observe(element));

const inspector = $("#inspectorCard") as HTMLDivElement;
$("[data-inspect='harmony']")?.addEventListener("click", () => inspector.classList.remove("hidden"));
inspector.querySelector("button")?.addEventListener("click", () => inspector.classList.add("hidden"));

let audioContext: AudioContext | undefined;
let audioEnabled = false;
let ambientTimer = 0;
const soundToggle = $("#soundToggle") as HTMLButtonElement;

function context(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

function tone(frequency: number, start: number, duration: number, volume = 0.035, type: OscillatorType = "sine") {
  const ctx = context();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + .025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .02);
}

function playCadence() {
  const ctx = context();
  const start = ctx.currentTime + .05;
  const progression = [
    [261.63, 329.63, 392],
    [174.61, 349.23, 440],
    [196, 246.94, 293.66, 349.23],
    [130.81, 261.63, 329.63, 392]
  ];
  progression.forEach((chord, index) => chord.forEach((note, voice) => {
    tone(note, start + index * .58 + voice * .012, .92, voice === 0 ? .022 : .012, voice === 0 ? "sine" : "triangle");
  }));
}

function scheduleAmbient() {
  window.clearTimeout(ambientTimer);
  if (!audioEnabled) return;
  playCadence();
  ambientTimer = window.setTimeout(scheduleAmbient, 9200);
}

async function toggleSound(forceOn = false) {
  audioEnabled = forceOn || !audioEnabled;
  soundToggle.setAttribute("aria-pressed", String(audioEnabled));
  const label = soundToggle.querySelector("span:last-child");
  if (label) label.textContent = audioEnabled ? "Sound on" : "Sound off";
  if (audioEnabled) {
    await context().resume();
    scheduleAmbient();
  } else {
    window.clearTimeout(ambientTimer);
  }
}
soundToggle.addEventListener("click", () => void toggleSound());
$("#demoTrigger")?.addEventListener("click", async () => {
  await toggleSound(true);
  playCadence();
  inspector.classList.remove("hidden");
  notify("Listen to the cadence, then inspect the evidence card on the score.");
});

const musicPrompt = $("#musicPrompt") as HTMLTextAreaElement;
const musicSpace = $("#musicSpace") as HTMLIFrameElement;
const musicSpaceLaunch = $("#musicSpaceLaunch") as HTMLButtonElement;
const spacePlaceholder = $("#spacePlaceholder") as HTMLDivElement;
const spaceStatus = $("#spaceStage .space-chrome small") as HTMLElement;

$$<HTMLButtonElement>("[data-music-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    musicPrompt.value = button.dataset.musicPrompt || "";
    musicPrompt.focus();
  });
});

async function copyMusicPrompt() {
  try {
    await navigator.clipboard.writeText(musicPrompt.value.trim());
    return true;
  } catch {
    musicPrompt.select();
    return document.execCommand("copy");
  }
}

musicSpaceLaunch.addEventListener("click", async () => {
  if (!musicPrompt.value.trim()) {
    notify("Give the model a short musical direction first.");
    musicPrompt.focus();
    return;
  }

  const copied = await copyMusicPrompt();
  if (!musicSpace.src) {
    const configuredSpace = import.meta.env.VITE_HF_SPACE_URL?.trim();
    const source = configuredSpace || musicSpace.dataset.src || "";
    musicSpace.src = source.includes("?") ? source : `${source}?__theme=dark`;
    musicSpace.hidden = false;
    spacePlaceholder.hidden = true;
    spaceStatus.textContent = "RTS MUSIC LAB · SPACE LOADING";
    musicSpace.addEventListener("load", () => {
      spaceStatus.textContent = "RTS MUSIC LAB · SPACE CONNECTED";
    }, { once: true });
  }

  musicSpace.scrollIntoView({ behavior: "smooth", block: "center" });
  musicSpaceLaunch.innerHTML = "Composer open <span>↗</span>";
  notify(copied
    ? "Prompt copied. Paste it into the composer, then generate an original miniature."
    : "Composer opened. Paste your direction into the Space to generate a miniature.");
});

const purchaseModal = $("#purchaseModal") as HTMLDivElement;
const paywallContainer = $("#paywall-container") as HTMLDivElement;
const fallback = $(".purchase-fallback") as HTMLDivElement;
purchaseModal.querySelector(".modal-close")?.addEventListener("click", () => {
  purchaseModal.hidden = true;
  paywallContainer.replaceChildren();
});
purchaseModal.addEventListener("click", (event) => {
  if (event.target === purchaseModal) purchaseModal.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") purchaseModal.hidden = true;
});

let billing: BillingState = { configured: false, hasEntitlement: false, packages: [] };

function formatLivePrice() {
  billing.packages.forEach((pkg) => {
    const id = pkg.identifier.toLowerCase();
    const tier = id.includes("studio") ? "studio" : id.includes("soloist") ? "soloist" : undefined;
    if (!tier) return;
    const price = document.querySelector(`[data-price-for="${tier}"] b`);
    const product = pkg.webBillingProduct;
    if (price && product.currentPrice?.formattedPrice) price.textContent = product.currentPrice.formattedPrice;
  });
}

async function completeEntitledDownload() {
  const entitled = await checkEntitlement();
  if (!entitled) {
    notify("No active ReadThisSheet entitlement was found for this browser identity.");
    return;
  }
  const url = entitledDownloadUrl();
  if (!url) {
    notify("Access verified. Add VITE_ENTITLED_DOWNLOAD_URL to attach the signed release download.");
    return;
  }
  window.location.assign(url);
}

async function startPurchase(tier: string) {
  purchaseModal.hidden = false;
  paywallContainer.replaceChildren();
  fallback.hidden = billing.configured;
  if (!billing.configured) return;

  try {
    const pkg = pickPackage(billing.packages, tier);
    const result = pkg
      ? await purchasePackage(pkg, paywallContainer)
      : await presentCurrentPaywall(paywallContainer);
    if (result.redemptionInfo) {
      notify("Purchase complete. Continue with the RevenueCat redemption link to connect access to the app.");
    }
    billing.hasEntitlement = Object.keys(result.customerInfo.entitlements.active).length > 0;
    if (billing.hasEntitlement) await completeEntitledDownload();
  } catch (error) {
    if (!isCancellation(error)) notify("Checkout could not be completed. Please retry or join early access by email.");
  }
}

$$<HTMLButtonElement>(".purchase-button").forEach((button) => {
  button.addEventListener("click", () => void startPurchase(button.dataset.purchase || ""));
});
$(".entitlement-button")?.addEventListener("click", () => void completeEntitledDownload());

void loadBilling()
  .then((state) => {
    billing = state;
    formatLivePrice();
    if (state.hasEntitlement) {
      $$<HTMLButtonElement>(".purchase-button").forEach((button) => {
        button.textContent = "Download entitled release →";
        button.onclick = (event) => { event.preventDefault(); void completeEntitledDownload(); };
      });
    }
  })
  .catch(() => notify("Live offers are temporarily unavailable; the proposed offer cards remain visible."));
