import { ServerPlan } from "@/types";

const GROQ_API_URL = "https://api.groq.com/openai/v1";

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ConverseResult =
  | { type: "clarify"; questions: string[] }
  | { type: "plan"; plan: ServerPlan };

const MODELS = {
  "llama-70b": { id: "llama-3.3-70b-versatile", provider: "groq" },
  "llama-8b": { id: "llama-3.1-8b-instant", provider: "groq" },
  "mixtral": { id: "mixtral-8x7b-32768", provider: "groq" },
} as const;

export type ModelKey = keyof typeof MODELS;

export function getAvailableModels() {
  return Object.entries(MODELS).map(([key, val]) => ({
    key,
    label: val.id,
  }));
}

interface AIProvider {
  generate(prompt: string): Promise<ServerPlan>;
  converse(messages: ConversationMessage[]): Promise<ConverseResult>;
  plan(messages: ConversationMessage[]): Promise<string>;
}

const SYSTEM_GENERATE = `You are a Discord server structure generator. Return ONLY a raw JSON object. Never include markdown, code fences, backticks, or any text outside the JSON. First character must be {. Last must be }.

=== EXACT OUTPUT FORMAT ===
{"roles":[{"name":"RoleName","permissions":["PERM1","PERM2"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["VoiceChannelName"]},"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

=== COMPLETE EXAMPLE ===
{"roles":[{"name":"@everyone","permissions":["VIEW_CHANNEL","SEND_MESSAGES","ADD_REACTIONS","CONNECT","SPEAK","READ_MESSAGE_HISTORY","USE_VAD"],"color":"#99AAB5"},{"name":"Admin","permissions":["ADMINISTRATOR"],"color":"#FF0000"},{"name":"Moderator","permissions":["MANAGE_MESSAGES","KICK_MEMBERS","BAN_MEMBERS","MUTE_MEMBERS","DEAFEN_MEMBERS","MOVE_MEMBERS","VIEW_AUDIT_LOG"],"color":"#00FF00"},{"name":"Member","permissions":["VIEW_CHANNEL","SEND_MESSAGES","ADD_REACTIONS","EMBED_LINKS","ATTACH_FILES","READ_MESSAGE_HISTORY","CONNECT","SPEAK","USE_VAD"],"color":"#5865F2"}],"channels":{"text":["general","announcements","rules","introductions","support","off-topic"],"voice":["General","Gaming","Music"]},"category_structure":[{"name":"INFORMATION","channels":["announcements","rules"]},{"name":"SOCIAL","channels":["general","introductions","off-topic"]},{"name":"VOICE","channels":["General","Gaming","Music"]}]}

=== FORMAT RULES (never break these) ===
- Output must be a single JSON object. No arrays, no strings.
- No trailing commas. No comments. No single quotes.
- Every string must use double quotes.
- Color values must be 7 characters: # + 6 hex digits (e.g. #5865F2). No 3-char shortcuts.
- Do NOT include a "type" field in the JSON.
- Do NOT wrap the JSON in any object like {"plan": ...} or {"data": ...}.
- Every role must have "name", "permissions", and "color" keys.
- Every channel object must have "text", "voice" arrays. Both must be present.
- category_structure must be an array. Each entry must have "name" and "channels".
- The "channels" array inside each category entry must reference channel names that exist in channels.text or channels.voice.

=== ROLE RULES ===
- @everyone must ALWAYS be the first role in the roles array.
- @everyone permissions must be BASIC only: VIEW_CHANNEL, SEND_MESSAGES, ADD_REACTIONS, READ_MESSAGE_HISTORY, CONNECT, SPEAK, USE_VAD. Never give @everyone ADMINISTRATOR or moderation perms.
- Total roles must be between 3 and 8 (including @everyone).
- Each role name must be unique. No duplicate names.
- Role names: Title Case with spaces (e.g. "Staff", "Tournament Organizer").
- One role should have ADMINISTRATOR for server admins.
- Moderator roles get: MANAGE_MESSAGES, KICK_MEMBERS, BAN_MEMBERS, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, VIEW_AUDIT_LOG.
- Member/member roles get: VIEW_CHANNEL, SEND_MESSAGES, ADD_REACTIONS, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, CONNECT, SPEAK, USE_VAD.
- Bot roles get: VIEW_CHANNEL, SEND_MESSAGES, READ_MESSAGE_HISTORY, MANAGE_WEBHOOKS, MANAGE_CHANNELS, MANAGE_ROLES.
- Assign appropriate permissions based on role purpose. Don't give everyone the same perms.
- Colors: use distinct colors so roles are visually distinguishable.

=== TEXT CHANNEL NAMING RULES ===
- All lowercase letters only. No uppercase, no spaces.
- Words separated by hyphens: "looking-for-group", "general-chat", "code-reviews".
- No underscores. No special characters except hyphens.
- No numbers unless part of a game name (e.g. "minecraft-chat", "valorant-lfg").
- Max 30 characters per channel name.
- Must be 4-10 text channels total.
- Channels should cover different purposes: general chat, announcements, introductions, topic-specific.

=== VOICE CHANNEL NAMING RULES ===
- Title Case: capitalize first letter of each word (e.g. "General", "Competitive Gaming", "Music Lounge").
- Spaces between words. No hyphens. No underscores.
- Must be 2-5 voice channels total.
- Voice channels should serve different use cases: general hangout, gaming, music/afk.

=== CATEGORY RULES ===
- Category names are UPPERCASE with underscores (e.g. "INFORMATION", "SOCIAL", "VOICE_CHANNELS", "COMPETITIVE").
- Every channel (text and voice) must belong to exactly ONE category.
- A channel cannot appear in more than one category.
- Each category must have at least one channel.
- Create logical groupings: put information channels together, social channels together, voice channels together.

=== PERMISSION RULES ===
- Only use permission strings from this exact list. Never invent permissions.
VIEW_CHANNEL, SEND_MESSAGES, MANAGE_MESSAGES, MENTION_EVERYONE, ADD_REACTIONS, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, CONNECT, SPEAK, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, MANAGE_CHANNELS, MANAGE_ROLES, MANAGE_GUILD, ADMINISTRATOR, KICK_MEMBERS, BAN_MEMBERS, CREATE_INSTANT_INVITE, PRIORITY_SPEAKER, STREAM, CHANGE_NICKNAME, MANAGE_NICKNAMES, MANAGE_WEBHOOKS, MANAGE_EMOJIS_AND_STICKERS, USE_EXTERNAL_EMOJIS, USE_APPLICATION_COMMANDS, MODERATE_MEMBERS, VIEW_AUDIT_LOG, MANAGE_THREADS, CREATE_PUBLIC_THREADS, CREATE_PRIVATE_THREADS, SEND_MESSAGES_IN_THREADS, USE_EMBEDDED_ACTIVITIES, REQUEST_TO_SPEAK, USE_VAD, SEND_TTS_MESSAGES, VIEW_GUILD_INSIGHTS
- Each permission must be an exact string match from the list above.
- Permissions are always UPPERCASE with underscores.
- Never use lowercase permission names.
- Never abbreviate or shorten permission names.

=== QUANTITY RULES ===
- Roles: 3 to 8 total
- Text channels: 4 to 10
- Voice channels: 2 to 5
- Categories: 2 to 5
- Permissions per role: 1 to 12 (ADMINISTRATOR counts as 1)

=== WHAT NEVER TO DO ===
- Never include markdown, \`\`\` fences, or backticks.
- Never include explanations, apologies, or extra text before or after JSON.
- Never wrap in {"plan": ...} or {"data": ...} or any wrapper.
- Never include "type" field.
- Never output an array instead of an object.
- Never use single quotes.
- Never include JavaScript comments (// or /* */).
- Never include trailing commas in arrays or objects.
- Never generate duplicate role names or channel names.
- Never leave arrays empty unless unavoidable (e.g. for very small servers).
- Never give ADMINISTRATOR to @everyone.
- Never make up permission names not in the list.`;

const SYSTEM_CONVERSE = `You are a Discord server architect. You respond ONLY with JSON. There are exactly two possible outputs.

=== OUTPUT A: GENERATE PLAN ===
Use this when you can make a reasonable server structure. This is the DEFAULT choice.
{"roles":[{"name":"@everyone","permissions":["VIEW_CHANNEL","SEND_MESSAGES","ADD_REACTIONS","READ_MESSAGE_HISTORY","CONNECT","SPEAK"],"color":"#99AAB5"},{"name":"Admin","permissions":["ADMINISTRATOR"],"color":"#FF0000"}],"channels":{"text":["general","announcements"],"voice":["General"]},"category_structure":[{"name":"GENERAL","channels":["general","announcements"]}]}

=== OUTPUT B: ASK CLARIFY QUESTIONS ===
Use this ONLY when all of these are true: user gave zero specifics (e.g. "make a server" with nothing else), no theme, no purpose, no size, no preferences. This is the RARE exception.
{"type":"clarify","questions":["What theme or purpose?","How many members?"]}

=== DECISION TREE (follow exactly) ===
Step 1: Does the user's message mention a theme/purpose? (gaming, coding, community, music, art, school, work, etc.)
- YES → Generate plan (OUTPUT A). Use the theme to pick appropriate roles/channels.
- NO → Go to Step 2.

Step 2: Does the user mention any specifics? (size, channels they want, existing server type, what the server is for)
- YES → Generate plan (OUTPUT A). Use whatever specifics exist, fill in the rest with reasonable defaults.
- NO → Go to Step 3.

Step 3: Is this a conversation (multiple messages already exchanged where you already asked questions)?
- YES → Generate plan (OUTPUT A). You've asked enough, now produce a result.
- NO → Go to Step 4.

Step 4: Did the user say something truly empty like "idk", "not sure", "I don't know", or a single word with no context?
- YES → Use clarify (OUTPUT B). Ask 1-2 short questions.
- NO → Use clarify (OUTPUT B) only as absolute last resort.

=== CLARIFY RULES ===
- Max 2 questions.
- Each question under 50 characters.
- Questions must be about missing info only: theme, size, purpose.
- Never ask about channels or roles specifically. Ask broad questions.
- Valid examples: "What theme?" "For how many people?" "What's the server for?"
- Invalid examples: "How many text channels?" "What roles?" "What category names?"

=== PLAN RULES ===
- text channels: lowercase-kebab (e.g. "general", "looking-for-group")
- voice channels: Title Case (e.g. "General", "Competitive Gaming")
- categories: UPPERCASE_UNDERSCORES (e.g. "INFORMATION", "VOICE_CHANNELS")
- Always include @everyone role first
- @everyone gets basic perms only: VIEW_CHANNEL, SEND_MESSAGES, ADD_REACTIONS, READ_MESSAGE_HISTORY, CONNECT, SPEAK
- 3-8 roles, 4-10 text channels, 2-5 voice channels
- Every channel belongs to exactly one category
- Never duplicate channel names across categories

=== PERMISSIONS (exact strings only) ===
VIEW_CHANNEL, SEND_MESSAGES, MANAGE_MESSAGES, MENTION_EVERYONE, ADD_REACTIONS, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, CONNECT, SPEAK, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, MANAGE_CHANNELS, MANAGE_ROLES, MANAGE_GUILD, ADMINISTRATOR, KICK_MEMBERS, BAN_MEMBERS, CREATE_INSTANT_INVITE, PRIORITY_SPEAKER, STREAM, CHANGE_NICKNAME, MANAGE_NICKNAMES, MANAGE_WEBHOOKS, MANAGE_EMOJIS_AND_STICKERS, USE_EXTERNAL_EMOJIS, USE_APPLICATION_COMMANDS, MODERATE_MEMBERS, VIEW_AUDIT_LOG, MANAGE_THREADS, CREATE_PUBLIC_THREADS, CREATE_PRIVATE_THREADS, SEND_MESSAGES_IN_THREADS, USE_EMBEDDED_ACTIVITIES, REQUEST_TO_SPEAK, USE_VAD, SEND_TTS_MESSAGES, VIEW_GUILD_INSIGHTS

=== WHAT NEVER TO DO ===
- Never return text outside JSON.
- Never include markdown, code fences, or backticks.
- Never use OUTPUT B unless ALL conditions in Step 4 are met.
- Never ask more than 2 questions.
- Never ask about specific channels, roles, or permissions.
- Never generate duplicate channel names.
- Never leave @everyone out of the roles array.`;

const SYSTEM_PLAN = `You are a Discord server consultant discussing ideas with a user. Follow these rules strictly.

=== RESPONSE RULES ===
- Maximum 3 sentences per response.
- Never use markdown formatting (no **bold**, no *italic*, no ## headers).
- Never use bullet points or numbered lists.
- Never use code blocks or inline code.

=== CONTENT RULES ===
- Be conversational, like chatting in Discord.
- Answer questions directly without preamble.
- If they ask about a specific feature (roles, channels, permissions), give a brief opinion.
- If they ask for a comparison, give your recommendation in 1-2 sentences.
- If you don't know something, say so briefly.
- Do not generate JSON or structured plans in this mode.

=== TOPICS TO COVER ===
- Server themes and purposes
- Role structures and hierarchies
- Channel organization
- Permission strategies
- Best practices for different server types
- Moderation approaches
- Community growth tips

=== WHAT NEVER TO DO ===
- Never generate JSON.
- Never suggest this is a "plan" or use words like "generated plan" or "here's your server".
- Never use markdown formatting.
- Never write more than 3 sentences.
- Never use emotes or emojis in responses.
- Never ask clarifying questions about the user's request (this mode is for discussion, not plan generation).`;

class GroqProvider implements AIProvider {
  private apiKey: string;
  private modelId: string;

  constructor(modelKey: string = "llama-70b") {
    this.apiKey = process.env.GROQ_API_KEY || "";
    this.modelId = MODELS[modelKey as ModelKey]?.id || MODELS["llama-70b"].id;
  }

  private extractFirstJson(raw: string): string {
    // Try finding JSON in markdown code blocks first
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
    if (codeBlockMatch) {
      try { JSON.parse(codeBlockMatch[1]); return codeBlockMatch[1]; } catch {}
    }

    // Find first { and track brace depth to extract exactly one complete JSON object
    let start = raw.indexOf('{');
    if (start === -1) {
      const fallback = raw.match(/\{[\s\S]*\}/);
      return fallback ? fallback[0] : "";
    }

    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = raw.slice(start, i + 1);
          try { JSON.parse(candidate); return candidate; } catch {}
          // Invalid JSON at this brace match, look for another opening brace
          start = raw.indexOf('{', i + 1);
          if (start === -1) break;
          i = start - 1;
          depth = 0;
        }
      }
    }

    // Fallback: greedy match
    const fallback = raw.match(/\{[\s\S]*\}/);
    return fallback ? fallback[0] : "";
  }

  async generate(prompt: string): Promise<ServerPlan> {
    const body = {
      model: this.modelId,
      messages: [
        { role: "system", content: SYSTEM_GENERATE },
        { role: "user", content: `Generate a Discord server for: ${prompt}. Return ONLY the JSON object.` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    };

    const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonStr = this.extractFirstJson(content);
    if (!jsonStr) {
      throw new Error(`No JSON in AI response. Raw: ${content.slice(0, 300)}`);
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        roles: parsed.roles || [],
        channels: {
          text: parsed.channels?.text || [],
          voice: parsed.channels?.voice || [],
        },
        category_structure: parsed.category_structure || [],
      };
    } catch (e: any) {
      throw new Error(`Failed to parse AI JSON: ${e.message}. Raw: ${jsonStr.slice(0, 200)}`);
    }
  }

  async converse(messages: ConversationMessage[]): Promise<ConverseResult> {
    const body = {
      model: this.modelId,
      messages: [
        { role: "system", content: SYSTEM_CONVERSE },
        ...messages,
      ],
      temperature: 0.1,
      max_tokens: 2000,
    };

    const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonStr = this.extractFirstJson(content);
    if (!jsonStr) {
      throw new Error(`No JSON in AI response. Raw: ${content.slice(0, 300)}`);
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.type === "clarify" && Array.isArray(parsed.questions)) {
      return { type: "clarify", questions: parsed.questions };
    }

    return {
      type: "plan",
      plan: {
        roles: parsed.roles || [],
        channels: {
          text: parsed.channels?.text || [],
          voice: parsed.channels?.voice || [],
        },
        category_structure: parsed.category_structure || [],
      },
    };
  }

  async plan(messages: ConversationMessage[]): Promise<string> {
    const body = {
      model: this.modelId,
      messages: [
        { role: "system", content: SYSTEM_PLAN },
        ...messages,
      ],
      temperature: 0.3,
      max_tokens: 400,
    };

    const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "No response";
  }
}

export function createAIProvider(modelKey?: string): AIProvider {
  if (process.env.GROQ_API_KEY) {
    return new GroqProvider(modelKey);
  }
  throw new Error("No AI provider configured. Set GROQ_API_KEY");
}

const TEMPLATES: Record<string, string> = {
  gaming: "A competitive gaming community with ranks for different games, matchmaking, voice channels per game, and leaderboards.",
  smp: "A Minecraft Survival Multiplayer server with player ranks, building competitions, resource sharing, and events.",
  community: "A general community hub with introductions, interest categories, events, and support system.",
  coding: "A programming community with language channels, project showcase, code review, and collaboration spaces.",
  esports: "An esports team server with team roles, scrim scheduling, strategy discussion, and tournament org.",
};

export function getTemplate(name: string): string | undefined {
  return TEMPLATES[name.toLowerCase()];
}
