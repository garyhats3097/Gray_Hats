# Help chatbot

A chat bubble on every page (bottom-right). It answers questions about the site, explains DeFi and
technical terms, and can explain the **connected user's own numbers** (vault, positions, loan,
health factor, credit score), because the site sends a summary of them with each question.

## How it works
```
browser (chat panel)  ──/api/chat──▶  Vite dev server (proxy)  ──▶  chatbot/server.mjs  ──▶  free AI API
  sends: the conversation                                            adds: rules + knowledge       (Gemini by default,
  + live summary read from the contracts                             keeps the API key              or Groq)
```
- **Knowledge:** `chatbot/knowledge/site-guide.md` (pages, rules, troubleshooting, glossary, trusted
  links) plus `docs/ACCOUNTING.md`, `CREDIT.md`, `MARKET_MAKER.md`, `LIMITATIONS.md`. Edit these
  files to change what the bot knows; it re-reads them on every question (no restart needed).
- **Rules** (in `server.mjs`): answer only from the knowledge and live data, say "I don't know" instead
  of guessing, no live news (it links trusted news sites), no financial advice, never ask for keys or
  seed phrases.
- **Key safety:** the key lives only in `chatbot/.env` (git-ignored) on the computer running the
  server. It is never sent to the browser.
- **Limits:** 15 questions per minute per visitor, last 12 messages of history, 2,000 characters
  per message. Each question sends about 8,000 tokens of knowledge, well inside the free tiers.
- No npm packages: plain Node 18+.

## Setup (once)
1. Get a free key: **Google AI Studio** → https://aistudio.google.com/apikey → *Create API key*.
2. In WSL:
   ```bash
   cd chatbot
   cp .env.example .env
   nano .env            # paste the key after GEMINI_API_KEY=   (Ctrl+O, Enter, Ctrl+X)
   ```
3. Test it from the terminal: `npm run ask -- "what is a health factor?"`

Alternative provider: Groq (https://console.groq.com/keys) — set `CHAT_PROVIDER=groq` and
`GROQ_API_KEY=` in `.env`.

## Run (a third terminal, next to the chain and the site)
```bash
cd chatbot
npm start            # >>> Assistant running at http://127.0.0.1:8787
```
The site reaches it through the dev server's proxy, so open the site as usual
(`npm run dev` in `frontend/`).

## Messages you may see
| In the chat | Meaning / fix |
|---|---|
| "The assistant isn't running" | Start it: `cd chatbot && npm start` |
| "The assistant has no AI key yet" | Create `chatbot/.env` with your key, restart the assistant |
| "The AI key is invalid / was refused" | Check the key in `chatbot/.env` |
| "The free AI service is busy right now" (HTTP 503) | Google's free models are overloaded. The bot already retried and tried the backup models (`gemini-2.5-flash`, `gemini-2.5-flash-lite`); wait a minute, or switch to Groq |
| "The free AI quota is used up for now" | Free-tier limit reached on every model; wait a minute |
| "AI model … was not found" | Set another model, e.g. `GEMINI_MODEL=gemini-2.5-flash` in `.env` |

## Why our own build instead of Botpress
Botpress's cloud cannot see the chain running on a laptop, so it couldn't explain a user's own
position or errors without extra plumbing, and teammates would need to keep its knowledge in sync
by hand. Our version reads the same docs as the repo and gets the live on-chain summary from the site.
