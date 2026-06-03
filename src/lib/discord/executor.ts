import { ServerPlan, LogEntry } from "@/types";

const DISCORD_API = "https://discord.com/api/v10";

const headers = () => ({
  Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
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

async function discordFetch(path: string, options: RequestInit = {}, timeoutMs = 8000) {
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
  } catch { return false; }
}

function rolePriority(role: { name: string; permissions: string[] }): number {
  if (role.permissions.includes("ADMINISTRATOR")) return 0;
  if (role.permissions.some(p => ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS", "MANAGE_ROLES", "MANAGE_CHANNELS", "MODERATE_MEMBERS"].includes(p))) return 1;
  return 2;
}

const MANAGED_ROLE_NAMES = new Set(["@everyone", "DiscordBot", "Bot", "MEE6", "Dyno", "Carl-bot", "TicketTool"]);

export async function executePlan(
  guildId: string,
  plan: ServerPlan
): Promise<{ success: boolean; logs: LogEntry[] }> {
  const logs: LogEntry[] = [];

  try {
    // Verify bot has Manage Channels permission
    const botUser: any = await discordFetch(`/users/@me`);
    const botUserId = botUser.id;
    const allGuildRoles: any[] = await discordFetch(`/guilds/${guildId}/roles`);
    const botMember: any = await discordFetch(`/guilds/${guildId}/members/${botUserId}`);
    const botRoleIds = new Set(botMember.roles);
    const hasAdmin = allGuildRoles.some((r: any) => botRoleIds.has(r.id) && (BigInt(r.permissions) & 0x8n) === 0x8n);
    const hasManageChannels = hasAdmin || allGuildRoles.some((r: any) => botRoleIds.has(r.id) && (BigInt(r.permissions) & 0x10n) === 0x10n);
    const hasManageRoles = hasAdmin || allGuildRoles.some((r: any) => botRoleIds.has(r.id) && (BigInt(r.permissions) & 0x10000000n) === 0x10000000n);

    if (!hasAdmin) {
      const missing: string[] = [];
      if (!hasManageChannels) missing.push("Manage Channels");
      if (!hasManageRoles) missing.push("Manage Roles");
      logs.push(makeLog("warn", `Bot missing permissions: ${missing.join(", ")}. Some operations may fail. Re-invite bot with Administrator.`));
    }

    const existingRoles: any[] = await discordFetch(`/guilds/${guildId}/roles`);
    const existingChannels: any[] = await discordFetch(`/guilds/${guildId}/channels`);

    const planRoleNamesLower = new Set(plan.roles.map(r => r.name.toLowerCase()));
    // Include all channel names from text, voice, category channels, and category names
    const planChannelNamesLower = new Set([
      ...plan.channels.text.map(n => n.toLowerCase()),
      ...plan.channels.voice.map(n => n.toLowerCase()),
      ...plan.category_structure.flatMap(c => c.channels.map(n => n.toLowerCase())),
      ...plan.category_structure.map(c => c.name.toLowerCase()),
    ]);

    // --- ROLES ---
    // Create roles in priority order (Admin first, then Mod, then Members)
    const sortedRoles = [...plan.roles].sort((a, b) => rolePriority(a) - rolePriority(b));
    const createdRoleIds: { name: string; id: string }[] = [];

    for (const role of sortedRoles) {
      if (role.name === "@everyone") continue;
      const existing = existingRoles.find((r: any) => r.name.toLowerCase() === role.name.toLowerCase());
      if (existing) {
        // Update existing role's permissions and color
        try {
          await discordFetch(`/guilds/${guildId}/roles/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              permissions: resolvePermissions(role.permissions),
              color: role.color ? parseInt(role.color.replace("#", ""), 16) : 0,
            }),
          });
          logs.push(makeLog("ok", `Updated role: ${role.name}`));
        } catch (err: any) {
          logs.push(makeLog("error", `Failed to update role ${role.name}: ${err.message}`));
        }
        createdRoleIds.push({ name: role.name, id: existing.id });
        continue;
      }
      try {
        const newRole: any = await discordFetch(`/guilds/${guildId}/roles`, {
          method: "POST",
          body: JSON.stringify({
            name: role.name,
            permissions: resolvePermissions(role.permissions),
            color: role.color ? parseInt(role.color.replace("#", ""), 16) : 0,
          }),
        });
        createdRoleIds.push({ name: role.name, id: newRole.id });
        logs.push(makeLog("ok", `Created role: ${role.name}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create role ${role.name}: ${err.message}`));
      }
    }

    // Delete roles not in plan (skip @everyone, managed, bot roles)
    let roleDeleteCount = 0;
    for (const existing of existingRoles) {
      if (existing.name === "@everyone") continue;
      if (existing.managed) {
        logs.push(makeLog("sync", `Skip managed role: ${existing.name}`));
        continue;
      }
      if (MANAGED_ROLE_NAMES.has(existing.name)) {
        logs.push(makeLog("sync", `Skip managed role: ${existing.name}`));
        continue;
      }
      if (!planRoleNamesLower.has(existing.name.toLowerCase())) {
        try {
          await discordFetch(`/guilds/${guildId}/roles/${existing.id}`, { method: "DELETE" });
          logs.push(makeLog("ok", `Deleted role: ${existing.name} (${existing.id})`));
          roleDeleteCount++;
          await new Promise(r => setTimeout(r, 300));
        } catch (err: any) {
          logs.push(makeLog("error", `Failed to delete role ${existing.name} (${existing.id}): ${err.message}`));
        }
      }
    }

    // Reorder roles so highest permission roles are at top (position 1 is highest non-@everyone)
    if (createdRoleIds.length > 0) {
      try {
        // Sort created roles by priority (Admin first = highest position)
        createdRoleIds.sort((a, b) => {
          const ra = plan.roles.find(r => r.name === a.name);
          const rb = plan.roles.find(r => r.name === b.name);
          return (rolePriority(ra || { name: "", permissions: [] }) - rolePriority(rb || { name: "", permissions: [] }));
        });
        // Build position array: reverse so highest priority gets highest position value
        const positionBody = createdRoleIds.map((r, i) => ({
          id: r.id,
          position: createdRoleIds.length - i,
        }));
        await discordFetch(`/guilds/${guildId}/roles`, {
          method: "PATCH",
          body: JSON.stringify(positionBody),
        });
        logs.push(makeLog("sync", "Reordered roles by priority"));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to reorder roles: ${err.message}`));
      }
    }

    // --- CATEGORIES ---
    const createdCategories = new Map<string, string>();

    for (const cat of plan.category_structure) {
      const existing = existingChannels.find((c: any) => c.name.toLowerCase() === cat.name.toLowerCase() && c.type === 4);
      if (existing) {
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
        logs.push(makeLog("ok", `Created category: ${cat.name}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create category ${cat.name}: ${err.message}`));
      }
    }

    // --- TEXT CHANNELS ---
    for (const chName of plan.channels.text) {
      const existing = existingChannels.find((c: any) => c.name.toLowerCase() === chName.toLowerCase() && c.type === 0);
      if (existing) {
        // Update NSFW flag
        if (plan.nsfw_channels?.includes(chName) !== existing.nsfw) {
          try {
            await discordFetch(`/guilds/${guildId}/channels/${existing.id}`, {
              method: "PATCH",
              body: JSON.stringify({ nsfw: plan.nsfw_channels?.includes(chName) || false }),
            });
          } catch {}
        }
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
        logs.push(makeLog("ok", `Created channel: #${chName}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create channel #${chName}: ${err.message}`));
      }
    }

    // --- VOICE CHANNELS ---
    for (const chName of plan.channels.voice) {
      const existing = existingChannels.find((c: any) => c.name.toLowerCase() === chName.toLowerCase() && c.type === 2);
      if (existing) {
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
        logs.push(makeLog("ok", `Created voice channel: ${chName}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create voice channel ${chName}: ${err.message}`));
      }
    }

    // --- DELETE CHANNELS NOT IN PLAN (re-fetch to get fresh state) ---
    const freshChannels: any[] = await discordFetch(`/guilds/${guildId}/channels`);
    logs.push(makeLog("sync", `Guild has ${freshChannels.length} channels: ${freshChannels.map((c: any) => `#${c.name}(${c.id})`).join(", ")}`));
    logs.push(makeLog("sync", `Plan keeps channels: ${[...planChannelNamesLower].join(", ")}`));
    const systemChannelIds = new Set<string>();
    try {
      const guild: any = await discordFetch(`/guilds/${guildId}`);
      if (guild.system_channel_id) systemChannelIds.add(guild.system_channel_id);
      if (guild.rules_channel_id) systemChannelIds.add(guild.rules_channel_id);
      if (guild.public_updates_channel_id) systemChannelIds.add(guild.public_updates_channel_id);
    } catch {}

    for (const existing of freshChannels) {
      if (systemChannelIds.has(existing.id)) {
        logs.push(makeLog("sync", `Skip system channel: #${existing.name}`));
        continue;
      }
      if (existing.managed) {
        logs.push(makeLog("sync", `Skip managed channel: #${existing.name}`));
        continue;
      }
      if (!planChannelNamesLower.has(existing.name.toLowerCase())) {
        try {
          await discordFetch(`/guilds/${guildId}/channels/${existing.id}`, { method: "DELETE" });
          logs.push(makeLog("ok", `Deleted channel: #${existing.name} (${existing.id})`));
          await new Promise(r => setTimeout(r, 300));
        } catch (err: any) {
          logs.push(makeLog("error", `Failed to delete #${existing.name} (${existing.id}): ${err.message}`));
        }
      }
    }

    // --- GUILD SETTINGS ---
    if (plan.guild_settings) {
      const gs = plan.guild_settings;
      const patchBody: Record<string, any> = {};

      if (gs.verification_level) {
        const levels: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, very_high: 4 };
        patchBody.verification_level = levels[gs.verification_level];
      }
      if (gs.default_message_notifications) {
        patchBody.default_message_notifications = gs.default_message_notifications === "all" ? 0 : 1;
      }
      if (gs.explicit_content_filter) {
        const filters: Record<string, number> = { disabled: 0, members_without_roles: 1, all_members: 2 };
        patchBody.explicit_content_filter = filters[gs.explicit_content_filter];
      }
      if (gs.afk_timeout !== undefined) patchBody.afk_timeout = Math.max(60, Math.min(14400, gs.afk_timeout));

      if (gs.system_channel) {
        try {
          const ch = await discordFetch(`/guilds/${guildId}/channels`);
          const channels: any[] = Array.isArray(ch) ? ch : [];
          const found = channels.find((c: any) => c.name.toLowerCase() === gs.system_channel!.toLowerCase() && c.type === 0);
          if (found) patchBody.system_channel_id = found.id;
        } catch {}
      }

      if (gs.afk_channel) {
        try {
          const ch = await discordFetch(`/guilds/${guildId}/channels`);
          const channels: any[] = Array.isArray(ch) ? ch : [];
          const found = channels.find((c: any) => c.name.toLowerCase() === gs.afk_channel!.toLowerCase() && c.type === 2);
          if (found) patchBody.afk_channel_id = found.id;
        } catch {}
      }

      if (Object.keys(patchBody).length > 0) {
        try {
          await discordFetch(`/guilds/${guildId}`, {
            method: "PATCH",
            body: JSON.stringify(patchBody),
          });
          logs.push(makeLog("ok", "Applied guild settings"));
        } catch (err: any) {
          logs.push(makeLog("error", `Failed to apply guild settings: ${err.message}`));
        }
      }
    }

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
    if (cat.channels.includes(channelName)) return categoryMap.get(cat.name);
  }
  return undefined;
}
