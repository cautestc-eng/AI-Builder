import { DiscordUser, DiscordGuild } from "@/types";

const DISCORD_API = "https://discord.com/api/v10";

export function getOAuthURL(state: string): string {
  const url = new URL(`${DISCORD_API}/oauth2/authorize`);
  url.searchParams.set("client_id", process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify guilds guilds.join");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<{ access_token: string } | null> {
  const body = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
    client_secret: process.env.DISCORD_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) return null;
  return res.json();
}

export async function fetchUser(accessToken: string): Promise<DiscordUser | null> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchGuilds(accessToken: string): Promise<DiscordGuild[] | null> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

const PERMISSION_FLAGS: Record<string, bigint> = {
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
  VIEW_GUILD_INSIGHTS: 1n << 19n,
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
  REQUEST_TO_SPEAK: 1n << 32n,
  MANAGE_THREADS: 1n << 33n,
  CREATE_PUBLIC_THREADS: 1n << 34n,
  CREATE_PRIVATE_THREADS: 1n << 35n,
  USE_EXTERNAL_STICKERS: 1n << 36n,
  SEND_MESSAGES_IN_THREADS: 1n << 37n,
  USE_EMBEDDED_ACTIVITIES: 1n << 38n,
  MODERATE_MEMBERS: 1n << 39n,
};

export function hasPermission(permissions: string, permission: string): boolean {
  try {
    const perms = BigInt(permissions);
    const flag = PERMISSION_FLAGS[permission];
    if (!flag) return false;
    return (perms & flag) === flag || (perms & PERMISSION_FLAGS.ADMINISTRATOR) === PERMISSION_FLAGS.ADMINISTRATOR;
  } catch {
    return false;
  }
}

export function isOwner(guild: DiscordGuild, userId: string): boolean {
  return guild.owner_id === userId || guild.owner === true;
}

export function canManageGuild(permissions: string): boolean {
  return hasPermission(permissions, "MANAGE_GUILD") || hasPermission(permissions, "ADMINISTRATOR");
}

export { PERMISSION_FLAGS };
