#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_MANUAL_ROOT="${RTS_ADMIN_MANUAL_ROOT:-${HOME}/Admin-Manual}"
ADMIN_ENV_FILE="${RTS_ADMIN_ENV_FILE:-${ADMIN_MANUAL_ROOT}/CREDENTIALS/RTS-LANDING-WEB/dot-env}"

# The official ACE-Step Space is the upstream container source. Model weights
# remain on the Hub and are fetched by the Space during its own build/startup.
SOURCE_SPACE="${HF_SOURCE_SPACE:-ACE-Step/Ace-Step-v1.5}"
TARGET_SPACE="${HF_SPACE_ID:-RobinsAIWorld/rts-music-lab}"
SPACE_HARDWARE="${HF_SPACE_HARDWARE:-zero-a10g}"

if [[ -r "$ADMIN_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ADMIN_ENV_FILE"
  set +a

  # Allow canonical Admin-Manual values to override script defaults.
  SOURCE_SPACE="${HF_SOURCE_SPACE:-$SOURCE_SPACE}"
  TARGET_SPACE="${HF_SPACE_ID:-$TARGET_SPACE}"
  SPACE_HARDWARE="${HF_SPACE_HARDWARE:-$SPACE_HARDWARE}"
fi

if ! command -v hf >/dev/null 2>&1; then
  printf 'The Hugging Face CLI is required. Install it with:\n' >&2
  printf '  curl -LsSf https://hf.co/cli/install.sh | bash\n' >&2
  exit 1
fi

printf 'Hugging Face CLI: '
hf version
printf 'Authenticated identity:\n'
hf auth whoami

# huggingface_hub renamed this option across CLI generations. Prefer the
# spelling exposed by the installed CLI so the script works on old and new
# operator workstations.
download_type_args=(--type space)
create_type_args=(--type space)
upload_type_args=(--type space)
if hf download --help 2>&1 | grep -q -- '--repo-type'; then
  download_type_args=(--repo-type space)
fi
if hf repos create --help 2>&1 | grep -q -- '--repo-type'; then
  create_type_args=(--repo-type space)
fi
if hf upload --help 2>&1 | grep -q -- '--repo-type'; then
  upload_type_args=(--repo-type space)
fi

work_dir="$(mktemp -d /tmp/rts-hf-space.XXXXXX)"
cleanup() {
  if [[ "$work_dir" == /tmp/rts-hf-space.* && -d "$work_dir" ]]; then
    rm -rf "$work_dir"
  fi
}
trap cleanup EXIT

printf '\n[1/5] Downloading public Space source: %s\n' "$SOURCE_SPACE"
hf download "$SOURCE_SPACE" "${download_type_args[@]}" --local-dir "$work_dir/source"

printf '\n[2/5] Creating or reusing public Space: %s\n' "$TARGET_SPACE"
hf repos create "$TARGET_SPACE" "${create_type_args[@]}" --space-sdk gradio --exist-ok

printf '\n[3/5] Uploading Space source\n'
hf upload "$TARGET_SPACE" "$work_dir/source" . \
  "${upload_type_args[@]}" \
  --commit-message "Sync ACE-Step Space for ReadThisSheet music lab"

printf '\n[4/5] Requesting Space hardware: %s\n' "$SPACE_HARDWARE"
if ! hf spaces settings "$TARGET_SPACE" --hardware "$SPACE_HARDWARE"; then
  printf '\nThe Space source was uploaded, but hardware assignment failed.\n' >&2
  printf 'ZeroGPU requires Hugging Face PRO for personal accounts or Team/Enterprise for organizations.\n' >&2
  printf 'Inspect available choices with: hf spaces hardware\n' >&2
  printf 'Then retry with: HF_SPACE_HARDWARE=<flavor> %s\n' "$0" >&2
  exit 2
fi

printf '\n[5/5] Inspecting deployed Space\n'
hf spaces info "$TARGET_SPACE"

space_slug="$(printf '%s' "$TARGET_SPACE" | tr '[:upper:]/_' '[:lower:]--')"
space_url="https://${space_slug}.hf.space"

printf '\nSpace deployment submitted successfully.\n'
printf 'Hub:     https://huggingface.co/spaces/%s\n' "$TARGET_SPACE"
printf 'Runtime: %s\n' "$space_url"
printf '\nRecord this public value in %s:\n' "$ADMIN_ENV_FILE"
printf 'VITE_HF_SPACE_URL=%s\n' "$space_url"
printf '\nThen rebuild/deploy the landing page with ./deploy.sh.\n'
