-- Supabase SQL Schema for Discord Server Architect
-- Run this in your Supabase SQL editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Guilds table
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  bot_installed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Server versions (snapshots for rollback)
CREATE TABLE IF NOT EXISTS server_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  plan_json JSONB NOT NULL,
  execution_log JSONB DEFAULT '[]'::jsonb,
  version_name TEXT NOT NULL DEFAULT 'v1'
);

-- Execution logs
CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  version_id UUID REFERENCES server_versions(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
  logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guilds_owner ON guilds(owner_id);
CREATE INDEX IF NOT EXISTS idx_versions_guild ON server_versions(guild_id);
CREATE INDEX IF NOT EXISTS idx_executions_guild ON executions(guild_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
