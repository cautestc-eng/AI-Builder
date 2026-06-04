import { ServerPlan } from "@/types";

export const ALLOWED_PERMISSIONS = new Set([
  "CREATE_INSTANT_INVITE", "KICK_MEMBERS", "BAN_MEMBERS",
  "ADMINISTRATOR", "MANAGE_CHANNELS", "MANAGE_GUILD",
  "ADD_REACTIONS", "VIEW_AUDIT_LOG", "PRIORITY_SPEAKER",
  "STREAM", "VIEW_CHANNEL", "SEND_MESSAGES", "SEND_TTS_MESSAGES",
  "MANAGE_MESSAGES", "EMBED_LINKS", "ATTACH_FILES",
  "READ_MESSAGE_HISTORY", "MENTION_EVERYONE", "USE_EXTERNAL_EMOJIS",
  "VIEW_GUILD_INSIGHTS", "CONNECT", "SPEAK", "MUTE_MEMBERS",
  "DEAFEN_MEMBERS", "MOVE_MEMBERS", "USE_VAD", "CHANGE_NICKNAME",
  "MANAGE_NICKNAMES", "MANAGE_ROLES", "MANAGE_WEBHOOKS",
  "MANAGE_EMOJIS_AND_STICKERS", "USE_APPLICATION_COMMANDS",
  "REQUEST_TO_SPEAK", "MANAGE_THREADS", "CREATE_PUBLIC_THREADS",
  "CREATE_PRIVATE_THREADS", "USE_EXTERNAL_STICKERS",
  "SEND_MESSAGES_IN_THREADS", "USE_EMBEDDED_ACTIVITIES",
  "MODERATE_MEMBERS",
]);

const DANGEROUS_PERMISSIONS = new Set([
  "ADMINISTRATOR", "KICK_MEMBERS", "BAN_MEMBERS",
  "MANAGE_GUILD", "MANAGE_ROLES", "MANAGE_WEBHOOKS",
]);

const MAX_ROLES = 250;
const MAX_TEXT_CHANNELS = 250;
const MAX_VOICE_CHANNELS = 250;
const MAX_TOTAL_CHANNELS = 500;

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePlan(plan: unknown): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (!plan || typeof plan !== "object") {
    result.errors.push("Plan must be a JSON object");
    result.valid = false;
    return result;
  }

  const p = plan as Record<string, unknown>;

  if (!Array.isArray(p.roles)) {
    result.errors.push("roles must be an array");
    result.valid = false;
  } else {
    if (p.roles.length > MAX_ROLES) {
      result.errors.push(`Too many roles (${p.roles.length} > ${MAX_ROLES})`);
      result.valid = false;
    }
    for (let i = 0; i < p.roles.length; i++) {
      const role = p.roles[i] as Record<string, unknown>;
      const roleName = role.name;
      if (typeof roleName !== "string") {
        result.errors.push(`Role at index ${i} must have a name`);
        result.valid = false;
        continue;
      }
      if (roleName.length > 100) {
        result.errors.push(`Role name "${roleName}" exceeds 100 characters`);
        result.valid = false;
      }
      if (Array.isArray(role.permissions)) {
        for (const perm of role.permissions) {
          const permStr = perm as string;
          if (!ALLOWED_PERMISSIONS.has(permStr)) {
            result.errors.push(`Invalid permission "${permStr}" in role "${roleName}"`);
            result.valid = false;
          }
          if (DANGEROUS_PERMISSIONS.has(permStr)) {
            result.warnings.push(`Role "${roleName}" has dangerous permission: ${permStr}`);
          }
        }
      }
    }
  }

  if (!p.channels || typeof p.channels !== "object") {
    result.errors.push("channels must be an object with text and voice arrays");
    result.valid = false;
  } else {
    const channels = p.channels as Record<string, unknown>;
    if (!Array.isArray(channels.text)) {
      result.errors.push("channels.text must be an array");
      result.valid = false;
    } else {
      if (channels.text.length > MAX_TEXT_CHANNELS) {
        result.errors.push(`Too many text channels (${channels.text.length} > ${MAX_TEXT_CHANNELS})`);
        result.valid = false;
      }
      for (const ch of channels.text) {
        if (typeof ch !== "string" || ch.length > 100) {
          result.errors.push(`Invalid text channel name: "${ch}"`);
          result.valid = false;
        }
      }
    }
    if (!Array.isArray(channels.voice)) {
      result.errors.push("channels.voice must be an array");
      result.valid = false;
    } else {
      if (channels.voice.length > MAX_VOICE_CHANNELS) {
        result.errors.push(`Too many voice channels (${channels.voice.length} > ${MAX_VOICE_CHANNELS})`);
        result.valid = false;
      }
      for (const ch of channels.voice) {
        if (typeof ch !== "string" || ch.length > 100) {
          result.errors.push(`Invalid voice channel name: "${ch}"`);
          result.valid = false;
        }
      }
    }
    const totalChannels = (Array.isArray(channels.text) ? channels.text.length : 0) +
      (Array.isArray(channels.voice) ? channels.voice.length : 0);
    if (totalChannels > MAX_TOTAL_CHANNELS) {
      result.errors.push(`Too many total channels (${totalChannels} > ${MAX_TOTAL_CHANNELS})`);
      result.valid = false;
    }
  }

  if (p.category_structure !== undefined && !Array.isArray(p.category_structure)) {
    result.errors.push("category_structure must be an array");
    result.valid = false;
  } else if (Array.isArray(p.category_structure)) {
    for (let i = 0; i < p.category_structure.length; i++) {
      const cat = p.category_structure[i] as Record<string, unknown>;
      const catName = cat.name;
      if (typeof catName !== "string") {
        result.errors.push(`Category at index ${i} must have a name`);
        result.valid = false;
        continue;
      }
      if (!Array.isArray(cat.channels)) {
        result.errors.push(`Category "${catName}" channels must be an array`);
        result.valid = false;
      }
    }
  }

  if (p.nsfw_channels !== undefined) {
    if (!Array.isArray(p.nsfw_channels)) {
      result.errors.push("nsfw_channels must be an array");
      result.valid = false;
    } else {
      for (const ch of p.nsfw_channels) {
        if (typeof ch !== "string") {
          result.errors.push("nsfw_channels must contain only strings");
          result.valid = false;
        }
      }
    }
  }

  return result;
}

export function sanitizePlan(plan: ServerPlan): ServerPlan {
  return {
    roles: plan.roles.map((r) => ({
      name: r.name.trim(),
      permissions: r.permissions.filter((p) => ALLOWED_PERMISSIONS.has(p)),
      color: r.color,
    })),
    channels: {
      text: plan.channels.text.map((c) => c.trim()).filter(Boolean),
      voice: plan.channels.voice.map((c) => c.trim()).filter(Boolean),
    },
    nsfw_channels: (plan.nsfw_channels || []).map((c) => c.trim()).filter(Boolean),
    category_structure: plan.category_structure.map((c) => ({
      name: c.name.trim(),
      channels: c.channels.map((ch) => ch.trim()).filter(Boolean),
    })),
    mode: plan.mode || "add",
  };
}
