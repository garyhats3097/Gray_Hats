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

# Refuse to start if another chain already uses port 8545 (e.g. a plain `anvil` in another
# terminal). Otherwise this script would talk to THAT chain, which saves nothing.
if cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; then
  echo "!!! Another chain is already running on port 8545 — probably a plain 'anvil' in another terminal."
  echo "!!! It does NOT save anything. Stop it (Ctrl+C in its terminal, or run: pkill anvil),"
  echo "!!! then run ./scripts/start-chain.sh again."
  exit 1
fi

# --host 0.0.0.0 lets the Windows browser (and other computers) reach the chain.
anvil --host 0.0.0.0 \
      --state "$STATE_FILE" --state-interval 5 \
      --preserve-historical-states &
ANVIL_PID=$!
trap 'kill -INT $ANVIL_PID 2>/dev/null; wait $ANVIL_PID 2>/dev/null' INT TERM EXIT

# Wait until OUR chain answers (and stop if it failed to start).
until cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; do
  if ! kill -0 "$ANVIL_PID" 2>/dev/null; then
    echo "!!! Anvil failed to start — see the error above."
    exit 1
  fi
  sleep 0.5
done

if [ "$FRESH" = 1 ]; then
  echo ">>> New chain — deploying contracts…"
  (cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast)
  echo ">>> Deployed. Your chain is saved in $STATE_FILE"
else
  echo ">>> Loaded saved chain from $STATE_FILE (block $(cast block-number --rpc-url http://127.0.0.1:8545)). No deploy needed."
fi
echo ">>> Chain running on http://127.0.0.1:8545 — press Ctrl+C to stop (state is saved)."
wait $ANVIL_PID
