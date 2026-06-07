# Discord Architect

AI-powered Discord server builder. Describe your ideal server, and the AI generates the roles, channels, categories, permissions, guild settings, auto-mod rules, and more — then applies it to your server via a Discord bot.

Built with Next.js 16, TypeScript, Tailwind v4, ShadCN UI, Supabase, and runs entirely on Vercel.

## Features

- **AI-powered generation** — describe your server in plain English, get a complete plan back
- **Rich channel configs** — text, voice, announcement, forum channels with topics, slowmode, NSFW
- **Permission overwrites** — per-channel role-based allow/deny
- **Auto-mod rules** — spam, mass-mention, invite link, and NSFW filtering
- **Guild settings** — verification level, content filter, notifications, AFK/system channels
- **JSON import** — paste a plan JSON directly for fine-grained control
- **Saved versions** — auto-save before every execution, browse and revert
- **Deletion preview** — see what will be removed before applying
- **Replace mode** — full server nuke-and-replace, or safe add/update-only
- **Gateway bot** — online presence with custom status (separate deployment)
- **Rate limits** — 10 generations/day, 20 executions/day, 5s guild cooldown
- **Content safety** — hate speech, violence, illegal, political, and extremist content filtered

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| UI | ShadCN UI + Radix/Framer Motion |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth + Discord OAuth |
| AI Providers | Groq (default), DeepSeek, NVIDIA |
| Discord API | Bot token + OAuth2 |
| Deployment | Vercel (Hobby plan: 300s functions) |

## Prerequisites

- Node.js 20+
- A Discord Application with Bot + OAuth2 enabled
- A Supabase project (or set `NEXT_PUBLIC_SUPABASE_URL` to a placeholder to run without)
- At least one AI API key: Groq, DeepSeek, or NVIDIA

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/discord-architect.git
cd discord-architect
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in the required variables (see [Environment Variables](#environment-variables) below).

### 3. Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Under **OAuth2** → **General**:
   - Add redirect: `http://localhost:3000/api/auth/callback`
   - Save
4. Under **OAuth2** → **URL Generator**:
   - Scopes: `identify`, `guilds`, `guilds.join`
5. Under **Bot**:
   - Create the bot
   - Privileged Gateway Intents: `Server Members Intent`, `Message Content Intent`
   - Copy the token

### 4. Supabase (optional)

Create a project and run the schema:

```sql
-- guilds
CREATE TABLE guilds (
  id TEXT PRIMARY KEY,
  name TEXT,
  icon TEXT,
  owner_id TEXT NOT NULL,
  bot_installed BOOLEAN DEFAULT false
);

-- server_versions
CREATE TABLE server_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  plan_json JSONB NOT NULL,
  execution_log JSONB DEFAULT '[]',
  version_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- executions
CREATE TABLE executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  version_id UUID,
  status TEXT DEFAULT 'running',
  logs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- rate_limits
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  count INT DEFAULT 0,
  UNIQUE(user_id, date)
);

-- sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  discord_access_token TEXT NOT NULL,
  discord_refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- security_logs
CREATE TABLE security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_CLIENT_ID` | Yes | Discord app client ID |
| `DISCORD_CLIENT_SECRET` | Yes | Discord app client secret |
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Yes | Same as DISCORD_CLIENT_ID (public) |
| `SESSION_SECRET` | Yes | Random string for session encryption |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_ANON_KEY` | No | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key |
| `GROQ_API_KEY` | No* | Groq API key |
| `DEEPSEEK_API_KEY` | No* | DeepSeek API key |
| `NVIDIA_API_KEY` | No* | NVIDIA API key |
| `NEXT_PUBLIC_APP_URL` | No | Public URL (defaults to localhost) |
| `AUTO_JOIN_GUILD_ID` | No | Guild ID to auto-join on first auth |

\* At least one AI provider key is required.

## AI Providers

The app supports three providers. Groq is the default:

| Provider | Model Key | Model ID |
|----------|-----------|----------|
| Groq | `llama-70b` | `llama-3.3-70b-versatile` |
| Groq | `llama-8b` | `llama-3.1-8b-instant` |
| Groq | `mixtral` | `mixtral-8x7b-32768` |
| DeepSeek | `deepseek-chat` | `deepseek-v4-flash` |
| NVIDIA | `nvidia-llama` | `meta/llama-3.1-8b-instruct` |

Set the default in `src/lib/ai/provider.ts:450` or pass `model` in the API request body.

## Deployment

Deploy to Vercel with zero config:

```bash
npx vercel
```

Set all environment variables in the Vercel dashboard. The function timeout is configured as `maxDuration: 300` (Vercel Hobby limit).

## Gateway Bot (Separate)

For the online presence + custom status feature, deploy the bot in `bot/` separately:

```bash
cd bot
npm install
# Set DISCORD_BOT_TOKEN in .env
node index.js
```

This is a simple CommonJS Discord.js v14 bot that maintains online presence.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/discord` | GET | Start Discord OAuth flow |
| `/api/auth/callback` | GET | OAuth callback handler |
| `/api/auth/session` | GET/DELETE | Get/destroy session |
| `/api/guilds` | GET | List user's manageable guilds |
| `/api/guilds/[id]` | GET | Guild details + versions |
| `/api/guilds/[id]/channels` | GET | Current channels + roles |
| `/api/ai/generate` | POST | Generate a plan (conversation mode) |
| `/api/execute` | POST | Apply a plan to a guild |
| `/api/versions` | GET/POST | List/save plan versions |
| `/api/versions/[id]` | DELETE | Delete a saved version |
| `/api/bot/guild-check` | GET | Check if bot is in guild |

## License

MIT
