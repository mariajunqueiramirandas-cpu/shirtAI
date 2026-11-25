import path from "node:path";

const API_ROOT = path.resolve(import.meta.dir, "..");

export const config = {
  port: Number(process.env.PORT ?? 8787),
  hostname: process.env.HOST?.trim() || "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN?.trim() || "*",
  mistralApiKey: process.env.MISTRAL_API_KEY?.trim() ?? "",
  meshyApiKey: process.env.MESHY_API_KEY?.trim() ?? "",
  mistralModel: process.env.MISTRAL_MODEL?.trim() || "deepseek-v4-1-flash-1017",
  meshyDraftModel: (process.env.MESHY_DRAFT_MODEL?.trim() ||
    "gpt-image-2-6-flare") as "gpt-image-2-6-flare" | "gpt-image-2-6-sunburst",
  meshyMasterModel: (process.env.MESHY_MASTER_MODEL?.trim() ||
    "gpt-image-2-6-sunburst") as "gpt-image-2-6-flare" | "gpt-image-2-6-sunburst",
  apiRoot: API_ROOT,
  blanksDir: path.resolve(API_ROOT, "assets/blanks"),
  webDistDir: path.resolve(
    API_ROOT,
    process.env.WEB_DIST_DIR || "../web/dist"
  ),
  storageDir: path.resolve(API_ROOT, process.env.STORAGE_DIR || "./storage"),
  databasePath: path.resolve(
    API_ROOT,
    process.env.DATABASE_PATH || "./storage/shirtai.sqlite"
  ),
  get hasLiveKeys(): boolean {
    return Boolean(this.mistralApiKey && this.meshyApiKey);
  },
};
