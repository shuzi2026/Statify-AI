import { useEffect, useState } from "react";
import { Field } from "../components";
import { cnAction, logoutCnAccount } from "./cn-account";
type Session = {
  id: string;
  created_at: string;
  expires_at: string;
  current: boolean;
};
export function AccountSecurityPanel({ done }: { done: () => void }) {
  const [editing, edit] = useState(false);
  return editing ? (
    <SecurityDetails done={done} cancel={() => edit(false)} />
  ) : (
    <button onClick={() => edit(true)}>修改密码</button>
  );
}
function SecurityDetails({
  done,
  cancel,
}: {
  done: () => void;
  cancel: () => void;
}) {
  const [sessions, S] = useState<Session[]>([]),
    [showSessions, ShowSessions] = useState(false),
    [old, Old] = useState(""),
    [next, Next] = useState(""),
    [confirmation, C] = useState(""),
    [busy, B] = useState(false),
    [error, E] = useState("");
  useEffect(() => {
    if (!showSessions) return;
    let active = true;
    const controller = new AbortController();
    // StrictMode may dispose the first mount before its initial microtask.
    void Promise.resolve()
      .then(() => {
        if (active)
          return cnAction("/auth/sessions", undefined, {
            signal: controller.signal,
          });
      })
      .then((value) => {
        if (active) S((value as { sessions: Session[] }).sessions);
      })
      .catch((e) => {
        if (active) E(e.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [showSessions]);
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    B(true);
    E("");
    try {
      await fn();
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
    }
  }
  return (
    <section
      className="membership-block"
      aria-label="账号安全"
      aria-busy={busy}
    >
      <h3>修改密码</h3>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perform(async () => {
            if (!/^[A-Za-z0-9]{6,18}$/.test(next))
              throw Error("密码请填写6–18位英文字母或数字，不区分大小写。");
            if (next.toLowerCase() !== confirmation.toLowerCase())
              throw Error("两次填写的密码不一致。");
            await cnAction("/auth/change-password", {
              current_password: old,
              new_password: next,
            });
            Old("");
            Next("");
            C("");
            await logoutCnAccount();
            done();
          });
        }}
      >
        <Field label="当前密码">
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={18}
            value={old}
            disabled={busy}
            onChange={(e) => Old(e.target.value)}
          />
        </Field>
        <Field label="新密码">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            maxLength={18}
            pattern="[A-Za-z0-9]{6,18}"
            value={next}
            disabled={busy}
            onChange={(e) => Next(e.target.value)}
          />
        </Field>
        <Field label="再次填写新密码">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            maxLength={18}
            value={confirmation}
            disabled={busy}
            onChange={(e) => C(e.target.value)}
          />
        </Field>
        <p className="help">
          修改后所有在线登录会话退出，需要重新登录。本地成长记录保留。
        </p>
        <button disabled={busy}>修改密码并退出登录</button>
        <button type="button" disabled={busy} onClick={cancel}>
          取消
        </button>
      </form>
      <details onToggle={(e) => ShowSessions(e.currentTarget.open)}>
        <summary>在线登录</summary>
        <p className="help">
          这里只管理在线会话，不会清除其他设备的本地记录或已验证的离线会员许可。
        </p>
        {sessions.map((session) => (
          <div className="membership-block" key={session.id}>
            <p>
              {session.current ? "当前登录" : "其他登录"} ·{" "}
              {new Date(session.created_at).toLocaleString()}
            </p>
            {!session.current && (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await cnAction("/auth/revoke-session", {
                      session_id: session.id,
                    });
                    S((values) =>
                      values.filter((value) => value.id !== session.id),
                    );
                  })
                }
              >
                退出此登录
              </button>
            )}
          </div>
        ))}
      </details>
    </section>
  );
}
