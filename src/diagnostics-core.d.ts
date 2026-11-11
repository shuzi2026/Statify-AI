export type IssueKind =
  "error" | "async" | "startup" | "initialization" | "render" | "api";
export type IssueContext = {
  phase?: "startup" | "initialization" | "render" | "api" | "runtime";
  category?: string;
  requestId?: string;
  durationMs?: number;
  status?: number;
};
export type RuntimeIssue = IssueContext & {
  schema: 2;
  kind: IssueKind;
  message: string;
  category: string;
  stack: string;
  at: string;
  count: number;
  buildId: string;
  fingerprint: string;
};
export type DiagnosticStore = {
  snapshot(): RuntimeIssue[];
  safe(reason: unknown): {
    message: string;
    stack: string;
    category: string;
    fingerprint: string;
  };
  requestId(): string;
  subscribe(listener: () => void): () => void;
  record(kind: IssueKind, reason: unknown, context?: IssueContext): void;
};
export function createDiagnostics(options: {
  region: string;
  buildId: string;
  storage(): Pick<Storage, "getItem" | "setItem">;
}): DiagnosticStore;
