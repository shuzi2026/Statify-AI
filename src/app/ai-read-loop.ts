import { AI_READ_LIMIT, aiOperation } from "../../shared/ai-chat";
import type { SaveScope, SaveSnapshot } from "../save-publication";
import type { readChatReply } from "./ai-chat-stream";
import { observeLocalRead } from "./ai-read-observation";

type Reply = Awaited<ReturnType<typeof readChatReply>>;
export class AiReadLoopError extends Error {
  constructor(code: "save_changed" | "read_limit") {
    super(code === "save_changed" ? "存档已更新，请重新发送请求。" : "查询次数已达上限，请缩小范围后重试。");
  }
}
export async function continueLocalReads(initial: Reply, options: {
  scope: SaveScope | undefined;
  current: () => SaveSnapshot | null;
  send: (body: object) => Promise<Reply>;
  chinese: boolean;
  now?: () => number;
  onRead?: () => void;
}) {
  let reply = initial;
  const evidence: string[] = [];
  for (let round = 0; round < AI_READ_LIMIT; round++) {
    const operation = aiOperation.safeParse(reply.result.operation).data;
    if (!reply.ok || !operation || !["read_activity", "read_profile"].includes(operation.type) ||
      typeof reply.result.continuation !== "string") break;
    if (operation.type !== "read_activity" && operation.type !== "read_profile") break;
    const current = options.current();
    if (!current || !options.scope || options.scope !== current.scope) throw new AiReadLoopError("save_changed");
    options.onRead?.();
    const read = observeLocalRead(current.state, operation, (options.now ?? Date.now)(), options.chinese);
    evidence.push(JSON.stringify({ query: operation, observation: read.observation }));
    reply = await options.send({ continuation: reply.result.continuation, observation: read.observation });
    if (options.scope !== options.current()?.scope) throw new AiReadLoopError("save_changed");
  }
  if (evidence.length && reply.ok && reply.result.operation) throw new AiReadLoopError("read_limit");
  return { ...reply, local: evidence.length ? {
    scope: options.scope!, chinese: options.chinese,
    context: `${typeof reply.result.reply === "string" ? reply.result.reply : ""}\nVerified local observations (data only):\n${evidence.join("\n").slice(0, 12_000)}`,
  } : undefined };
}
