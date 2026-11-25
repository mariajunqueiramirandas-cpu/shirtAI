import type { MeshyModel } from "@shirtai/shared";
import { config } from "../config";

const MESHY_BASE = "https://api.meshy.ai/openapi/v1";

export interface MeshyTaskObject {
  id: string;
  type: "text-to-image" | "image-to-image";
  ai_model: string;
  prompt: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress: number;
  created_at?: number;
  started_at?: number;
  finished_at?: number;
  expires_at?: number;
  preceding_tasks?: number;
  image_urls?: string[];
  task_error?: { message?: string } | null;
  consumed_credits?: number;
}

export interface MeshyGenerationResult {
  taskId: string;
  type: "text-to-image" | "image-to-image";
  aiModel: MeshyModel;
  imageBuffer: Buffer;
  remoteImageUrl: string;
  consumedCredits: number;
  expiresAt?: number;
}

export interface MeshyBalance {
  balance: number;
  monthly_credits?: number;
  permanent_credits?: number;
}

export class MeshyImageClient {
  private readonly apiKey: string;

  constructor(apiKey: string = config.meshyApiKey) {
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async getBalance(): Promise<MeshyBalance | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch(`${MESHY_BASE}/balance`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as MeshyBalance;
    } catch {
      return null;
    }
  }

  async generateTextToImage(params: {
    aiModel: MeshyModel;
    prompt: string;
    aspectRatio: "3:4" | "2:3" | "1:1" | "4:3" | "3:2";
    removeBackground?: boolean;
    onProgress?: (progress: number, status: string) => void;
  }): Promise<MeshyGenerationResult> {
    const createRes = await fetch(`${MESHY_BASE}/text-to-image`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        ai_model: params.aiModel,
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio,
        remove_background: params.removeBackground ?? true,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(
        `Meshy text-to-image create failed (${createRes.status}): ${errText.slice(0, 300)}`
      );
    }

    const { result: taskId } = (await createRes.json()) as { result: string };
    const finalTask = await this.waitForTask(
      "text-to-image",
      taskId,
      params.onProgress
    );
    return this.downloadTaskImage(finalTask, params.aiModel);
  }

  async generateImageToImage(params: {
    aiModel: MeshyModel;
    prompt: string;
    inputTaskId?: string;
    referenceImageUrls?: string[];
    aspectRatio: "3:4" | "2:3" | "1:1" | "4:3" | "3:2";
    removeBackground?: boolean;
    onProgress?: (progress: number, status: string) => void;
  }): Promise<MeshyGenerationResult> {
    const body: Record<string, unknown> = {
      ai_model: params.aiModel,
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio,
      remove_background: params.removeBackground ?? true,
    };

    if (params.inputTaskId) {
      body.input_task_id = params.inputTaskId;
    } else if (params.referenceImageUrls && params.referenceImageUrls.length > 0) {
      body.reference_image_urls = params.referenceImageUrls.slice(0, 5);
    } else {
      throw new Error(
        "Meshy image-to-image requires either inputTaskId or referenceImageUrls"
      );
    }

    const createRes = await fetch(`${MESHY_BASE}/image-to-image`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(
        `Meshy image-to-image create failed (${createRes.status}): ${errText.slice(0, 300)}`
      );
    }

    const { result: taskId } = (await createRes.json()) as { result: string };
    const finalTask = await this.waitForTask(
      "image-to-image",
      taskId,
      params.onProgress
    );
    return this.downloadTaskImage(finalTask, params.aiModel);
  }

  /**
   * Prefers Meshy's native SSE stream (/stream) for low-latency live progress,
   * automatically falling back to resilient GET polling if the stream drops.
   */
  private async waitForTask(
    endpointType: "text-to-image" | "image-to-image",
    taskId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<MeshyTaskObject> {
    try {
      const streamed = await this.streamTask(endpointType, taskId, onProgress);
      if (streamed) return streamed;
    } catch {
      // Fall back seamlessly to polling if SSE closes prematurely
    }

    return this.pollTask(endpointType, taskId, onProgress);
  }

  private async streamTask(
    endpointType: "text-to-image" | "image-to-image",
    taskId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<MeshyTaskObject | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);

    try {
      const res = await fetch(`${MESHY_BASE}/${endpointType}/${taskId}/stream`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) return null;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastTask: MeshyTaskObject | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLines = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());
          if (dataLines.length === 0) continue;

          try {
            const parsed = JSON.parse(dataLines.join("\n")) as MeshyTaskObject & {
              message?: string;
            };
            if (parsed.status) {
              lastTask = parsed;
              onProgress?.(parsed.progress ?? 0, parsed.status);
              if (
                parsed.status === "SUCCEEDED" ||
                parsed.status === "FAILED" ||
                parsed.status === "CANCELED"
              ) {
                return parsed;
              }
            }
          } catch {
            // Ignore heartbeat / malformed lines
          }
        }
      }

      return lastTask?.status === "SUCCEEDED" ? lastTask : null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async pollTask(
    endpointType: "text-to-image" | "image-to-image",
    taskId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<MeshyTaskObject> {
    const deadline = Date.now() + 180_000;

    while (Date.now() < deadline) {
      const res = await fetch(`${MESHY_BASE}/${endpointType}/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `Meshy task poll failed (${res.status}): ${errText.slice(0, 240)}`
        );
      }

      const task = (await res.json()) as MeshyTaskObject;
      onProgress?.(task.progress ?? 0, task.status);

      if (
        task.status === "SUCCEEDED" ||
        task.status === "FAILED" ||
        task.status === "CANCELED"
      ) {
        return task;
      }

      await new Promise((r) => setTimeout(r, 1500));
    }

    throw new Error(`Meshy task ${taskId} timed out after 180 seconds`);
  }

  private async downloadTaskImage(
    task: MeshyTaskObject,
    aiModel: MeshyModel
  ): Promise<MeshyGenerationResult> {
    if (task.status !== "SUCCEEDED") {
      throw new Error(
        `Meshy task ${task.id} ended with status ${task.status}: ${
          task.task_error?.message ?? "unknown failure"
        }`
      );
    }

    const remoteUrl = task.image_urls?.[0];
    if (!remoteUrl) {
      throw new Error(`Meshy task ${task.id} succeeded without image_urls`);
    }

    const imgRes = await fetch(remoteUrl);
    if (!imgRes.ok) {
      throw new Error(
        `Failed to persist Meshy asset (${imgRes.status}) before expiration`
      );
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    return {
      taskId: task.id,
      type: task.type,
      aiModel,
      imageBuffer: Buffer.from(arrayBuffer),
      remoteImageUrl: remoteUrl,
      consumedCredits: task.consumed_credits ?? 0,
      expiresAt: task.expires_at,
    };
  }
}
