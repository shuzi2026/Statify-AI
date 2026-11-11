/** Runtime authorization snapshot, supplied by callers; never read from a save. */
export type RuleContext = Readonly<{
  now: number;
  member: boolean;
  trial: boolean;
}>;
