import { ServerPlan, LogEntry } from "@/types";
import { ALLOWED_PERMISSIONS } from "./validate";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = () => process.env.DISCORD_BOT_TOKEN;

const headers = () => ({
  Authorization: `Bot ${BOT_TOKEN()}`,
  "Content-Type": "application/json",
});

function makeLog(type: LogEntry["type"], message: string): LogEntry {
  return { type, message, timestamp: new Date().toISOString() };
}

const PERMISSION_FLAGS: Record<string, number> = {
  CREATE_INSTANT_INVITE: 0x1,
  KICK_MEMBERS: 0x2,
  BAN_MEMBERS: 0x4,
  ADMINISTRATOR: 0x8,
  MANAGE_CHANNELS: 0x10,
  MANAGE_GUILD: 0x20,
  ADD_REACTIONS: 0x40,
  VIEW_AUDIT_LOG: 0x80,
  PRIORITY_SPEAKER: 0x100,
  STREAM: 0x200,
  VIEW_CHANNEL: 0x400,
  SEND_MESSAGES: 0x800,
  SEND_TTS_MESSAGES: 0x1000,
  MANAGE_MESSAGES: 0x2000,
  EMBED_LINKS: 0x4000,
  ATTACH_FILES: 0x8000,
  READ_MESSAGE_HISTORY: 0x10000,
  MENTION_EVERYONE: 0x20000,
  USE_EXTERNAL_EMOJIS: 0x40000,
  VIEW_GUILD_INSIGHTS: 0x80000,
  CONNECT: 0x100000,
  SPEAK: 0x200000,
  MUTE_MEMBERS: 0x400000,
  DEAFEN_MEMBERS: 0x800000,
  MOVE_MEMBERS: 0x1000000,
  USE_VAD: 0x2000000,
  CHANGE_NICKNAME: 0x4000000,
  MANAGE_NICKNAMES: 0x8000000,
  MANAGE_ROLES: 0x10000000,
  MANAGE_WEBHOOKS: 0x20000000,
  MANAGE_EMOJIS_AND_STICKERS: 0x40000000,
  USE_APPLICATION_COMMANDS: 0x80000000,
  MODERATE_MEMBERS: 0x100000000,
};

function resolvePermissions(perms: string[]): string {
  let bitwise = 0;
  for (const perm of perms) {
    const flag = PERMISSION_FLAGS[perm];
    if (flag) bitwise |= flag;
  }
  return bitwise.toString();
}

async function discordFetch(path: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { ...headers(), ...(options.headers as Record<string, string> || {}) },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord API ${res.status}: ${body}`);
    }
    return res.status === 204 ? null : res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyBotInGuild(guildId: string): Promise<boolean> {
  try {
    await discordFetch(`/guilds/${guildId}`, {}, 3000);
    return true;
  } catch {
    return false;
  }
}

export async function executePlan(
  guildId: string,
  plan: ServerPlan
): Promise<{ success: boolean; logs: LogEntry[] }> {
  const logs: LogEntry[] = [];

  try {
    const existingRoles: any[] = await discordFetch(`/guilds/${guildId}/roles`);
    const existingChannels: any[] = await discordFetch(`/guilds/${guildId}/channels`);

    const roleMap = new Map(existingRoles.map((r: any) => [r.name, r]));
    const channelMap = new Map(existingChannels.map((c: any) => [c.name, c]));

    for (const role of plan.roles) {
      if (roleMap.has(role.name)) {
        logs.push(makeLog("sync", `Role already exists: ${role.name}`));
        continue;
      }
      try {
        await discordFetch(`/guilds/${guildId}/roles`, {
          method: "POST",
          body: JSON.stringify({
            name: role.name,
            permissions: resolvePermissions(role.permissions),
            color: role.color ? parseInt(role.color.replace("#", ""), 16) : undefined,
          }),
        });
        logs.push(makeLog("ok", `Creating role: ${role.name}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create role ${role.name}: ${err.message}`));
      }
    }

    const createdCategories = new Map<string, string>();
    for (const cat of plan.category_structure) {
      const existing = channelMap.get(cat.name);
      if (existing && existing.type === 4) {
        createdCategories.set(cat.name, existing.id);
        logs.push(makeLog("sync", `Category exists: ${cat.name}`));
        continue;
      }
      try {
        const newCat: any = await discordFetch(`/guilds/${guildId}/channels`, {
          method: "POST",
          body: JSON.stringify({ name: cat.name, type: 4 }),
        });
        createdCategories.set(cat.name, newCat.id);
        logs.push(makeLog("ok", `Creating category: ${cat.name}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create category ${cat.name}: ${err.message}`));
      }
    }

    for (const chName of plan.channels.text) {
      if (channelMap.has(chName)) {
        logs.push(makeLog("sync", `Text channel exists: #${chName}`));
        continue;
      }
      try {
        const parentId = findCategoryId(chName, plan.category_structure, createdCategories);
        const body: Record<string, any> = { name: chName, type: 0 };
        if (parentId) body.parent_id = parentId;
        if (plan.nsfw_channels?.includes(chName)) body.nsfw = true;
        await discordFetch(`/guilds/${guildId}/channels`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        logs.push(makeLog("ok", `Creating channel: #${chName}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create channel #${chName}: ${err.message}`));
      }
    }

    for (const chName of plan.channels.voice) {
      if (channelMap.has(chName)) {
        logs.push(makeLog("sync", `Voice channel exists: ${chName}`));
        continue;
      }
      try {
        const parentId = findCategoryId(chName, plan.category_structure, createdCategories);
        const body: Record<string, any> = { name: chName, type: 2 };
        if (parentId) body.parent_id = parentId;
        await discordFetch(`/guilds/${guildId}/channels`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        logs.push(makeLog("ok", `Creating voice channel: ${chName}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create voice channel ${chName}: ${err.message}`));
      }
    }

    logs.push(makeLog("sync", "Syncing guild state"));
    logs.push(makeLog("done", "Server structure applied successfully"));
    return { success: true, logs };
  } catch (err: any) {
    logs.push(makeLog("error", `Execution failed: ${err.message}`));
    return { success: false, logs };
  }
}

function findCategoryId(
  channelName: string,
  categories: { name: string; channels: string[] }[],
  categoryMap: Map<string, string>
): string | undefined {
  for (const cat of categories) {
    if (cat.channels.includes(channelName)) {
      return categoryMap.get(cat.name);
    }
  }
  return undefined;
}
