import { CheckCircle2 } from "lucide-react";
import type { Entry } from "./model";

/** Shared content for direct completion and the normal saved-action notice. */
export function CompletionNotice({
  entry,
  message,
}: {
  entry: Entry;
  message?: string;
}) {
  return (
    <>
      <CheckCircle2 size={36} />
      <strong>{entry.name}</strong>
      <span>{entry.counted ? "已完成一次" : "已记录本次行动"}</span>
      {message && <p>{message}</p>}
      {entry.values
        .filter((v) => v.reason.includes("两行数值空间不足"))
        .map((v) => (
          <p key={v.id} role="status">
            {v.name}：{v.reason}
          </p>
        ))}
    </>
  );
}
