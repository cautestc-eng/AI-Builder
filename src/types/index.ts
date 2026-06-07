export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  owner_id?: string;
  bot_installed?: boolean;
}

export interface GuildSettings {
  verification_level?: "none" | "low" | "medium" | "high" | "very_high";
  default_message_notifications?: "all" | "only_mentions";
  explicit_content_filter?: "disabled" | "members_without_roles" | "all_members";
  system_channel?: string;
  afk_channel?: string;
  afk_timeout?: number;
}

export interface PermissionOverwrite {
  role: string;
  allow: string[];
  deny: string[];
}

export interface ChannelDetail {
  name: string;
  type: "text" | "voice" | "announcement" | "forum";
  topic?: string;
  nsfw?: boolean;
  slowmode?: number;
  parent?: string;
  permission_overwrites?: PermissionOverwrite[];
}

export interface AutoModRule {
  type: string;
  enabled: boolean;
  limit?: number;
  channel_exceptions?: string[];
}

export interface ServerPlan {
  roles: ServerRole[];
  channels: {
    text: string[];
    voice: string[];
  };
  nsfw_channels?: string[];
  category_structure: ServerCategory[];
  guild_settings?: GuildSettings;
  mode?: "add" | "replace";
  channel_details?: ChannelDetail[];
  auto_mod?: AutoModRule[];
  recommended_bots?: string[];
}

export interface ServerRole {
  name: string;
  permissions: string[];
  color?: string;
  hoist?: boolean;
  mentionable?: boolean;
}

export interface ServerCategory {
  name: string;
  channels: string[];
}

export interface ExecutionLog {
  id: string;
  guild_id: string;
  status: "pending" | "running" | "success" | "failed";
  logs: LogEntry[];
  created_at: string;
}

export interface LogEntry {
  type: "ok" | "error" | "sync" | "done" | "warn";
  message: string;
  timestamp: string;
}

export interface ServerVersion {
  id: string;
  guild_id: string;
  created_by: string;
  created_at: string;
  plan_json: ServerPlan;
  execution_log: LogEntry[];
  version_name: string;
}

export type PermissionAction =
  | "CREATE_INSTANT_INVITE"
  | "KICK_MEMBERS"
  | "BAN_MEMBERS"
  | "ADMINISTRATOR"
  | "MANAGE_CHANNELS"
  | "MANAGE_GUILD"
  | "ADD_REACTIONS"
  | "VIEW_AUDIT_LOG"
  | "PRIORITY_SPEAKER"
  | "STREAM"
  | "VIEW_CHANNEL"
  | "SEND_MESSAGES"
  | "SEND_TTS_MESSAGES"
  | "MANAGE_MESSAGES"
  | "EMBED_LINKS"
  | "ATTACH_FILES"
  | "READ_MESSAGE_HISTORY"
  | "MENTION_EVERYONE"
  | "USE_EXTERNAL_EMOJIS"
  | "VIEW_GUILD_INSIGHTS"
  | "CONNECT"
  | "SPEAK"
  | "MUTE_MEMBERS"
  | "DEAFEN_MEMBERS"
  | "MOVE_MEMBERS"
  | "USE_VAD"
  | "CHANGE_NICKNAME"
  | "MANAGE_NICKNAMES"
  | "MANAGE_ROLES"
  | "MANAGE_WEBHOOKS"
  | "MANAGE_EMOJIS_AND_STICKERS"
  | "USE_APPLICATION_COMMANDS"
  | "REQUEST_TO_SPEAK"
  | "MANAGE_THREADS"
  | "CREATE_PUBLIC_THREADS"
  | "CREATE_PRIVATE_THREADS"
  | "USE_EXTERNAL_STICKERS"
  | "SEND_MESSAGES_IN_THREADS"
  | "USE_EMBEDDED_ACTIVITIES"
  | "MODERATE_MEMBERS";
