import type { State, Action, Card, Meter } from "../model";
import type { useAppControls } from "./useAppControls";
import type { useAppSession } from "./useAppSession";
import type { useAppActions } from "./useAppActions";
import type { useWorkspaceNavigation } from "./useWorkspaceNavigation";
import type { useAppGuide } from "./useAppGuide";
export type Modal =
  | { kind: "finish" | "abandon"; id: string }
  | { kind: "card"; id?: string; shopping?: boolean; suggested?: { original: Card; changes: Partial<Card> } }
  | { kind: "meter"; id?: string; suggested?: { changes: Partial<Omit<Meter, "id">>; original?: Meter } }
  | { kind: "status"; suggested?: Parameters<typeof import("../engine").correctStatus>[1]; id?: never }
  | { kind: "initial"; suggested?: Record<string, number>; id?: never }
  | {
      kind:
        | "templates"
        | "attributes"
        | "guide"
        | "reset"
        | "messages";
      id?: never;
    };
export type Controls = ReturnType<typeof useAppControls>;
export type Session = ReturnType<typeof useAppSession>;
export type Actions = ReturnType<typeof useAppActions>;
export type Navigation = ReturnType<typeof useWorkspaceNavigation>;
export type Guide = ReturnType<typeof useAppGuide>;
import type { execution } from "../engine";
import type { planMessages, dailyPlanProgress } from "../planning";
export interface AppViewProps {
  activity: {
    reminders: ReturnType<typeof planMessages>;
    level: ReturnType<typeof execution>;
    dailyProgress: ReturnType<typeof dailyPlanProgress>;
    timer: Action | undefined;
    pending: Action[];
    activeFinish: Action | undefined;
    focusAction: Action | undefined;
  };
  s: State;
  mobile: boolean;
  payments: Session["payments"];
  controls: Controls;
  actions: Actions;
  navigation: Navigation;
  guide: Guide;
}
