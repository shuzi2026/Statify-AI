import { Trash2 } from "lucide-react";
import { Dialog, Field, timeText } from "../components";
import { methodNames, statusNames } from "../model";
import type { useJournalEditor } from "./useJournalEditor";
import { journalSentence } from "./read-model";
import { PurchaseDetails } from "../cards/PurchaseHistory";
import { ChatText } from "../app/ai-chat-links";

export function JournalReflection({
  editor,
  profileName,
}: {
  editor: ReturnType<typeof useJournalEditor>;
  profileName: string;
}) {
  const {
    entry, editing, note, saving, close, save, setNote, cancel, edit, remove,
  } = editor;
  if (!entry) return null;
  return (
    <Dialog
      title={editing ? "记下这次的感想" : entry.purchase ? "购买记录" : "个人感悟"}
      className="journal-dialog"
      close={close}
      dismissible={!saving}
    >
      <p className="journal-context">
        {journalSentence(profileName, entry)}
        <br />
        <time dateTime={new Date(entry.endedAt).toISOString()}>
          {new Date(entry.endedAt).toLocaleString("zh-CN")}
        </time>
      </p>
      {entry.purchase && <PurchaseDetails purchase={entry.purchase} />}
      {editing ? (
        <>
          <Field label="感想">
            <textarea
              aria-label="感想"
              autoFocus
              disabled={saving}
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <footer className="dialog-actions">
            <button disabled={saving} onClick={cancel}>
              取消
            </button>
            <button
              className="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "正在保存…" : "保存感想"}
            </button>
          </footer>
        </>
      ) : (
        <>
          <p className="journal-note">
            {entry.note.trim() ? <ChatText content={entry.note} /> : "还没有填写个人感悟。"}
          </p>
          <button
            className="text-button"
            aria-label={"编辑感想 " + entry.name}
            onClick={edit}
          >
            {entry.note.trim() ? "编辑感想" : "填写感想"}
          </button>
          <div className="journal-detail-row">
            {!entry.purchase && <details>
              <summary>本次明细</summary>
              <p>
                {entry.legacy ? "0.1 迁移记录" : methodNames[entry.method]} ·{" "}
                {entry.counted ? "已完成" : "部分记录"}
              </p>
              <p>
                {entry.reported ? "补记行动" : "起止："}{" "}
                {!entry.reported && <>{new Date(entry.startedAt).toLocaleString()} —{" "}</>}
                {new Date(entry.endedAt).toLocaleString()}
              </p>
              <p>
                {entry.reported ? "申报时长" : "原计时"} {timeText(entry.measured)}；最终 {timeText(entry.seconds)}
                ；数量 {entry.quantity}；评价 ×{entry.rating}；状态 ×
                {entry.coefficient.toFixed(3)}
              </p>
              {[...entry.rewards, ...entry.effects, ...entry.values].map(
                (r, i) => (
                  <p key={i}>
                    {statusNames[r.name as keyof typeof statusNames] || r.name}：
                    {r.actual >= 0 ? "+" : ""}
                    {Math.round(r.actual)} {r.reason}
                  </p>
                ),
              )}
            </details>}
            <button
              type="button"
              className="icon-button journal-delete-entry"
              aria-label="删除行动记录"
              disabled={saving}
              onClick={() => void remove()}
            >
              <Trash2 size={16} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
