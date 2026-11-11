import type { State } from "../model";
export type SettingsProps = {
  s: State;
  run: (fn: (s: State) => unknown) => Promise<boolean>;
  notify: (m: string) => void;
  error: (m: string) => void;
  openInitial: () => void;
  openGuide: () => void;
  openReset: () => void;
};

export type SettingsPanel =
  | "motion"
  | "mode"
  | "backups"
  | "payment"
  | "developer"
  | "early"
  | "theme"
  | "archive"
  | "ui"
  | "rewards"
  | "vote"
  | "developer-pin"
  | "bug-feedback"
  | null;
