#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_CONFIG="${REPO_ROOT}/infra/livekit/livekit.yaml"
RUNTIME_CONFIG="${REPO_ROOT}/infra/livekit/livekit.runtime.yaml"

if ! command -v livekit-server >/dev/null 2>&1; then
  echo "livekit-server was not found in PATH." >&2
  echo "Install livekit-server inside WSL, then run this script again." >&2
  exit 1
fi

if [[ ! -f "${BASE_CONFIG}" ]]; then
  echo "LiveKit base config not found at ${BASE_CONFIG}" >&2
  exit 1
fi

WSL_IP="$(hostname -I | awk '{print $1}')"

if [[ -z "${WSL_IP}" ]]; then
  echo "Could not determine the WSL IP address." >&2
  exit 1
fi

python3 - "${BASE_CONFIG}" "${RUNTIME_CONFIG}" "${WSL_IP}" <<'PY'
from pathlib import Path
import sys

base_path = Path(sys.argv[1])
runtime_path = Path(sys.argv[2])
wsl_ip = sys.argv[3]

content = base_path.read_text(encoding="utf-8")
content = content.replace('node_ip: "127.0.0.1"', f'node_ip: "{wsl_ip}"')
runtime_path.write_text(content, encoding="utf-8")
PY

echo "Starting LiveKit with WSL IP ${WSL_IP}"
echo "Runtime config: ${RUNTIME_CONFIG}"
exec livekit-server --config "${RUNTIME_CONFIG}"
