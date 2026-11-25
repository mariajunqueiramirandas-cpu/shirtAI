import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ArtDirectionSpec,
  BlankColorway,
  BrandBible,
  CriticVerdict,
  LoopIteration,
  LoopRun,
  LoopStatus,
  LoopTraceEvent,
  MeshyModel,
  PrintMethod,
  PrintPlacement,
  PrintPreflightReport,
  PrinterProfile,
  RunMode,
  Workspace,
} from "@shirtai/shared";
import { config } from "../config";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
fs.mkdirSync(config.storageDir, { recursive: true });

const db = new Database(config.databasePath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA foreign_keys = ON;");

export function closeDatabase(): void {
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    db.close();
  } catch {
    // ignore shutdown errors
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    plan_tier TEXT NOT NULL DEFAULT 'founder_studio',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS brand_bibles (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    brand_name TEXT NOT NULL,
    aesthetic_dna TEXT NOT NULL,
    approved_motifs_json TEXT NOT NULL,
    forbidden_tropes_json TEXT NOT NULL,
    ink_palette_json TEXT NOT NULL,
    typography_direction TEXT NOT NULL,
    default_blank_spec TEXT NOT NULL,
    max_spot_colors INTEGER NOT NULL DEFAULT 4,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS printer_profiles (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    supported_methods_json TEXT NOT NULL,
    max_spot_colors INTEGER NOT NULL,
    required_dpi INTEGER NOT NULL,
    dispatch_email TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    notes TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS loop_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    brief TEXT NOT NULL,
    placement TEXT NOT NULL,
    print_method TEXT NOT NULL,
    blank_colorway TEXT NOT NULL,
    max_iterations INTEGER NOT NULL,
    target_score REAL NOT NULL,
    escalate_to_sunburst INTEGER NOT NULL DEFAULT 1,
    alpha_choke_enabled INTEGER NOT NULL DEFAULT 1,
    mode TEXT NOT NULL DEFAULT 'live',
    status TEXT NOT NULL,
    current_progress INTEGER NOT NULL DEFAULT 0,
    best_iteration_id TEXT,
    art_spec_json TEXT,
    total_meshy_credits INTEGER NOT NULL DEFAULT 0,
    total_mistral_tokens INTEGER NOT NULL DEFAULT 0,
    total_cached_tokens INTEGER NOT NULL DEFAULT 0,
    dispatched_printer_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loop_iterations (
    id TEXT PRIMARY KEY,
    loop_id TEXT NOT NULL REFERENCES loop_runs(id) ON DELETE CASCADE,
    iteration_number INTEGER NOT NULL,
    generation_type TEXT NOT NULL,
    ai_model TEXT NOT NULL,
    meshy_task_id TEXT,
    parent_meshy_task_id TEXT,
    prompt_used TEXT NOT NULL,
    human_note TEXT,
    raw_transparent_url TEXT,
    garment_mockup_url TEXT,
    alpha_diagnostic_url TEXT,
    ink_separation_url TEXT,
    print_master_url TEXT,
    preflight_json TEXT,
    critic_json TEXT,
    meshy_credits INTEGER NOT NULL DEFAULT 0,
    mistral_input_tokens INTEGER NOT NULL DEFAULT 0,
    mistral_cached_tokens INTEGER NOT NULL DEFAULT 0,
    mistral_output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loop_trace_events (
    id TEXT PRIMARY KEY,
    loop_id TEXT NOT NULL REFERENCES loop_runs(id) ON DELETE CASCADE,
    iteration_number INTEGER NOT NULL,
    stage TEXT NOT NULL,
    actor TEXT NOT NULL,
    message TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
  );
`);

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const FOUNDING_WORKSPACE_ID = "ws_vigil_concrete";

export function ensureSeedWorkspace(): void {
  const existing = db
    .query("SELECT id FROM workspaces WHERE id = ?")
    .get(FOUNDING_WORKSPACE_ID);
  if (existing) return;

  const ts = nowIso();
  db.query(
    `INSERT INTO workspaces (id, slug, name, tagline, plan_tier, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    FOUNDING_WORKSPACE_ID,
    "vigil-concrete",
    "VIGIL Concrete",
    "Heavyweight Catholic skate apparel & print archive",
    "founder_studio",
    ts
  );

  const inkPalette = [
    { name: "Chalk Plastisol", hex: "#F1F1ED", pantone: "Pantone White C" },
    { name: "Liturgical Crimson", hex: "#C81E24", pantone: "Pantone 186 C" },
    { name: "Cathedral Ash", hex: "#8B9098", pantone: "Pantone Cool Gray 8 C" },
    { name: "Soot Knockout", hex: "#111214", pantone: "Garment Fabric Knockout" },
  ];

  db.query(
    `INSERT INTO brand_bibles (
      workspace_id, brand_name, aesthetic_dna, approved_motifs_json,
      forbidden_tropes_json, ink_palette_json, typography_direction,
      default_blank_spec, max_spot_colors, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    FOUNDING_WORKSPACE_ID,
    "VIGIL Concrete",
    "Raw 1990s East Coast skate zine energy colliding with solemn Catholic sacred art, cathedral stone relief engravings, and heavy 300gsm plastisol screen-print craftsmanship. High-contrast chalk white and deep liturgical crimson ink over washed obsidian cotton, with gritty woodcut hatching, vintage halftone grain, and fearless architectural symmetry.",
    JSON.stringify([
      "Archangel Michael baroque woodcut engravings",
      "Gothic cathedral rose windows and lancet stone tracery",
      "Sacred Heart thorny botanical ink etchings",
      "Rosary beads intertwined with concrete skate ledges and grip-tape grain",
      "Stained-glass geometry translated into stark 2-to-3 ink halftone plates",
      "Minimal Latin architectural inscriptions (VIGILA, MEMENTO, PAX) only when explicitly requested",
    ]),
    JSON.stringify([
      "Cheesy Hallmark church flyer clipart or pastel doves",
      "Neon cyberpunk, vaporwave purple gradients, or glossy 3D plastic renders",
      "Demonic, blasphemous, occult, or grotesque horror imagery",
      "Soft blurry radial outer glows or boxy rectangular poster backgrounds",
      "Garbled AI faux-Latin or misspelled lettering",
    ]),
    JSON.stringify(inkPalette),
    "Condensed neo-grotesk or chiseled Roman lapidary capitals with razor-sharp edges; omit text entirely unless specifically requested in the drop brief.",
    "300gsm pigment-dyed boxy heavyweight drop-shoulder tee (100% combed cotton)",
    4,
    ts
  );

  db.query(
    `INSERT INTO printer_profiles (
      id, workspace_id, name, location, supported_methods_json,
      max_spot_colors, required_dpi, dispatch_email, webhook_url, notes, is_default
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "prt_ironpress_la",
    FOUNDING_WORKSPACE_ID,
    "Ironpress Print House",
    "Los Angeles, CA",
    JSON.stringify(["screen_print", "dtg", "dtf"]),
    6,
    300,
    "prepress@ironpress-studio.example",
    "https://hooks.ironpress-studio.example/v1/tech-packs",
    "Requires 300 DPI transparent RGBA PNGs with choked edges for dark-garment white underbase; 3.5 in standard back collar drop.",
    1
  );

  db.query(
    `INSERT INTO printer_profiles (
      id, workspace_id, name, location, supported_methods_json,
      max_spot_colors, required_dpi, dispatch_email, webhook_url, notes, is_default
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "prt_foundry_bk",
    FOUNDING_WORKSPACE_ID,
    "Borough Foundry Textile Co.",
    "Brooklyn, NY",
    JSON.stringify(["screen_print", "dtf"]),
    4,
    300,
    "production@boroughfoundry.example",
    "",
    "Specializes in high-mesh water-based discharge and heavy puff plastisol on 300gsm blanks.",
    0
  );
}

ensureSeedWorkspace();

export const store = {
  listWorkspaces(): Workspace[] {
    const rows = db
      .query("SELECT * FROM workspaces ORDER BY created_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      tagline: String(r.tagline),
      planTier: r.plan_tier as Workspace["planTier"],
      createdAt: String(r.created_at),
    }));
  },

  getWorkspace(id: string): Workspace | null {
    const r = db
      .query("SELECT * FROM workspaces WHERE id = ?")
      .get(id) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      tagline: String(r.tagline),
      planTier: r.plan_tier as Workspace["planTier"],
      createdAt: String(r.created_at),
    };
  },

  createWorkspace(input: { name: string; tagline: string }): Workspace {
    const id = newId("ws");
    const slug =
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      crypto.randomBytes(2).toString("hex");
    const ts = nowIso();
    db.query(
      `INSERT INTO workspaces (id, slug, name, tagline, plan_tier, created_at)
       VALUES (?, ?, ?, ?, 'brand_pro', ?)`
    ).run(id, slug, input.name, input.tagline, ts);

    db.query(
      `INSERT INTO brand_bibles (
        workspace_id, brand_name, aesthetic_dna, approved_motifs_json,
        forbidden_tropes_json, ink_palette_json, typography_direction,
        default_blank_spec, max_spot_colors, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.name,
      `${input.tagline}. High-contrast graphic apparel engineered for crisp 300 DPI screen printing and DTG.`,
      JSON.stringify(["Bold graphic silhouettes", "Distressed halftone texture"]),
      JSON.stringify(["Blurry gradients", "Garbled AI text", "Solid box frames"]),
      JSON.stringify([
        { name: "Chalk White", hex: "#F2F2EE", pantone: "Pantone White C" },
        { name: "Cardinal Red", hex: "#C81E24", pantone: "Pantone 186 C" },
        { name: "Soot Black", hex: "#111214", pantone: "Pantone Black 6 C" },
      ]),
      "Clean bold display lettering only when explicitly requested.",
      "300gsm boxy heavyweight combed cotton tee",
      4,
      ts
    );

    db.query(
      `INSERT INTO printer_profiles (
        id, workspace_id, name, location, supported_methods_json,
        max_spot_colors, required_dpi, dispatch_email, webhook_url, notes, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      newId("prt"),
      id,
      "Default Print Partner",
      "Local Prepress",
      JSON.stringify(["screen_print", "dtg", "dtf"]),
      6,
      300,
      "prepress@brand-printer.example",
      "",
      "300 DPI transparent RGBA PNG with clean alpha edges.",
    );

    return this.getWorkspace(id)!;
  },

  getBrandBible(workspaceId: string): BrandBible | null {
    const r = db
      .query("SELECT * FROM brand_bibles WHERE workspace_id = ?")
      .get(workspaceId) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      workspaceId: String(r.workspace_id),
      brandName: String(r.brand_name),
      aestheticDna: String(r.aesthetic_dna),
      approvedMotifs: JSON.parse(String(r.approved_motifs_json)),
      forbiddenTropes: JSON.parse(String(r.forbidden_tropes_json)),
      inkPalette: JSON.parse(String(r.ink_palette_json)),
      typographyDirection: String(r.typography_direction),
      defaultBlankSpec: String(r.default_blank_spec),
      maxSpotColors: Number(r.max_spot_colors),
      updatedAt: String(r.updated_at),
    };
  },

  updateBrandBible(
    workspaceId: string,
    input: Omit<BrandBible, "workspaceId" | "updatedAt">
  ): BrandBible {
    const ts = nowIso();
    db.query(
      `UPDATE brand_bibles
       SET brand_name = ?, aesthetic_dna = ?, approved_motifs_json = ?,
           forbidden_tropes_json = ?, ink_palette_json = ?, typography_direction = ?,
           default_blank_spec = ?, max_spot_colors = ?, updated_at = ?
       WHERE workspace_id = ?`
    ).run(
      input.brandName,
      input.aestheticDna,
      JSON.stringify(input.approvedMotifs),
      JSON.stringify(input.forbiddenTropes),
      JSON.stringify(input.inkPalette),
      input.typographyDirection,
      input.defaultBlankSpec,
      input.maxSpotColors,
      ts,
      workspaceId
    );
    return this.getBrandBible(workspaceId)!;
  },

  listPrinters(workspaceId: string): PrinterProfile[] {
    const rows = db
      .query(
        "SELECT * FROM printer_profiles WHERE workspace_id = ? ORDER BY is_default DESC, name ASC"
      )
      .all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      name: String(r.name),
      location: String(r.location),
      supportedMethods: JSON.parse(String(r.supported_methods_json)),
      maxSpotColors: Number(r.max_spot_colors),
      requiredDpi: Number(r.required_dpi),
      dispatchEmail: String(r.dispatch_email),
      webhookUrl: String(r.webhook_url),
      notes: String(r.notes),
      isDefault: Boolean(r.is_default),
    }));
  },

  getPrinter(printerId: string): PrinterProfile | null {
    const r = db
      .query("SELECT * FROM printer_profiles WHERE id = ?")
      .get(printerId) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      name: String(r.name),
      location: String(r.location),
      supportedMethods: JSON.parse(String(r.supported_methods_json)),
      maxSpotColors: Number(r.max_spot_colors),
      requiredDpi: Number(r.required_dpi),
      dispatchEmail: String(r.dispatch_email),
      webhookUrl: String(r.webhook_url),
      notes: String(r.notes),
      isDefault: Boolean(r.is_default),
    };
  },

  updatePrinter(
    printerId: string,
    workspaceId: string,
    input: Omit<PrinterProfile, "id" | "workspaceId">
  ): PrinterProfile | null {
    if (input.isDefault) {
      db.query(
        "UPDATE printer_profiles SET is_default = 0 WHERE workspace_id = ?"
      ).run(workspaceId);
    }
    db.query(
      `UPDATE printer_profiles
       SET name = ?, location = ?, supported_methods_json = ?, max_spot_colors = ?,
           required_dpi = ?, dispatch_email = ?, webhook_url = ?, notes = ?, is_default = ?
       WHERE id = ? AND workspace_id = ?`
    ).run(
      input.name,
      input.location,
      JSON.stringify(input.supportedMethods),
      input.maxSpotColors,
      input.requiredDpi,
      input.dispatchEmail,
      input.webhookUrl,
      input.notes,
      input.isDefault ? 1 : 0,
      printerId,
      workspaceId
    );
    return this.getPrinter(printerId);
  },

  createLoopRun(params: {
    id?: string;
    workspaceId: string;
    title: string;
    brief: string;
    placement: PrintPlacement;
    printMethod: PrintMethod;
    blankColorway: BlankColorway;
    maxIterations: number;
    targetScore: number;
    escalateToSunburst: boolean;
    alphaChokeEnabled: boolean;
    mode: RunMode;
    status?: LoopStatus;
  }): LoopRun {
    const id = params.id ?? newId("loop");
    const ts = nowIso();
    db.query(
      `INSERT INTO loop_runs (
        id, workspace_id, title, brief, placement, print_method, blank_colorway,
        max_iterations, target_score, escalate_to_sunburst, alpha_choke_enabled,
        mode, status, current_progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      id,
      params.workspaceId,
      params.title,
      params.brief,
      params.placement,
      params.printMethod,
      params.blankColorway,
      params.maxIterations,
      params.targetScore,
      params.escalateToSunburst ? 1 : 0,
      params.alphaChokeEnabled ? 1 : 0,
      params.mode,
      params.status ?? "queued",
      ts,
      ts
    );
    return this.getLoopRun(id)!;
  },

  updateLoopRun(
    loopId: string,
    patch: Partial<{
      title: string;
      status: LoopStatus;
      currentProgress: number;
      bestIterationId: string | null;
      artSpec: ArtDirectionSpec | null;
      totalMeshyCredits: number;
      totalMistralTokens: number;
      totalCachedTokens: number;
      dispatchedPrinterId: string | null;
      errorMessage: string | null;
    }>
  ): LoopRun | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (patch.title !== undefined) {
      fields.push("title = ?");
      values.push(patch.title);
    }
    if (patch.status !== undefined) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (patch.currentProgress !== undefined) {
      fields.push("current_progress = ?");
      values.push(patch.currentProgress);
    }
    if (patch.bestIterationId !== undefined) {
      fields.push("best_iteration_id = ?");
      values.push(patch.bestIterationId);
    }
    if (patch.artSpec !== undefined) {
      fields.push("art_spec_json = ?");
      values.push(patch.artSpec ? JSON.stringify(patch.artSpec) : null);
    }
    if (patch.totalMeshyCredits !== undefined) {
      fields.push("total_meshy_credits = ?");
      values.push(patch.totalMeshyCredits);
    }
    if (patch.totalMistralTokens !== undefined) {
      fields.push("total_mistral_tokens = ?");
      values.push(patch.totalMistralTokens);
    }
    if (patch.totalCachedTokens !== undefined) {
      fields.push("total_cached_tokens = ?");
      values.push(patch.totalCachedTokens);
    }
    if (patch.dispatchedPrinterId !== undefined) {
      fields.push("dispatched_printer_id = ?");
      values.push(patch.dispatchedPrinterId);
    }
    if (patch.errorMessage !== undefined) {
      fields.push("error_message = ?");
      values.push(patch.errorMessage);
    }

    fields.push("updated_at = ?");
    values.push(nowIso());
    values.push(loopId);

    db.query(`UPDATE loop_runs SET ${fields.join(", ")} WHERE id = ?`).run(
      ...(values as never[])
    );
    return this.getLoopRun(loopId);
  },

  addIteration(params: {
    id?: string;
    loopId: string;
    iterationNumber: number;
    generationType: "text-to-image" | "image-to-image";
    aiModel: MeshyModel;
    meshyTaskId: string | null;
    parentMeshyTaskId: string | null;
    promptUsed: string;
    humanNote?: string | null;
    rawTransparentUrl?: string | null;
    garmentMockupUrl?: string | null;
    alphaDiagnosticUrl?: string | null;
    inkSeparationUrl?: string | null;
    printMasterUrl?: string | null;
    preflight?: PrintPreflightReport | null;
    critic?: CriticVerdict | null;
    meshyCredits?: number;
    mistralInputTokens?: number;
    mistralCachedTokens?: number;
    mistralOutputTokens?: number;
  }): LoopIteration {
    const id = params.id ?? newId("iter");
    const ts = nowIso();
    db.query(
      `INSERT INTO loop_iterations (
        id, loop_id, iteration_number, generation_type, ai_model, meshy_task_id,
        parent_meshy_task_id, prompt_used, human_note, raw_transparent_url,
        garment_mockup_url, alpha_diagnostic_url, ink_separation_url, print_master_url,
        preflight_json, critic_json, meshy_credits, mistral_input_tokens,
        mistral_cached_tokens, mistral_output_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.loopId,
      params.iterationNumber,
      params.generationType,
      params.aiModel,
      params.meshyTaskId,
      params.parentMeshyTaskId,
      params.promptUsed,
      params.humanNote ?? null,
      params.rawTransparentUrl ?? null,
      params.garmentMockupUrl ?? null,
      params.alphaDiagnosticUrl ?? null,
      params.inkSeparationUrl ?? null,
      params.printMasterUrl ?? null,
      params.preflight ? JSON.stringify(params.preflight) : null,
      params.critic ? JSON.stringify(params.critic) : null,
      params.meshyCredits ?? 0,
      params.mistralInputTokens ?? 0,
      params.mistralCachedTokens ?? 0,
      params.mistralOutputTokens ?? 0,
      ts
    );
    return this.getIteration(id)!;
  },

  updateIteration(
    iterId: string,
    patch: Partial<{
      meshyTaskId: string | null;
      rawTransparentUrl: string | null;
      garmentMockupUrl: string | null;
      alphaDiagnosticUrl: string | null;
      inkSeparationUrl: string | null;
      printMasterUrl: string | null;
      preflight: PrintPreflightReport | null;
      critic: CriticVerdict | null;
      meshyCredits: number;
      mistralInputTokens: number;
      mistralCachedTokens: number;
      mistralOutputTokens: number;
    }>
  ): LoopIteration | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (patch.meshyTaskId !== undefined) {
      fields.push("meshy_task_id = ?");
      values.push(patch.meshyTaskId);
    }
    if (patch.rawTransparentUrl !== undefined) {
      fields.push("raw_transparent_url = ?");
      values.push(patch.rawTransparentUrl);
    }
    if (patch.garmentMockupUrl !== undefined) {
      fields.push("garment_mockup_url = ?");
      values.push(patch.garmentMockupUrl);
    }
    if (patch.alphaDiagnosticUrl !== undefined) {
      fields.push("alpha_diagnostic_url = ?");
      values.push(patch.alphaDiagnosticUrl);
    }
    if (patch.inkSeparationUrl !== undefined) {
      fields.push("ink_separation_url = ?");
      values.push(patch.inkSeparationUrl);
    }
    if (patch.printMasterUrl !== undefined) {
      fields.push("print_master_url = ?");
      values.push(patch.printMasterUrl);
    }
    if (patch.preflight !== undefined) {
      fields.push("preflight_json = ?");
      values.push(patch.preflight ? JSON.stringify(patch.preflight) : null);
    }
    if (patch.critic !== undefined) {
      fields.push("critic_json = ?");
      values.push(patch.critic ? JSON.stringify(patch.critic) : null);
    }
    if (patch.meshyCredits !== undefined) {
      fields.push("meshy_credits = ?");
      values.push(patch.meshyCredits);
    }
    if (patch.mistralInputTokens !== undefined) {
      fields.push("mistral_input_tokens = ?");
      values.push(patch.mistralInputTokens);
    }
    if (patch.mistralCachedTokens !== undefined) {
      fields.push("mistral_cached_tokens = ?");
      values.push(patch.mistralCachedTokens);
    }
    if (patch.mistralOutputTokens !== undefined) {
      fields.push("mistral_output_tokens = ?");
      values.push(patch.mistralOutputTokens);
    }

    if (fields.length === 0) return this.getIteration(iterId);
    values.push(iterId);
    db.query(`UPDATE loop_iterations SET ${fields.join(", ")} WHERE id = ?`).run(
      ...(values as never[])
    );
    return this.getIteration(iterId);
  },

  addTraceEvent(params: {
    loopId: string;
    iterationNumber: number;
    stage: string;
    actor: LoopTraceEvent["actor"];
    message: string;
    detail?: string | null;
  }): LoopTraceEvent {
    const id = newId("evt");
    const ts = nowIso();
    db.query(
      `INSERT INTO loop_trace_events (id, loop_id, iteration_number, stage, actor, message, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.loopId,
      params.iterationNumber,
      params.stage,
      params.actor,
      params.message,
      params.detail ?? null,
      ts
    );
    return {
      id,
      loopId: params.loopId,
      iterationNumber: params.iterationNumber,
      stage: params.stage,
      actor: params.actor,
      message: params.message,
      detail: params.detail ?? null,
      createdAt: ts,
    };
  },

  getIteration(id: string): LoopIteration | null {
    const r = db
      .query("SELECT * FROM loop_iterations WHERE id = ?")
      .get(id) as Record<string, unknown> | null;
    if (!r) return null;
    return mapIteration(r);
  },

  listIterations(loopId: string): LoopIteration[] {
    const rows = db
      .query(
        "SELECT * FROM loop_iterations WHERE loop_id = ? ORDER BY iteration_number ASC"
      )
      .all(loopId) as Array<Record<string, unknown>>;
    return rows.map(mapIteration);
  },

  listTraceEvents(loopId: string): LoopTraceEvent[] {
    const rows = db
      .query(
        "SELECT * FROM loop_trace_events WHERE loop_id = ? ORDER BY created_at ASC, rowid ASC"
      )
      .all(loopId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      loopId: String(r.loop_id),
      iterationNumber: Number(r.iteration_number),
      stage: String(r.stage),
      actor: r.actor as LoopTraceEvent["actor"],
      message: String(r.message),
      detail: r.detail ? String(r.detail) : null,
      createdAt: String(r.created_at),
    }));
  },

  getLoopRun(loopId: string): LoopRun | null {
    const r = db
      .query("SELECT * FROM loop_runs WHERE id = ?")
      .get(loopId) as Record<string, unknown> | null;
    if (!r) return null;
    return mapLoopRun(r, this.listIterations(loopId), this.listTraceEvents(loopId));
  },

  listLoopRuns(workspaceId: string): LoopRun[] {
    const rows = db
      .query(
        "SELECT * FROM loop_runs WHERE workspace_id = ? ORDER BY updated_at DESC"
      )
      .all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const id = String(r.id);
      return mapLoopRun(r, this.listIterations(id), this.listTraceEvents(id));
    });
  },
};

function mapIteration(r: Record<string, unknown>): LoopIteration {
  return {
    id: String(r.id),
    loopId: String(r.loop_id),
    iterationNumber: Number(r.iteration_number),
    generationType: r.generation_type as LoopIteration["generationType"],
    aiModel: r.ai_model as MeshyModel,
    meshyTaskId: r.meshy_task_id ? String(r.meshy_task_id) : null,
    parentMeshyTaskId: r.parent_meshy_task_id
      ? String(r.parent_meshy_task_id)
      : null,
    promptUsed: String(r.prompt_used),
    humanNote: r.human_note ? String(r.human_note) : null,
    rawTransparentUrl: r.raw_transparent_url
      ? String(r.raw_transparent_url)
      : null,
    garmentMockupUrl: r.garment_mockup_url ? String(r.garment_mockup_url) : null,
    alphaDiagnosticUrl: r.alpha_diagnostic_url
      ? String(r.alpha_diagnostic_url)
      : null,
    inkSeparationUrl: r.ink_separation_url ? String(r.ink_separation_url) : null,
    printMasterUrl: r.print_master_url ? String(r.print_master_url) : null,
    preflight: r.preflight_json ? JSON.parse(String(r.preflight_json)) : null,
    critic: r.critic_json ? JSON.parse(String(r.critic_json)) : null,
    meshyCredits: Number(r.meshy_credits),
    mistralInputTokens: Number(r.mistral_input_tokens),
    mistralCachedTokens: Number(r.mistral_cached_tokens),
    mistralOutputTokens: Number(r.mistral_output_tokens),
    createdAt: String(r.created_at),
  };
}

function mapLoopRun(
  r: Record<string, unknown>,
  iterations: LoopIteration[],
  traceEvents: LoopTraceEvent[]
): LoopRun {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    title: String(r.title),
    brief: String(r.brief),
    placement: r.placement as PrintPlacement,
    printMethod: r.print_method as PrintMethod,
    blankColorway: r.blank_colorway as BlankColorway,
    maxIterations: Number(r.max_iterations),
    targetScore: Number(r.target_score),
    escalateToSunburst: Boolean(r.escalate_to_sunburst),
    alphaChokeEnabled: Boolean(r.alpha_choke_enabled),
    mode: r.mode as RunMode,
    status: r.status as LoopStatus,
    currentProgress: Number(r.current_progress),
    bestIterationId: r.best_iteration_id ? String(r.best_iteration_id) : null,
    artSpec: r.art_spec_json ? JSON.parse(String(r.art_spec_json)) : null,
    totalMeshyCredits: Number(r.total_meshy_credits),
    totalMistralTokens: Number(r.total_mistral_tokens),
    totalCachedTokens: Number(r.total_cached_tokens),
    dispatchedPrinterId: r.dispatched_printer_id
      ? String(r.dispatched_printer_id)
      : null,
    errorMessage: r.error_message ? String(r.error_message) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    iterations,
    traceEvents,
  };
}
