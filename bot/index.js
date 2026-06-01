import { Client, GatewayIntentBits, ActivityType } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const statusUrl = process.env.STATUS_URL || "ai-builder-ten-beta.vercel.app";
const statusText = process.env.STATUS_TEXT || "Free AI builder just for you";

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
});

client.on("error", (err) => {
  console.error("[BOT] Error:", err.message);
});

client.login(token);

// Keep alive for platforms that need HTTP
import { createServer } from "http";
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: client.isReady() ? "online" : "connecting",
    user: client.user?.tag || null,
  }));
});
server.listen(process.env.PORT || 4000);
