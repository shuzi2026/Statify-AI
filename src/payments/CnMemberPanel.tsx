import { useEffect, useState } from "react";
import { MembershipStatus } from "./MembershipStatus";
import { Field } from "../components";
import { type State } from "../model";
import { memberActive, accountTrialActive } from "./access";
import {
  useCnAccount,
  cnAction,
  refreshCnAccount,
  logoutCnAccount,
} from "./cn-account";
import "./payments.css";
import { AccountSecurityPanel } from "./AccountSecurityPanel";
import { accountNickname } from "./character-nickname";
import { emailValidationMessage, validAccountEmail } from "./email-validation";
import type { CnMemberTarget } from "./CnMembershipSummary";
import { AlipayPurchase } from "./AlipayPurchase";
import { LaunchPricing } from "./LaunchPricing";
import { nativeAlipay } from "./alipay-native";
import { hasAndroidBridge } from "../platform/native";
type Run = (
  fn: (s: State) => unknown,
  onError?: (message: string) => void,
) => Promise<boolean>;
export function CnMemberPanel({
  s,
  target = "account",
  openAccount,
}: {
  s: State;
  run: Run;
  target?: CnMemberTarget;
  openAccount?: () => void;
}) {
  const p = useCnAccount(),
    [mode, Mode] = useState<"login" | "register">("login"),
    [email, Email] = useState(""),
    [password, Password] = useState(""),
    [confirmation, Confirmation] = useState(""),
    [code, Code] = useState(""),
    [form, Form] = useState(false),
    [busy, Busy] = useState(false),
    [error, ErrorText] = useState(""),
    [message, Message] = useState("");
  const [rename, Rename] = useState(false);
  useEffect(() => {
    ErrorText("");
    Message("");
    Rename(false);
  }, [target, p.account?.id]);
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    Busy(true);
    ErrorText("");
    Message("");
    try {
      await fn();
    } catch (e) {
      ErrorText((e as Error).message);
    } finally {
      Busy(false);
    }
  }
  const member = memberActive(),
    trial = accountTrialActive(),
    monthly = p.license?.v === 2,
    permanent = member && !monthly,
    memberLabel = monthly ? "月度会员" : "永久会员";
  return (
    <section
      className="membership cn-account-panel"
      aria-label="国区账号与会员"
      aria-busy={busy}
    >
      <header className="membership-heading">
        <h2>
          {target === "trial"
            ? "试用会员"
            : target === "code"
              ? "会员激活"
              : target === "purchase"
                ? permanent
                  ? "购买记录"
                  : "购买永久会员"
                : p.account
                  ? "我的会员与账号"
                  : "登录与会员"}
        </h2>
      </header>
      {((target === "account" && (p.account || member || trial)) ||
        (target === "trial" && trial)) && (
        <div className="cn-member-identity" role="status">
          <h3>
            <MembershipStatus
              region="cn"
              founder={permanent && !!(p.founder || p.collector)}
              label={member ? memberLabel : trial ? "7天试用中" : "免费使用"}
            />
          </h3>
          {member && (p.founder || p.collector) && (
            <small>
              获得于{" "}
              {new Date(
                (p.founder || p.collector)!.issued_at,
              ).toLocaleDateString("zh-CN")}
            </small>
          )}
          {member && monthly && p.license?.v === 2 && (
            <small>
              会员截止：
              {new Date(p.license.membership_ends_at).toLocaleString()}
            </small>
          )}
          {p.offline && <small>离线显示最近验证的会员身份</small>}
        </div>
      )}
      {target === "trial" && !member && !trial && (
        <p className="help">试用需主动开启，共7天，离线时间也计入试用。</p>
      )}
      {target !== "account" &&
        (p.account && !p.sessionExpired ? (
          <p className="test-account">{p.account.email}</p>
        ) : (
          <>
            <p className="help">请先登录账号。</p>
            <button onClick={openAccount}>前往登录</button>
          </>
        ))}
      {p.error && (
        <div>
          <p role="status">{p.error}</p>
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await refreshCnAccount();
              })
            }
          >
            重试连接
          </button>
        </div>
      )}
      {error && (
        <p className="membership-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {target === "account" && p.account && p.sessionExpired && (
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await logoutCnAccount();
              Mode("login");
              Form(false);
              Message("已退出账号，本地角色和成长记录保留。");
            })
          }
        >
          退出账号
        </button>
      )}
      {target === "account" &&
        (!p.account || p.sessionExpired || form ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                if (!validAccountEmail(email))
                  throw Error(emailValidationMessage);
                if (!/^[A-Za-z0-9]{6,18}$/.test(password))
                  throw Error("密码请填写6–18位英文字母或数字，不区分大小写。");
                if (
                  mode === "register" &&
                  password.toLowerCase() !== confirmation.toLowerCase()
                )
                  throw Error("两次填写的密码不一致。");
                await cnAction("/auth/" + mode, {
                  email: email.trim(),
                  password,
                });
                Password("");
                Confirmation("");
                Form(false);
                Message("");
              });
            }}
          >
            <div className="button-row" role="group" aria-label="邮箱账号操作">
              <button
                type="button"
                aria-pressed={mode === "login"}
                disabled={busy}
                onClick={() => Mode("login")}
              >
                邮箱登录
              </button>
              <button
                type="button"
                aria-pressed={mode === "register"}
                disabled={busy}
                onClick={() => Mode("register")}
              >
                邮箱注册
              </button>
            </div>
            <div className="membership-fields">
              <Field label="邮箱">
                <input
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  maxLength={254}
                  required
                  value={email}
                  aria-invalid={error === emailValidationMessage}
                  onInvalid={(e) => {
                    e.preventDefault();
                    ErrorText(emailValidationMessage);
                  }}
                  onChange={(e) => {
                    Email(e.target.value);
                    ErrorText("");
                  }}
                  disabled={busy}
                />
              </Field>
              <Field label="密码">
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={6}
                  maxLength={18}
                  pattern="[A-Za-z0-9]{6,18}"
                  required
                  value={password}
                  onChange={(e) => Password(e.target.value)}
                  disabled={busy}
                />
              </Field>
              {mode === "register" && (
                <Field label="确认密码">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    maxLength={18}
                    pattern="[A-Za-z0-9]{6,18}"
                    required
                    value={confirmation}
                    onChange={(e) => Confirmation(e.target.value)}
                    disabled={busy}
                  />
                </Field>
              )}
            </div>
            <button className="primary" disabled={busy}>
              {busy
                ? "处理中…"
                : mode === "register"
                  ? "注册邮箱账号"
                  : "登录并恢复会员"}
            </button>
            {p.account && (
              <button type="button" disabled={busy} onClick={() => Form(false)}>
                返回账号
              </button>
            )}
            <p className="help">
              密码为6–18位英文字母或数字，不区分大小写。本内测版尚未接入邮箱验证及自助找回，请使用自己的邮箱。
            </p>
          </form>
        ) : (
          <>
            <dl className="cn-account-facts">
              <div>
                <dt>登录邮箱</dt>
                <dd>{p.account.email}</dd>
              </div>
              <div>
                <dt>账号昵称</dt>
                <dd>{p.account.character_nickname || "尚未绑定"}</dd>
              </div>
              <div>
                <dt>本机昵称</dt>
                <dd>{s.profile.name}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await refreshCnAccount();
                  })
                }
              >
                刷新会员状态
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  Email(p.account!.email);
                  Mode("login");
                  Form(true);
                }}
              >
                重新登录
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await logoutCnAccount();
                    Mode("login");
                    Form(false);
                    Message("已退出账号，本地角色和成长记录保留。");
                  })
                }
              >
                退出账号
              </button>
            </div>
            <div className="cn-character-actions">
              {!p.account.character_id ? (
                <>
                  <p className="help">将绑定当前本机昵称：{s.profile.name}</p>
                  <button
                    disabled={busy || !s.profile.onboarded}
                    onClick={() =>
                      void perform(async () => {
                        await cnAction("/characters/current", {
                          nickname: accountNickname(s.profile.name),
                          character_id: null,
                        });
                        Message("已绑定当前角色身份，本地成长记录保留。");
                      })
                    }
                  >
                    绑定当前角色昵称
                  </button>
                </>
              ) : (
                <>
                  {p.account.character_nickname !== s.profile.name.trim() && (
                    <div className="cn-nickname-update">
                      <button
                        disabled={busy || p.offline}
                        onClick={() => Rename(true)}
                      >
                        将账号昵称更新为当前人物昵称
                      </button>
                      {rename && (
                        <div role="group" aria-label="确认更新账号昵称">
                          <p>
                            将“{p.account.character_nickname}”更新为“
                            {s.profile.name.trim()}
                            ”。只修改账号昵称，角色身份、会员和本机存档保留。
                          </p>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void perform(async () => {
                                await cnAction("/characters/nickname", {
                                  nickname: accountNickname(s.profile.name),
                                  expected_account_id: p.account!.id,
                                  character_id: p.account!.character_id,
                                  expected_nickname:
                                    p.account!.character_nickname,
                                });
                                Rename(false);
                                Message("账号昵称已更新，本机存档和会员保留。");
                              })
                            }
                          >
                            确认更新昵称
                          </button>
                          <button disabled={busy} onClick={() => Rename(false)}>
                            取消
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ))}
      {target === "trial" &&
        p.account &&
        !p.sessionExpired &&
        (member ? (
          <p>当前会员无需开启试用。</p>
        ) : (
          <section id="cn-trial" className="membership-block">
            <button
              disabled={busy || !p.entitlement?.trial_available}
              onClick={() =>
                void perform(async () => {
                  await cnAction("/trial", {});
                  Message("已开启7天试用，离线时间也计入试用。");
                })
              }
            >
              {trial
                ? "7天试用中"
                : p.entitlement?.trial_available
                  ? "开启7天试用"
                  : "试用机会已使用"}
            </button>
            {p.entitlement?.trial_ends_at && (
              <p className="help">
                试用截止：
                {new Date(p.entitlement.trial_ends_at).toLocaleString()}
              </p>
            )}
          </section>
        ))}
      {target === "purchase" &&
        p.account &&
        !p.sessionExpired &&
        p.config?.alipay_environment &&
        p.config.alipay_channels?.includes(
          hasAndroidBridge() ? "app" : "web",
        ) &&
        p.config.alipay_offer && (
          <AlipayPurchase
            key={p.account.id}
            accountId={p.account.id}
            offer={p.config.alipay_offer}
            environment={p.config.alipay_environment}
            member={permanent}
            showHeading={false}
            request={cnAction}
            refresh={refreshCnAccount}
            nativePayment={hasAndroidBridge() ? nativeAlipay : undefined}
          />
        )}
      {target === "purchase" &&
        p.account &&
        !p.config?.alipay_channels?.includes(
          hasAndroidBridge() ? "app" : "web",
        ) && (
          <p className="help">
            当前平台尚未开放支付宝购买，请使用国区 Android
            应用。已有会员可刷新账号状态。
          </p>
        )}
      {target === "purchase" && !permanent && <LaunchPricing region="cn" />}
      {target === "code" &&
        p.account &&
        !p.sessionExpired &&
        (member ? (
          <p>当前会员仍有效，无需再次兑换激活码。</p>
        ) : (
          <form
            id="cn-code"
            className="membership-block"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await cnAction("/codes/redeem", { code });
                Code("");
                Message("会员已激活，期限以上方会员状态为准。");
              });
            }}
          >
            <Field label="激活码">
              <input
                required
                autoComplete="off"
                spellCheck={false}
                maxLength={100}
                value={code}
                onChange={(e) => Code(e.target.value)}
                disabled={busy}
              />
            </Field>
            <button className="primary" disabled={busy || !code.trim()}>
              兑换并绑定当前账号
            </button>
            <p className="help">
              未兑换的码可以转赠；兑换后归领取账号，不能重复领取。
            </p>
          </form>
        ))}
      {target === "account" &&
        p.account &&
        !form &&
        !p.sessionExpired &&
        p.config?.account_security_enabled && (
          <AccountSecurityPanel
            key={p.account.id}
            done={() => Message("密码已修改，请重新登录。")}
          />
        )}
    </section>
  );
}
