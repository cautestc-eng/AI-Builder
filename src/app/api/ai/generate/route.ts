import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAIProvider, getTemplate, ConversationMessage } from "@/lib/ai/provider";
import { validatePlan, sanitizePlan } from "@/lib/discord/validate";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("discord_user_id")?.value;

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { prompt, template, messages } = body;

    const provider = createAIProvider();

    if (messages && Array.isArray(messages)) {
      const result = await provider.converse(messages as ConversationMessage[]);

      if (result.type === "clarify") {
        return NextResponse.json({ type: "clarify", questions: result.questions });
      }

      const validation = validatePlan(result.plan);
      if (!validation.valid) {
        return NextResponse.json({
          error: "AI generated an invalid plan",
          details: validation.errors,
        }, { status: 422 });
      }

      const sanitized = sanitizePlan(result.plan);
      return NextResponse.json({
        type: "plan",
        plan: sanitized,
        warnings: validation.warnings,
      });
    }

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
      type: "plan",
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
