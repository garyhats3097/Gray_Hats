#!/usr/bin/env bash
# Deletes the saved local chain. Next ./scripts/start-chain.sh starts fresh and redeploys.
# Afterwards, in MetaMask: Settings → Advanced → Clear activity tab data.
set -euo pipefail
cd "$(dirname "$0")/.."
if pgrep -x anvil >/dev/null; then
  echo "Anvil is still running. Stop it first (Ctrl+C in its terminal)."; exit 1
fi
rm -rf .anvil
echo "Saved chain deleted. Run ./scripts/start-chain.sh for a fresh one."
echo "Then in MetaMask: Settings → Advanced → Clear activity tab data."
