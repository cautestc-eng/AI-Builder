import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAIProvider, getTemplate } from "@/lib/ai/provider";
import { validatePlan, sanitizePlan } from "@/lib/discord/validate";
import { ServerPlan } from "@/types";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("discord_user_id")?.value;

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { prompt, template } = body;

    let finalPrompt = prompt;
    if (template) {
      const templatePrompt = getTemplate(template);
      if (templatePrompt) {
        finalPrompt = templatePrompt;
      }
    }

    if (!finalPrompt || typeof finalPrompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const provider = createAIProvider();
    const plan = await provider.generate(finalPrompt);

    const validation = validatePlan(plan);
    if (!validation.valid) {
      return NextResponse.json({
        error: "AI generated an invalid plan",
        details: validation.errors,
      }, { status: 422 });
    }

    const sanitized = sanitizePlan(plan);

    return NextResponse.json({
      plan: sanitized,
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error("AI generation error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to generate plan",
    }, { status: 500 });
  }
}
