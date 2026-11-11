import { streamLines } from "../shared/text-stream";

export async function readAiResponse<T>(
  response: Response, text?: (delta: string) => void, protectedValues: string[] = [],
): Promise<{ result: T; status: number; ok: boolean }> {
  if (!response.ok || !response.body || !response.headers.get("Content-Type")?.startsWith("text/event-stream"))
    return { result: await response.json(), status: response.status, ok: response.ok };

  const visible = new Set<number>();
  let carry = "";
  function emit(delta: string, done = false) {
    if (!text) return;
    let value = carry + delta;
    for (const secret of protectedValues) value = value.replaceAll(secret, "[redacted]");
    let length = 0;
    if (!done) {
      for (const secret of protectedValues) {
        for (let size = Math.min(value.length, secret.length - 1); size > length; size--) {
          if (value.endsWith(secret.slice(0, size))) {
            length = size;
            break;
          }
        }
      }
    }
    carry = length ? value.slice(-length) : "";
    const safe = length ? value.slice(0, -length) : value;
    if (safe) text(safe);
  }
  for await (const line of streamLines(response.body)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") break;
    const event = JSON.parse(data);
    if (event.type === "response.output_item.added" && event.item?.type === "message" && event.item.phase !== "commentary")
      visible.add(event.output_index);
    if (event.type === "response.output_text.delta" && visible.has(event.output_index) && typeof event.delta === "string")
      emit(event.delta);
    if (event.type === "response.completed") {
      emit("", true);
      return { result: event.response, status: 200, ok: true };
    }
    if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error")
      return { result: event.response ?? { error: { code: event.code } }, status: 502, ok: false };
  }
  throw Error("AI response stream ended before completion");
}
