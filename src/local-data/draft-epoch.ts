// Durable replacement identity lives in preferences and is committed with the
// character replacement. It never travels with a character backup/cloud copy.
export const draftEpochKey = "character-draft-epoch";
const remotePrefix = "remote-cloud:";
export const newDraftEpoch = (fromOtherDevice = false) =>
  (fromOtherDevice ? remotePrefix : "") + crypto.randomUUID();
export const isRemoteDraftEpoch = (value: string | null) =>
  value?.startsWith(remotePrefix) === true;
let epoch: string | null = null;
export const currentDraftEpoch = () => epoch;
export function acceptDraftEpoch(value: unknown) {
  if (value !== undefined && value !== null && typeof value !== "string")
    throw Error("草稿作用域无法读取，请先保留原数据");
  epoch = value ?? null;
}
