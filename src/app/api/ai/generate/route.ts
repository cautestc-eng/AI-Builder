import { NextRequest, NextResponse } from "next/server";
import { createAIProvider, getTemplate, ConversationMessage } from "@/lib/ai/provider";
import { validatePlan, sanitizePlan } from "@/lib/discord/validate";
import { checkRateLimit, incrementRateLimit } from "@/lib/rate-limit";
import { verifyRequest, stripIdentityFields } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let verified;
  try {
    verified = await verifyRequest(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { user } = verified;

  const rateCheck = await checkRateLimit(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json({
      error: `Daily limit reached (${rateCheck.limit}/day). Try again tomorrow.`,
    }, { status: 429 });
  }

  try {
    const rawBody = await req.json();
    const body = stripIdentityFields(rawBody) as any;
    const { prompt, template, messages, mode, model } = body;
    const provider = createAIProvider(model);

    if (mode === "plan") {
      const text = await provider.plan(messages as ConversationMessage[]);
      return NextResponse.json({ type: "text", content: text });
    }

    if (messages && Array.isArray(messages)) {
      const result = await provider.converse(messages as ConversationMessage[]);

      if (result.type === "clarify") {
        return NextResponse.json({ type: "clarify", questions: result.questions });
      }

      if (result.type !== "plan") {
        return NextResponse.json({ error: "Unexpected response from AI" }, { status: 500 });
      }

      await incrementRateLimit(user.id);

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
    await incrementRateLimit(user.id);
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
