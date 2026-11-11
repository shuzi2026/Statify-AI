import { getCnAccount, subscribeCnAccount } from "./cn-account";
import { cnAccountBackend } from "./deployment";
import { storedThemeChoice, subscribeThemeChoice } from "../themes/runtime";
import { paymentRequest } from "./transport";

/** Metadata only. Never uploads the character save or applies server appearance to it. */
export function startThemePreferenceSync() {
  if (!cnAccountBackend) return;
  let disposed = false,
    running = false,
    again = false;
  let controller: AbortController | undefined,
    sendingAccount: string | undefined;
  const flush = async () => {
    if (disposed) return;
    if (running) {
      again = true;
      return;
    }
    const id = getCnAccount().account?.id,
      theme = storedThemeChoice();
    if (!id || !theme || getCnAccount().sessionExpired) return;
    const key = "statify-theme-synced:" + id;
    try {
      if (localStorage.getItem(key) === theme) return;
    } catch {}
    running = true;
    controller = new AbortController();
    const signal = controller.signal;
    sendingAccount = id;
    again = false;
    try {
      const response = await paymentRequest(
        "/preferences",
        {
          theme_id: theme,
          expected_account_id: id,
        },
        { signal },
      );
      const data = response.data as {
        account_id?: string;
        preference?: { theme_id?: string };
      };
      if (
        !disposed &&
        !signal.aborted &&
        response.status === 200 &&
        data.account_id === id &&
        data.preference?.theme_id === theme &&
        getCnAccount().account?.id === id &&
        storedThemeChoice() === theme
      ) {
        try {
          localStorage.setItem(key, theme);
        } catch {}
      }
    } catch {
      /* The real device choice stays durable and is retried at the next event. */
    } finally {
      running = false;
      sendingAccount = undefined;
      if (again && !disposed) void flush();
    }
  };
  const run = () => {
      void flush();
    },
    account = subscribeCnAccount(() => {
      if (sendingAccount !== getCnAccount().account?.id) controller?.abort();
      run();
    }),
    choice = subscribeThemeChoice(() => {
      const id = getCnAccount().account?.id;
      if (id) {
        try {
          localStorage.removeItem("statify-theme-synced:" + id);
        } catch {}
      }
      run();
    });
  window.addEventListener("online", run);
  run();
  return () => {
    disposed = true;
    controller?.abort();
    account();
    choice();
    window.removeEventListener("online", run);
  };
}
