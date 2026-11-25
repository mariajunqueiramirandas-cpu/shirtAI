# shirtAI

Autonomous multi-agent apparel design, vision critique, deterministic print preflight, and 300 DPI tech-pack pipeline built on **React + Bun + Hono.dev**.

Engineered first for heavyweight streetwear/Catholic/skate production and architected from commit one for multi-tenant B2B SaaS workspaces.

## Stack & Agentic Harness

- **Frontend (`apps/web`)**: React 19, Vite, TypeScript, React Router, Vanilla CSS design tokens
  - `/` — Editorial landing page with interactive 5-stage pipeline workbench and live blank placement switcher
  - `/studio` — Immediate `y = 0` 3-zone Production Desk, Print-Ready Vault table, editable Brand Bible, and Printer Profiles
- **Backend (`apps/api`)**: Bun, Hono.dev (`/api/v1/workspaces/:wsId/...`), Hono SSE live progress streams, Bun SQLite, `sharp`, `fflate`
  - **Brain & Vision Critic**: `deepseek-v4-1-flash-1017` hosted by Mistral (cached Brand Bible system prefix, strict JSON schema outputs, bounded 2-image multimodal critic)
  - **Image Engine**: MeshyAI GPT Image 2.6 (`gpt-image-2-6-flare` → `gpt-image-2-6-sunburst`, `remove_background: true`, `input_task_id` iterative chaining, native SSE)
  - **Deterministic Print Engineering (`sharp`)**: Pre-critic alpha-choke cleanup, dark-cotton black knockout, hue-aware spot-ink plate clustering, 300 DPI `pHYs` print masters (`4200×5400 px` back / `3600×4800 px` front / `1200×1200 px` chest), and downloadable Tech-Pack ZIP bundles
- **Shared Contracts (`packages/shared`)**: Shared Zod schemas, print geometry constants, and TypeScript types

## Deploy on Dokploy (Docker Compose)

The root [`docker-compose.yml`](./docker-compose.yml) and multi-stage [`Dockerfile`](./Dockerfile) bundle the React SPA and Bun + Hono API into a single unified container (`port 8787`) so Traefik routing, SSE live streams (`X-Accel-Buffering: no`, `idleTimeout: 255`), SPA client routes (`/studio`), and 300 DPI tech-pack downloads run on one origin with zero proxy buffering issues.

1. In Dokploy, create a new **Compose** service (`Docker Compose` type) connected to this GitHub repository with Compose Path `./docker-compose.yml`.
2. In the **Environment** tab, paste the variables from [`.env.example`](./.env.example) and set your `MISTRAL_API_KEY` and `MESHY_API_KEY` (leave empty to run in dry-run mode).
3. In the **Domains** tab, add your domain targeting service **`shirtai`** and Container Port **`8787`** with HTTPS (Let's Encrypt) enabled.
4. Click **Deploy** (redeploy after any domain change so Dokploy injects Traefik labels). SQLite and all persisted 300 DPI print assets live on the persistent `shirtai_data` volume (`/app/data`).

### Test the Production Docker Image Locally

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## Local Development

1. Install dependencies:
   ```bash
   bun install
   ```
2. Copy the API environment template and add your keys (optional — runs in zero-credit dry-run mode without keys):
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
3. Run the Bun + Hono API (`:8787`) and React Vite app (`:5173`):
   ```bash
   bun run dev:api
   bun run dev:web
   ```
4. Typecheck and production build:
   ```bash
   bun run typecheck
   bun run build
   ```
