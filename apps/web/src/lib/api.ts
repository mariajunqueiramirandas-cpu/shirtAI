import type {
  ApproveLoopInput,
  BrandBible,
  CreateLoopInput,
  CreateWorkspaceInput,
  HumanFeedbackInput,
  LoopRun,
  PrinterProfile,
  UpdateBrandBibleInput,
  Workspace,
} from "@shirtai/shared";

export interface SystemStatus {
  ok: boolean;
  liveKeysConfigured: boolean;
  mistralModel: string;
  meshyDraftModel: string;
  meshyMasterModel: string;
  meshyBalance: number | null;
  foundingWorkspaceId: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) errMsg = data.error;
    } catch {
      // ignore non-JSON body
    }
    throw new Error(errMsg);
  }
  return (await res.json()) as T;
}

export const api = {
  getSystemStatus(): Promise<SystemStatus> {
    return request<SystemStatus>("/api/v1/system/status");
  },

  async listWorkspaces(): Promise<Workspace[]> {
    const res = await request<{ workspaces: Workspace[] }>("/api/v1/workspaces");
    return res.workspaces;
  },

  async createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    const res = await request<{ workspace: Workspace }>("/api/v1/workspaces", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.workspace;
  },

  async getBrandBible(wsId: string): Promise<BrandBible> {
    const res = await request<{ brandBible: BrandBible }>(
      `/api/v1/workspaces/${wsId}/brand-bible`
    );
    return res.brandBible;
  },

  async updateBrandBible(
    wsId: string,
    input: UpdateBrandBibleInput
  ): Promise<BrandBible> {
    const res = await request<{ brandBible: BrandBible }>(
      `/api/v1/workspaces/${wsId}/brand-bible`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      }
    );
    return res.brandBible;
  },

  async listPrinters(wsId: string): Promise<PrinterProfile[]> {
    const res = await request<{ printers: PrinterProfile[] }>(
      `/api/v1/workspaces/${wsId}/printers`
    );
    return res.printers;
  },

  async updatePrinter(
    wsId: string,
    printerId: string,
    input: Omit<PrinterProfile, "id" | "workspaceId">
  ): Promise<PrinterProfile> {
    const res = await request<{ printer: PrinterProfile }>(
      `/api/v1/workspaces/${wsId}/printers/${printerId}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      }
    );
    return res.printer;
  },

  async listLoops(wsId: string): Promise<LoopRun[]> {
    const res = await request<{ loops: LoopRun[] }>(
      `/api/v1/workspaces/${wsId}/loops`
    );
    return res.loops;
  },

  async createLoop(wsId: string, input: CreateLoopInput): Promise<LoopRun> {
    const res = await request<{ loop: LoopRun }>(
      `/api/v1/workspaces/${wsId}/loops`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
    return res.loop;
  },

  async sendFeedback(
    wsId: string,
    loopId: string,
    input: HumanFeedbackInput
  ): Promise<LoopRun> {
    const res = await request<{ loop: LoopRun }>(
      `/api/v1/workspaces/${wsId}/loops/${loopId}/feedback`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
    return res.loop;
  },

  async approveLoop(
    wsId: string,
    loopId: string,
    input: ApproveLoopInput
  ): Promise<LoopRun> {
    const res = await request<{ loop: LoopRun }>(
      `/api/v1/workspaces/${wsId}/loops/${loopId}/approve`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
    return res.loop;
  },

  getTechPackUrl(wsId: string, loopId: string, iterationId?: string): string {
    const qs = iterationId ? `?iterationId=${encodeURIComponent(iterationId)}` : "";
    return `/api/v1/workspaces/${wsId}/loops/${loopId}/tech-pack${qs}`;
  },

  subscribeToLoop(
    wsId: string,
    loopId: string,
    handlers: {
      onSnapshot?: (loop: LoopRun) => void;
      onUpdate?: (loop: LoopRun) => void;
      onProgress?: (data: { status: string; progress: number; message: string }) => void;
    }
  ): () => void {
    const es = new EventSource(`/api/v1/workspaces/${wsId}/loops/${loopId}/stream`);

    es.addEventListener("snapshot", (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as { loop: LoopRun };
        handlers.onSnapshot?.(parsed.loop);
      } catch {
        // ignore
      }
    });

    es.addEventListener("update", (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as { loop: LoopRun };
        handlers.onUpdate?.(parsed.loop);
      } catch {
        // ignore
      }
    });

    es.addEventListener("progress", (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as {
          status: string;
          progress: number;
          message: string;
        };
        handlers.onProgress?.(parsed);
      } catch {
        // ignore
      }
    });

    return () => {
      es.close();
    };
  },
};
