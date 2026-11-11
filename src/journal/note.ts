import { textLimits } from "../../shared/rules/text";
import type { State } from "../model";

export function saveJournalNote(state: State, id: string, note: string, expected?: string) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) throw Error("这条记录已不存在");
  if (expected !== undefined && entry.note !== expected)
    throw Error("感想已更新，请重新打开这条日志。");
  if (note.length > textLimits.note) throw Error("感想超过字数上限，请缩短后重试。");
  entry.note = note;
}
