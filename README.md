# ReadThisSheet! landing page

A responsive, audibly interactive product/marketing site for ReadThisSheet!, kept deliberately separate from the Android/Rust product build.

## What is included

- Source-grounded positioning derived from `DOCS/PRD.md` and `DOCS/ARCHITECTURE.md`.
- Cinematic score/Paper Lens simulation with synthesized Web Audio cadence (no licensed recording asset).
- Optional, lazy-loaded Hugging Face Space music lab using the MIT-licensed ACE-Step 1.5 model.
- Proposed launch offers clearly labelled as hypotheses.
- RevenueCat Web Billing integration via `@revenuecat/purchases-js`.
- Anonymous RevenueCat identity support and post-purchase Redemption Link awareness.
- Entitlement check and configurable entitled-download handoff.
- SoftwareApplication, Offer, and FAQ structured data; canonical/OG metadata; `robots.txt`, `sitemap.xml`, and `llms.txt`.
- Vercel, Netlify, and nginx-ui/PCT 123 configurations.
- One interactive deployment script for multi-target publishing.

## Local development

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
npm run preview
```

## RevenueCat setup

1. Copy `.env.example` to `.env.local`.
2. In RevenueCat, configure RevenueCat Billing, Stripe Billing, or Paddle Billing for Web.
3. Create the products, entitlement, offering, and packages.
4. Put the **public Web Billing API key** in `VITE_REVENUECAT_API_KEY`. Never put a RevenueCat secret API key in a `VITE_` variable.
5. Match `VITE_REVENUECAT_ENTITLEMENT` to the entitlement identifier.
6. Optionally set the offering/package IDs. Otherwise the current offering is used.
7. If purchases are anonymous, enable RevenueCat Redemption Links in the dashboard and handle the returned redemption step in the mobile app.
8. Start with RevenueCat Test Store, then provider sandbox, then production.

The fallback prices in HTML are proposed positioning only. When RevenueCat is configured, matching package prices replace them at runtime.

## Hugging Face music lab

The AI music lab is optional and separate from canonical score recognition and
analysis. It lazy-loads a public Gradio Space only after user interaction. The
default `VITE_HF_SPACE_URL` points to the official ACE-Step 1.5 Space; replace it
with `https://robinsaiworld-rts-music-lab.hf.space` after the dedicated Space is
created.

No Hugging Face token belongs in the browser bundle. Public ZeroGPU quotas and
cold starts apply. Prompts should request original material without artist
names, song titles, copyrighted lyrics, or imitation. Generated output remains
labelled as AI-generated and should be reviewed before commercial publication.

The ACE-Step 1.5 model card identifies the model license as MIT and describes
licensed, royalty-free/no-copyright, and synthetic training sources. That does
not make every generated output automatically risk-free or remove the need for
an originality review.

### Publish the dedicated Space

On a workstation with the authenticated `hf` CLI:

```bash
chmod +x deploy-hf-space.sh
./deploy-hf-space.sh
```

The idempotent script sources Admin-Manual when present, downloads the official
ACE-Step 1.5 Space repository, creates or reuses the public
`RobinsAIWorld/rts-music-lab` Gradio Space, uploads the Space source, requests
`zero-a10g`, and prints the final `VITE_HF_SPACE_URL`. It copies container
source—not model weights—so the weights remain managed by the Hub.

ZeroGPU hosting requires Hugging Face PRO for a personal account or a qualifying
organization plan. Override the target or hardware through Admin-Manual or the
process environment:

```bash
HF_SPACE_ID=RobinsAIWorld/rts-music-lab \
HF_SPACE_HARDWARE=zero-a10g \
./deploy-hf-space.sh
```

### Download security

Client-side entitlement checks improve UX but are not a secure file-delivery boundary. Do **not** place a paid APK, bundle, course, or score pack at a guessable public URL. `VITE_ENTITLED_DOWNLOAD_URL` should point to an expiring signed URL or to a server endpoint that independently verifies the RevenueCat entitlement using a server-side secret. The static nginx path can still host the landing page; secure delivery should be a separate API or protected object store.

## Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

The repository is intentionally public-safe: the deployer does not read a
repo-local production `.env`. On operator workstations it sources:

```text
~/Admin-Manual/CREDENTIALS/RTS-LANDING-WEB/dot-env
```

For a workstation with a non-standard checkout location:

```bash
RTS_ADMIN_MANUAL_ROOT=/path/to/Admin-Manual ./deploy.sh
```

The deployer builds locally after loading that file. It uploads only generated
static output: `.vercel/output/` to Vercel, `dist/` to Netlify, or the `dist/`
archive to PCT 123. The Admin-Manual checkout is never sent as deployment
source.

Without `gum`, the script presents:

```text
[ ] 1. Vercel
[ ] 2. Netlify
[ ] 3. Self-hosted nginx-ui (PCT 123)
```

Enter any combination such as `1 2 3`. It builds once, then deploys the same `dist/` artifact to every selected target.

### Admin-Manual variables

The canonical values live only in the Admin-Manual `dot-env` above. Production
builds require `VITE_REVENUECAT_API_KEY`, `VITE_REVENUECAT_ENTITLEMENT`, and
`VITE_SITE_URL`. `VITE_HF_SPACE_URL` selects the public Space origin and is not
a credential.

Vercel selections require `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
`VERCEL_PROJECT_ID`. Netlify selections require `NETLIFY_AUTH_TOKEN` and
`NETLIFY_SITE_ID`. Optional RevenueCat/package and self-host variables remain
listed in `.env.example`. The deployer validates names without printing values.

### Self-hosted variables

- `RTS_PCT_ID` — defaults to `123`.
- `RTS_DOCROOT` — defaults to `/var/www/readthissheet`.
- `RTS_PROXMOX_HOST` — optional SSH target when the script is not running on the Proxmox host, e.g. `root@192.168.1.10`.

After staging, import or adapt `nginx/readthissheet.conf` in nginx-ui and configure the actual domain and TLS certificate.

## Search/answer-engine launch checklist

- Replace `https://readthissheet.robin.mba` in `index.html`, `robots.txt`, and `sitemap.xml` if the canonical domain changes.
- Add a real 1200×630 social preview image and `og:image`/`twitter:image` when brand artwork is final.
- Keep future capability wording and proposed offers labelled until their release gate clears.
- Submit the sitemap to Google Search Console and Bing Webmaster Tools after the production domain is live.
- Keep `llms.txt`, FAQ answers, structured data, and visible claims consistent.
