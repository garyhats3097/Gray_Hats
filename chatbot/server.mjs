#!/usr/bin/env node
/**
 * Modular DeFi assistant — a small chat server for the site's help bubble.
 *
 * The browser sends the conversation plus a summary of the connected user's on-chain state
 * (read by the site from the contracts). This server adds the knowledge base and the rules,
 * and asks a free AI API (Google Gemini by default, or Groq). The API key stays here: it is
 * read from chatbot/.env and never sent to the browser.
 *
 *   cd chatbot && npm start          → http://127.0.0.1:8787  (the site proxies /api/chat to it)
 *
 * No npm packages needed: Node 18+ only.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setDefaultResultOrder } from "node:dns";

// WSL often has no working IPv6 route; trying IPv6 first can make requests hang until they time out.
setDefaultResultOrder("ipv4first");

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// ------------------------------------------------------------------ settings

/** Minimal .env reader (KEY=value lines), so no dependency is needed. Real env vars win. */
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnv(join(HERE, ".env"));

const PROVIDER = (process.env.CHAT_PROVIDER || "gemini").toLowerCase();
const PORT = Number(process.env.CHAT_PORT || 8787);
const HOST = process.env.CHAT_HOST || "127.0.0.1";
const PROVIDERS = {
  gemini: {
    key: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    keyName: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  groq: {
    key: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    keyName: "GROQ_API_KEY",
    keyUrl: "https://console.groq.com/keys",
  },
};
const P = PROVIDERS[PROVIDER];
if (!P) {
  console.error(`Unknown CHAT_PROVIDER "${PROVIDER}". Use "gemini" or "groq".`);
  process.exit(1);
}

// Limits that protect the free quota and keep requests small.
const MAX_MESSAGES = 12; // conversation turns sent to the AI
const MAX_CHARS = 2000; // per message
const RATE_PER_MINUTE = 15; // per visitor
const TIMEOUT_MS = 25_000; // per attempt; a slow model is skipped for the next one

// ------------------------------------------------------------------ knowledge

const KNOWLEDGE_FILES = [
  "chatbot/knowledge/site-guide.md",
  "docs/ACCOUNTING.md",
  "docs/CREDIT.md",
  "docs/MARKET_MAKER.md",
  "docs/LIMITATIONS.md",
];
// Groq's free tier allows only ~6–8k tokens per minute, so it gets the site guide alone (~3.5k tokens),
// which already covers every page, rule, fix and term. CHAT_KNOWLEDGE=full/compact overrides this.
const COMPACT_KNOWLEDGE = (process.env.CHAT_KNOWLEDGE ?? (PROVIDER === "groq" ? "compact" : "full")) === "compact";

function loadKnowledge() {
  return (COMPACT_KNOWLEDGE ? KNOWLEDGE_FILES.slice(0, 1) : KNOWLEDGE_FILES).filter((f) => existsSync(join(ROOT, f)))
    .map((f) => `<document path="${f}">\n${readFileSync(join(ROOT, f), "utf8").trim()}\n</document>`)
    .join("\n\n");
}

const RULES = `You are the help assistant inside "Modular DeFi", a prototype DeFi web app built by team Gray Hats.
You help users understand the site, its features, DeFi and technical terms, and their own position.

Rules:
- Answer from the knowledge documents and the live data below. If the answer is not there and it is not general,
  well-established DeFi/crypto knowledge, say plainly that you don't know. Never guess numbers, rules or features.
  When useful, point to a trusted external resource from the guide.
- Live data: you only know the live data given below (the connected user's state and the current ETH price).
  You have NO live news and no internet access. For news, say so and suggest the news links from the guide.
- Never invent transactions, balances, prices or events.
- No financial advice: explain how things work and what the numbers mean; don't tell people what to buy or trade.
- Never ask for a private key, seed phrase or password. If someone offers one, tell them not to share it.
- Everything here uses test tokens on a local test chain; remind users of that when it matters.
- Be short and clear for beginners: plain words, short paragraphs or bullet points, light **bold**. Use the
  site's page and button names exactly (e.g. Shared Vault → Deposit). Use $ amounts like $1,250.00.
- Answer in the language the user writes in.`;

function systemPrompt(context) {
  return `${RULES}

<knowledge>
${loadKnowledge()}
</knowledge>

<live_data note="Read from the blockchain by the site just now. Amounts in USD (1 mUSDC = $1).">
${JSON.stringify(context ?? { wallet: "not connected" })}
</live_data>`;
}

// ------------------------------------------------------------------ AI providers

class ChatError extends Error {
  /** retry: worth trying again or with another model (busy, quota, model missing) */
  constructor(status, message, retry = false) {
    super(message);
    this.status = status;
    this.retry = retry;
  }
}

/** The provider's own error text, e.g. Google's {"error":{"message":"The model is overloaded..."}}. */
function providerMessage(body) {
  try {
    return JSON.parse(body).error?.message ?? "";
  } catch {
    return "";
  }
}

function explainHttpError(status, body, model) {
  const detail = providerMessage(body);
  console.error(`[chat] ${model}: HTTP ${status}${detail ? ` — ${detail}` : ""}`);
  if (status === 429) return new ChatError(429, "The free AI quota is used up for now. Wait a minute and try again.", true);
  if (status === 400 && /api key/i.test(detail)) return new ChatError(500, `The AI key is invalid. Check ${P.keyName} in chatbot/.env.`);
  if (status === 401 || status === 403) return new ChatError(500, `The AI key was refused. Check ${P.keyName} in chatbot/.env.`);
  if (status === 413) return new ChatError(413, "The question was too large for the free AI plan. Start a new conversation and try again.", true);
  if (status === 404) return new ChatError(500, `AI model "${model}" was not found. Set another model in chatbot/.env (see .env.example).`, true);
  if (status === 500 || status === 503) return new ChatError(503, "The free AI service is busy right now. Try again in a minute.", true);
  return new ChatError(502, `The AI service returned an error (${status})${detail ? `: ${detail}` : ""}.`);
}

/** The configured model first, then other free models if it is busy, over its limit or missing. */
const FALLBACKS = {
  gemini: process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.8-flash,gemini-flash-latest",
  groq: process.env.GROQ_FALLBACK_MODELS ?? "openai/gpt-oss-20b",
};
const MODELS = [...new Set([P.model, ...FALLBACKS[PROVIDER].split(",")].map((m) => m.trim()).filter(Boolean))];

async function askWithFallback(system, messages) {
  const ask = PROVIDER === "groq" ? askGroq : askGemini;
  let lastError;
  for (const model of MODELS) {
    // A busy model often answers on a second try a moment later.
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try {
        const text = await ask(model, system, messages);
        console.log(`[chat] ${model}: answered in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        return text;
      } catch (e) {
        if (e?.name === "TimeoutError") {
          console.error(`[chat] ${model}: no answer within ${TIMEOUT_MS / 1000}s, trying the next model`);
          e = new ChatError(504, "The AI took too long to answer. Try again.", true);
        }
        lastError = e;
        if (!(e instanceof ChatError) || !e.retry) throw e;
        if (e.status !== 503) break; // quota or missing model: go straight to the next model
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  throw lastError;
}

/** How much a model may "think" before answering. A help bot needs little, and thinking is slow. */
function thinkingFor(model) {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-(3|flash-latest|flash-lite-latest)/.test(model)) return { thinkingLevel: "low" };
  return undefined;
}

async function askGemini(model, system, messages, thinking = thinkingFor(model)) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": P.key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096, ...(thinking && { thinkingConfig: thinking }) },
    }),
  });
  const body = await res.text();
  // A model that doesn't accept this thinking setting: ask again without it.
  if (res.status === 400 && thinking && /think/i.test(providerMessage(body))) return askGemini(model, system, messages, null);
  if (!res.ok) throw explainHttpError(res.status, body, model);
  const data = JSON.parse(body);
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    const reason = data.promptFeedback?.blockReason || candidate?.finishReason || "empty reply";
    throw new ChatError(502, `The AI gave no answer (${reason}). Try rephrasing the question.`);
  }
  return text;
}

async function askGroq(model, system, messages, effort = /gpt-oss/.test(model) ? "low" : undefined) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${P.key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 1500,
      // gpt-oss models reason before answering; "low" keeps that short and fast.
      ...(effort && { reasoning_effort: effort }),
      messages: [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.text }))],
    }),
  });
  const body = await res.text();
  if (res.status === 400 && effort && /reasoning/i.test(providerMessage(body))) return askGroq(model, system, messages, null);
  if (!res.ok) throw explainHttpError(res.status, body, model);
  const text = JSON.parse(body).choices?.[0]?.message?.content?.trim();
  if (!text) throw new ChatError(502, "The AI gave no answer. Try rephrasing the question.");
  return text;
}

export async function answer(messages, context) {
  if (!P.key) throw new ChatError(503, `The assistant has no AI key yet. Put ${P.keyName}=... in chatbot/.env (free key: ${P.keyUrl}) and restart it.`);
  const system = systemPrompt(context);
  try {
    return await askWithFallback(system, messages);
  } catch (e) {
    if (e instanceof ChatError) throw e;
    if (e?.name === "TimeoutError") throw new ChatError(504, "The AI took too long to answer. Try again.");
    throw new ChatError(502, "Couldn't reach the AI service. Check the internet connection.");
  }
}

// ------------------------------------------------------------------ HTTP server

/** Keeps only well-formed turns, newest last, starting with a user turn. */
function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS) }))
    .slice(-MAX_MESSAGES);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs.length && msgs.at(-1).role === "user" ? msgs : null;
}

const hits = new Map(); // visitor → recent request times
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_PER_MINUTE;
}

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 64_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new ChatError(413, "Message too long."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const path = (req.url || "").split("?")[0];
  if (req.method === "GET" && path === "/api/chat/health") {
    return send(res, 200, { ok: true, provider: PROVIDER, model: P.model, hasKey: !!P.key });
  }
  if (req.method !== "POST" || path !== "/api/chat") return send(res, 404, { error: "Not found" });

  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "?";
  if (rateLimited(ip)) return send(res, 429, { error: "Too many questions in a minute. Wait a moment and try again." });

  try {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (e) {
      if (e instanceof ChatError) throw e;
      throw new ChatError(400, "Invalid request.");
    }
    const messages = cleanMessages(payload?.messages);
    if (!messages) throw new ChatError(400, "Send a question.");
    const reply = await answer(messages, payload?.context);
    send(res, 200, { reply });
  } catch (e) {
    const status = e instanceof ChatError ? e.status : 500;
    if (!(e instanceof ChatError)) console.error(e);
    else if (status >= 500) console.error(`[chat] ${e.message}`);
    send(res, status, { error: e instanceof ChatError ? e.message : "Something went wrong in the assistant." });
  }
});

/** `npm run doctor`: checks the internet connection, the key and each model, with timings. */
async function doctor() {
  console.log(`Provider: ${PROVIDER}   key set: ${P.key ? "yes" : "NO"}`);
  const t0 = Date.now();
  try {
    const host = PROVIDER === "groq" ? "https://api.groq.com/openai/v1/models" : "https://generativelanguage.googleapis.com/v1beta/models";
    const headers = PROVIDER === "groq" ? { authorization: `Bearer ${P.key}` } : { "x-goog-api-key": P.key ?? "" };
    const res = await fetch(host, { headers, signal: AbortSignal.timeout(10_000) });
    const body = await res.text();
    console.log(`1) Reach the AI service: OK, HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s ${res.ok ? "(key accepted)" : "— " + providerMessage(body)}`);
    if (res.ok) {
      try {
        const data = JSON.parse(body);
        const ids = (data.data ?? data.models ?? []).map((m) => (m.id ?? m.name ?? "").replace(/^models\//, "")).filter(Boolean);
        if (ids.length) console.log(`   Models your key can use: ${ids.sort().join(", ")}`);
      } catch {
        // list is optional
      }
    }
  } catch (e) {
    console.log(`1) Reach the AI service: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s (${e?.cause?.code || e?.name || e}) — network problem, not the bot`);
    return;
  }
  const models = MODELS;
  for (const model of models) {
    const t = Date.now();
    try {
      const reply =
        await (PROVIDER === "groq" ? askGroq : askGemini)(model, "Reply with just: OK", [{ role: "user", text: "test" }]);
      console.log(`2) ${model}: OK in ${((Date.now() - t) / 1000).toFixed(1)}s → ${reply.slice(0, 40)}`);
    } catch (e) {
      console.log(`2) ${model}: FAILED after ${((Date.now() - t) / 1000).toFixed(1)}s → ${e?.name === "TimeoutError" ? "no answer in time" : e.message}`);
    }
  }
}

// `node server.mjs "question"` asks once from the terminal (handy to test the key).
const question = process.argv.slice(2).join(" ").trim();
if (question === "--doctor") {
  doctor();
} else if (question) {
  answer([{ role: "user", text: question }], { note: "asked from the terminal, no wallet" })
    .then((reply) => console.log(reply))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
} else {
  server.listen(PORT, HOST, () => {
    console.log(`>>> Assistant running at http://${HOST}:${PORT}  (provider: ${PROVIDER}, model: ${P.model})`);
    if (!P.key) console.log(`!!! No ${P.keyName} yet: copy .env.example to .env and add a free key from ${P.keyUrl}`);
  });
}
