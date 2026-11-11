import { useSyncExternalStore } from "react";
import { memberActive, memberFeaturesActive, subscribeAccess } from "./access";
/** UI state follows verified runtime access; action handlers still recheck at commit time. */
export const useMemberAccess = () =>
  useSyncExternalStore(subscribeAccess, memberActive, () => false);
export const useMemberFeatures = () =>
  useSyncExternalStore(subscribeAccess, memberFeaturesActive, () => false);
