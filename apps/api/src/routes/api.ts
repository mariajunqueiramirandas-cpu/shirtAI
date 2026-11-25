import { zValidator } from "@hono/zod-validator";
import {
  ApproveLoopInputSchema,
  CreateLoopInputSchema,
  CreateWorkspaceInputSchema,
  HumanFeedbackInputSchema,
  UpdateBrandBibleSchema,
  UpdatePrinterProfileSchema,
} from "@shirtai/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { config } from "../config";
import { FOUNDING_WORKSPACE_ID, store } from "../db/database";
import { MeshyImageClient } from "../providers/meshy";
import { harness } from "../services/harness";
import { assembleTechPackZip } from "../services/print-engineering";
import { sseHub } from "../services/sse-hub";

export const apiRouter = new Hono();

const meshyClient = new MeshyImageClient();

apiRouter.get("/system/status", async (c) => {
  const meshyBalance = config.hasLiveKeys ? await meshyClient.getBalance() : null;
  return c.json({
    ok: true,
    liveKeysConfigured: config.hasLiveKeys,
    mistralModel: config.mistralModel,
    meshyDraftModel: config.meshyDraftModel,
    meshyMasterModel: config.meshyMasterModel,
    meshyBalance: meshyBalance?.balance ?? null,
    foundingWorkspaceId: FOUNDING_WORKSPACE_ID,
  });
});

// Multi-tenant Workspaces
apiRouter.get("/workspaces", (c) => {
  return c.json({ workspaces: store.listWorkspaces() });
});

apiRouter.post(
  "/workspaces",
  zValidator("json", CreateWorkspaceInputSchema),
  (c) => {
    const input = c.req.valid("json");
    const workspace = store.createWorkspace(input);
    return c.json({ workspace }, 201);
  }
);

// Tenant-scoped Brand Bible
apiRouter.get("/workspaces/:wsId/brand-bible", (c) => {
  const wsId = c.req.param("wsId");
  const bible = store.getBrandBible(wsId);
  if (!bible) return c.json({ error: "Workspace brand bible not found" }, 404);
  return c.json({ brandBible: bible });
});

apiRouter.put(
  "/workspaces/:wsId/brand-bible",
  zValidator("json", UpdateBrandBibleSchema),
  (c) => {
    const wsId = c.req.param("wsId");
    if (!store.getWorkspace(wsId)) {
      return c.json({ error: "Workspace not found" }, 404);
    }
    const updated = store.updateBrandBible(wsId, c.req.valid("json"));
    return c.json({ brandBible: updated });
  }
);

// Tenant-scoped Printer Profiles
apiRouter.get("/workspaces/:wsId/printers", (c) => {
  const wsId = c.req.param("wsId");
  return c.json({ printers: store.listPrinters(wsId) });
});

apiRouter.put(
  "/workspaces/:wsId/printers/:printerId",
  zValidator("json", UpdatePrinterProfileSchema),
  (c) => {
    const wsId = c.req.param("wsId");
    const printerId = c.req.param("printerId");
    const updated = store.updatePrinter(printerId, wsId, c.req.valid("json"));
    if (!updated) return c.json({ error: "Printer profile not found" }, 404);
    return c.json({ printer: updated });
  }
);

// Tenant-scoped Agentic Loops
apiRouter.get("/workspaces/:wsId/loops", (c) => {
  const wsId = c.req.param("wsId");
  return c.json({ loops: store.listLoopRuns(wsId) });
});

apiRouter.post(
  "/workspaces/:wsId/loops",
  zValidator("json", CreateLoopInputSchema),
  (c) => {
    const wsId = c.req.param("wsId");
    if (!store.getWorkspace(wsId)) {
      return c.json({ error: "Workspace not found" }, 404);
    }
    const input = c.req.valid("json");
    const initialTitle =
      input.brief
        .split(/[.!?\n]/)[0]
        .trim()
        .slice(0, 46) || "Untitled Drop";

    const loop = store.createLoopRun({
      workspaceId: wsId,
      title: initialTitle,
      brief: input.brief,
      placement: input.placement,
      printMethod: input.printMethod,
      blankColorway: input.blankColorway,
      maxIterations: input.maxIterations,
      targetScore: input.targetScore,
      escalateToSunburst: input.escalateToSunburst,
      alphaChokeEnabled: input.alphaChokeEnabled,
      mode: input.mode,
    });

    harness.startLoopInBackground(loop.id);
    return c.json({ loop }, 201);
  }
);

apiRouter.get("/workspaces/:wsId/loops/:loopId", (c) => {
  const loop = store.getLoopRun(c.req.param("loopId"));
  if (!loop || loop.workspaceId !== c.req.param("wsId")) {
    return c.json({ error: "Loop run not found" }, 404);
  }
  return c.json({ loop });
});

// Live Hono SSE Stream for real-time agentic progress & critic trace
apiRouter.get("/workspaces/:wsId/loops/:loopId/stream", (c) => {
  const loopId = c.req.param("loopId");
  const loop = store.getLoopRun(loopId);
  if (!loop || loop.workspaceId !== c.req.param("wsId")) {
    return c.json({ error: "Loop run not found" }, 404);
  }

  c.header("X-Accel-Buffering", "no");
  c.header("Cache-Control", "no-cache, no-transform");

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "snapshot",
      data: JSON.stringify({ type: "snapshot", loop }),
    });

    let closed = false;
    const unsubscribe = sseHub.subscribe(loopId, (msg) => {
      if (closed) return;
      stream
        .writeSSE({
          event: msg.type,
          data: JSON.stringify(msg),
        })
        .catch(() => {
          closed = true;
        });
    });

    const keepalive = setInterval(() => {
      if (closed) return;
      stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {
        closed = true;
      });
    }, 8000);

    stream.onAbort(() => {
      closed = true;
      clearInterval(keepalive);
      unsubscribe();
    });

    // Hold SSE connection open until client disconnects
    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve());
    });
  });
});

// Human Director Feedback -> Chained Meshy image-to-image revision
apiRouter.post(
  "/workspaces/:wsId/loops/:loopId/feedback",
  zValidator("json", HumanFeedbackInputSchema),
  async (c) => {
    const wsId = c.req.param("wsId");
    const loopId = c.req.param("loopId");
    const loop = store.getLoopRun(loopId);
    if (!loop || loop.workspaceId !== wsId) {
      return c.json({ error: "Loop run not found" }, 404);
    }
    if (harness.isRunning(loopId)) {
      return c.json({ error: "Loop is currently executing an iteration" }, 409);
    }

    await harness.runHumanFeedbackInBackground(loopId, c.req.valid("json"));
    return c.json({ loop: store.getLoopRun(loopId) }, 202);
  }
);

// Approve & Optionally Dispatch to Print Partner
apiRouter.post(
  "/workspaces/:wsId/loops/:loopId/approve",
  zValidator("json", ApproveLoopInputSchema),
  (c) => {
    const wsId = c.req.param("wsId");
    const loopId = c.req.param("loopId");
    const loop = store.getLoopRun(loopId);
    if (!loop || loop.workspaceId !== wsId) {
      return c.json({ error: "Loop run not found" }, 404);
    }

    const input = c.req.valid("json");
    const printers = store.listPrinters(wsId);
    const chosenPrinter =
      printers.find((p) => p.id === input.printerProfileId) ??
      printers.find((p) => p.isDefault) ??
      printers[0] ??
      null;

    const chosenIterationId =
      input.iterationId ??
      loop.bestIterationId ??
      loop.iterations[loop.iterations.length - 1]?.id ??
      null;

    const newStatus = input.dispatchNow ? "dispatched" : "approved";
    const updated = store.updateLoopRun(loopId, {
      status: newStatus,
      bestIterationId: chosenIterationId,
      dispatchedPrinterId: input.dispatchNow ? chosenPrinter?.id ?? null : loop.dispatchedPrinterId,
    })!;

    store.addTraceEvent({
      loopId,
      iterationNumber: loop.iterations.length,
      stage: newStatus,
      actor: "human_director",
      message: input.dispatchNow
        ? `Approved & dispatched 300 DPI tech-pack to ${chosenPrinter?.name ?? "print house"}`
        : "Approved for print-ready vault & tech-pack export",
      detail: chosenPrinter ? `Recipient: ${chosenPrinter.dispatchEmail}` : null,
    });

    const fresh = store.getLoopRun(loopId)!;
    sseHub.publish(loopId, { type: "update", loop: fresh });
    return c.json({ loop: fresh });
  }
);

// Download Real 300 DPI Print-Ready Tech-Pack ZIP
apiRouter.get("/workspaces/:wsId/loops/:loopId/tech-pack", async (c) => {
  const wsId = c.req.param("wsId");
  const loopId = c.req.param("loopId");
  const loop = store.getLoopRun(loopId);
  if (!loop || loop.workspaceId !== wsId) {
    return c.json({ error: "Loop run not found" }, 404);
  }

  const iterIdParam = c.req.query("iterationId");
  const iteration =
    loop.iterations.find((i) => i.id === iterIdParam) ??
    loop.iterations.find((i) => i.id === loop.bestIterationId) ??
    loop.iterations[loop.iterations.length - 1];

  if (!iteration) {
    return c.json({ error: "No completed iteration available for export" }, 400);
  }

  const bible = store.getBrandBible(wsId)!;
  const printers = store.listPrinters(wsId);
  const printer =
    printers.find((p) => p.id === loop.dispatchedPrinterId) ??
    printers.find((p) => p.isDefault) ??
    printers[0] ??
    null;

  const { zipBytes, filename } = await assembleTechPackZip({
    loop,
    iteration,
    bible,
    printer,
  });

  return new Response(Buffer.from(zipBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
