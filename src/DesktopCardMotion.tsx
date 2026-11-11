import { CardMotionSwitch } from "./cards/CardMotionSwitch";

export function DesktopCardMotion({ plans = false }: { plans?: boolean }) {
  return (
    <div className={"desktop-card-motion" + (plans ? " is-plan" : "")}>
      <CardMotionSwitch preference="cardFloatingOverride" />
    </div>
  );
}
