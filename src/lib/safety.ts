import { ServerPlan } from "@/types";

const BLOCKED_CATEGORIES = [
  { patterns: [/\b(nazi|white.?supremacy|racial.?slur|hate.?speech|ethnic.?cleansing|genocide)\b/i], category: "Hate Speech" },
  { patterns: [/\b(drug.?cartel|human.?trafficking|child.?abuse|underage.*(?:sex|porn)|bomb.?making)\b/i], category: "Illegal" },
  { patterns: [/\b(murder|assault|torture|mass.?shooting|terrorism|school.?shooting|bombing|cannon.?fodder)\b/i], category: "Violence" },
  { patterns: [/\b(rape|sexual.?assault|molest|grooming)\b/i], category: "Sexual Violence" },
  { patterns: [/\b(doxxing|swatting|harassment.?campaign|coordinated.?abuse)\b/i], category: "Harassment" },
];

export function checkPromptSafety(prompt: string): { allowed: boolean; reason?: string } {
  for (const { patterns, category } of BLOCKED_CATEGORIES) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        return { allowed: false, reason: `Prompt contains ${category} content` };
      }
    }
  }
  return { allowed: true };
}

const BLOCKED_CHANNEL_NAMES = [
  "nazi", "white-supremacy", "kkk", "racial-slur",
  "cp", "underage", "child-abuse",
  "drugs", "heroin", "cocaine", "bomb",
  "murder", "kill", "assault", "torture",
  "rape", "sexual-assault", "molest",
];

export function checkPlanSafety(plan: ServerPlan): { allowed: boolean; reason?: string } {
  for (const name of plan.channels.text) {
    const lower = name.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (BLOCKED_CHANNEL_NAMES.some(b => lower === b || lower.startsWith(b + "-") || lower.endsWith("-" + b) || lower.includes("-" + b + "-"))) {
      return { allowed: false, reason: `Channel name "${name}" contains blocked content` };
    }
  }

  for (const name of plan.channels.voice) {
    const lower = name.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (BLOCKED_CHANNEL_NAMES.some(b => lower.includes(b))) {
      return { allowed: false, reason: `Channel name "${name}" contains blocked content` };
    }
  }

  return { allowed: true };
}
