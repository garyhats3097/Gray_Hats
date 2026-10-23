#!/usr/bin/env bash
# Feeds the REAL ETH/USD market price into the local MockOracle, so the app follows the
# actual Ethereum price and its real fluctuations.
#
#   ./scripts/price-feed.sh          # update every 15 seconds
#   ./scripts/price-feed.sh 60       # update every 60 seconds
#
# Run it in its own terminal while ./scripts/start-chain.sh is running. Stop with Ctrl+C.
# Sources, first one that answers wins: Coinbase → Kraken → CoinGecko (public, no API key).
# The oracle is updated by the admin test account (Anvil #0) — local test chain only.
#
# Note: while this runs, it overwrites prices set by hand in Demo controls on its next update.
set -uo pipefail
cd "$(dirname "$0")/.."

INTERVAL="${1:-15}"
RPC="${RPC_URL:-http://127.0.0.1:8545}"
# Anvil account #0 — a PUBLICLY KNOWN test key. Never use it on a real network.
ADMIN_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
COINBASE_URL="${COINBASE_URL:-https://api.coinbase.com/v2/prices/ETH-USD/spot}"
KRAKEN_URL="${KRAKEN_URL:-https://api.kraken.com/0/public/Ticker?pair=ETHUSD}"
COINGECKO_URL="${COINGECKO_URL:-https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd}"

ORACLE=$(grep -o '"MockOracle": *"0x[0-9a-fA-F]*"' frontend/src/config/deployments.json | grep -o '0x[0-9a-fA-F]\{40\}')
MARKET=$(cast keccak "ETH/USD")

if ! cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "!!! The chain isn't running at $RPC. Start it first with ./scripts/start-chain.sh"; exit 1
fi
if [ "$(cast code "$ORACLE" --rpc-url "$RPC")" = "0x" ]; then
  echo "!!! No oracle contract at $ORACLE. Start the chain with ./scripts/start-chain.sh"; exit 1
fi

# Each source prints a plain decimal price like 2398.42, or nothing if it fails.
from_coinbase()  { curl -s -m 8 "$COINBASE_URL"  | grep -o '"amount":"[0-9.]*"' | cut -d'"' -f4; }
from_kraken()    { curl -s -m 8 "$KRAKEN_URL"    | grep -o '"c":\["[0-9.]*"' | grep -o '[0-9][0-9.]*'; }
from_coingecko() { curl -s -m 8 "$COINGECKO_URL" | grep -o '"usd":[0-9.]*' | cut -d: -f2; }

LAST=""
echo ">>> Live ETH/USD feed → oracle $ORACLE every ${INTERVAL}s. Ctrl+C to stop."
while true; do
  PRICE=""; SOURCE=""
  for src in coinbase kraken coingecko; do
    PRICE=$("from_$src" 2>/dev/null | head -1)
    # Accept only a positive decimal number (rejects empty, garbage, and zero).
    if [[ "$PRICE" =~ ^[0-9]+(\.[0-9]+)?$ && ! "$PRICE" =~ ^0+(\.0+)?$ ]]; then
      SOURCE=$src; break
    fi
    PRICE=""
  done

  NOW=$(date '+%H:%M:%S')
  if [ -z "$PRICE" ]; then
    echo "$NOW  could not fetch a price from any source (no internet?) — oracle unchanged"
  elif [ "$PRICE" = "$LAST" ]; then
    echo "$NOW  ETH/USD \$$PRICE ($SOURCE) — unchanged"
  else
    WEI=$(cast to-wei "$PRICE" ether)
    if cast send -q --private-key "$ADMIN_KEY" --rpc-url "$RPC" "$ORACLE" "setPrice(bytes32,uint256)" "$MARKET" "$WEI" 2>/tmp/price-feed-error.log; then
      echo "$NOW  ETH/USD \$$PRICE ($SOURCE) → oracle updated"
      LAST=$PRICE
    else
      echo "$NOW  ETH/USD \$$PRICE ($SOURCE) — oracle update FAILED: $(tail -1 /tmp/price-feed-error.log)"
    fi
  fi
  sleep "$INTERVAL"
done
