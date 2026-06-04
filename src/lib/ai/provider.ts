import { ServerPlan } from "@/types";

const OPENAI_API_URL = "https://api.groq.com/openai/v1";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1";

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ConverseResult =
  | { type: "clarify"; questions: string[] }
  | { type: "plan"; plan: ServerPlan }
  | { type: "reject"; reason: string };

const MODELS = {
  "llama-70b": { id: "llama-3.3-70b-versatile", provider: "groq" },
  "llama-8b": { id: "llama-3.1-8b-instant", provider: "groq" },
  "mixtral": { id: "mixtral-8x7b-32768", provider: "groq" },
  "deepseek-chat": { id: "deepseek-chat", provider: "deepseek" },
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
{"roles":[{"name":"RoleName","permissions":["PERM1","PERM2"],"color":"#hex"}],"channels":{"text":["channel-name"],"voice":["VoiceChannelName"]},"nsfw_channels":["channel-name"],"category_structure":[{"name":"CATEGORY","channels":["channel-name"]}]}

=== COMPLETE EXAMPLE ===
{"roles":[{"name":"@everyone","permissions":["VIEW_CHANNEL","SEND_MESSAGES","ADD_REACTIONS","CONNECT","SPEAK","READ_MESSAGE_HISTORY","USE_VAD"],"color":"#99AAB5"},{"name":"Admin","permissions":["ADMINISTRATOR"],"color":"#FF0000"},{"name":"Moderator","permissions":["MANAGE_MESSAGES","KICK_MEMBERS","BAN_MEMBERS","MUTE_MEMBERS","DEAFEN_MEMBERS","MOVE_MEMBERS","VIEW_AUDIT_LOG"],"color":"#00FF00"},{"name":"Member","permissions":["VIEW_CHANNEL","SEND_MESSAGES","ADD_REACTIONS","EMBED_LINKS","ATTACH_FILES","READ_MESSAGE_HISTORY","CONNECT","SPEAK","USE_VAD"],"color":"#5865F2"}],"channels":{"text":["general","announcements","rules","introductions","support","off-topic"],"voice":["General","Gaming","Music"]},"nsfw_channels":[],"category_structure":[{"name":"Information","channels":["announcements","rules"]},{"name":"Social","channels":["general","introductions","off-topic"]},{"name":"Voice","channels":["General","Gaming","Music"]}]}

=== FORMAT RULES (never break these) ===
- Output must be a single JSON object. No arrays, no strings.
- No trailing commas in arrays or objects. This is the #1 cause of errors. DOUBLE CHECK EVERY COMMA.
- Every array element except the last MUST have a comma after it.
- No comma after the last element in an array or object.
- No comments (// or /* */). No single quotes. No backticks.
- Every string must use double quotes.
- Every key must be double-quoted: "roles", "channels", "name", etc. Unquoted keys are invalid.
- Color values must be 7 characters: # + 6 hex digits (e.g. #5865F2). No 3-char shortcuts.
- Do NOT include a "type" field in plan output. Only clarify output has "type".
- Do NOT wrap the JSON in any object like {"plan": ...} or {"data": ...}.
- Every role must have "name", "permissions", and "color" keys.
- Every channel object must have "text", "voice" arrays. Both must be present.
- nsfw_channels must be an array of text channel names that should be age-restricted.
- category_structure must be an array. Each entry must have "name" and "channels".
- The "channels" array inside each category entry must reference channel names that exist in channels.text or channels.voice.
- VALID JSON CHECK: Paste your output into a JSON validator before returning. If it does not parse, fix it.

=== ROLE RULES ===
- @everyone must ALWAYS be the first role in the roles array.
- @everyone permissions must be BASIC only: VIEW_CHANNEL, SEND_MESSAGES, ADD_REACTIONS, READ_MESSAGE_HISTORY, CONNECT, SPEAK, USE_VAD. Never give @everyone ADMINISTRATOR or moderation perms.
- Total roles: 2-8 normally, but follow user's explicit request. Include @everyone.
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
- Numbers are allowed (e.g. "hi1", "hi2", "channel-1", "room-42").
- Max 30 characters per channel name.
- Text channels: 2-10 normally, but follow the user's explicit request. Output [] if user asks for 0. Output all names if user asks for many.
- Channels should cover different purposes: general chat, announcements, introductions, topic-specific.
- NSFW channels are allowed. Include them in nsfw_channels array. NSFW channels should have "nsfw" prefix (e.g. "nsfw-general", "nsfw-media") or be clearly adult-themed.
- Only text channels can be NSFW. Voice channels cannot be NSFW.
- If the server purpose is clearly adult/18+, mark appropriate channels as NSFW. If the server is general/family-friendly, leave nsfw_channels as an empty array.

=== VOICE CHANNEL NAMING RULES ===
- Title Case: capitalize first letter of each word (e.g. "General", "Competitive Gaming", "Music Lounge").
- Spaces between words. No hyphens. No underscores.
- Voice channels: 1-5 normally, but follow the user's explicit request. Output [] if user asks for 0.
- Voice channels should serve different use cases: general hangout, gaming, music/afk.

=== CATEGORY RULES ===
 - Category names are Title Case (e.g. "Information", "Social", "Voice Channels", "Competitive").
- Every channel (text and voice) must belong to exactly ONE category.
- A channel cannot appear in more than one category.
- Each category must have at least one channel, unless user asked to delete all.
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
- Never include "type" field in plan output.
- Never output an array instead of an object.
- Never use single quotes for strings.
- Never include JavaScript comments (// or /* */).
- Never include trailing commas in arrays or objects. THIS IS THE MOST COMMON MISTAKE.
- Never forget a comma between array elements or object properties. MISSING COMMAS ALSO BREAK JSON.
- Never generate duplicate role names or channel names.
- Never leave arrays empty unless unavoidable (e.g. for very small servers).
- Never give ADMINISTRATOR to @everyone.
- Never make up permission names not in the list.
- Never mark voice channels as NSFW. nsfw_channels only applies to text channels.
- Never use unquoted keys like roles: instead of "roles":.
- Never add a comma after the last item in an array or object.
- BEFORE RETURNING: Count your braces. Every { must have a matching }. Every [ must have a matching ].

=== CONTENT SAFETY (never break these) ===
- Never generate channels, roles, or categories that reference: hate speech, racial slurs, white supremacy, nazi ideology, genocide, ethnic cleansing.
- Never generate channels, roles, or categories that reference: murder, assault, torture, mass shootings, terrorism, bombing, violence.
- Never generate channels, roles, or categories that reference: rape, sexual assault, molestation, grooming, child abuse.
- Never generate channels, roles, or categories that reference: drug cartels, human trafficking, bomb making, weapons dealing, or any illegal activity.
- Never generate channels, roles, or categories that reference: doxxing, swatting, coordinated harassment campaigns.
- Never generate channels, roles, or categories related to politics, government, political ideology, regimes, coups, civil war, insurgency, or militias.
- Never generate channels, roles, or categories related to nuclear weapons, nuclear programs, nuclear plans, missiles, warheads, or military armaments.
- Never generate channels, roles, or categories related to extremist groups, terrorist organizations, radicalization, or militant factions.
- If the user prompt explicitly requests any of the above, ignore the user and generate a family-friendly general server structure instead.
- Always prioritize safety. If unsure, default to a family-friendly general community server.
- NSFW channels are allowed for adult-themed servers but must never intersect with the blocked categories above.`;


const SYSTEM_CONVERSE = `You are a Discord server architect. You respond ONLY with JSON. There are exactly three possible output types.

=== OUTPUT A: GENERATE PLAN ===
Use this when you can make a reasonable server structure. This is the DEFAULT choice.
{"mode":"add","roles":[{"name":"@everyone","permissions":["VIEW_CHANNEL","SEND_MESSAGES","ADD_REACTIONS","READ_MESSAGE_HISTORY","CONNECT","SPEAK"],"color":"#99AAB5"},{"name":"Admin","permissions":["ADMINISTRATOR"],"color":"#FF0000"}],"channels":{"text":["general","announcements"],"voice":["General"]},"nsfw_channels":[],"category_structure":[{"name":"General","channels":["general","announcements"]}],"guild_settings":{"verification_level":"low","default_message_notifications":"only_mentions","explicit_content_filter":"members_without_roles"}}

MODE RULES:
- "mode":"add" (DEFAULT): The bot ONLY adds new channels/roles and updates existing ones. Never deletes anything. Use this for normal requests like "add a general channel", "create a moderator role", "make a gaming category".
- "mode":"replace": The bot replaces the entire server structure — creates everything in the plan AND DELETES any existing channels/roles not in the plan. Use this ONLY when the user explicitly says "replace", "overwrite", "nuke", "start fresh", or "delete everything and make new".
- NEVER use "mode":"replace" unless the user explicitly asks to delete/remove/replace/nuke things. If unsure, use "mode":"add".

You can also include guild_settings to configure the server:
- "verification_level": "none" | "low" | "medium" | "high" | "very_high"
- "default_message_notifications": "all" | "only_mentions"
- "explicit_content_filter": "disabled" | "members_without_roles" | "all_members"
- "system_channel": channel name string (must exist in channels.text)
- "afk_channel": voice channel name string (must exist in channels.voice)
- "afk_timeout": number in seconds (60-14400)
All guild_settings fields are optional. Omit if not specified.

=== DELETE EXAMPLES ===
User: "delete all text channels"
Plan: {"mode":"replace","roles":[{"name":"@everyone","permissions":["VIEW_CHANNEL","SEND_MESSAGES","ADD_REACTIONS","READ_MESSAGE_HISTORY","CONNECT","SPEAK"],"color":"#99AAB5"},{"name":"Admin","permissions":["ADMINISTRATOR"],"color":"#FF0000"}],"channels":{"text":[],"voice":["General"]},"nsfw_channels":[],"category_structure":[],"guild_settings":{"verification_level":"low"}}

User: "delete all channels and roles"
Plan: {"mode":"replace","roles":[{"name":"@everyone","permissions":["VIEW_CHANNEL","SEND_MESSAGES","ADD_REACTIONS","READ_MESSAGE_HISTORY","CONNECT","SPEAK"],"color":"#99AAB5"}],"channels":{"text":[],"voice":[]},"nsfw_channels":[],"category_structure":[]}

=== OUTPUT B: ASK CLARIFY QUESTIONS ===
Use this ONLY when all of these are true: user gave zero specifics (e.g. "make a server" with nothing else), no theme, no purpose, no size, no preferences. This is the RARE exception.
{"type":"clarify","questions":["What theme or purpose?","How many members?"]}

=== OUTPUT C: REJECT ===
{"type":"reject","reason":"Explain what they asked for that you cannot do and why."}
Use this when the user asks you to do something that you CANNOT do. Things you CANNOT do:
- Change server icon, splash, banner, or any image
- Create, delete, or modify emojis or stickers
- Create or modify webhooks, bots, or integrations
- Set server boosts, vanity URL, or premium features
- Moderate users (ban, kick, mute, warn)
- Assign roles to users
- Send messages or create threads
- Set channel-specific permission overwrites for individual users
- Change guild owner or transfer ownership
- Set welcome screen, onboarding, or community features
- Anything involving money, subscriptions, or Nitro
If the user asks for any of these, use OUTPUT C (reject) with a clear reason.

=== WHAT YOU CAN DO (NEVER REJECT THESE) ===
- Create, delete, or rename channels and categories
- Create, delete, or modify roles and permissions
- Change server structure, reorganize channels, add/remove anything
- Set verification level, notification settings, content filter, AFK timeout, system channel, AFK channel
IMPORTANT: Default mode is "add" — the bot only adds/updates, never deletes. Use "mode":"replace" ONLY when user explicitly asks to delete/overwrite/nuke/replace everything. Never reject "delete" requests — just use "mode":"replace" and omit what they want gone.

=== DECISION TREE (follow exactly) ===
Step 0: User asks to DELETE or REMOVE channels/roles?
- YES → Generate plan (OUTPUT A) with mode:"replace", arrays empty or omitting what should be removed.
  * "delete all channels" → mode:"replace", channels.text: [], channels.voice: [], category_structure: []
  * "remove the welcome channel" → mode:"replace", omit "welcome"
  * "delete all roles except @everyone" → mode:"replace", roles: only [@everyone]
  * DO NOT reject. DO NOT create replacements. Just omit what they want gone.
- NO → Go to Step 1.

Step 1: Does the user ask to REPLACE or overwrite everything?
- YES → Generate plan (OUTPUT A) with mode:"replace". Include everything you want to exist.
- NO → Go to Step 2.

Step 2: Does the user's message mention a theme/purpose? (gaming, coding, community, music, art, school, work, etc.)
- YES → Generate plan (OUTPUT A). Use the theme to pick appropriate roles/channels.
- NO → Go to Step 3.

Step 3: Does the user mention any specifics? (size, channels they want, existing server type, what the server is for)
- YES → Generate plan (OUTPUT A). Use whatever specifics exist, fill in the rest with reasonable defaults.
- NO → Go to Step 4.

Step 4: Is this a conversation (multiple messages already exchanged where you already asked questions)?
- YES → Generate plan (OUTPUT A). You've asked enough, now produce a result.
- NO → Go to Step 5.

Step 5: Did the user say something truly empty like "idk", "not sure", "I don't know", or a single word with no context?
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
- Always set "mode" in every output. Default is "add". Use "replace" only for delete/overwrite requests.
- Include the channels from previous responses unless the user asks to change/remove them. If user says "add a general channel", keep all existing channels AND add general.
- text channels: lowercase-kebab (e.g. "general", "looking-for-group")
- voice channels: Title Case (e.g. "General", "Competitive Gaming")
- categories: Title Case (e.g. "Information", "Voice Channels")
- Always include @everyone role first
- @everyone gets basic perms only: VIEW_CHANNEL, SEND_MESSAGES, ADD_REACTIONS, READ_MESSAGE_HISTORY, CONNECT, SPEAK
- Normal range: 2-8 roles, 2-10 text channels, 1-5 voice channels. BUT these are soft guidelines — follow the user's explicit request. If user asks for 0 channels, output []. If user asks for 50 channels, output all 50 names in the array.
- Every channel belongs to exactly one category
- CRITICAL: The "channels" array inside each category entry MUST reference channel names that exist in channels.text or channels.voice. A channel must appear in BOTH its category AND the top-level text/voice array.
- Never duplicate channel names across categories
- nsfw_channels is an array of text channel names that are age-restricted. Use "nsfw-" prefix for NSFW channels.
- Include nsfw_channels in every output. Use empty array [] if no NSFW channels.

=== PERMISSIONS (exact strings only) ===
VIEW_CHANNEL, SEND_MESSAGES, MANAGE_MESSAGES, MENTION_EVERYONE, ADD_REACTIONS, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, CONNECT, SPEAK, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, MANAGE_CHANNELS, MANAGE_ROLES, MANAGE_GUILD, ADMINISTRATOR, KICK_MEMBERS, BAN_MEMBERS, CREATE_INSTANT_INVITE, PRIORITY_SPEAKER, STREAM, CHANGE_NICKNAME, MANAGE_NICKNAMES, MANAGE_WEBHOOKS, MANAGE_EMOJIS_AND_STICKERS, USE_EXTERNAL_EMOJIS, USE_APPLICATION_COMMANDS, MODERATE_MEMBERS, VIEW_AUDIT_LOG, MANAGE_THREADS, CREATE_PUBLIC_THREADS, CREATE_PRIVATE_THREADS, SEND_MESSAGES_IN_THREADS, USE_EMBEDDED_ACTIVITIES, REQUEST_TO_SPEAK, USE_VAD, SEND_TTS_MESSAGES, VIEW_GUILD_INSIGHTS

=== WHAT NEVER TO DO ===
- Never return text outside JSON.
- Never include markdown, code fences, or backticks.
- Never use OUTPUT B unless ALL conditions in Step 4 are met.
- Never ask more than 2 questions.
- Never ask about specific channels, roles, or permissions.
- Never generate duplicate channel names.
- Never leave @everyone out of the roles array.
- Never include trailing commas in arrays or objects.
- Never forget commas between array elements.
- Never use single quotes. Only double quotes.
- Never include comments in JSON.
- Never use unquoted keys.
- OUTPUT A MUST be valid JSON that passes JSON.parse(). Check every comma and brace.

=== CONTENT SAFETY ===
- Never generate channels, roles, or categories for hate speech, violence, illegal activity, harassment, politics, nuclear weapons, or extremism.
- If the user prompt requests harmful or illegal content, silently generate a family-friendly server instead.
- NSFW channels are allowed for adult themes but must not reference any blocked category.`;

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
- Never ask clarifying questions about the user's request (this mode is for discussion, not plan generation).
- Never discuss or suggest hate speech, violence, illegal activity, harassment, politics, nuclear weapons, or extremist content.
- If the user asks about harmful content, politely decline and redirect to appropriate topics.`;

class OpenAICompatibleProvider implements AIProvider {
  private apiKey: string;
  private modelId: string;
  private baseUrl: string;

  constructor(modelKey: string = "llama-70b") {
    const model = MODELS[modelKey as ModelKey] || MODELS["llama-70b"];
    this.modelId = model.id;
    if (model.provider === "deepseek") {
      this.apiKey = process.env.DEEPSEEK_API_KEY || "";
      this.baseUrl = DEEPSEEK_API_URL;
    } else {
      this.apiKey = process.env.GROQ_API_KEY || "";
      this.baseUrl = OPENAI_API_URL;
    }
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
      return fallback ? this.repairJson(fallback[0]) : "";
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
          // Try repaired version
          const repaired = this.repairJson(candidate);
          try { JSON.parse(repaired); return repaired; } catch {}
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
    const result = fallback ? fallback[0] : "";
    return this.repairJson(result);
  }

  private repairJson(s: string): string {
    let r = s;
    // Remove comments
    r = r.replace(/\/\/.*?(\n|$)/g, "");
    r = r.replace(/\/\*[\s\S]*?\*\//g, "");
    // Replace single quotes with double quotes (not inside strings)
    r = r.replace(/'/g, '"');
    // Remove trailing commas before } or ]
    r = r.replace(/,\s*([}\]])/g, "$1");
    // Remove trailing comma at end of file before EOF
    r = r.replace(/,\s*$/, "");
    // Remove backticks
    r = r.replace(/`/g, "");
    // Fix missing commas between quoted strings in arrays: "x" "y" → "x","y"
    r = r.replace(/"\s+"(?=[^:,\s])/g, '","');
    // Fix missing commas between string and next array element: "x" "y"
    r = r.replace(/("\s*)\n?\s*(")/g, '$1,$2');
    return r;
  }

  async generate(prompt: string): Promise<ServerPlan> {
    const body = {
      model: this.modelId,
      messages: [
        { role: "system", content: SYSTEM_GENERATE },
        { role: "user", content: `Generate a Discord server for: ${prompt}. Return ONLY the JSON object.` },
      ],
      temperature: 0,
      max_tokens: 4096,
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
        nsfw_channels: parsed.nsfw_channels || [],
        category_structure: parsed.category_structure || [],
        guild_settings: parsed.guild_settings || undefined,
        mode: parsed.mode || "add",
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
      temperature: 0,
      max_tokens: 4096,
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
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

    if (parsed.type === "reject" && typeof parsed.reason === "string") {
      return { type: "reject", reason: parsed.reason };
    }

    return {
      type: "plan",
      plan: {
        roles: parsed.roles || [],
        channels: {
          text: parsed.channels?.text || [],
          voice: parsed.channels?.voice || [],
        },
        nsfw_channels: parsed.nsfw_channels || [],
        category_structure: parsed.category_structure || [],
        guild_settings: parsed.guild_settings || undefined,
        mode: parsed.mode || "add",
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

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
  const key = modelKey || "llama-70b";
  const model = MODELS[key as ModelKey];
  if (!model) return new OpenAICompatibleProvider("llama-70b");
  if (model.provider === "deepseek") {
    if (!process.env.DEEPSEEK_API_KEY) throw new Error("DeepSeek selected but DEEPSEEK_API_KEY not set");
    return new OpenAICompatibleProvider(key);
  }
  if (process.env.GROQ_API_KEY) {
    return new OpenAICompatibleProvider(key);
  }
  throw new Error("No AI provider configured. Set GROQ_API_KEY or DEEPSEEK_API_KEY");
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
