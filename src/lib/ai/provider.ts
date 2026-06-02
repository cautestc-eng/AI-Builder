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

const SYSTEM_GENERATE = `You are a Discord server architect. Return ONLY valid JSON. No markdown, no explanations, no extra text.

Required JSON:
{"roles":[{"name":"RoleName","permissions":["PERMISSION_NAME"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["Voice Channel"]},"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

Permissions (use exact names): VIEW_CHANNEL, SEND_MESSAGES, MANAGE_MESSAGES, MENTION_EVERYONE, ADD_REACTIONS, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, CONNECT, SPEAK, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, MANAGE_CHANNELS, MANAGE_ROLES, MANAGE_GUILD, ADMINISTRATOR, KICK_MEMBERS, BAN_MEMBERS, CREATE_INSTANT_INVITE, PRIORITY_SPEAKER, STREAM, CHANGE_NICKNAME, MANAGE_NICKNAMES, MANAGE_WEBHOOKS, MANAGE_EMOJIS_AND_STICKERS, USE_EXTERNAL_EMOJIS, USE_APPLICATION_COMMANDS, MODERATE_MEMBERS, VIEW_AUDIT_LOG, MANAGE_THREADS, CREATE_PUBLIC_THREADS, CREATE_PRIVATE_THREADS, SEND_MESSAGES_IN_THREADS, USE_EMBEDDED_ACTIVITIES, REQUEST_TO_SPEAK, USE_VAD, SEND_TTS_MESSAGES, VIEW_GUILD_INSIGHTS

Rules:
- text channels: lowercase-kebab
- voice channels: Title Case
- categories: UPPERCASE
- Always include @everyone role
- Generate 3-8 roles, 4-10 text, 2-5 voice
- Every channel belongs to a category`;

const SYSTEM_CONVERSE = `You are a Discord server architect. Be concise.

If you have enough info, return ONLY the plan JSON:
{"roles":[{"name":"RoleName","permissions":["PERMISSION_NAME"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["Voice Channel"]},"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

If you truly have zero context, return ONLY:
{"type":"clarify","questions":["Short question 1?","Short question 2?"]}

Keep questions under 50 chars. When in doubt, guess and generate.

Available permissions: VIEW_CHANNEL, SEND_MESSAGES, MANAGE_MESSAGES, MENTION_EVERYONE, ADD_REACTIONS, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, CONNECT, SPEAK, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, MANAGE_CHANNELS, MANAGE_ROLES, MANAGE_GUILD, ADMINISTRATOR, KICK_MEMBERS, BAN_MEMBERS, CREATE_INSTANT_INVITE, PRIORITY_SPEAKER, STREAM, CHANGE_NICKNAME, MANAGE_NICKNAMES, MANAGE_WEBHOOKS, MANAGE_EMOJIS_AND_STICKERS, USE_EXTERNAL_EMOJIS, USE_APPLICATION_COMMANDS, MODERATE_MEMBERS, VIEW_AUDIT_LOG, MANAGE_THREADS, CREATE_PUBLIC_THREADS, CREATE_PRIVATE_THREADS, SEND_MESSAGES_IN_THREADS, USE_EMBEDDED_ACTIVITIES, REQUEST_TO_SPEAK, USE_VAD, SEND_TTS_MESSAGES, VIEW_GUILD_INSIGHTS

Rules: lowercase-kebab text, Title Case voice, UPPERCASE categories. Include @everyone. 3-8 roles, 4-10 text, 2-5 voice. Every channel in a category.`;

const SYSTEM_PLAN = `You are a Discord server consultant. Keep responses under 3 sentences. No markdown. Be direct.`;

class GroqProvider implements AIProvider {
  private apiKey: string;
  private modelId: string;

  constructor(modelKey: string = "llama-70b") {
    this.apiKey = process.env.GROQ_API_KEY || "";
    this.modelId = MODELS[modelKey as ModelKey]?.id || MODELS["llama-70b"].id;
  }

  async generate(prompt: string): Promise<ServerPlan> {
    const body = {
      model: this.modelId,
      messages: [
        { role: "system", content: SYSTEM_GENERATE },
        { role: "user", content: `Generate a Discord server for: ${prompt}. Return ONLY JSON.` },
      ],
      temperature: 0.1,
      max_tokens: 1200,
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

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON in AI response. Raw: ${content.slice(0, 300)}`);
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        roles: parsed.roles || [],
        channels: {
          text: parsed.channels?.text || [],
          voice: parsed.channels?.voice || [],
        },
        category_structure: parsed.category_structure || [],
      };
    } catch (e: any) {
      throw new Error(`Failed to parse AI JSON: ${e.message}. Raw: ${jsonMatch[0].slice(0, 200)}`);
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
      max_tokens: 1200,
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

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON in AI response. Raw: ${content.slice(0, 300)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]);

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
