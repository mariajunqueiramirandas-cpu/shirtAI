import { z } from "zod";

export const PrintPlacementSchema = z.enum(["full_back", "full_front", "left_chest"]);
export type PrintPlacement = z.infer<typeof PrintPlacementSchema>;

export const PrintMethodSchema = z.enum(["screen_print", "dtg", "dtf"]);
export type PrintMethod = z.infer<typeof PrintMethodSchema>;

export const BlankColorwaySchema = z.enum(["obsidian", "chalk", "cardinal"]);
export type BlankColorway = z.infer<typeof BlankColorwaySchema>;

export const LoopStatusSchema = z.enum([
  "queued",
  "directing",
  "generating",
  "preflight",
  "critiquing",
  "print_prep",
  "needs_review",
  "approved",
  "dispatched",
  "failed",
]);
export type LoopStatus = z.infer<typeof LoopStatusSchema>;

export const MeshyModelSchema = z.enum([
  "gpt-image-2-6-flare",
  "gpt-image-2-6-sunburst",
]);
export type MeshyModel = z.infer<typeof MeshyModelSchema>;

export const RunModeSchema = z.enum(["live", "dry_run"]);
export type RunMode = z.infer<typeof RunModeSchema>;

export interface PlacementSpec {
  id: PrintPlacement;
  label: string;
  widthInches: number;
  heightInches: number;
  collarDropInches: number;
  dpi: number;
  widthPx: number;
  heightPx: number;
  meshyAspectRatio: "3:4" | "2:3" | "1:1";
  /** Relative box on the 3:4 blank tee studio photograph (0..1) */
  overlayRect: { left: number; top: number; width: number; height: number };
}

export const PRINT_PLACEMENTS: Record<PrintPlacement, PlacementSpec> = {
  full_back: {
    id: "full_back",
    label: "Full back (14 × 18 in)",
    widthInches: 14,
    heightInches: 18,
    collarDropInches: 3.5,
    dpi: 300,
    widthPx: 4200,
    heightPx: 5400,
    meshyAspectRatio: "3:4",
    overlayRect: { left: 0.305, top: 0.315, width: 0.39, height: 0.41 },
  },
  full_front: {
    id: "full_front",
    label: "Full front (12 × 16 in)",
    widthInches: 12,
    heightInches: 16,
    collarDropInches: 3.0,
    dpi: 300,
    widthPx: 3600,
    heightPx: 4800,
    meshyAspectRatio: "3:4",
    overlayRect: { left: 0.325, top: 0.325, width: 0.35, height: 0.37 },
  },
  left_chest: {
    id: "left_chest",
    label: "Left chest (4 × 4 in)",
    widthInches: 4,
    heightInches: 4,
    collarDropInches: 4.0,
    dpi: 300,
    widthPx: 1200,
    heightPx: 1200,
    meshyAspectRatio: "1:1",
    overlayRect: { left: 0.52, top: 0.34, width: 0.145, height: 0.145 },
  },
};

export interface BlankColorwaySpec {
  id: BlankColorway;
  label: string;
  hex: string;
  fabricNote: string;
  isDarkGarment: boolean;
  blankAssetPath: string;
}

export const BLANK_COLORWAYS: Record<BlankColorway, BlankColorwaySpec> = {
  obsidian: {
    id: "obsidian",
    label: "Washed Obsidian",
    hex: "#151619",
    fabricNote: "300gsm pigment-dyed combed cotton",
    isDarkGarment: true,
    blankAssetPath: "/assets/blank-tee-obsidian.jpg",
  },
  chalk: {
    id: "chalk",
    label: "Raw Chalk",
    hex: "#ECECE8",
    fabricNote: "300gsm heavy knit raw cotton",
    isDarkGarment: false,
    blankAssetPath: "/assets/blank-tee-chalk.jpg",
  },
  cardinal: {
    id: "cardinal",
    label: "Liturgical Cardinal",
    hex: "#6E141A",
    fabricNote: "300gsm enzyme-washed crimson cotton",
    isDarkGarment: true,
    blankAssetPath: "/assets/blank-tee-cardinal.jpg",
  },
};

export const WorkspaceSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  planTier: z.enum(["founder_studio", "brand_pro", "agency"]),
  createdAt: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const BrandBibleSchema = z.object({
  workspaceId: z.string(),
  brandName: z.string(),
  aestheticDna: z.string(),
  approvedMotifs: z.array(z.string()),
  forbiddenTropes: z.array(z.string()),
  inkPalette: z.array(
    z.object({
      name: z.string(),
      hex: z.string(),
      pantone: z.string(),
    })
  ),
  typographyDirection: z.string(),
  defaultBlankSpec: z.string(),
  maxSpotColors: z.number().int().min(1).max(8),
  updatedAt: z.string(),
});
export type BrandBible = z.infer<typeof BrandBibleSchema>;

export const UpdateBrandBibleSchema = BrandBibleSchema.omit({
  workspaceId: true,
  updatedAt: true,
});
export type UpdateBrandBibleInput = z.infer<typeof UpdateBrandBibleSchema>;

export const PrinterProfileSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  location: z.string(),
  supportedMethods: z.array(PrintMethodSchema),
  maxSpotColors: z.number().int().min(1).max(12),
  requiredDpi: z.number().int().min(150).max(600),
  dispatchEmail: z.string(),
  webhookUrl: z.string(),
  notes: z.string(),
  isDefault: z.boolean(),
});
export type PrinterProfile = z.infer<typeof PrinterProfileSchema>;

export const UpdatePrinterProfileSchema = PrinterProfileSchema.omit({
  id: true,
  workspaceId: true,
});

export const ArtDirectionSpecSchema = z.object({
  dropTitle: z.string(),
  visualConcept: z.string(),
  compositionNotes: z.string(),
  exactTextOverlay: z.string().nullable(),
  inkColors: z.array(z.string()).min(1).max(6),
  garmentKnockoutStrategy: z.string(),
  meshyPrompt: z.string(),
});
export type ArtDirectionSpec = z.infer<typeof ArtDirectionSpecSchema>;

export const PrintPreflightReportSchema = z.object({
  rawWidth: z.number().int(),
  rawHeight: z.number().int(),
  trimmedWidth: z.number().int(),
  trimmedHeight: z.number().int(),
  opaqueCoveragePct: z.number(),
  semiTransparentRatioPct: z.number(),
  edgeHaloRisk: z.enum(["low", "medium", "high"]),
  estimatedColorCount: z.number().int(),
  dominantColors: z.array(
    z.object({
      hex: z.string(),
      coveragePct: z.number(),
    })
  ),
  hasCleanTransparency: z.boolean(),
  warnings: z.array(z.string()),
});
export type PrintPreflightReport = z.infer<typeof PrintPreflightReportSchema>;

export const CriticScoresSchema = z.object({
  brandDna: z.number().min(0).max(10),
  composition: z.number().min(0).max(10),
  typography: z.number().min(0).max(10),
  printContrast: z.number().min(0).max(10),
  alphaEdges: z.number().min(0).max(10),
});
export type CriticScores = z.infer<typeof CriticScoresSchema>;

export const CriticVerdictSchema = z.object({
  scores: CriticScoresSchema,
  overallScore: z.number().min(0).max(10),
  decision: z.enum(["pass", "edit_in_place", "regenerate_fresh"]),
  summary: z.string(),
  defects: z.array(z.string()),
  nextEditPrompt: z.string(),
});
export type CriticVerdict = z.infer<typeof CriticVerdictSchema>;

export const LoopIterationSchema = z.object({
  id: z.string(),
  loopId: z.string(),
  iterationNumber: z.number().int(),
  generationType: z.enum(["text-to-image", "image-to-image"]),
  aiModel: MeshyModelSchema,
  meshyTaskId: z.string().nullable(),
  parentMeshyTaskId: z.string().nullable(),
  promptUsed: z.string(),
  humanNote: z.string().nullable(),
  rawTransparentUrl: z.string().nullable(),
  garmentMockupUrl: z.string().nullable(),
  alphaDiagnosticUrl: z.string().nullable(),
  inkSeparationUrl: z.string().nullable(),
  printMasterUrl: z.string().nullable(),
  preflight: PrintPreflightReportSchema.nullable(),
  critic: CriticVerdictSchema.nullable(),
  meshyCredits: z.number().int(),
  mistralInputTokens: z.number().int(),
  mistralCachedTokens: z.number().int(),
  mistralOutputTokens: z.number().int(),
  createdAt: z.string(),
});
export type LoopIteration = z.infer<typeof LoopIterationSchema>;

export const LoopTraceEventSchema = z.object({
  id: z.string(),
  loopId: z.string(),
  iterationNumber: z.number().int(),
  stage: z.string(),
  actor: z.enum([
    "art_director",
    "meshy_generator",
    "sharp_preflight",
    "vision_critic",
    "print_prep",
    "human_director",
    "system",
  ]),
  message: z.string(),
  detail: z.string().nullable(),
  createdAt: z.string(),
});
export type LoopTraceEvent = z.infer<typeof LoopTraceEventSchema>;

export const LoopRunSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  brief: z.string(),
  placement: PrintPlacementSchema,
  printMethod: PrintMethodSchema,
  blankColorway: BlankColorwaySchema,
  maxIterations: z.number().int().min(1).max(5),
  targetScore: z.number().min(6).max(9.8),
  escalateToSunburst: z.boolean(),
  alphaChokeEnabled: z.boolean(),
  mode: RunModeSchema,
  status: LoopStatusSchema,
  currentProgress: z.number().int().min(0).max(100),
  bestIterationId: z.string().nullable(),
  artSpec: ArtDirectionSpecSchema.nullable(),
  totalMeshyCredits: z.number().int(),
  totalMistralTokens: z.number().int(),
  totalCachedTokens: z.number().int(),
  dispatchedPrinterId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  iterations: z.array(LoopIterationSchema),
  traceEvents: z.array(LoopTraceEventSchema),
});
export type LoopRun = z.infer<typeof LoopRunSchema>;

export const CreateLoopInputSchema = z.object({
  brief: z.string().min(6, "Describe the drop concept in at least 6 characters"),
  placement: PrintPlacementSchema.default("full_back"),
  printMethod: PrintMethodSchema.default("screen_print"),
  blankColorway: BlankColorwaySchema.default("obsidian"),
  maxIterations: z.number().int().min(1).max(5).default(3),
  targetScore: z.number().min(6.5).max(9.8).default(8.4),
  escalateToSunburst: z.boolean().default(true),
  alphaChokeEnabled: z.boolean().default(true),
  mode: RunModeSchema.default("live"),
});
export type CreateLoopInput = z.infer<typeof CreateLoopInputSchema>;

export const HumanFeedbackInputSchema = z.object({
  note: z.string().min(4, "Provide brief direction for the next iteration"),
  useSunburst: z.boolean().default(true),
  forceFresh: z.boolean().default(false),
});
export type HumanFeedbackInput = z.infer<typeof HumanFeedbackInputSchema>;

export const ApproveLoopInputSchema = z.object({
  iterationId: z.string().optional(),
  printerProfileId: z.string().optional(),
  dispatchNow: z.boolean().default(false),
});
export type ApproveLoopInput = z.infer<typeof ApproveLoopInputSchema>;

export const CreateWorkspaceInputSchema = z.object({
  name: z.string().min(2).max(48),
  tagline: z.string().min(4).max(120),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInputSchema>;
