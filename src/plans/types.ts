import type { Card, Plan, State } from "../model";
export type Run = (
  fn: (s: State) => unknown,
  onError?: (message: string) => void,
) => Promise<boolean>;
export type Selection = {
  scope: NonNullable<Plan["scope"]>;
  period: Plan["period"];
  anchor: string;
};

export type PlanWorkspaceProps = {
  s: State;
  now: number;
  plannedCards?: ReadonlyMap<string, unknown>;
  readOnlyDemo?: boolean;
  cardFilter: string;
  setCardFilter: (v: string) => void;
  run: Run;
  open: (c: Card, el: HTMLElement) => void;
  deleteCard: (id: string) => void;
  editCard: (id: string) => void;
  begin: (c: Card) => void;
};
export type PlanItem = {
  cardId: string;
  slot?: NonNullable<Plan["slots"]>[number];
};
