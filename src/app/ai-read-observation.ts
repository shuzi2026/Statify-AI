import { aiReadObservation, type AiReadObservation, type AiActivityOperation, type AiProfileOperation } from "../../shared/ai-chat";
import type { State } from "../model";
import { readActivity, type ActivityResult } from "./ai-activity";

export type LocalRead = Extract<AiActivityOperation, { type: "read_activity" }> | Extract<AiProfileOperation, { type: "read_profile" }>;
export function observeLocalRead(state: State, operation: LocalRead, now: number, chinese: boolean): {
  observation: AiReadObservation; result?: ActivityResult;
} {
  const result = operation.type === "read_activity" ? readActivity(state, operation, now, chinese) : undefined;
  const offset = operation.type === "read_activity" ? operation.offset ?? 0 : 0;
  const rows = result ? result.page(offset, 20) : [JSON.stringify({
    ...(operation.type === "read_profile" && operation.field !== "age" && { name: state.profile.name }),
    ...(operation.type === "read_profile" && operation.field !== "name" && { age: state.profile.age }),
  })];
  const count = result?.count ?? 1;
  const observation = aiReadObservation.parse({ title: result?.title ?? "Character profile", count, offset,
    rows: rows.map((row) => row.length > 3_000 ? row.slice(0, 2_980) + "\n[Row truncated]" : row),
    truncated: offset > 0 || offset + rows.length < count || rows.some((row) => row.length > 3_000),
    observedAt: new Date(now).toISOString(),
  });
  while (new TextEncoder().encode(JSON.stringify(observation)).byteLength > 56_000) {
    observation.rows.pop();
    observation.truncated = true;
  }
  return { observation, result };
}
