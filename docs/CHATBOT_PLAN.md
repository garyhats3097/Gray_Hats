# Chatbot plan (on hold)

Status: **not started.** Decision pending between Botpress and building our own.

## Requirements (from the project brief)
- Answer questions about the site and its features.
- Explain financial and technical terms.
- Market news, if any.
- Clear up confusion about any functionality.
- When it doesn't know: say so, never guess, and point to an external resource if possible.

## Option A — Botpress (the team's original plan)
- Hosted platform: no server or API key to manage; free tier with limited AI credits.
- Teammates can edit it in a visual editor without code.
- Knows the site through documents uploaded to its knowledge base.
- Botpress's cloud **cannot reach a chain running on a laptop**. To answer "my position" questions,
  the site must send it a short summary of the connected user's state when the chat opens
  (Botpress web chat supports passing user data).
- Needs internet during the demo, and depends on Botpress being up.

## Option B — Build our own
- Chat panel in the site plus a small server that holds an AI API key (Claude, OpenAI, …).
- The server reads the chain directly, so it can explain a user's own position and errors.
- Full control over honesty rules ("I don't know"), everything kept in the repo.
- About a day of work; pay-per-question API costs (small for a demo); a third process to run.

## Market news
Recommended: no live news. The bot says it has no live data and links to trusted sources,
so it can never invent headlines. Live news would need web search (more cost, more failure modes).

## Work needed either way
1. Knowledge-base document: site guide, features, prototype rules, DeFi glossary,
   "I don't know" guidance, trusted external links.
2. Bot instructions: honest, no financial advice, never asks for keys or seed phrases.
3. For Botpress: the site code that embeds the chat and sends the user's position summary
   (needs the bot's embed code / bot ID from Botpress → Share / Webchat).
