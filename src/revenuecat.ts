import type { Package } from "@revenuecat/purchases-js";

const apiKey = import.meta.env.VITE_REVENUECAT_API_KEY?.trim();
const entitlementId = import.meta.env.VITE_REVENUECAT_ENTITLEMENT?.trim() || "readthissheet_pro";
const offeringId = import.meta.env.VITE_REVENUECAT_OFFERING_ID?.trim();
const preferredPackageId = import.meta.env.VITE_REVENUECAT_PACKAGE_ID?.trim();
const explicitUserId = import.meta.env.VITE_REVENUECAT_APP_USER_ID?.trim();
const downloadUrl = import.meta.env.VITE_ENTITLED_DOWNLOAD_URL?.trim();

type PurchasesModule = typeof import("@revenuecat/purchases-js");
let sdkPromise: Promise<PurchasesModule> | undefined;
let loadedSdk: PurchasesModule | undefined;
let initialized = false;

export interface BillingState {
  configured: boolean;
  hasEntitlement: boolean;
  packages: Package[];
}

async function sdk(): Promise<PurchasesModule> {
  sdkPromise ??= import("@revenuecat/purchases-js").then((module) => {
    loadedSdk = module;
    return module;
  });
  return sdkPromise;
}

function browserAnonymousId(Purchases: PurchasesModule["Purchases"]): string {
  const key = "rts_rc_anonymous_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = Purchases.generateRevenueCatAnonymousAppUserId();
  localStorage.setItem(key, generated);
  return generated;
}

async function configure(): Promise<PurchasesModule | undefined> {
  if (!apiKey) return undefined;
  const module = await sdk();
  if (!initialized) {
    module.Purchases.configure({
      apiKey,
      appUserId: explicitUserId || browserAnonymousId(module.Purchases)
    });
    initialized = true;
  }
  return module;
}

export async function loadBilling(): Promise<BillingState> {
  const module = await configure();
  if (!module) return { configured: false, hasEntitlement: false, packages: [] };
  const purchases = module.Purchases.getSharedInstance();
  const [offerings, customerInfo] = await Promise.all([
    purchases.getOfferings(),
    purchases.getCustomerInfo()
  ]);
  const offering = (offeringId && offerings.all[offeringId]) || offerings.current;
  return {
    configured: true,
    hasEntitlement: entitlementId in customerInfo.entitlements.active,
    packages: offering?.availablePackages ?? []
  };
}

export function pickPackage(packages: Package[], requestedTier?: string): Package | undefined {
  if (preferredPackageId) {
    const preferred = packages.find((pkg) => pkg.identifier === preferredPackageId);
    if (preferred) return preferred;
  }
  if (requestedTier) {
    const tier = requestedTier.toLowerCase();
    const matched = packages.find((pkg) => pkg.identifier.toLowerCase().includes(tier));
    if (matched) return matched;
  }
  return packages[0];
}

export async function purchasePackage(pkg: Package, htmlTarget: HTMLElement) {
  const module = await configure();
  if (!module) throw new Error("RevenueCat is not configured.");
  return module.Purchases.getSharedInstance().purchase({ rcPackage: pkg, htmlTarget });
}

export async function presentCurrentPaywall(htmlTarget: HTMLElement) {
  const module = await configure();
  if (!module) throw new Error("RevenueCat is not configured.");
  return module.Purchases.getSharedInstance().presentPaywall({ htmlTarget });
}

export async function checkEntitlement(): Promise<boolean> {
  const module = await configure();
  if (!module) return false;
  const info = await module.Purchases.getSharedInstance().getCustomerInfo();
  return entitlementId in info.entitlements.active;
}

export function entitledDownloadUrl(): string | undefined { return downloadUrl; }

export function isCancellation(error: unknown): boolean {
  if (!loadedSdk) return false;
  return error instanceof loadedSdk.PurchasesError && error.errorCode === loadedSdk.ErrorCode.UserCancelledError;
}
