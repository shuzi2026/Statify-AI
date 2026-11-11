import { useEffect, useRef, useState } from "react";
import { Dialog } from "./components";
import { getCnAccount, useCnAccount } from "./payments/cn-account";
import { getGlobalAccount, useGlobalAccount } from "./payments/global-account";
import { cnAccountBackend, globalAppBackend } from "./payments/deployment";
import { localize } from "./i18n/runtime";
import {
  featurePoll,
  requestFeatureVote,
  VoteError,
  type FeatureVote,
} from "./payments/feature-votes";
import "./feature-votes.css";

export function FeatureVotePanel({
  close,
  login,
}: {
  close: () => void;
  login: () => void;
}) {
  const cn = useCnAccount(),
    global = useGlobalAccount(),
    id = globalAppBackend
      ? global.account?.id
      : cnAccountBackend
        ? cn.account?.id
        : undefined;
  const options = featurePoll.options.filter(
    (option) => option.status !== "completed",
  );
  const [result, R] = useState<FeatureVote | null>(null),
    [phase, P] = useState<"loading" | "ready" | "saving" | "error">("loading"),
    [error, E] = useState(""),
    [loginRequired, L] = useState(false),
    [message, M] = useState(""),
    [retry, Retry] = useState(0);
  const epoch = useRef(0),
    pending = useRef(false),
    load = useRef<{ key: string; value: Promise<FeatureVote> } | null>(null);
  useEffect(() => {
    const token = ++epoch.current;
    R(null);
    E("");
    M("");
    L(false);
    if (!id) {
      P("ready");
      return;
    }
    const key = id + ":" + retry;
    if (load.current?.key !== key)
      load.current = { key, value: requestFeatureVote(id) };
    P("loading");
    void load.current.value
      .then((value) => {
        if (token === epoch.current) {
          R(value);
          P("ready");
        }
      })
      .catch((err) => {
        if (token === epoch.current) {
          E(
            err instanceof VoteError
              ? err.message
              : "投票服务暂未连接，请重试。",
          );
          L(err instanceof VoteError && err.loginRequired);
          P("error");
        }
      });
    return () => {
      epoch.current++;
    };
  }, [id, retry]);
  const current = result?.account_id === id ? result : null;
  async function save(choice: string) {
    if (!id || !current || pending.current) return;
    const active = !current.selections.includes(choice);
    pending.current = true;
    const token = epoch.current;
    P("saving");
    E("");
    M("");
    try {
      const value = await requestFeatureVote(id, choice, active);
      if (
        token === epoch.current &&
        (globalAppBackend ? getGlobalAccount() : getCnAccount()).account?.id ===
          id
      ) {
        R(value);
        M(active ? "已支持，可以继续支持其他功能。" : "已取消支持。");
        P("ready");
      }
    } catch (err) {
      if (token === epoch.current) {
        E(
          err instanceof VoteError
            ? err.message
            : "未确认投票结果，请重新连接核对。",
        );
        L(err instanceof VoteError && err.loginRequired);
        P("error");
      }
    } finally {
      pending.current = false;
    }
  }
  return (
    <Dialog
      title={localize(featurePoll.title)}
      className="feature-vote-dialog"
      close={close}
      dismissible={phase !== "saving"}
      focusTitle
    >
      <div className="feature-vote-body">
        <p className="feature-vote-intro">
          以下是预计准备完成的新功能。把你期待的功能往上顶，帮助开发者选择优先做什么。
        </p>
        <p className="help">
          可支持多个功能，不限项数。每项顶一次，再点即可取消。
        </p>
        {phase === "loading" && <p role="status">正在读取投票…</p>}
        <fieldset
          className="feature-vote-options"
          disabled={!current || phase !== "ready" || loginRequired}
        >
          <legend className="sr-only">支持你期待的功能</legend>
          {[...options]
            .sort(
              (a, b) =>
                (current?.options.find((item) => item.id === b.id)?.votes ||
                  0) -
                (current?.options.find((item) => item.id === a.id)?.votes || 0),
            )
            .map((option) => {
              const count = current?.options.find(
                (item) => item.id === option.id,
              )?.votes;
              const selected = current?.selections.includes(option.id) || false;
              return (
                <div
                  key={option.id}
                  className="feature-vote-option"
                  data-selected={selected || undefined}
                >
                  <span>
                    {localize(option.title)}
                    {"description" in option && (
                      <small className="feature-vote-description">
                        {localize(option.description!)}
                      </small>
                    )}
                  </span>
                  <button
                    type="button"
                    className="feature-upvote"
                    aria-label={"支持：" + localize(option.title)}
                    aria-pressed={selected}
                    onClick={() => void save(option.id)}
                  >
                    <span aria-hidden="true">▲</span>
                    <strong>{count ?? "—"}</strong>
                    <small>{selected ? "已支持" : "支持"}</small>
                  </button>
                </div>
              );
            })}
        </fieldset>
        {current && (
          <p className="feature-vote-total">
            支持总数：
            {current.options
              .filter((item) => options.some((option) => option.id === item.id))
              .reduce((sum, item) => sum + item.votes, 0)}
          </p>
        )}
        {error && (
          <p role="alert" className="feature-vote-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      <footer className="dialog-actions">
        <button type="button" disabled={phase === "saving"} onClick={close}>
          关闭
        </button>
        {!id || loginRequired ? (
          <button type="button" className="primary" onClick={login}>
            登录后投票
          </button>
        ) : phase === "error" ? (
          <button
            type="button"
            className="primary"
            onClick={() => {
              P("loading");
              Retry((n) => n + 1);
            }}
          >
            重新连接
          </button>
        ) : phase === "saving" ? (
          <span role="status">正在保存…</span>
        ) : null}
      </footer>
    </Dialog>
  );
}
