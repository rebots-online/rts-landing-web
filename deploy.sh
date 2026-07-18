#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

command_exists() { command -v "$1" >/dev/null 2>&1; }

ADMIN_MANUAL_ROOT="${RTS_ADMIN_MANUAL_ROOT:-${HOME}/Admin-Manual}"
ADMIN_ENV_FILE="${RTS_ADMIN_ENV_FILE:-${ADMIN_MANUAL_ROOT}/CREDENTIALS/RTS-LANDING-WEB/dot-env}"

load_admin_environment() {
  if [[ ! -r "$ADMIN_ENV_FILE" ]]; then
    printf 'Required Admin-Manual environment file is not readable: %s\n' "$ADMIN_ENV_FILE" >&2
    printf 'Set RTS_ADMIN_ENV_FILE only when this workstation uses a non-standard Admin-Manual location.\n' >&2
    return 1
  fi

  # Export the canonical private assignments to child processes without
  # copying the Admin-Manual file into this public repository.
  set -a
  # shellcheck disable=SC1090
  source "$ADMIN_ENV_FILE"
  set +a
}

require_environment() {
  local missing=0
  local key
  for key in "$@"; do
    if [[ -z "${!key:-}" ]]; then
      printf 'Missing required variable %s in %s\n' "$key" "$ADMIN_ENV_FILE" >&2
      missing=1
    fi
  done
  (( missing == 0 ))
}

choose_targets() {
  if command_exists gum; then
    gum choose --no-limit --header "Select one or more deployment targets" \
      "Vercel" "Netlify" "Self-hosted nginx-ui (PCT 123)"
    return
  fi

  printf '\nReadThisSheet! deployment targets\n\n' >&2
  printf '  [ ] 1. Vercel\n' >&2
  printf '  [ ] 2. Netlify\n' >&2
  printf '  [ ] 3. Self-hosted nginx-ui (PCT 123)\n\n' >&2
  read -r -p "Select one or more (example: 1 2 3): " selection
  for item in $selection; do
    case "$item" in
      1) printf '%s\n' "Vercel" ;;
      2) printf '%s\n' "Netlify" ;;
      3) printf '%s\n' "Self-hosted nginx-ui (PCT 123)" ;;
      *) printf 'Ignoring unknown selection: %s\n' "$item" >&2 ;;
    esac
  done
}

read -r -p "Production deployment? [y/N]: " production_answer
if [[ "$production_answer" =~ ^[Yy]$ ]]; then
  PRODUCTION=true
else
  PRODUCTION=false
fi

mapfile -t TARGETS < <(choose_targets)
if (( ${#TARGETS[@]} == 0 )); then
  printf 'No targets selected. Nothing deployed.\n'
  exit 0
fi

load_admin_environment

if $PRODUCTION; then
  require_environment VITE_REVENUECAT_API_KEY VITE_REVENUECAT_ENTITLEMENT VITE_SITE_URL
fi

for target in "${TARGETS[@]}"; do
  case "$target" in
    Vercel) require_environment VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID ;;
    Netlify) require_environment NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID ;;
  esac
done

printf '\nBuilding one immutable artifact for all selected targets…\n'
npm ci
npm run build

deploy_vercel() {
  printf '\n[X] Vercel\n'
  local args=(deploy --prebuilt --archive=tgz --yes)
  $PRODUCTION && args+=(--prod)

  # Adapt the already-built dist/ directory to Vercel Build Output API v3.
  # Vercel receives the same static artifact used by the other targets.
  local output_dir="$ROOT_DIR/.vercel/output"
  rm -rf "$output_dir"
  mkdir -p "$output_dir/static"
  cp -R dist/. "$output_dir/static/"
  printf '{"version":3}\n' > "$output_dir/config.json"

  npx vercel "${args[@]}"
}

deploy_netlify() {
  printf '\n[X] Netlify\n'
  local args=(netlify deploy --dir=dist)
  $PRODUCTION && args+=(--prod)
  npx "${args[@]}"
}

deploy_self_hosted() {
  printf '\n[X] Self-hosted nginx-ui (PCT 123)\n'
  local pct_id="${RTS_PCT_ID:-123}"
  local docroot="${RTS_DOCROOT:-/var/www/readthissheet}"
  local proxmox_host="${RTS_PROXMOX_HOST:-}"
  local archive
  archive="$(mktemp /tmp/readthissheet-dist.XXXXXX.tar.gz)"
  trap 'rm -f "$archive"' RETURN
  tar -C dist -czf "$archive" .

  if [[ -n "$proxmox_host" ]]; then
    local remote_archive="/tmp/readthissheet-dist-${RANDOM}.tar.gz"
    scp "$archive" "${proxmox_host}:${remote_archive}"
    ssh "$proxmox_host" "pct exec '$pct_id' -- mkdir -p '$docroot' && pct push '$pct_id' '$remote_archive' /tmp/readthissheet-dist.tar.gz && pct exec '$pct_id' -- tar -xzf /tmp/readthissheet-dist.tar.gz -C '$docroot' && pct exec '$pct_id' -- rm -f /tmp/readthissheet-dist.tar.gz && rm -f '$remote_archive'"
  elif command_exists pct; then
    pct exec "$pct_id" -- mkdir -p "$docroot"
    pct push "$pct_id" "$archive" /tmp/readthissheet-dist.tar.gz
    pct exec "$pct_id" -- tar -xzf /tmp/readthissheet-dist.tar.gz -C "$docroot"
    pct exec "$pct_id" -- rm -f /tmp/readthissheet-dist.tar.gz
  else
    printf 'pct is unavailable. Run this script on the Proxmox host or set RTS_PROXMOX_HOST (for example root@192.168.1.10).\n' >&2
    return 1
  fi

  printf 'Static files staged in PCT %s at %s. Import nginx/readthissheet.conf into nginx-ui and set the real domain/TLS certificate.\n' "$pct_id" "$docroot"
}

for target in "${TARGETS[@]}"; do
  case "$target" in
    Vercel) deploy_vercel ;;
    Netlify) deploy_netlify ;;
    "Self-hosted nginx-ui (PCT 123)") deploy_self_hosted ;;
  esac
done

printf '\nSelected deployments completed.\n'
