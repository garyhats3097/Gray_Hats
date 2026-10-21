#!/usr/bin/env bash
# Starts the local Anvil chain and REMEMBERS it between restarts.
#
#   First run  : starts a fresh chain and deploys the contracts.
#   Later runs : reloads the saved chain (balances, positions, loans, history).
#                Do NOT run the deploy script again on a saved chain — it would
#                create new, empty contracts and the app would switch to them.
#
# Stop with Ctrl+C (the state is saved on exit, and every 5 seconds while running).
# Start over with: ./scripts/reset-chain.sh
set -euo pipefail
cd "$(dirname "$0")/.."

STATE_DIR=".anvil"
STATE_FILE="$STATE_DIR/state.json"
mkdir -p "$STATE_DIR"

FRESH=1
[ -f "$STATE_FILE" ] && FRESH=0

# --host 0.0.0.0 lets the Windows browser (and other computers) reach the chain.
anvil --host 0.0.0.0 \
      --state "$STATE_FILE" --state-interval 5 \
      --preserve-historical-states &
ANVIL_PID=$!
trap 'kill -INT $ANVIL_PID 2>/dev/null; wait $ANVIL_PID 2>/dev/null' INT TERM EXIT

# Wait until the chain answers.
until cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; do sleep 0.5; done

if [ "$FRESH" = 1 ]; then
  echo ">>> New chain — deploying contracts…"
  (cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast)
  echo ">>> Deployed. Your chain is saved in $STATE_FILE"
else
  echo ">>> Loaded saved chain from $STATE_FILE (block $(cast block-number --rpc-url http://127.0.0.1:8545)). No deploy needed."
fi
echo ">>> Chain running on http://127.0.0.1:8545 — press Ctrl+C to stop (state is saved)."
wait $ANVIL_PID
