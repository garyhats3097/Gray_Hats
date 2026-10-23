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
  echo ">>> New chain — fetching the real ETH price…"
  if ! PRICE_WEI=$(node scripts/price-feed.mjs --price-wei); then
    echo "!!! Can't start a new chain without the real ETH price (needs internet). Check your connection and try again."
    exit 1
  fi
  echo ">>> Real ETH price: \$$(cast --from-wei "$PRICE_WEI" | sed 's/\(\.[0-9][0-9]\).*/\1/'). Deploying contracts…"
  # Oracle prices older than 15 minutes are rejected, so trading stops if the live feed stops.
  (cd contracts && INITIAL_ETH_PRICE_WEI=$PRICE_WEI ORACLE_MAX_AGE=900 \
    forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast >/dev/null)
  echo ">>> Deployed. Your chain is saved in $STATE_FILE"
else
  echo ">>> Loaded saved chain from $STATE_FILE (block $(cast block-number --rpc-url http://127.0.0.1:8545)). No deploy needed."

  # Anvil restarts its clock at the real current time. If an older chain had been time-travelled,
  # new blocks would be OLDER than earlier ones, and the lending interest maths would fail
  # ("arithmetic underflow"). Move the clock to just after the newest timestamp the chain has seen.
  LATEST=$(cast block-number --rpc-url http://127.0.0.1:8545)
  MAX_TS=0
  for ((n = 0; n <= LATEST; n++)); do
    TS=$(cast block "$n" --field timestamp --rpc-url http://127.0.0.1:8545)
    [ "$TS" -gt "$MAX_TS" ] && MAX_TS=$TS
  done
  NOW=$(date +%s)
  if [ "$MAX_TS" -ge "$NOW" ]; then
    cast rpc anvil_setTime $((MAX_TS + 1)) --rpc-url http://127.0.0.1:8545 >/dev/null
    # Mine one empty block so the LATEST block (which the website reads at) has the fixed time.
    cast rpc evm_mine --rpc-url http://127.0.0.1:8545 >/dev/null
    echo ">>> Chain clock moved forward to $(date -d @$((MAX_TS + 1)) '+%d %b %Y %H:%M') (it had been time-travelled)."
  fi

  # Chains saved before the Market Maker module existed: add it (nothing else is redeployed).
  MM=$(grep -o '"MarketMakerModule": *"0x[0-9a-fA-F]*"' frontend/src/config/deployments.json | grep -o '0x[0-9a-fA-F]\{40\}' || true)
  if [ -z "$MM" ] || [ "$(cast code "$MM" --rpc-url http://127.0.0.1:8545)" = "0x" ]; then
    echo ">>> Adding the Market Maker module to this saved chain (your data is kept)…"
    (cd contracts && forge script script/AddMarketMaker.s.sol --rpc-url http://127.0.0.1:8545 --broadcast >/dev/null) \
      && echo ">>> Market Maker added." || echo "!!! Could not add the Market Maker module — run: cd contracts && forge script script/AddMarketMaker.s.sol --rpc-url http://127.0.0.1:8545 --broadcast"
  fi
fi
# Live real-world ETH price → oracle every 15 s, plus price history for the chart.
node scripts/price-feed.mjs > "$STATE_DIR/price-feed.log" 2>&1 &
FEED_PID=$!
trap 'kill $FEED_PID 2>/dev/null; kill -INT $ANVIL_PID 2>/dev/null; wait $ANVIL_PID 2>/dev/null' INT TERM EXIT
sleep 3
echo ">>> Live ETH price feed running ($(tail -1 "$STATE_DIR/price-feed.log" | cut -c1-80)…). Log: $STATE_DIR/price-feed.log"
echo ">>> Chain running on http://127.0.0.1:8545 — press Ctrl+C to stop (state is saved)."
wait $ANVIL_PID
