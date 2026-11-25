import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./config";
import { closeDatabase } from "./db/database";
import { apiRouter } from "./routes/api";

const app = new Hono();

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: config.corsOrigin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "shirtai",
    runtime: "bun+hono",
    liveKeysConfigured: config.hasLiveKeys,
  })
);

app.route("/api/v1", apiRouter);

// Serve persisted print artifacts (raw RGBA PNGs, garment mockups, alpha X-Ray, 300 DPI masters)
app.get("/storage/*", async (c) => {
  const reqPath = c.req.path.replace(/^\/storage\//, "");
  const safePath = path.resolve(config.storageDir, reqPath);
  if (!safePath.startsWith(config.storageDir + path.sep)) {
    return c.text("Forbidden", 403);
  }
  try {
    const fileBytes = await fs.readFile(safePath);
    return new Response(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": getContentType(safePath),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return c.text("Not found", 404);
  }
});

// Unified production SPA serving (serves apps/web/dist directly on the same origin behind Dokploy Traefik)
const hasBuiltFrontend = fsSync.existsSync(
  path.join(config.webDistDir, "index.html")
);

if (hasBuiltFrontend) {
  app.get("*", async (c) => {
    const reqPath = c.req.path;
    if (reqPath.startsWith("/api/") || reqPath.startsWith("/storage/")) {
      return c.json({ error: "Not found" }, 404);
    }

    const relative = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
    const candidate = path.resolve(config.webDistDir, relative);

    if (candidate.startsWith(config.webDistDir + path.sep)) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          const fileBytes = await fs.readFile(candidate);
          const isHashedViteAsset =
            relative.startsWith("assets/") && /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/i.test(relative);
          return new Response(fileBytes, {
            status: 200,
            headers: {
              "Content-Type": getContentType(candidate),
              "Cache-Control": isHashedViteAsset
                ? "public, max-age=31536000, immutable"
                : relative === "index.html"
                ? "no-cache"
                : "public, max-age=86400",
            },
          });
        }
      } catch {
        // Fall through to SPA index.html for client-side routes like /studio
      }
    }

    const indexHtml = await fs.readFile(path.join(config.webDistDir, "index.html"));
    return new Response(indexHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  });
}

// Graceful shutdown for Docker/Dokploy redeploys so SQLite WAL checkpoints cleanly
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`[shirtAI] Received ${sig}, checkpointing SQLite WAL and exiting`);
    closeDatabase();
    process.exit(0);
  });
}

console.log(
  `[shirtAI] Listening on http://${config.hostname}:${config.port} (frontend: ${
    hasBuiltFrontend ? "bundled SPA" : "api-only"
  }, live keys: ${config.hasLiveKeys ? "configured" : "dry-run"})`
);

export default {
  hostname: config.hostname,
  port: config.port,
  idleTimeout: 255,
  fetch: app.fetch,
};
