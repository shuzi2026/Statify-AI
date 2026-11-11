import {
  applyCommand,
  CardConfirmation,
  Unchanged,
  type Command,
  type CommandValue,
} from "./commands";
import {
  PlanApplyRequired,
  readPlanApplyChoice,
  rememberPlanApplyChoice,
  withPlanApplyChoice,
  type PlanApplyChoice,
} from "../late-plan-edits";
import type { State } from "../model";
import { prepareSaveReplacement, captureReplacementGuard } from "./save-replacement";
import { ruleContext } from "../payments/access";
import type { RuleContext } from "../rules/context";
import { recordRuntimeIssue } from "../runtime-diagnostics";
import {
  assertSaveScope,
  saveSnapshot,
  SaveConflict,
  type SaveScope,
} from "../save-publication";
import {
  db,
  importSave,
  load,
  mutate,
  readRevision,
  refreshState,
  resetForTesting,
  synchronousResult,
} from "../storage";

export type Result<T> =
  | { status: "success"; value: T; committed: boolean }
  | { status: "cancelled" }
  | {
      status: "error";
      code: "conflict" | "save-failed";
      message: string;
      recoverable: true;
    }
  | {
      status: "confirmation";
      request:
        | { kind: "card"; message: string; title?: string }
        | { kind: "late-plan"; periods: PlanApplyRequired["periods"] };
      resume: (answer: boolean | PlanApplyChoice | null) => Promise<Result<T>>;
    };
type Decision = {
  revision: number;
  card?: boolean;
  plan?: PlanApplyChoice;
  at?: number;
};
export type CommandCoordinator = <C extends Command>(
  command: C,
  scope: SaveScope | undefined,
  execute: () => Promise<Result<CommandValue<C>>>,
) => Promise<Result<CommandValue<C>>>;

/** One queue per application instance. Confirmation/file/network waits stay outside
 * it; every resumed write rechecks its revision in the storage transaction. */
export function createApplication(
  context: () => RuleContext = () => ruleContext(Date.now()),
) {
  let tail: Promise<unknown> = Promise.resolve(),
    pending = 0;
  let coordinator: CommandCoordinator | undefined;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        recordRuntimeIssue("error", error);
      }
    }
  };
  function queue<T>(work: () => Promise<T>) {
    pending++;
    emit();
    const result = tail.then(work);
    tail = result
      .catch(() => {})
      .finally(() => {
        pending--;
        emit();
      });
    return result;
  }
  function change<T>(
    fn: (state: State, context: RuleContext, confirmed: boolean) => T,
    scope: SaveScope | undefined = saveSnapshot()?.scope,
    decision?: Decision,
  ): Promise<Result<T>> {
    return queue(async () => {
      const revision = decision?.revision ?? scope?.revision;
      try {
        assertSaveScope(scope);
        const result = await mutate(
          (st) => {
            const ctx = context();
            return withPlanApplyChoice(
              st,
              (s) => synchronousResult(fn(s, ctx, decision?.card === true)),
              ctx.now,
              decision?.plan ?? readPlanApplyChoice(st, ctx.now),
            );
          },
          { expectedRevision: revision, guard: () => assertSaveScope(scope) },
        );
        if (decision?.plan)
          rememberPlanApplyChoice(result.state, decision.plan, decision.at);
        return { status: "success", value: result.result, committed: true };
      } catch (error) {
        if (error instanceof Unchanged)
          return {
            status: "success",
            value: error.value as T,
            committed: false,
          };
        if (
          error instanceof CardConfirmation ||
          error instanceof PlanApplyRequired
        ) {
          let resumed: Promise<Result<T>> | undefined;
          const request =
            error instanceof CardConfirmation
              ? {
                  kind: "card" as const,
                  message: error.message,
                  ...(error.title ? { title: error.title } : {}),
                }
              : { kind: "late-plan" as const, periods: error.periods };
          return {
            status: "confirmation",
            request,
            resume: (answer) => {
              if (!resumed)
                resumed = !answer
                  ? Promise.resolve({ status: "cancelled" })
                  : change(fn, scope, {
                      ...decision,
                      revision: revision!,
                      ...(request.kind === "card"
                        ? { card: answer === true }
                        : {
                            plan: answer as PlanApplyChoice,
                            at: context().now,
                          }),
                    });
              return resumed;
            },
          };
        }
        if (error instanceof SaveConflict) {
          await refreshState().catch(() => {});
          error = new SaveConflict(scope);
        }
        return {
          status: "error",
          code: error instanceof SaveConflict ? "conflict" : "save-failed",
          message: error instanceof Error ? error.message : "保存失败，请重试",
          recoverable: true,
        };
      }
    });
  }
  return {
    change,
    async maintainCalendar() {
      const scope = saveSnapshot()?.scope;
      if (!scope) return;
      try {
        await queue(() => load(scope));
      } catch (error) {
        if (!(error instanceof SaveConflict)) throw error;
        await refreshState();
      }
    },
    async execute<C extends Command>(
      command: C,
      scope = saveSnapshot()?.scope,
    ): Promise<Result<CommandValue<C>>> {
      const input = structuredClone(command);
      const perform = () =>
        change(
          (state, ctx, confirmed) => applyCommand(state, input, ctx, confirmed),
          scope,
        );
      const coordinate = coordinator;
      if (!coordinate) return perform();
      // Network waits happen outside the IndexedDB transaction. Keep the UI
      // busy throughout preflight and let change recheck the captured scope.
      async function coordinated(
        work: typeof perform,
      ): Promise<Result<CommandValue<C>>> {
        pending++;
        emit();
        try {
          const result = await coordinate!(input, scope, work);
          if (result.status !== "confirmation") return result;
          let resumed: Promise<Result<CommandValue<C>>> | undefined;
          return {
            ...result,
            resume(answer) {
              return (resumed ??=
                answer === null
                  ? result.resume(null)
                  : coordinated(() => result.resume(answer)));
            },
          };
        } catch (error) {
          return {
            status: "error",
            code: error instanceof SaveConflict ? "conflict" : "save-failed",
            message:
              error instanceof Error ? error.message : "保存失败，请重试",
            recoverable: true,
          };
        } finally {
          pending--;
          emit();
        }
      }
      return coordinated(perform);
    },
    coordinateCommands(value: CommandCoordinator) {
      coordinator = value;
      return () => {
        if (coordinator === value) coordinator = undefined;
      };
    },
    async importSave(
      text: string,
      options: Parameters<typeof importSave>[1] & { discardInputsConfirmed?: boolean } = {},
    ) {
      // Capture before enqueueing so concurrent imports cannot silently overwrite.
      const expectedRevision =
        options.expectedRevision ?? (await readRevision());
      const approval = prepareSaveReplacement({ source: options.source || "import", revision: expectedRevision, confirmed: options.discardInputsConfirmed });
      if (approval) await approval;
      const inputsUnchanged = captureReplacementGuard();
      return queue(() => importSave(text, { ...options, expectedRevision, guard: () => { options.guard?.(); inputsUnchanged(); } }));
    },
    resetForTesting() {
      const scope = saveSnapshot()?.scope,
        expectedRevision = scope?.revision;
      return queue(() =>
        resetForTesting({
          expectedRevision,
          guard: () => assertSaveScope(scope),
        }),
      );
    },
    isBusy: () => pending > 0,
    subscribeBusy(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect() {
      let active = true;
      let refreshing = false,
        rerun = false;
      const refresh = () => {
        if (!active) return;
        if (refreshing) {
          rerun = true;
          return;
        }
        refreshing = true;
        void refreshState()
          .catch((error) => {
            if (active) recordRuntimeIssue("initialization", error);
          })
          .finally(() => {
            refreshing = false;
            if (rerun) {
              rerun = false;
              refresh();
            }
          });
      };
      let channel: BroadcastChannel | undefined;
      try {
        channel = new BroadcastChannel("life-rpg-refresh");
      } catch (error) {
        recordRuntimeIssue("initialization", error);
      }
      if (channel)
        channel.onmessage = (event) => {
          if (
            event.data === "changed" ||
            (event.data?.database === db.name &&
              event.data?.revision > (saveSnapshot()?.revision ?? 0))
          )
            refresh();
        };
      const visible = () => {
        if (document.visibilityState === "visible") refresh();
      };
      window.addEventListener("focus", refresh);
      window.addEventListener("pageshow", refresh);
      if (typeof document !== "undefined")
        document.addEventListener("visibilitychange", visible);
      return () => {
        active = false;
        channel?.close();
        window.removeEventListener("focus", refresh);
        window.removeEventListener("pageshow", refresh);
        if (typeof document !== "undefined")
          document.removeEventListener("visibilitychange", visible);
      };
    },
  };
}
export const application = createApplication();
