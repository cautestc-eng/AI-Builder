import { ServerPlan } from "@/types";

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1";

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ConverseResult =
  | { type: "clarify"; questions: string[] }
  | { type: "plan"; plan: ServerPlan };

interface AIProvider {
  generate(prompt: string): Promise<ServerPlan>;
  converse(messages: ConversationMessage[]): Promise<ConverseResult>;
}

class NVIDIAProvider implements AIProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.NVIDIA_API_KEY || "";
  }

  async generate(prompt: string): Promise<ServerPlan> {
    const systemPrompt = `You are a Discord server architect. Return ONLY valid JSON. No markdown, no code fences, no explanations, no extra text. Start with { and end with }.

Required JSON format:
{"roles":[{"name":"RoleName","permissions":["PERMISSION_NAME"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["Voice Channel"]},"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

Available permissions: CREATE_INSTANT_INVITE, KICK_MEMBERS, BAN_MEMBERS, ADMINISTRATOR, MANAGE_CHANNELS, MANAGE_GUILD, ADD_REACTIONS, VIEW_AUDIT_LOG, PRIORITY_SPEAKER, STREAM, VIEW_CHANNEL, SEND_MESSAGES, SEND_TTS_MESSAGES, MANAGE_MESSAGES, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, MENTION_EVERYONE, USE_EXTERNAL_EMOJIS, CONNECT, SPEAK, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, USE_VAD, CHANGE_NICKNAME, MANAGE_NICKNAMES, MANAGE_ROLES, MANAGE_WEBHOOKS, MANAGE_EMOJIS_AND_STICKERS, USE_APPLICATION_COMMANDS, MODERATE_MEMBERS

Rules: lowercase-kebab text channels, Title Case voice channels, UPPERCASE categories. Always include @everyone. Generate 3-8 roles, 4-10 text channels, 2-5 voice channels. Every channel belongs to a category.`;

    const body = {
      model: "nvidia/llama-3.3-nemotron-super-49b-v1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate a Discord server structure for: ${prompt}. Return ONLY the JSON object.` },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    };

    const res = await fetch(`${NVIDIA_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NVIDIA API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON found in AI response. Raw: ${content.slice(0, 500)}`);
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
      throw new Error(`Failed to parse AI JSON: ${e.message}. Raw: ${jsonMatch[0].slice(0, 300)}`);
    }
  }

  async converse(messages: ConversationMessage[]): Promise<ConverseResult> {
    const systemPrompt = `You are a Discord server architect helping a user design a Discord server.

Be proactive: make reasonable assumptions and generate a plan directly whenever you have enough context. Only ask questions if the request is truly ambiguous (e.g. "make a server" with no other details).

## If you can generate a plan
Return the server plan JSON directly (no wrapper):
{"roles":[{"name":"RoleName","permissions":["PERMISSION_NAME"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["Voice Channel"]},"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

## If you absolutely cannot (truly zero context)
Return ONLY this JSON:
{"type":"clarify","questions":["Short question 1?","Short question 2?"]}

Keep questions very short (under 50 chars) and only ask what's genuinely needed. When in doubt, make a reasonable guess and generate.

## If you have enough info
Return ONLY the server plan JSON (no wrapper, no extra text):
{"roles":[{"name":"RoleName","permissions":["PERMISSION_NAME"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["Voice Channel"]},"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

Available permissions: CREATE_INSTANT_INVITE, KICK_MEMBERS, BAN_MEMBERS, ADMINISTRATOR, MANAGE_CHANNELS, MANAGE_GUILD, ADD_REACTIONS, VIEW_AUDIT_LOG, PRIORITY_SPEAKER, STREAM, VIEW_CHANNEL, SEND_MESSAGES, SEND_TTS_MESSAGES, MANAGE_MESSAGES, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, MENTION_EVERYONE, USE_EXTERNAL_EMOJIS, CONNECT, SPEAK, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, USE_VAD, CHANGE_NICKNAME, MANAGE_NICKNAMES, MANAGE_ROLES, MANAGE_WEBHOOKS, MANAGE_EMOJIS_AND_STICKERS, USE_APPLICATION_COMMANDS, MODERATE_MEMBERS

Rules: lowercase-kebab text channels, Title Case voice channels, UPPERCASE categories. Always include @everyone. Generate 3-8 roles, 4-10 text channels, 2-5 voice channels. Every channel belongs to a category.`;

    const body = {
      model: "nvidia/llama-3.3-nemotron-super-49b-v1",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.1,
      max_tokens: 1500,
    };

    const res = await fetch(`${NVIDIA_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NVIDIA API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON in AI response. Raw: ${content.slice(0, 500)}`);
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
}

class FallbackProvider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.FALLBACK_AI_API_KEY || "";
    this.baseUrl = process.env.FALLBACK_AI_BASE_URL || "https://api.openai.com/v1";
  }

  async generate(prompt: string): Promise<ServerPlan> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.FALLBACK_AI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a Discord server architect. Return ONLY valid JSON matching the required schema. No extra text, no markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) throw new Error(`Fallback AI error: ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in fallback response");
    return JSON.parse(jsonMatch[0]);
  }

  async converse(messages: ConversationMessage[]): Promise<ConverseResult> {
    const systemPrompt = `You are a Discord server architect helping a user design a Discord server.

Be proactive: make reasonable assumptions and generate a plan directly whenever you have enough context. Only ask questions if the request is truly ambiguous (e.g. "make a server" with no other details).

## If you can generate a plan
Return the server plan JSON directly (no wrapper):
{"roles":[{"name":"RoleName","permissions":["PERMISSION_NAME"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["Voice Channel"]},"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

## If you absolutely cannot (truly zero context)
Return ONLY this JSON:
{"type":"clarify","questions":["Short question 1?","Short question 2?"]}

Keep questions under 50 chars. When in doubt, make a reasonable guess and generate.
Return ONLY the server plan JSON:
{"roles":[{"name":"RoleName","permissions":["PERMISSION_NAME"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["Voice Channel"]},"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

Rules: lowercase-kebab text channels, Title Case voice channels, UPPERCASE categories. Always include @everyone. Generate 3-8 roles, 4-10 text channels, 2-5 voice channels. Every channel belongs to a category.`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.FALLBACK_AI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) throw new Error(`Fallback AI error: ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in fallback response");

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
}

export function createAIProvider(): AIProvider {
  if (process.env.NVIDIA_API_KEY) {
    return new NVIDIAProvider();
  }
  if (process.env.FALLBACK_AI_API_KEY) {
    return new FallbackProvider();
  }
  throw new Error("No AI provider configured. Set NVIDIA_API_KEY or FALLBACK_AI_API_KEY");
}

const TEMPLATES: Record<string, string> = {
  gaming: "A competitive gaming community with ranks for different games, a matchmaking system, voice channels for each game, and a leaderboard system.",
  smp: "A Minecraft Survival Multiplayer server with player ranks, building competition channels, resource sharing categories, and event organization.",
  community: "A general community hub with introduction channels, interest-based categories, event planning, and a support system.",
  coding: "A programming community with language-specific channels, project showcase, code review system, and collaboration spaces.",
  esports: "An esports team server with team roles, scrimmage scheduling, strategy discussion channels, and tournament organization.",
};

export function getTemplate(name: string): string | undefined {
  return TEMPLATES[name.toLowerCase()];
}
