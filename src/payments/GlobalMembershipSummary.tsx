import { KeyRound, CreditCard, Cloud } from "lucide-react";
import { MembershipStatus } from "./MembershipStatus";
import { MembershipSummary } from "./MembershipSummary";
import { useGlobalAccount } from "./global-account";
export type GlobalMemberTarget = "paypal" | "code" | "account" | "cloud";
export function GlobalMembershipSummary({
  open,
}: {
  open: (target: GlobalMemberTarget) => void;
}) {
  const p = useGlobalAccount(),
    member = p.entitlement?.member,
    trial = (p.entitlement?.trial_ends_at || 0) > Date.now();
  return (
    <MembershipSummary
      title="Account & membership"
      subtitle={
        <>
          {p.account && (
            <span className="membership-account-line">
              {p.account.username}
            </span>
          )}
          <MembershipStatus
            region="global"
            founder={!!member && !!p.founder}
            label={
              member
                ? "Lifetime member"
                : trial
                  ? "Your trial is active"
                  : "Free access"
            }
          />
        </>
      }
    >
      <button onClick={() => open("paypal")}>
        <CreditCard size={18} />
        PayPal purchase
      </button>
      <button onClick={() => open("code")}>
        <KeyRound size={18} />
        Activation code
      </button>
      <button onClick={() => open("account")}>Account & trial</button>
      <button onClick={() => open("cloud")}>
        <Cloud size={18} />
        Cloud sync
      </button>
    </MembershipSummary>
  );
}
