import { useEffect, useRef, useState } from "react";

export function AbandonDialog({
  close,
  abandon,
}: {
  close: () => void;
  abandon: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, Busy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="abandon-dialog"
      aria-label="当前任务未满一分钟"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="abandon-message">
        <p>
          当前任务未满一分钟，
          <br />
          结束视为放弃行动。
        </p>
        <small>系统将不做任何记录，也没有任何数值变动。</small>
      </div>
      <div className="abandon-actions">
        <button disabled={busy} onClick={close}>
          取消
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            Busy(true);
            try {
              await abandon();
            } finally {
              Busy(false);
            }
          }}
        >
          放弃任务
        </button>
      </div>
    </dialog>
  );
}
