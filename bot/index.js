import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import { createServer } from "http";

const token = process.env.DISCORD_BOT_TOKEN;
const statusUrl = process.env.STATUS_URL || "ai-builder-ten-beta.vercel.app";
const statusText = process.env.STATUS_TEXT || "Free AI builder just for you";
const keepaliveUrl = process.env.KEEPALIVE_URL;
const port = parseInt(process.env.PORT || "4000", 10);

if (!token) {
  console.error("DISCORD_BOT_TOKEN is required");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`[BOT] Logged in as ${client.user?.tag}`);

  client.user?.setPresence({
    activities: [{
      name: `${statusUrl} | ${statusText}`,
      type: ActivityType.Custom,
    }],
    status: "online",
  });

  console.log(`[BOT] Status set to: ${statusUrl} | ${statusText}`);

  // Self-keepalive: ping own URL every 4 min to prevent platform spin-down
  if (keepaliveUrl) {
    console.log(`[BOT] Keepalive enabled → ${keepaliveUrl}`);
    setInterval(async () => {
      try {
        const res = await fetch(keepaliveUrl, { signal: AbortSignal.timeout(10000) });
        console.log(`[KEEPALIVE] ${res.status} ${res.statusText}`);
      } catch (err) {
        console.error(`[KEEPALIVE] failed: ${err.message}`);
      }
    }, 4 * 60 * 1000);
  } else {
    console.log("[BOT] No KEEPALIVE_URL set — skipping keepalive pings");
  }
});

client.on("error", (err) => {
  console.error("[BOT] Error:", err.message);
});

client.login(token);

// Health check HTTP server (platforms like Railway/Render use this to verify the app is alive)
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: client.isReady() ? "online" : "connecting",
    user: client.user?.tag || null,
    uptime: process.uptime(),
  }));
});

server.listen(port, () => {
  console.log(`[HTTP] Health check listening on port ${port}`);
});
