import { installRuntimeCompatibility } from "./runtime-compat";
import { installLegacyStyles } from "./legacy-styles";
import {
  initializeRuntimeDiagnostics,
  recordRuntimeIssue,
} from "./runtime-diagnostics";
const disposeDiagnostics = initializeRuntimeDiagnostics();
let disposed = false;
if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  disposeDiagnostics();
});
// Keep the main bundle out of engines missing essential storage or cryptography.
if (!(window as Window & { statifyUnsupported?: boolean }).statifyUnsupported) {
  try {
    installRuntimeCompatibility();
    installLegacyStyles();
    import("./main").catch((error) => {
      if (disposed) return;
      recordRuntimeIssue("startup", error);
      (
        window as Window & { statifyLaunchFailed?: (reason?: unknown) => void }
      ).statifyLaunchFailed?.(error);
    });
  } catch (error) {
    recordRuntimeIssue("initialization", error);
    (
      window as Window & { statifyLaunchFailed?: (reason?: unknown) => void }
    ).statifyLaunchFailed?.(error);
  }
}
