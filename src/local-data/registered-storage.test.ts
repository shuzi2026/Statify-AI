import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cardDraftSlot,
  profileDraftSlot,
  planChoiceSlot,
  themeChoiceSlot,
  themePreviewSlot,
  clearCharacterDraftsForTesting,
  isThemeChoiceEventKey,
} from "./registered-storage";

function storage(values = new Map<string, string>(), prefix = ""): Storage {
  const keys = () => [...values.keys()].filter((k) => k.startsWith(prefix));
  return {
    get length() {
      return keys().length;
    },
    key: (i) => keys()[i]?.slice(prefix.length) ?? null,
    getItem: (k) => values.get(prefix + k) ?? null,
    setItem: (k, v) => {
      values.set(prefix + k, v);
    },
    removeItem: (k) => {
      values.delete(prefix + k);
    },
    clear: () => {
      throw Error("Whole-store deletion is forbidden");
    },
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("retains legacy draft lifetimes and scoped plan identities without mixing local and session storage", () => {
  profileDraftSlot(123).write("profile");
  cardDraftSlot(123).write("card");
  planChoiceSlot({ region: "cn", createdAt: 123 }).write("cn");
  planChoiceSlot({ region: "global", createdAt: 123 }).write("global");
  expect(localStorage.getItem("life-rpg-profile-draft:123")).toBe("profile");
  expect(sessionStorage.getItem("life-rpg-card-draft:123")).toBe("card");
  expect(profileDraftSlot(124).read().status).toBe("missing");
  expect(planChoiceSlot({ region: "cn", createdAt: 123 }).read().value).toBe(
    "cn",
  );
  // Closing a tab creates another session store, without deleting local drafts.
  vi.stubGlobal("sessionStorage", storage());
  expect(cardDraftSlot(123).read().status).toBe("missing");
  expect(profileDraftSlot(123).read().value).toBe("profile");
});

it("reset enumerates only the supplied PWA namespace and the two original draft families", () => {
  const local = new Map([
      ["cn:life-rpg-profile-draft:1", "keep-other-region"],
      ["life-rpg-profile-draft:1", "keep-root"],
    ]),
    session = new Map([["cn:life-rpg-card-draft:1", "keep-other-region"]]);
  vi.stubGlobal("localStorage", storage(local, "global:"));
  vi.stubGlobal("sessionStorage", storage(session, "global:"));
  profileDraftSlot(1).write("discard");
  profileDraftSlot(2).write("discard");
  cardDraftSlot(1).write("discard");
  themeChoiceSlot.write("raven-wizard");
  themePreviewSlot.write("night-sprout");
  localStorage.setItem("signed-account", "keep");
  localStorage.setItem("statify-late-plan-choice:global:1", "keep-choice");
  expect(clearCharacterDraftsForTesting()).toBe("removed");
  expect(profileDraftSlot(1).read().status).toBe("missing");
  expect(profileDraftSlot(2).read().status).toBe("missing");
  expect(cardDraftSlot(1).read().status).toBe("missing");
  expect(local.get("cn:life-rpg-profile-draft:1")).toBe("keep-other-region");
  expect(local.get("life-rpg-profile-draft:1")).toBe("keep-root");
  expect(session.get("cn:life-rpg-card-draft:1")).toBe("keep-other-region");
  expect(themeChoiceSlot.read().value).toBe("raven-wizard");
  expect(themePreviewSlot.read().value).toBe("night-sprout");
  expect(localStorage.getItem("signed-account")).toBe("keep");
  expect(localStorage.getItem("statify-late-plan-choice:global:1")).toBe(
    "keep-choice",
  );
});

it("unavailable storage stays distinguishable, retries on recovery, and reset preserves stop-on-error order", () => {
  const entry = profileDraftSlot(3);
  entry.write("keep-on-failure");
  cardDraftSlot(3).write("not-attempted");
  const deny = () => {
    throw new DOMException("Synthetic denial", "SecurityError");
  };
  vi.spyOn(localStorage, "getItem").mockImplementation(deny);
  vi.spyOn(localStorage, "setItem").mockImplementation(deny);
  vi.spyOn(localStorage, "removeItem").mockImplementation(deny);
  expect(entry.read().status).toBe("unavailable");
  expect(entry.write("new")).toBe("unavailable");
  expect(clearCharacterDraftsForTesting()).toBe("unavailable");
  expect(cardDraftSlot(3).read().value).toBe("not-attempted");
  vi.restoreAllMocks();
  expect(entry.read().value).toBe("keep-on-failure");
  expect(clearCharacterDraftsForTesting()).toBe("removed");
  vi.stubGlobal("localStorage", undefined);
  expect(themeChoiceSlot.read().status).toBe("unavailable");
  expect(themeChoiceSlot.write("raven-wizard")).toBe("unavailable");
});

it("native theme events match only the current deployment prefix and ignore clear or another region", () => {
  vi.stubEnv("VITE_STATIFY_STORAGE_PREFIX", "");
  expect(isThemeChoiceEventKey("statify-ui-theme")).toBe(true);
  vi.stubEnv("VITE_STATIFY_STORAGE_PREFIX", "global:");
  expect(isThemeChoiceEventKey("global:statify-ui-theme")).toBe(true);
  for (const key of [
    null,
    "statify-ui-theme",
    "cn:statify-ui-theme",
    "global:statify-preview-theme",
  ])
    expect(isThemeChoiceEventKey(key)).toBe(false);
});
