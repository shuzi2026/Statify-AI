import { CnMemberPanel } from "../payments/CnMemberPanel";
import {
  CnMembershipSummary,
  type CnMemberTarget,
} from "../payments/CnMembershipSummary";
import { cnAccountBackend, globalAppBackend } from "../payments/deployment";
import { GlobalMemberPanel } from "../payments/GlobalMemberPanel";
import {
  GlobalMembershipSummary,
  type GlobalMemberTarget,
} from "../payments/GlobalMembershipSummary";
import { TestPaymentPage } from "../payments/TestPaymentPage";
import type { SettingsProps } from "./types";

export function SettingsMembershipSummary({
  openGlobal,
  openCn,
}: {
  openGlobal: (target: GlobalMemberTarget) => void;
  openCn: (target: CnMemberTarget) => void;
}) {
  return globalAppBackend ? (
    <GlobalMembershipSummary open={openGlobal} />
  ) : cnAccountBackend ? (
    <CnMembershipSummary open={openCn} />
  ) : null;
}
// Select the existing regional view; the views retain their own account adapters.
export function SettingsMembership({
  s,
  run,
  globalTarget,
  cnTarget,
  openCnAccount,
  back,
}: Pick<SettingsProps, "s" | "run"> & {
  globalTarget: GlobalMemberTarget;
  cnTarget: CnMemberTarget;
  openCnAccount: () => void;
  back: () => void;
}) {
  if (globalAppBackend)
    return <GlobalMemberPanel target={globalTarget} back={back} />;
  return cnAccountBackend ? (
    <div className="payment-test-page">
      <button className="text-button payment-back" onClick={back}>
        返回设置
      </button>
      <CnMemberPanel
        s={s}
        run={run}
        target={cnTarget}
        openAccount={openCnAccount}
      />
    </div>
  ) : (
    <TestPaymentPage back={back} />
  );
}
