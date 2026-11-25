import {
  ArtDirectionSpecSchema,
  BLANK_COLORWAYS,
  CriticVerdictSchema,
  PRINT_PLACEMENTS,
  type ArtDirectionSpec,
  type BlankColorway,
  type BrandBible,
  type CriticVerdict,
  type PrintMethod,
  type PrintPlacement,
  type PrintPreflightReport,
} from "@shirtai/shared";
import { z } from "zod";
import { config } from "../config";

export interface MistralUsage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface MistralResult<T> {
  data: T;
  usage: MistralUsage;
}

interface MistralChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

/**
 * Deterministic, byte-stable system prefix designed to hit Mistral prompt caching
 * ($0.007/M cached input on deepseek-v4-1-flash-1017) across every turn of a workspace loop.
 */
export function buildCachedBrandSystemPrompt(bible: BrandBible): string {
  const paletteLines = bible.inkPalette
    .map((ink) => `- ${ink.name} (${ink.hex}, ${ink.pantone})`)
    .join("\n");

  return [
    `You are the autonomous Creative Director and Master Print Technician for ${bible.brandName}, operating inside the shirtAI production pipeline.`,
    ``,
    `BRAND BIBLE (NON-NEGOTIABLE):`,
    `Aesthetic DNA: ${bible.aestheticDna}`,
    `Approved motifs and visual language: ${bible.approvedMotifs.join("; ")}`,
    `Strictly forbidden tropes (instant rejection if present): ${bible.forbiddenTropes.join("; ")}`,
    `Typography direction: ${bible.typographyDirection}`,
    `Default garment blank: ${bible.defaultBlankSpec}`,
    `Max plastisol spot ink colors: ${bible.maxSpotColors}`,
    `Approved ink palette:`,
    paletteLines,
    ``,
    `PHYSICAL APPAREL PRINT PRODUCTION RULES:`,
    `1. Every graphic will be physically printed on heavyweight 300gsm streetwear T-shirts from a transparent RGBA PNG at 300 DPI.`,
    `2. NEVER generate rectangular box frames, photo backgrounds, soft foggy outer glows, translucent stained-glass mist inside hollow lattice openings, or lens flares. Hollow architectural cutouts (such as Gothic rose window gaps) MUST be completely open negative space so the garment fabric shows cleanly through.`,
    `3. Design a strong, intentional outer silhouette with crisp high-contrast edges, bold engraving/woodcut/halftone linework, and clean distressed texture where appropriate.`,
    `4. GARMENT-AS-BLACK KNOCKOUT: On dark blanks (Washed Obsidian or Cardinal), let the shirt fabric act as the dark shadows/negative space so the print breathes instead of feeling like a heavy plastic rubber slab. White and grey tonal engraving shading counts as ONE white halftone plate, not separate spot inks.`,
    `5. SACRED ICONOGRAPHY DISCIPLINE: When depicting saints or archangels (such as Archangel Michael), NEVER introduce demonic creatures, devils, or grotesque beasts beneath them unless explicitly requested—anchor figures instead on carved cathedral stone, Gothic tracery, or cracked concrete skate ledges.`,
    `6. TYPOGRAPHY DISCIPLINE: Only include lettering if explicitly requested or if a very short (1-3 word) Latin or brand inscription strongly elevates the silhouette. If any text is included, every single letter must be razor-sharp, bold, and spelled flawlessly. Zero gibberish or filler text.`,
    `7. PRE-CRITIC DETERMINISTIC CLEANUP: Our sharp print-engineering engine automatically runs alpha-choke edge hardening, dark-cotton black knockout, and hue-aware spot-plate clustering BEFORE Vision Critique. Critique the post-cleanup composite image and post-cleanup telemetry fairly; do NOT waste image-generation iterations asking the image model to fix tiny sub-pixel alpha noise that deterministic prepress has already eliminated.`,
    `8. Always return strict JSON matching the requested schema.`,
  ].join("\n");
}

function extractTextContent(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n");
}

function extractJsonString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

const ART_DIRECTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    dropTitle: { type: "string" },
    visualConcept: { type: "string" },
    compositionNotes: { type: "string" },
    exactTextOverlay: { type: ["string", "null"] },
    inkColors: {
      type: "array",
      items: { type: "string" },
    },
    garmentKnockoutStrategy: { type: "string" },
    meshyPrompt: { type: "string" },
  },
  required: [
    "dropTitle",
    "visualConcept",
    "compositionNotes",
    "exactTextOverlay",
    "inkColors",
    "garmentKnockoutStrategy",
    "meshyPrompt",
  ],
  additionalProperties: false,
};

const CRITIC_VERDICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: {
        brandDna: { type: "number" },
        composition: { type: "number" },
        typography: { type: "number" },
        printContrast: { type: "number" },
        alphaEdges: { type: "number" },
      },
      required: [
        "brandDna",
        "composition",
        "typography",
        "printContrast",
        "alphaEdges",
      ],
      additionalProperties: false,
    },
    overallScore: { type: "number" },
    decision: {
      type: "string",
      enum: ["pass", "edit_in_place", "regenerate_fresh"],
    },
    summary: { type: "string" },
    defects: {
      type: "array",
      items: { type: "string" },
    },
    nextEditPrompt: { type: "string" },
  },
  required: [
    "scores",
    "overallScore",
    "decision",
    "summary",
    "defects",
    "nextEditPrompt",
  ],
  additionalProperties: false,
};

const PROMPT_SURGEON_JSON_SCHEMA = {
  type: "object",
  properties: {
    editPrompt: { type: "string" },
    rationale: { type: "string" },
    preferFreshGeneration: { type: "boolean" },
  },
  required: ["editPrompt", "rationale", "preferFreshGeneration"],
  additionalProperties: false,
};

const PromptSurgeonOutputSchema = z.object({
  editPrompt: z.string(),
  rationale: z.string(),
  preferFreshGeneration: z.boolean(),
});

export class MistralDeepSeekClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    apiKey: string = config.mistralApiKey,
    model: string = config.mistralModel
  ) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async callStructured<T>(params: {
    systemPrompt: string;
    userContent: string | Array<Record<string, unknown>>;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
    zodSchema: z.ZodType<T>;
    temperature?: number;
  }): Promise<MistralResult<T>> {
    const endpoint = "https://api.mistral.ai/v1/chat/completions";
    const totalUsage: MistralUsage = {
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    };

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userContent },
    ];

    let lastError = "Unknown Mistral error";

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: params.temperature ?? 0.35,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: params.schemaName,
              strict: true,
              schema: params.jsonSchema,
            },
          },
          messages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Mistral API error (${response.status}): ${errText.slice(0, 320)}`
        );
      }

      const payload = (await response.json()) as MistralChatResponse;
      totalUsage.inputTokens += payload.usage?.prompt_tokens ?? 0;
      totalUsage.cachedTokens +=
        payload.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      totalUsage.outputTokens += payload.usage?.completion_tokens ?? 0;
      totalUsage.reasoningTokens +=
        payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0;

      const rawText = extractTextContent(payload.choices?.[0]?.message?.content);
      try {
        const parsedJson = JSON.parse(extractJsonString(rawText));
        const validated = params.zodSchema.parse(parsedJson);
        return { data: validated, usage: totalUsage };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        messages.push({ role: "assistant", content: rawText });
        messages.push({
          role: "user",
          content: `Your JSON failed validation (${lastError}). Return ONLY corrected strict JSON matching the schema.`,
        });
      }
    }

    throw new Error(`Mistral structured output failed: ${lastError}`);
  }

  async directArtConcept(params: {
    bible: BrandBible;
    brief: string;
    placement: PrintPlacement;
    printMethod: PrintMethod;
    blankColorway: BlankColorway;
  }): Promise<MistralResult<ArtDirectionSpec>> {
    const placementSpec = PRINT_PLACEMENTS[params.placement];
    const blankSpec = BLANK_COLORWAYS[params.blankColorway];

    const userPrompt = [
      `TASK: Translate this drop brief into an art-directed, print-ready graphic specification and Meshy GPT Image 2.6 prompt.`,
      ``,
      `DROP BRIEF: "${params.brief}"`,
      `TARGET GARMENT BLANK: ${blankSpec.label} (${blankSpec.hex}, ${blankSpec.fabricNote})`,
      `PLACEMENT: ${placementSpec.label} (aspect ratio ${placementSpec.meshyAspectRatio}, physical print ${placementSpec.widthInches}x${placementSpec.heightInches} inches at 300 DPI)`,
      `PRINT METHOD: ${params.printMethod} (limit ink palette strictly to <= ${params.bible.maxSpotColors} distinct high-contrast spot inks when screen_print)`,
      ``,
      `PROMPT ENGINEERING REQUIREMENTS FOR meshyPrompt:`,
      `- Describe an ISOLATED T-SHIRT GRAPHIC DESIGN ONLY (never draw an actual T-shirt, mannequin, person, model, wall, or studio table—ONLY the flat graphic artwork itself, centered with clean breathing room around the silhouette so background removal produces a pristine transparent RGBA PNG).`,
      `- Explicitly demand hard crisp graphic edges, bold woodcut/engraving/halftone screen-print ink work, zero blurry glow, zero smoke gradients, zero rectangular bounding box background.`,
      `- Because the target blank is ${blankSpec.label} (${blankSpec.isDarkGarment ? "DARK garment" : "LIGHT garment"}), specify high-contrast ink colors that pop violently on ${blankSpec.hex}${blankSpec.isDarkGarment ? " and use pure empty black/negative space for shadows (garment knockout)" : " using deep soot black and liturgical crimson inks"}.`,
      `- Unless the brief explicitly asks for specific words, set exactTextOverlay to null and instruct the image model strictly: "no text, no letters, no watermark".`,
    ].join("\n");

    return this.callStructured({
      systemPrompt: buildCachedBrandSystemPrompt(params.bible),
      userContent: userPrompt,
      schemaName: "art_direction_spec",
      jsonSchema: ART_DIRECTION_JSON_SCHEMA,
      zodSchema: ArtDirectionSpecSchema,
      temperature: 0.45,
    });
  }

  async critiqueCandidate(params: {
    bible: BrandBible;
    brief: string;
    artSpec: ArtDirectionSpec;
    placement: PrintPlacement;
    printMethod: PrintMethod;
    blankColorway: BlankColorway;
    iterationNumber: number;
    maxIterations: number;
    targetScore: number;
    preflight: PrintPreflightReport;
    priorCritiqueSummaries: string[];
    garmentMockupBase64: string;
    alphaDiagnosticBase64: string;
  }): Promise<MistralResult<CriticVerdict>> {
    const blankSpec = BLANK_COLORWAYS[params.blankColorway];
    const placementSpec = PRINT_PLACEMENTS[params.placement];

    const historyBlock =
      params.priorCritiqueSummaries.length > 0
        ? `PRIOR ITERATION SUMMARIES (text-only to keep vision context bounded):\n${params.priorCritiqueSummaries
            .map((line, i) => `Iter ${i + 1}: ${line}`)
            .join("\n")}`
        : "PRIOR ITERATIONS: None (this is Iteration 1).";

    const textPart = [
      `TASK: Inspect the two attached diagnostic images as a ruthless streetwear creative director and master screen printer.`,
      `IMAGE 1: The transparent graphic composited directly onto the real ${blankSpec.label} 300gsm blank T-shirt at ${placementSpec.label} scale.`,
      `IMAGE 2: Alpha-Edge X-Ray Diagnostic. Pure transparent background is dark slate, solid opaque ink is monochrome grey, and SEMI-TRANSPARENT HALO PIXELS (alpha 1..235) are highlighted in BRIGHT MAGENTA.`,
      ``,
      `ORIGINAL DROP BRIEF: "${params.brief}"`,
      `INTENDED VISUAL CONCEPT: ${params.artSpec.visualConcept}`,
      `EXPECTED TEXT OVERLAY: ${params.artSpec.exactTextOverlay ?? "NONE (any hallucinated letters or gibberish MUST be penalized heavily)"}`,
      `PRINT METHOD: ${params.printMethod}`,
      `ITERATION: ${params.iterationNumber} of ${params.maxIterations} | TARGET PASS SCORE: ${params.targetScore.toFixed(1)} / 10`,
      historyBlock,
      ``,
      `DETERMINISTIC SHARP PREFLIGHT TELEMETRY:`,
      JSON.stringify(params.preflight, null, 2),
      ``,
      `SCORING RUBRIC (0.0 to 10.0 each — be brutally honest, never inflate mediocre art):`,
      `- brandDna: Genuine, tasteful Catholic + skate + streetwear energy (penalize generic AI fantasy, corny clipart, demons/forbidden tropes, or fake-looking vector stock).`,
      `- composition: Strong balanced silhouette on a boxy tee back/chest, no accidental cropped edges or ugly rectangle box frames.`,
      `- typography: Flawless spelling if text was requested, OR 10/10 if zero unwanted gibberish text appeared. Deduct 4+ points for any garbled AI text.`,
      `- printContrast: High legibility and bold ink contrast against the actual ${blankSpec.label} cotton fabric.`,
      `- alphaEdges: Crisp cutout with minimal magenta halo fringes in Image 2 (penalize if semiTransparentRatioPct > 15% or visible residual background boxes appear).`,
      ``,
      `DECISION POLICY:`,
      `- Compute overallScore as a weighted average (brandDna 25%, composition 25%, printContrast 20%, typography 15%, alphaEdges 15%).`,
      `- Set decision = "pass" ONLY if overallScore >= ${params.targetScore.toFixed(1)} AND typography >= 8.0 AND no fatal brand violation exists.`,
      `- Set decision = "edit_in_place" if the core silhouette and composition are strong and targeted Meshy image-to-image edits will fix the defects. Write a surgical, concrete nextEditPrompt describing exact visual changes while preserving what works (keep isolated transparent graphic instructions!).`,
      `- Set decision = "regenerate_fresh" ONLY if the overall layout, subject, or aesthetic fundamentally missed the mark or drew a shirt inside the graphic. Write a complete improved Meshy text-to-image prompt in nextEditPrompt.`,
    ].join("\n");

    return this.callStructured({
      systemPrompt: buildCachedBrandSystemPrompt(params.bible),
      userContent: [
        { type: "text", text: textPart },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${params.garmentMockupBase64}`,
          },
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${params.alphaDiagnosticBase64}`,
          },
        },
      ],
      schemaName: "critic_verdict",
      jsonSchema: CRITIC_VERDICT_JSON_SCHEMA,
      zodSchema: CriticVerdictSchema,
      temperature: 0.2,
    });
  }

  async translateHumanFeedback(params: {
    bible: BrandBible;
    brief: string;
    artSpec: ArtDirectionSpec;
    humanNote: string;
    blankColorway: BlankColorway;
    printMethod: PrintMethod;
    forceFresh: boolean;
  }): Promise<
    MistralResult<{
      editPrompt: string;
      rationale: string;
      preferFreshGeneration: boolean;
    }>
  > {
    const blankSpec = BLANK_COLORWAYS[params.blankColorway];
    const userPrompt = [
      `TASK: Convert the human creative director's feedback note into a surgical Meshy GPT Image 2.6 prompt.`,
      `DROP BRIEF: "${params.brief}"`,
      `CURRENT CONCEPT: ${params.artSpec.visualConcept}`,
      `BLANK: ${blankSpec.label} (${blankSpec.hex}) | PRINT METHOD: ${params.printMethod}`,
      `DIRECTOR FEEDBACK NOTE: "${params.humanNote}"`,
      `FORCE FRESH GENERATION: ${params.forceFresh ? "yes" : "no"}`,
      ``,
      `Remember: output MUST remain an isolated flat T-shirt graphic with hard crisp print edges, no shirt mockup drawn inside the image, zero foggy outer glow, clean transparent cutout compatibility.`,
    ].join("\n");

    return this.callStructured({
      systemPrompt: buildCachedBrandSystemPrompt(params.bible),
      userContent: userPrompt,
      schemaName: "prompt_surgeon_output",
      jsonSchema: PROMPT_SURGEON_JSON_SCHEMA,
      zodSchema: PromptSurgeonOutputSchema,
      temperature: 0.3,
    });
  }
}
