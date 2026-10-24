#!/usr/bin/env node
// Real ETH/USD market data for the local chain. Started automatically by ./scripts/start-chain.sh.
//
//   node scripts/price-feed.mjs              live feed: push the real price into the oracle every 15 s,
//                                            and save real price history for the chart
//   node scripts/price-feed.mjs --price-wei  print the current real price (18 decimals) and exit
//
// Sources (first that answers wins): Coinbase → Kraken → CoinGecko. Public APIs, no key needed.
// The oracle is updated by the admin test account (Anvil #0) — local test chain only.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const INTERVAL_S = Number(process.env.PRICE_INTERVAL ?? 15);
const HISTORY_EVERY_S = 120; // 1-minute candles for the 1H view stay fresh
const HISTORY_FILE = resolve(ROOT, "frontend/public/eth-history.json");
// Anvil account #0 — a PUBLICLY KNOWN test key. Never use it on a real network.
const ADMIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Endpoints can be overridden (used by tests with a local stand-in server).
const URL_ = {
  cbSpot: process.env.CB_SPOT_URL ?? "https://api.coinbase.com/v2/prices/ETH-USD/spot",
  cbCandles: process.env.CB_CANDLES_URL ?? "https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity={g}",
  krTicker: process.env.KRAKEN_TICKER_URL ?? "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
  krOhlc: process.env.KRAKEN_OHLC_URL ?? "https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval={i}",
  cgSimple: process.env.GECKO_SIMPLE_URL ?? "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
  cgChart: process.env.GECKO_CHART_URL ?? "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days={d}",
};

/** Chart ranges: seconds of history, and the candle size each source should use. */
const RANGES = {
  "1H": { seconds: 3_600, coinbase: 60, kraken: 1, gecko: 1 },
  "1D": { seconds: 86_400, coinbase: 300, kraken: 5, gecko: 1 },
  "7D": { seconds: 7 * 86_400, coinbase: 3_600, kraken: 60, gecko: 7 },
  "30D": { seconds: 30 * 86_400, coinbase: 21_600, kraken: 240, gecko: 30 },
  "1Y": { seconds: 365 * 86_400, coinbase: 86_400, kraken: 1_440, gecko: 365 },
};

const log = (msg) => console.log(`${new Date().toLocaleTimeString()}  ${msg}`);

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "modular-defi-prototype" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const positive = (n) => (Number.isFinite(n) && n > 0 ? n : undefined);

/** Current spot price as a decimal string, plus where it came from. */
async function spotPrice() {
  const sources = [
    ["Coinbase", async () => (await getJson(URL_.cbSpot)).data.amount],
    ["Kraken", async () => Object.values((await getJson(URL_.krTicker)).result)[0].c[0]],
    ["CoinGecko", async () => String((await getJson(URL_.cgSimple)).ethereum.usd)],
  ];
  for (const [name, fn] of sources) {
    try {
      const s = String(await fn());
      if (positive(Number(s))) return { price: s, source: name };
    } catch {
      /* try the next source */
    }
  }
  return undefined;
}

/**
 * Real price history for one range, oldest first, as [unixSeconds, close, open, high, low] candles.
 * CoinGecko only has prices, so its points are just [unixSeconds, price].
 */
async function history(range) {
  const cfg = RANGES[range];
  const since = Date.now() / 1000 - cfg.seconds;
  const sources = [
    // Coinbase candle: [time, low, high, open, close, volume]
    ["Coinbase", async () => (await getJson(URL_.cbCandles.replace("{g}", cfg.coinbase))).map((c) => [c[0], c[4], c[3], c[2], c[1]])],
    // Kraken candle: [time, open, high, low, close, vwap, volume, count] (prices as strings)
    ["Kraken", async () => Object.values((await getJson(URL_.krOhlc.replace("{i}", cfg.kraken))).result).find(Array.isArray).map((c) => [c[0], Number(c[4]), Number(c[1]), Number(c[2]), Number(c[3])])],
    ["CoinGecko", async () => (await getJson(URL_.cgChart.replace("{d}", cfg.gecko))).prices.map(([ms, p]) => [Math.floor(ms / 1000), p])],
  ];
  for (const [name, fn] of sources) {
    try {
      const points = (await fn())
        .filter(([t, p]) => t >= since && positive(p))
        .sort((a, b) => a[0] - b[0]);
      if (points.length >= 2) return { source: name, points };
    } catch {
      /* try the next source */
    }
  }
  return undefined;
}

async function saveHistory() {
  const ranges = {};
  const sources = {};
  for (const r of Object.keys(RANGES)) {
    const h = await history(r);
    if (h) {
      ranges[r] = h.points;
      sources[r] = h.source;
    }
  }
  if (Object.keys(ranges).length === 0) return log("could not fetch price history from any source (no internet?)");
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(`${HISTORY_FILE}.tmp`, JSON.stringify({ updatedAt: Math.floor(Date.now() / 1000), sources, ranges }));
  renameSync(`${HISTORY_FILE}.tmp`, HISTORY_FILE); // atomic: the site never reads a half-written file
  log(`price history saved (${Object.entries(sources).map(([r, s]) => `${r}: ${s}`).join(", ")})`);
}

function oracleAddress() {
  const d = JSON.parse(readFileSync(resolve(ROOT, "frontend/src/config/deployments.json"), "utf8"));
  return d.MockOracle;
}

function toWei(decimal) {
  const [whole, frac = ""] = decimal.split(".");
  return (BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18))).toString();
}

function cast(args) {
  return execFileSync("cast", [...args, "--rpc-url", RPC], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// ------------------------------------------------------------------ main

if (process.argv.includes("--price-wei")) {
  const spot = await spotPrice();
  if (!spot) {
    console.error("Could not fetch the real ETH price from Coinbase, Kraken or CoinGecko (no internet?).");
    process.exit(1);
  }
  console.log(toWei(spot.price));
  process.exit(0);
}

const ORACLE = oracleAddress();
const MARKET = execFileSync("cast", ["keccak", "ETH/USD"], { encoding: "utf8" }).trim(); // no RPC needed
const HEARTBEAT_S = 300; // re-send an unchanged price so the oracle never looks stale
let last;
let lastSent = 0;
let lastHistory = 0;
log(`live ETH/USD feed → oracle ${ORACLE} every ${INTERVAL_S}s`);

for (;;) {
  if (Date.now() / 1000 - lastHistory >= HISTORY_EVERY_S) {
    await saveHistory();
    lastHistory = Date.now() / 1000;
  }
  const spot = await spotPrice();
  if (!spot) {
    log("could not fetch the ETH price from any source (no internet?) — oracle unchanged");
  } else if (spot.price !== last || Date.now() / 1000 - lastSent >= HEARTBEAT_S) {
    try {
      cast(["send", "-q", "--private-key", ADMIN_KEY, ORACLE, "setPrice(bytes32,uint256)", MARKET, toWei(spot.price)]);
      log(`ETH/USD $${spot.price} (${spot.source}) → oracle updated`);
      last = spot.price;
      lastSent = Date.now() / 1000;
    } catch (e) {
      log(`ETH/USD $${spot.price} (${spot.source}) — oracle update FAILED: ${String(e.stderr ?? e.message).split("\n")[0]}`);
    }
  }
  await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}
