import { KeyRound, LogIn, Sparkles } from "lucide-react";
import { MembershipStatus } from "./MembershipStatus";
import { useCnAccount } from "./cn-account";
import { memberActive, accountTrialActive } from "./access";
import { MembershipSummary } from "./MembershipSummary";

export type CnMemberTarget = "account" | "trial" | "code" | "purchase";
export function CnMembershipSummary({
  open,
}: {
  open: (target: CnMemberTarget) => void;
}) {
  const p = useCnAccount(),
    status = memberActive()
      ? p.license?.v === 2
        ? "月度会员"
        : "永久会员"
      : accountTrialActive()
        ? "7天试用中"
        : "免费使用";
  return (
    <MembershipSummary
      title="账号与会员"
      subtitle={
        <>
          {p.account && (
            <span className="membership-account-line">{p.account.email}</span>
          )}
          <MembershipStatus
            label={status}
            region="cn"
            founder={memberActive() && !!(p.founder || p.collector)}
          />
        </>
      }
    >
      <button onClick={() => open("account")}>
        <LogIn size={18} />
        {p.account ? "我的账号" : "登录与会员"}
      </button>
      {!memberActive() && (
        <button onClick={() => open("trial")}>
          <Sparkles size={18} />
          试用会员
        </button>
      )}
      <button onClick={() => open("purchase")}>
        <KeyRound size={18} />
        {memberActive() && p.license?.v !== 2 ? "购买记录" : "购买永久会员"}
      </button>
      {!memberActive() && (
        <button onClick={() => open("code")}>
          <KeyRound size={18} />
          兑换激活码
        </button>
      )}
    </MembershipSummary>
  );
}
