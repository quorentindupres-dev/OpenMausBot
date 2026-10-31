#!/usr/bin/env bash
# ==============================================================================
# setup-agent-mac.sh — 1-Command Secondary Apple Silicon Mac Bootstrap
# ==============================================================================
# Turns a freshly reset Apple Silicon Mac into a dedicated 24/7 Agent Computer
# Host for OpenMausBot:
#   1. mac2-lume-vm (#1 Primary): 2–4 concurrent isolated macOS/Linux VMs via
#      Cua `lume` (Apple Virtualization.framework) at $0/hr, zero cursor fight.
#   2. mac2-shared (Direct Host): Paired with OpenMausBot `shared-computers`
#      for bare-metal Xcode / Metal GPU / terminal workloads.
# ==============================================================================
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LUME_PORT=7777
MACOS_BASE_VM="xlabs-macos-base"
LINUX_BASE_VM="xlabs-ubuntu-base"
MACOS_PULL_IMAGE="ghcr.io/trycua/macos-sequoia-cua:latest"
LINUX_PULL_IMAGE="ghcr.io/trycua/ubuntu-noble-cua:latest"

CUA_DRIVER_VERSION="0.28.2"
CUA_DRIVER_ARCHIVE="cua-driver-rs-${CUA_DRIVER_VERSION}-darwin-universal-binary.tar.gz"
CUA_DRIVER_URL="https://github.com/trycua/cua/releases/download/cua-driver-rs-v${CUA_DRIVER_VERSION}/${CUA_DRIVER_ARCHIVE}"
CUA_DRIVER_SHA256="386db225a3080714a0f9f935525e61efaf46709587ef8b94dd2df81aeb2f6daa"

LAUNCH_AGENT_LABEL="com.xlabs.agent-mac-host"
LAUNCH_AGENT_PLIST="${HOME}/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"
HOST_SUPERVISOR_BIN="${HOME}/.local/libexec/xlabs-agent-mac-host.sh"
LOG_DIR="${HOME}/Library/Logs/xlabs-agent-mac"
SSHD_DROPIN="/etc/ssh/sshd_config.d/90-xlabs-tailscale-only.conf"

DO_CHECK=false
DO_INSTALL=false
DO_INIT_VM_POOL=false
PAIR_URL=""
DRY_RUN=false

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [OPTIONS]

Bootstrap or verify a dedicated Apple Silicon Mac as an OpenMausBot Agent Computer Host.

Actions (combine one or more):
  --check                 Audit sleep guards, Tailscale, SSH, Lume, cua-driver, LaunchAgent & base VMs
  --install               Configure pmset sleep guards, Tailscale SSH, Lume, cua-driver & LaunchAgent
  --init-vm-pool          Prepare golden base VMs (${MACOS_BASE_VM} & ${LINUX_BASE_VM}) for instant cloning
  --pair-url <url>        Pair this Mac with OpenMausBot shared-computers and print host config JSON

Options:
  --lume-port <port>      Local Lume HTTP daemon port on 127.0.0.1 (default: ${LUME_PORT})
  --macos-base <name>     Golden macOS base VM name (default: ${MACOS_BASE_VM})
  --linux-base <name>     Golden Linux base VM name (default: ${LINUX_BASE_VM})
  --dry-run               Print mutating commands without executing them
  -h, --help              Show this help screen and exit 0

Examples:
  # 1. Audit current host readiness (safe, read-only)
  ./scripts/${SCRIPT_NAME} --check

  # 2. Full 1-command bootstrap on Gregorio's reset 2nd Mac
  ./scripts/${SCRIPT_NAME} --install --init-vm-pool --pair-url "https://omb.tailnet.ts.net/pair/..."
EOF
}

log_info()  { printf '[INFO]  %s\n' "$*"; }
log_ok()    { printf '[OK]    %s\n' "$*"; }
log_warn()  { printf '[WARN]  %s\n' "$*"; }
log_err()   { printf '[ERROR] %s\n' "$*" >&2; }

run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '[DRY-RUN] %s\n' "$*"
    return 0
  fi
  "$@"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      DO_CHECK=true
      shift
      ;;
    --install)
      DO_INSTALL=true
      shift
      ;;
    --init-vm-pool)
      DO_INIT_VM_POOL=true
      shift
      ;;
    --pair-url)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        log_err "--pair-url requires a non-empty URL argument"
        exit 2
      fi
      PAIR_URL="$2"
      shift 2
      ;;
    --lume-port)
      if [[ $# -lt 2 || ! "${2:-}" =~ ^[0-9]+$ ]]; then
        log_err "--lume-port requires a valid TCP port (1024-65535)"
        exit 2
      fi
      LUME_PORT="$2"
      shift 2
      ;;
    --macos-base)
      MACOS_BASE_VM="${2:?--macos-base requires a VM name}"
      shift 2
      ;;
    --linux-base)
      LINUX_BASE_VM="${2:?--linux-base requires a VM name}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_err "Unknown flag: $1 (run with --help for usage)"
      exit 2
      ;;
  esac
done

if [[ "${DO_CHECK}" == "false" && "${DO_INSTALL}" == "false" && "${DO_INIT_VM_POOL}" == "false" && -z "${PAIR_URL}" ]]; then
  usage
  exit 0
fi

find_tailscale_bin() {
  if command -v tailscale >/dev/null 2>&1; then
    command -v tailscale
  elif [[ -x "/Applications/Tailscale.app/Contents/MacOS/Tailscale" ]]; then
    printf '%s\n' "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
  else
    return 1
  fi
}

get_tailscale_ipv4() {
  local ts_bin
  ts_bin="$(find_tailscale_bin 2>/dev/null || true)"
  if [[ -z "${ts_bin}" ]]; then
    return 1
  fi
  "${ts_bin}" ip -4 2>/dev/null | head -n 1 | tr -d '[:space:]'
}

get_tailscale_dns() {
  local ts_bin
  ts_bin="$(find_tailscale_bin 2>/dev/null || true)"
  if [[ -z "${ts_bin}" ]]; then
    return 1
  fi
  "${ts_bin}" status --json 2>/dev/null \
    | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("Self",{}).get("DNSName") or "").rstrip("."))' 2>/dev/null || true
}

find_cua_driver_bin() {
  for candidate in "/usr/local/bin/cua-driver" "${HOME}/.local/bin/cua-driver" "/Applications/CuaDriver.app/Contents/MacOS/cua-driver"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  if command -v cua-driver >/dev/null 2>&1; then
    command -v cua-driver
    return 0
  fi
  return 1
}

find_lume_bin() {
  for candidate in "/opt/homebrew/bin/lume" "/usr/local/bin/lume" "${HOME}/.local/bin/lume"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  if command -v lume >/dev/null 2>&1; then
    command -v lume
    return 0
  fi
  return 1
}

assert_apple_silicon() {
  local os_name arch_name
  os_name="$(uname -s)"
  arch_name="$(uname -m)"
  if [[ "${os_name}" != "Darwin" || "${arch_name}" != "arm64" ]]; then
    if [[ "${DRY_RUN}" == "true" ]]; then
      log_warn "Non-Apple-Silicon host (${os_name}/${arch_name}) allowed because --dry-run is active."
      return 0
    fi
    log_err "Apple Virtualization.framework (Lume) requires macOS on Apple Silicon (arm64); detected ${os_name}/${arch_name}."
    exit 1
  fi
}

configure_power_and_ssh() {
  log_info "Step 1/4: Configuring AC power sleep guards (pmset) & Tailscale-restricted SSH..."
  # Prevent system/disk sleep on AC power while allowing display to dim after 10 minutes.
  run_cmd sudo pmset -c sleep 0 disksleep 0 standby 0 autopoweroff 0 powernap 0 displaysleep 10 womp 1 autorestart 1

  local ts_ip=""
  ts_ip="$(get_tailscale_ipv4 || true)"
  if [[ -n "${ts_ip}" ]]; then
    log_info "Restricting sshd ListenAddress to Tailscale (${ts_ip}) and loopback (127.0.0.1)..."
    local dropin_content
    dropin_content="# Managed by OpenMausBot ${SCRIPT_NAME}
ListenAddress 127.0.0.1
ListenAddress ${ts_ip}
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
"
    if [[ "${DRY_RUN}" == "true" ]]; then
      printf '[DRY-RUN] write %s (ListenAddress %s + 127.0.0.1)\n' "${SSHD_DROPIN}" "${ts_ip}"
    else
      sudo mkdir -p "$(dirname "${SSHD_DROPIN}")"
      printf '%s' "${dropin_content}" | sudo tee "${SSHD_DROPIN}" >/dev/null
      sudo chmod 0644 "${SSHD_DROPIN}"
      sudo systemsetup -setremotelogin on >/dev/null 2>&1 || sudo launchctl load -w /System/Library/LaunchDaemons/ssh.plist >/dev/null 2>&1 || true
      sudo launchctl kickstart -k system/com.openssh.sshd >/dev/null 2>&1 || true
    fi
    log_ok "SSH restricted to Tailscale IP ${ts_ip} + 127.0.0.1."
  else
    log_warn "Tailscale IPv4 not yet assigned; skipped sshd ListenAddress lock until 'tailscale up' completes."
  fi
}

install_dependencies() {
  log_info "Step 2/4: Installing/verifying Homebrew, Tailscale, Cua Lume, and cua-driver ${CUA_DRIVER_VERSION}..."

  if ! command -v brew >/dev/null 2>&1 && [[ ! -x /opt/homebrew/bin/brew ]]; then
    log_err "Homebrew is missing. Install Homebrew first: https://brew.sh"
    if [[ "${DRY_RUN}" != "true" ]]; then
      exit 1
    fi
  fi
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi

  if ! find_tailscale_bin >/dev/null 2>&1; then
    log_info "Installing Tailscale via Homebrew..."
    run_cmd brew install --cask tailscale
  else
    log_ok "Tailscale binary present ($(find_tailscale_bin))."
  fi

  if ! find_lume_bin >/dev/null 2>&1; then
    log_info "Installing Cua Lume (trycua/lume)..."
    if ! run_cmd brew tap trycua/lume || ! run_cmd brew install trycua/lume/lume; then
      log_warn "Homebrew tap failed; falling back to official trycua Lume install script..."
      run_cmd /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/lume/scripts/install.sh)"
    fi
  else
    log_ok "Lume CLI present ($(find_lume_bin))."
  fi

  local existing_cua=""
  existing_cua="$(find_cua_driver_bin || true)"
  local current_ver=""
  if [[ -n "${existing_cua}" ]]; then
    current_ver="$("${existing_cua}" --version 2>/dev/null | awk '{print $2}' || true)"
  fi

  if [[ "${current_ver}" == "${CUA_DRIVER_VERSION}" ]]; then
    log_ok "cua-driver ${CUA_DRIVER_VERSION} already installed at ${existing_cua}."
  else
    log_info "Installing checksum-verified cua-driver ${CUA_DRIVER_VERSION}..."
    run_cmd mkdir -p "${HOME}/.local/bin"
    if [[ "${DRY_RUN}" == "true" ]]; then
      printf '[DRY-RUN] download %s (sha256=%s) -> %s/.local/bin/cua-driver\n' \
        "${CUA_DRIVER_URL}" "${CUA_DRIVER_SHA256}" "${HOME}"
    else
      local tmp_dir
      tmp_dir="$(mktemp -d)"
      trap 'rm -rf "${tmp_dir}"' EXIT
      curl -fsSL "${CUA_DRIVER_URL}" -o "${tmp_dir}/${CUA_DRIVER_ARCHIVE}"
      local actual_sha
      actual_sha="$(shasum -a 256 "${tmp_dir}/${CUA_DRIVER_ARCHIVE}" | awk '{print $1}')"
      if [[ "${actual_sha}" != "${CUA_DRIVER_SHA256}" ]]; then
        log_err "cua-driver SHA-256 mismatch! Expected ${CUA_DRIVER_SHA256}, got ${actual_sha}"
        exit 1
      fi
      /usr/bin/tar -xzf "${tmp_dir}/${CUA_DRIVER_ARCHIVE}" -C "${tmp_dir}" cua-driver
      install -m 0755 "${tmp_dir}/cua-driver" "${HOME}/.local/bin/cua-driver"
      if [[ -w "/usr/local/bin" ]]; then
        install -m 0755 "${tmp_dir}/cua-driver" "/usr/local/bin/cua-driver"
      fi
      rm -rf "${tmp_dir}"
      trap - EXIT
      log_ok "Installed cua-driver ${CUA_DRIVER_VERSION} to ${HOME}/.local/bin/cua-driver."
    fi
  fi
}

install_launch_agent() {
  log_info "Step 3/4: Installing LaunchAgent (${LAUNCH_AGENT_LABEL}) for Lume daemon on 127.0.0.1:${LUME_PORT}..."

  local lume_bin
  lume_bin="$(find_lume_bin || printf '%s' '/opt/homebrew/bin/lume')"

  run_cmd mkdir -p "$(dirname "${HOST_SUPERVISOR_BIN}")" "${HOME}/Library/LaunchAgents" "${LOG_DIR}"

  local supervisor_script="#!/usr/bin/env bash
set -euo pipefail
export PATH=\"/opt/homebrew/bin:/usr/local/bin:\${HOME}/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin\"
exec \"${lume_bin}\" serve --port ${LUME_PORT}
"

  local plist_xml="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${HOST_SUPERVISOR_BIN}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/lume-serve.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/lume-serve.err.log</string>
</dict>
</plist>
"

  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '[DRY-RUN] write %s and %s, then launchctl bootstrap gui/%s\n' \
      "${HOST_SUPERVISOR_BIN}" "${LAUNCH_AGENT_PLIST}" "$(id -u)"
  else
    printf '%s' "${supervisor_script}" > "${HOST_SUPERVISOR_BIN}"
    chmod 0755 "${HOST_SUPERVISOR_BIN}"
    printf '%s' "${plist_xml}" > "${LAUNCH_AGENT_PLIST}"
    chmod 0644 "${LAUNCH_AGENT_PLIST}"

    launchctl bootout "gui/$(id -u)/${LAUNCH_AGENT_LABEL}" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/$(id -u)" "${LAUNCH_AGENT_PLIST}"
    launchctl kickstart -k "gui/$(id -u)/${LAUNCH_AGENT_LABEL}" >/dev/null 2>&1 || true
  fi

  local ts_bin=""
  ts_bin="$(find_tailscale_bin || true)"
  if [[ -n "${ts_bin}" ]] && [[ -n "$(get_tailscale_ipv4 || true)" ]]; then
    log_info "Bridging 127.0.0.1:${LUME_PORT} exclusively onto Tailnet via 'tailscale serve'..."
    run_cmd "${ts_bin}" serve --bg --tcp "${LUME_PORT}" "tcp://127.0.0.1:${LUME_PORT}" || \
      log_warn "tailscale serve TCP bridge skipped (SSH tunnel transport remains ready on 127.0.0.1:${LUME_PORT})."
  fi

  log_ok "LaunchAgent ${LAUNCH_AGENT_LABEL} active (survives reboot, bound to 127.0.0.1:${LUME_PORT})."
}

init_vm_pool() {
  log_info "Step 4/4: Preparing Golden Base VM Templates (${MACOS_BASE_VM} & ${LINUX_BASE_VM})..."
  local lume_bin
  lume_bin="$(find_lume_bin || true)"
  if [[ -z "${lume_bin}" && "${DRY_RUN}" != "true" ]]; then
    log_err "lume CLI not found. Run with --install first."
    exit 1
  fi
  lume_bin="${lume_bin:-/opt/homebrew/bin/lume}"

  local existing_vms=""
  if [[ "${DRY_RUN}" != "true" ]]; then
    existing_vms="$("${lume_bin}" ls 2>/dev/null || true)"
  fi

  if grep -qE "(^|[[:space:]])${MACOS_BASE_VM}([[:space:]]|$)" <<<"${existing_vms}"; then
    log_ok "Golden macOS template '${MACOS_BASE_VM}' already exists."
  else
    log_info "Pulling prebuilt Cua macOS image into '${MACOS_BASE_VM}'..."
    if ! run_cmd "${lume_bin}" pull "${MACOS_PULL_IMAGE}" "${MACOS_BASE_VM}"; then
      log_warn "Prebuilt pull unavailable; creating unattended macOS IPSW base '${MACOS_BASE_VM}'..."
      run_cmd "${lume_bin}" create "${MACOS_BASE_VM}" --os macos --cpu 4 --memory 8GB --disk-size 50GB --ipsw latest
    fi
    run_cmd "${lume_bin}" stop "${MACOS_BASE_VM}" || true
    log_ok "Golden macOS template '${MACOS_BASE_VM}' ready for instant APFS copy-on-write cloning."
  fi

  if grep -qE "(^|[[:space:]])${LINUX_BASE_VM}([[:space:]]|$)" <<<"${existing_vms}"; then
    log_ok "Golden Linux template '${LINUX_BASE_VM}' already exists."
  else
    log_info "Pulling prebuilt Cua Ubuntu image into '${LINUX_BASE_VM}'..."
    if ! run_cmd "${lume_bin}" pull "${LINUX_PULL_IMAGE}" "${LINUX_BASE_VM}"; then
      log_warn "Prebuilt Linux pull unavailable; creating base Linux VM '${LINUX_BASE_VM}'..."
      run_cmd "${lume_bin}" create "${LINUX_BASE_VM}" --os linux --cpu 4 --memory 8GB --disk-size 40GB
    fi
    run_cmd "${lume_bin}" stop "${LINUX_BASE_VM}" || true
    log_ok "Golden Linux template '${LINUX_BASE_VM}' ready for instant APFS copy-on-write cloning."
  fi
}

pair_openmausbot() {
  local url="$1"
  log_info "Pairing this Mac with OpenMausBot shared-computers (${url})..."

  if [[ -f "${REPO_ROOT}/package.json" ]] && command -v pnpm >/dev/null 2>&1; then
    run_cmd pnpm --dir "${REPO_ROOT}" pair "${url}" || \
      log_warn "Interactive pairing prompt required; complete approval in OpenMausBot UI."
  elif [[ -d "/Applications/OpenMausBot.app" ]]; then
    run_cmd open -a "/Applications/OpenMausBot.app" "${url}"
  else
    log_warn "OpenMausBot.app or repo checkout not found on Mac #2; install OpenMausBot.app and open: ${url}"
  fi

  local ts_dns ts_host ts_ip user_name
  ts_dns="$(get_tailscale_dns || true)"
  ts_ip="$(get_tailscale_ipv4 || true)"
  ts_host="${ts_dns:-${ts_ip:-mac2.tailnet.ts.net}}"
  user_name="$(id -un)"

  cat <<EOF

================================================================================
Primary Mac Configuration (<DATA_DIR>/agent-computers.json -> "mac2")
================================================================================
{
  "enabled": true,
  "name": "$(scutil --get ComputerName 2>/dev/null || hostname -s)",
  "tailscaleHost": "${ts_host}",
  "sshUser": "${user_name}",
  "lumePort": ${LUME_PORT},
  "lumeTransport": "http",
  "maxConcurrentVms": 3,
  "maxMacOsVms": 2,
  "macosBaseImage": "${MACOS_BASE_VM}",
  "linuxBaseImage": "${LINUX_BASE_VM}",
  "snapshotOnLongTermStop": true
}
================================================================================
EOF
}

run_check() {
  log_info "Auditing Agent Computer Host readiness..."
  local issues=0

  local os_name arch_name
  os_name="$(uname -s)"
  arch_name="$(uname -m)"
  if [[ "${os_name}" == "Darwin" && "${arch_name}" == "arm64" ]]; then
    log_ok "Hardware: Apple Silicon (${os_name}/${arch_name})"
  else
    log_warn "Hardware: ${os_name}/${arch_name} (Apple Silicon arm64 required for Lume)"
    issues=$((issues + 1))
  fi

  local ac_sleep
  ac_sleep="$(pmset -g custom 2>/dev/null | awk '/AC Power:/,/^$/' | awk '$1=="sleep"{print $2}' | head -n 1 || true)"
  if [[ "${ac_sleep}" == "0" ]]; then
    log_ok "Power guard: AC sleep disabled (sleep=0)"
  else
    log_warn "Power guard: AC sleep=${ac_sleep:-unknown} (run --install to set sleep=0)"
    issues=$((issues + 1))
  fi

  local ts_ip=""
  ts_ip="$(get_tailscale_ipv4 || true)"
  if [[ -n "${ts_ip}" ]]; then
    log_ok "Tailscale: connected (${ts_ip} / $(get_tailscale_dns || echo 'no-magicdns'))"
  else
    log_warn "Tailscale: offline or not installed"
    issues=$((issues + 1))
  fi

  if [[ -f "${SSHD_DROPIN}" ]]; then
    log_ok "SSH guard: ${SSHD_DROPIN} present"
  else
    log_warn "SSH guard: ${SSHD_DROPIN} missing (run --install)"
    issues=$((issues + 1))
  fi

  local lume_bin=""
  lume_bin="$(find_lume_bin || true)"
  if [[ -n "${lume_bin}" ]]; then
    log_ok "Lume CLI: ${lume_bin}"
  else
    log_warn "Lume CLI: missing (run --install)"
    issues=$((issues + 1))
  fi

  local cua_bin=""
  cua_bin="$(find_cua_driver_bin || true)"
  if [[ -n "${cua_bin}" ]]; then
    log_ok "cua-driver: ${cua_bin} ($("${cua_bin}" --version 2>/dev/null | tr -d '\n' || echo 'unknown'))"
  else
    log_warn "cua-driver: missing (run --install)"
    issues=$((issues + 1))
  fi

  if [[ -f "${LAUNCH_AGENT_PLIST}" ]]; then
    log_ok "LaunchAgent: ${LAUNCH_AGENT_PLIST} installed"
  else
    log_warn "LaunchAgent: ${LAUNCH_AGENT_PLIST} missing (run --install)"
    issues=$((issues + 1))
  fi

  if curl -fsS --max-time 3 "http://127.0.0.1:${LUME_PORT}/lume/vms" >/dev/null 2>&1; then
    log_ok "Lume HTTP API: responding on http://127.0.0.1:${LUME_PORT}/lume/vms"
  else
    log_warn "Lume HTTP API: not responding on http://127.0.0.1:${LUME_PORT}/lume/vms"
    issues=$((issues + 1))
  fi

  if [[ -n "${lume_bin}" ]]; then
    local vms_out
    vms_out="$("${lume_bin}" ls 2>/dev/null || true)"
    for tpl in "${MACOS_BASE_VM}" "${LINUX_BASE_VM}"; do
      if grep -qE "(^|[[:space:]])${tpl}([[:space:]]|$)" <<<"${vms_out}"; then
        log_ok "Base VM template: ${tpl} ready"
      else
        log_warn "Base VM template: ${tpl} missing (run --init-vm-pool)"
        issues=$((issues + 1))
      fi
    done
  fi

  if [[ "${issues}" -eq 0 ]]; then
    log_ok "All host checks passed — Mac #2 is ready for mac2-lume-vm & mac2-shared!"
    return 0
  else
    log_warn "${issues} check(s) need attention. Run './scripts/${SCRIPT_NAME} --install --init-vm-pool' on Mac #2."
    return 1
  fi
}

if [[ "${DO_INSTALL}" == "true" || "${DO_INIT_VM_POOL}" == "true" ]]; then
  assert_apple_silicon
fi

if [[ "${DO_INSTALL}" == "true" ]]; then
  install_dependencies
  configure_power_and_ssh
  install_launch_agent
fi

if [[ "${DO_INIT_VM_POOL}" == "true" ]]; then
  init_vm_pool
fi

if [[ -n "${PAIR_URL}" ]]; then
  pair_openmausbot "${PAIR_URL}"
fi

if [[ "${DO_CHECK}" == "true" ]]; then
  run_check
fi
