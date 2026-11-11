import { useSyncExternalStore } from "react";
import { createCloudSync } from "./sync";
import { platformCapabilities } from "../platform/runtime";
import { application } from "../application/runtime";
import { sharedService } from "../application/lifecycle";
import type { State } from "../model";
import {
  getGlobalAccount,
  subscribeGlobalAccount,
  globalAction,
} from "../payments/global-account";

const controller = createCloudSync({
  enabled: platformCapabilities().cloud,
  getAccount: getGlobalAccount,
  subscribeAccount: subscribeGlobalAccount,
  request: globalAction,
});
export const useCloudSync = () =>
  useSyncExternalStore(controller.subscribe, controller.getSnapshot);
export function useRemoteTimerId(state: State | null) {
  const ids = useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().remoteTimerIds,
  );
  return state?.actions.find((action) => ids.includes(action.id))?.id;
}
export const { setCloudMode, syncNow, dismissCloudConflict } = controller;
export const startCloudSync = sharedService(() => {
  if (!platformCapabilities().cloud) return;
  const release = application.coordinateCommands(controller.coordinateCommand);
  const stop = controller.startCloudSync();
  return () => {
    release();
    stop();
  };
});
