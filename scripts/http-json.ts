import type { IncomingMessage, ServerResponse } from "node:http";
import { AI_CHAT_STREAM } from "../shared/ai-chat";

export function json(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 128_000) return undefined;
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

type ChatResult = { status: number; body: object; retryAfter?: number };
export type ChatProgress = { type: "text"; delta: string } | { type: "search" };

export async function sendChat(
  request: IncomingMessage, response: ServerResponse,
  run: (progress?: (event: ChatProgress) => void, signal?: AbortSignal) => Promise<ChatResult>,
) {
  const stream = request.headers.accept === AI_CHAT_STREAM;
  const controller = new AbortController();
  const close = () => controller.abort();
  response.once("close", close);
  let started = false;
  const progress = (event: ChatProgress) => {
    if (response.destroyed) return;
    if (!started) {
      response.writeHead(200, {
        "Content-Type": AI_CHAT_STREAM + "; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      });
      started = true;
    }
    response.write(JSON.stringify(event) + "\n");
  };
  try {
    const result = await run(stream ? progress : undefined, controller.signal);
    if (response.destroyed) return;
    if (started) {
      response.end(JSON.stringify({ type: "result", status: result.status, body: result.body }) + "\n");
    } else {
      if (result.retryAfter !== undefined) response.setHeader("Retry-After", String(result.retryAfter));
      json(response, result.status, result.body);
    }
  } finally {
    response.off("close", close);
  }
}
