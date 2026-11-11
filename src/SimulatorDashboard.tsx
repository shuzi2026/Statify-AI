import type { State } from "./model";
import { DesktopAttributes } from "./home/HomeAttributes";
import { DesktopIdentity } from "./home/HomeStatus";
export function SimulatorDashboard(p: {
  part: "identity" | "attributes";
  s: State;
  now: number;
  executionLevel: number;
  openStatus: () => void;
  openAttributes: () => void;
  openMeter: (id?: string) => void;
}) {
  if (p.part === "identity") return <DesktopIdentity {...p} />;
  return <DesktopAttributes {...p} />;
}
