import { AI_CHAT_STREAM } from "../../shared/ai-chat";
import { streamLines } from "../../shared/text-stream";

export async function readChatReply(
  response: Response,
  onText: (delta: string) => void,
  onSearch: () => void,
) {
  if (!response.body || !response.headers.get("Content-Type")?.startsWith(AI_CHAT_STREAM))
    return { ok: response.ok, result: await response.json() };
  for await (const line of streamLines(response.body)) {
    if (!line) continue;
    const event = JSON.parse(line);
    if (event.type === "text" && typeof event.delta === "string") onText(event.delta);
    else if (event.type === "search") onSearch();
    else if (event.type === "result" && typeof event.status === "number" && event.body)
      return { ok: event.status >= 200 && event.status < 300, result: event.body };
  }
  throw Error("Chat stream ended before completion");
}
