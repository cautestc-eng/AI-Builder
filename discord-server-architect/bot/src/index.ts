import express from "express";
import cors from "cors";
import { Client, GatewayIntentBits } from "discord.js";
import { executePlan } from "./executor";
import { LogEntry } from "./types";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PORT = parseInt(process.env.PORT || "4000", 10);

if (!BOT_TOKEN) {
  console.error("DISCORD_BOT_TOKEN is required");
  process.exit(1);
}

client.once("ready", () => {
  console.log(`[BOT] Logged in as ${client.user?.tag}`);
  console.log(`[BOT] HTTP server listening on port ${PORT}`);
});

client.login(BOT_TOKEN);

app.post("/execute", async (req, res) => {
  const { guildId, plan, executionId, token } = req.body;

  if (!guildId || !plan) {
    return res.status(400).json({ success: false, error: "guildId and plan required" });
  }

  if (token !== BOT_TOKEN) {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }

  if (!client.isReady()) {
    return res.status(503).json({ success: false, error: "Bot not ready" });
  }

  try {
    const result = await executePlan(client, { guildId, plan, executionId, token: BOT_TOKEN });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: client.isReady() ? "ready" : "connecting",
    user: client.user?.tag || null,
    guilds: client.guilds.cache.size,
  });
});

app.post("/validate-execution", (req, res) => {
  const { guildId, plan } = req.body;

  if (!guildId || !plan) {
    return res.status(400).json({ valid: false, error: "Missing guildId or plan" });
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return res.json({ valid: false, error: "Bot not in guild", needsInvite: true });
  }

  const logs: LogEntry[] = [];
  const warnings: string[] = [];
  let valid = true;

  for (const role of plan.roles) {
    if (guild.roles.cache.find((r: any) => r.name === role.name)) {
      warnings.push(`Role "${role.name}" already exists, will be skipped`);
    }
  }

  for (const ch of plan.channels.text) {
    if (guild.channels.cache.find((c: any) => c.type === 0 && c.name === ch)) {
      warnings.push(`Text channel #${ch} already exists`);
    }
  }

  return res.json({ valid, warnings });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Server running on port ${PORT}`);
});
