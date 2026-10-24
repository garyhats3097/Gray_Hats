import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The help chatbot runs as its own small server (chatbot/server.mjs); the site talks to it here.
    proxy: { "/api/chat": process.env.CHAT_SERVER_URL ?? "http://127.0.0.1:8787" },
  },
});
