const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
const http = require("http");

const token = process.env.DISCORD_BOT_TOKEN;
const statusUrl = process.env.STATUS_URL || "ai-builder-ten-beta.vercel.app";
const statusText = process.env.STATUS_TEXT || "Free AI builder just for you";
const keepaliveUrl = process.env.KEEPALIVE_URL;
const port = process.env.PORT || 4000;

if (!token) {
  console.error("DISCORD_BOT_TOKEN is required");
  process.exit(1);
}

console.log("[BOT] Starting...");

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

  if (keepaliveUrl) {
    console.log(`[BOT] Keepalive enabled → ${keepaliveUrl}`);
    setInterval(async () => {
      try {
        const res = await fetch(keepaliveUrl, { signal: AbortSignal.timeout(10000) });
        console.log(`[KEEPALIVE] ${res.status}`);
      } catch (err) {
        console.error(`[KEEPALIVE] failed: ${err.message}`);
      }
    }, 4 * 60 * 1000);
  }
});

client.on("error", (err) => {
  console.error("[BOT] Error:", err.message);
});

client.login(token).catch((err) => {
  console.error("[BOT] Login failed:", err.message);
  process.exit(1);
});

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: client.isReady() ? "online" : "connecting",
    user: client.user?.tag || null,
    uptime: process.uptime(),
  }));
});

server.listen(port, () => {
  console.log(`[HTTP] Health check on port ${port}`);
});
