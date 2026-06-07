import { ServerPlan, LogEntry, ChannelDetail, PermissionOverwrite } from "@/types";

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

const CHANNEL_TYPE_MAP: Record<string, number> = {
  text: 0,
  voice: 2,
  announcement: 5,
  forum: 15,
};

async function discordFetch(path: string, options: RequestInit = {}, timeoutMs = 10000) {
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
    // Verify bot permissions
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
      logs.push(makeLog("warn", `Bot missing permissions: ${missing.join(", ")}. Some operations may fail.`));
    }

    const existingRoles: any[] = await discordFetch(`/guilds/${guildId}/roles`);
    const existingChannels: any[] = await discordFetch(`/guilds/${guildId}/channels`);

    const planRoleNamesLower = new Set(plan.roles.map(r => r.name.toLowerCase()));

    // Determine channel names from either channel_details or simple text/voice
    let planChannelNamesLower: Set<string>;
    if (plan.channel_details && plan.channel_details.length > 0) {
      planChannelNamesLower = new Set(plan.channel_details.map(c => c.name.toLowerCase()));
    } else {
      planChannelNamesLower = new Set([
        ...plan.channels.text.map(n => n.toLowerCase()),
        ...plan.channels.voice.map(n => n.toLowerCase()),
        ...plan.category_structure.flatMap(c => c.channels.map(n => n.toLowerCase())),
        ...plan.category_structure.map(c => c.name.toLowerCase()),
      ]);
    }

    // --- ROLES ---
    const sortedRoles = [...plan.roles].sort((a, b) => rolePriority(a) - rolePriority(b));
    const createdRoleIds: { name: string; id: string }[] = [];

    for (const role of sortedRoles) {
      if (role.name === "@everyone") continue;
      const existing = existingRoles.find((r: any) => r.name.toLowerCase() === role.name.toLowerCase());
      if (existing) {
        try {
          await discordFetch(`/guilds/${guildId}/roles/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              permissions: resolvePermissions(role.permissions),
              color: role.color ? parseInt(role.color.replace("#", ""), 16) : 0,
              hoist: role.hoist ?? false,
              mentionable: role.mentionable ?? false,
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
            hoist: role.hoist ?? false,
            mentionable: role.mentionable ?? false,
          }),
        });
        createdRoleIds.push({ name: role.name, id: newRole.id });
        logs.push(makeLog("ok", `Created role: ${role.name}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create role ${role.name}: ${err.message}`));
      }
    }

    // Build role name -> ID map for permission overwrites
    const roleIdMap = new Map<string, string>();
    for (const r of createdRoleIds) roleIdMap.set(r.name.toLowerCase(), r.id);
    // @everyone is special - find its ID from existing roles
    const everyoneRole = existingRoles.find((r: any) => r.name === "@everyone");

    // Delete roles not in plan — only if mode is "replace"
    if (plan.mode === "replace") {
      let roleDeleteCount = 0;
      for (const existing of existingRoles) {
        if (existing.name === "@everyone") continue;
        if (existing.managed) { logs.push(makeLog("sync", `Skip managed role: ${existing.name}`)); continue; }
        if (MANAGED_ROLE_NAMES.has(existing.name)) { logs.push(makeLog("sync", `Skip managed role: ${existing.name}`)); continue; }
        if (!planRoleNamesLower.has(existing.name.toLowerCase())) {
          try {
            await discordFetch(`/guilds/${guildId}/roles/${existing.id}`, { method: "DELETE" });
            logs.push(makeLog("ok", `Deleted role: ${existing.name}`));
            roleDeleteCount++;
            await new Promise(r => setTimeout(r, 300));
          } catch (err: any) {
            logs.push(makeLog("error", `Failed to delete role ${existing.name}: ${err.message}`));
          }
        }
      }
    } else {
      logs.push(makeLog("sync", "Keeping all existing roles (plan mode is add/update only)"));
    }

    // Reorder roles by priority
    if (createdRoleIds.length > 0) {
      try {
        createdRoleIds.sort((a, b) => {
          const ra = plan.roles.find(r => r.name === a.name);
          const rb = plan.roles.find(r => r.name === b.name);
          return (rolePriority(ra || { name: "", permissions: [] }) - rolePriority(rb || { name: "", permissions: [] }));
        });
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
    // Refresh category map with all existing categories
    const freshChannels: any[] = await discordFetch(`/guilds/${guildId}/channels`);
    for (const ch of freshChannels) {
      if (ch.type === 4) {
        createdCategories.set(ch.name, ch.id);
      }
    }

    // --- CHANNELS (rich channel_details or simple text/voice) ---
    const createdChannelIds: { name: string; id: string }[] = [];

    const channelsToCreate: ChannelDetail[] = [];
    if (plan.channel_details && plan.channel_details.length > 0) {
      // Use rich channel details
      for (const cd of plan.channel_details) {
        channelsToCreate.push(cd);
      }
    } else {
      // Fall back to simple text/voice
      for (const chName of plan.channels.text) {
        channelsToCreate.push({ name: chName, type: "text", nsfw: plan.nsfw_channels?.includes(chName) || false });
      }
      for (const chName of plan.channels.voice) {
        channelsToCreate.push({ name: chName, type: "voice" });
      }
    }

    for (const ch of channelsToCreate) {
      const typeId = CHANNEL_TYPE_MAP[ch.type] ?? 0;
      const existing = existingChannels.find((c: any) => c.name.toLowerCase() === ch.name.toLowerCase() && c.type === typeId);
      if (existing) {
        logs.push(makeLog("sync", `Channel exists: #${ch.name}`));
        createdChannelIds.push({ name: ch.name, id: existing.id });
        // Update nsfw, topic, slowmode on existing channel
        try {
          const patchBody: Record<string, any> = {};
          if (ch.topic !== undefined) patchBody.topic = ch.topic;
          if (ch.slowmode !== undefined) patchBody.rate_limit_per_user = Math.min(21600, Math.max(0, ch.slowmode));
          if (ch.nsfw !== undefined && (ch.type === "text" || ch.type === "announcement")) patchBody.nsfw = ch.nsfw;
          if (Object.keys(patchBody).length > 0) {
            await discordFetch(`/channels/${existing.id}`, {
              method: "PATCH",
              body: JSON.stringify(patchBody),
            });
          }
        } catch {}
        continue;
      }
      try {
        const parentId = ch.parent ? createdCategories.get(ch.parent) : undefined;
        const body: Record<string, any> = { name: ch.name, type: typeId };
        if (parentId) body.parent_id = parentId;
        if (ch.topic !== undefined) body.topic = ch.topic;
        if (ch.slowmode !== undefined) body.rate_limit_per_user = Math.min(21600, Math.max(0, ch.slowmode));
        if (ch.nsfw !== undefined && (ch.type === "text" || ch.type === "announcement")) body.nsfw = ch.nsfw;

        // Build permission overwrites
        if (ch.permission_overwrites && ch.permission_overwrites.length > 0) {
          body.permission_overwrites = buildOverwrites(ch.permission_overwrites, roleIdMap, everyoneRole?.id);
        }

        const newCh: any = await discordFetch(`/guilds/${guildId}/channels`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        createdChannelIds.push({ name: ch.name, id: newCh.id });
        logs.push(makeLog("ok", `Created ${ch.type} channel: #${ch.name}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create ${ch.type} channel #${ch.name}: ${err.message}`));
      }
    }

    // Apply permission overwrites to existing channels that were not re-created
    if (plan.channel_details && plan.channel_details.length > 0) {
      for (const ch of plan.channel_details) {
        if (!ch.permission_overwrites || ch.permission_overwrites.length === 0) continue;
        const created = createdChannelIds.find(c => c.name === ch.name);
        if (!created) continue;
        // Check if already applied during creation
        const existing = existingChannels.find((c: any) => c.name.toLowerCase() === ch.name.toLowerCase());
        if (existing && existing.id === created.id) {
          // Was existing, not re-created — apply overwrites now
          try {
            const overwrites = buildOverwrites(ch.permission_overwrites, roleIdMap, everyoneRole?.id);
            await discordFetch(`/channels/${created.id}`, {
              method: "PATCH",
              body: JSON.stringify({ permission_overwrites: overwrites }),
            });
            logs.push(makeLog("ok", `Applied permission overwrites to #${ch.name}`));
          } catch (err: any) {
            logs.push(makeLog("error", `Failed to apply permission overwrites to #${ch.name}: ${err.message}`));
          }
        }
      }
    }

    // --- DELETE CHANNELS NOT IN PLAN (only if mode is "replace") ---
    if (plan.mode === "replace") {
      const latestChannels: any[] = await discordFetch(`/guilds/${guildId}/channels`);
      const systemChannelIds = new Set<string>();
      try {
        const guild: any = await discordFetch(`/guilds/${guildId}`);
        if (guild.system_channel_id) systemChannelIds.add(guild.system_channel_id);
        if (guild.rules_channel_id) systemChannelIds.add(guild.rules_channel_id);
        if (guild.public_updates_channel_id) systemChannelIds.add(guild.public_updates_channel_id);
      } catch {}

      for (const existing of latestChannels) {
        if (existing.type === 4 && plan.category_structure.some(c => c.name.toLowerCase() === existing.name.toLowerCase())) continue;
        if (systemChannelIds.has(existing.id)) { logs.push(makeLog("sync", `Skip system channel: #${existing.name}`)); continue; }
        if (existing.managed) { logs.push(makeLog("sync", `Skip managed channel: #${existing.name}`)); continue; }
        if (!planChannelNamesLower.has(existing.name.toLowerCase())) {
          try {
            await discordFetch(`/channels/${existing.id}`, { method: "DELETE" });
            logs.push(makeLog("ok", `Deleted channel: #${existing.name}`));
            await new Promise(r => setTimeout(r, 300));
          } catch (err: any) {
            logs.push(makeLog("error", `Failed to delete #${existing.name}: ${err.message}`));
          }
        }
      }
    } else {
      logs.push(makeLog("sync", "Keeping all existing channels (plan mode is add/update only)"));
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
        const chList: any[] = await discordFetch(`/guilds/${guildId}/channels`);
        const found = chList.find((c: any) => c.name.toLowerCase() === gs.system_channel!.toLowerCase() && c.type === 0);
        if (found) patchBody.system_channel_id = found.id;
      }
      if (gs.afk_channel) {
        const chList: any[] = await discordFetch(`/guilds/${guildId}/channels`);
        const found = chList.find((c: any) => c.name.toLowerCase() === gs.afk_channel!.toLowerCase() && c.type === 2);
        if (found) patchBody.afk_channel_id = found.id;
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

    // --- AUTO-MOD RULES ---
    if (plan.auto_mod && plan.auto_mod.length > 0) {
      const hasManageGuild = hasAdmin || allGuildRoles.some((r: any) => botRoleIds.has(r.id) && (BigInt(r.permissions) & 0x20n) === 0x20n);
      if (!hasManageGuild) {
        logs.push(makeLog("warn", "Bot needs Manage Guild permission to set auto-mod rules. Skipping."));
      } else {
        for (const rule of plan.auto_mod) {
          if (!rule.enabled) continue;
          try {
            const existingRules: any[] = await discordFetch(`/guilds/${guildId}/auto-moderation/rules`);
            const exists = existingRules.find((r: any) => r.name.toLowerCase() === rule.type.toLowerCase());
            if (exists) {
              logs.push(makeLog("sync", `Auto-mod rule already exists: ${rule.type}`));
              continue;
            }
            const amBody = buildAutoModRule(rule, guildId, roleIdMap, everyoneRole?.id);
            if (amBody) {
              await discordFetch(`/guilds/${guildId}/auto-moderation/rules`, {
                method: "POST",
                body: JSON.stringify(amBody),
              });
              logs.push(makeLog("ok", `Created auto-mod rule: ${rule.type}`));
            }
          } catch (err: any) {
            logs.push(makeLog("error", `Failed to create auto-mod rule ${rule.type}: ${err.message}`));
          }
        }
      }
    }

    // --- RECOMMENDED BOTS ---
    if (plan.recommended_bots && plan.recommended_bots.length > 0) {
      logs.push(makeLog("sync", `Recommended bots: ${plan.recommended_bots.join(", ")}`));
    }

    logs.push(makeLog("done", "Server structure applied successfully"));
    return { success: true, logs };
  } catch (err: any) {
    logs.push(makeLog("error", `Execution failed: ${err.message}`));
    return { success: false, logs };
  }
}

function buildOverwrites(
  overwrites: PermissionOverwrite[],
  roleIdMap: Map<string, string>,
  everyoneRoleId?: string
): { id: string; type: number; allow: string; deny: string }[] {
  return overwrites.map(ow => {
    const roleNameLower = ow.role.toLowerCase();
    let id = roleIdMap.get(roleNameLower);
    if (!id && roleNameLower === "@everyone" && everyoneRoleId) {
      id = everyoneRoleId;
    }
    if (!id) id = "0"; // fallback — will likely fail
    return {
      id,
      type: 0,
      allow: resolvePermissions(ow.allow || []),
      deny: resolvePermissions(ow.deny || []),
    };
  });
}

function buildAutoModRule(
  rule: { type: string; enabled: boolean; limit?: number; channel_exceptions?: string[] },
  guildId: string,
  roleIdMap: Map<string, string>,
  everyoneRoleId?: string
): Record<string, any> | null {
  const base = {
    name: rule.type,
    enabled: true,
    exempt_roles: [] as string[],
    exempt_channels: [] as string[],
  };

  // Map channel exceptions to IDs
  if (rule.channel_exceptions && rule.channel_exceptions.length > 0) {
    // We'll use names and resolve later — for now leave empty
    base.exempt_channels = [];
  }

  switch (rule.type) {
    case "spam":
      return {
        ...base,
        event_type: 1,
        trigger_type: 3,
        trigger_metadata: {},
        actions: [{ type: 1, metadata: { timeout_seconds: 60 } }],
      };
    case "mass_mentions":
    case "mass_mention":
      return {
        ...base,
        event_type: 1,
        trigger_type: 5,
        trigger_metadata: { mention_total_limit: rule.limit || 5 },
        actions: [{ type: 1, metadata: { timeout_seconds: 60 } }],
      };
    case "invite_links":
    case "invite":
      return {
        ...base,
        event_type: 1,
        trigger_type: 1,
        trigger_metadata: {
          presets: [1], // 1 = invites
        },
        actions: [{ type: 1, metadata: { timeout_seconds: 60 } }],
        exempt_channels: [], // will be resolved during execution
      };
    case "nsfw":
      return {
        ...base,
        event_type: 1,
        trigger_type: 1,
        trigger_metadata: {
          presets: [3], // 3 = explicit content
        },
        actions: [{ type: 1, metadata: { timeout_seconds: 60 } }],
      };
    case "keywords":
    case "keyword":
      return null; // Not implemented
    default:
      return null;
  }
}
