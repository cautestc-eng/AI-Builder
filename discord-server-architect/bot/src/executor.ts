import { ServerPlan, LogEntry } from "./types";

interface ExecuteRequest {
  guildId: string;
  plan: ServerPlan;
  executionId: string;
  token: string;
}

interface ExecuteResponse {
  success: boolean;
  logs: LogEntry[];
  error?: string;
}

type PermissionResolveMap = Record<string, bigint>;

const PERMISSIONS: PermissionResolveMap = {
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_TTS_MESSAGES: 1n << 12n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EMOJIS_AND_STICKERS: 1n << 30n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
  MODERATE_MEMBERS: 1n << 39n,
};

function resolvePermissions(perms: string[]): bigint {
  let resolved = 0n;
  for (const perm of perms) {
    const flag = PERMISSIONS[perm];
    if (flag) resolved |= flag;
  }
  return resolved;
}

function makeLog(type: LogEntry["type"], message: string): LogEntry {
  return { type, message, timestamp: new Date().toISOString() };
}

export async function executePlan(
  client: any,
  req: ExecuteRequest
): Promise<ExecuteResponse> {
  const logs: LogEntry[] = [];
  const guild = client.guilds.cache.get(req.guildId);

  if (!guild) {
    return { success: false, logs: [makeLog("error", "Bot is not in this guild")], error: "Bot not in guild" };
  }

  try {
    for (const role of req.plan.roles) {
      try {
        const existingRole = guild.roles.cache.find((r: any) => r.name === role.name);
        if (existingRole) {
          logs.push(makeLog("sync", `Role already exists: ${role.name}`));
          continue;
        }

        const permissions = resolvePermissions(role.permissions);
        await guild.roles.create({
          name: role.name,
          permissions,
          color: role.color || undefined,
          reason: "Discord Server Architect - AI generated",
        });
        logs.push(makeLog("ok", `Creating role: ${role.name}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create role ${role.name}: ${err.message}`));
      }
    }

    const categoryMap = new Map<string, any>();
    for (const cat of req.plan.category_structure) {
      try {
        const existingCat = guild.channels.cache.find(
          (c: any) => c.type === 4 && c.name === cat.name
        );
        if (existingCat) {
          categoryMap.set(cat.name, existingCat);
          logs.push(makeLog("sync", `Category exists: ${cat.name}`));
          continue;
        }

        const newCat = await guild.channels.create({
          name: cat.name,
          type: 4,
          reason: "Discord Server Architect - AI generated",
        });
        categoryMap.set(cat.name, newCat);
        logs.push(makeLog("ok", `Creating category: ${cat.name}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create category ${cat.name}: ${err.message}`));
      }
    }

    for (const chName of req.plan.channels.text) {
      try {
        const existingCh = guild.channels.cache.find(
          (c: any) => c.type === 0 && c.name === chName
        );
        if (existingCh) {
          logs.push(makeLog("sync", `Text channel exists: #${chName}`));
          continue;
        }

        const parent = findCategoryForChannel(chName, req.plan.category_structure, categoryMap);
        await guild.channels.create({
          name: chName,
          type: 0,
          parent: parent?.id || undefined,
          reason: "Discord Server Architect - AI generated",
        });
        logs.push(makeLog("ok", `Creating channel: #${chName}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create channel #${chName}: ${err.message}`));
      }
    }

    for (const chName of req.plan.channels.voice) {
      try {
        const existingCh = guild.channels.cache.find(
          (c: any) => c.type === 2 && c.name === chName
        );
        if (existingCh) {
          logs.push(makeLog("sync", `Voice channel exists: ${chName}`));
          continue;
        }

        const parent = findCategoryForChannel(chName, req.plan.category_structure, categoryMap);
        await guild.channels.create({
          name: chName,
          type: 2,
          parent: parent?.id || undefined,
          reason: "Discord Server Architect - AI generated",
        });
        logs.push(makeLog("ok", `Creating voice channel: ${chName}`));
      } catch (err: any) {
        logs.push(makeLog("error", `Failed to create voice channel ${chName}: ${err.message}`));
      }
    }

    logs.push(makeLog("sync", "Updating guild cache"));
    logs.push(makeLog("done", "Server structure applied successfully"));

    return { success: true, logs };
  } catch (err: any) {
    logs.push(makeLog("error", `Execution failed: ${err.message}`));
    return { success: false, logs, error: err.message };
  }
}

function findCategoryForChannel(
  channelName: string,
  categories: { name: string; channels: string[] }[],
  categoryMap: Map<string, any>
): any | null {
  for (const cat of categories) {
    if (cat.channels.includes(channelName)) {
      return categoryMap.get(cat.name) || null;
    }
  }
  return null;
}
