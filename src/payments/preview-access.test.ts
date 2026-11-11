import { afterEach, describe, it, expect, vi } from "vitest";
import { isGuestPreview, isLocalPreview, previewMemberActive } from "./preview-access";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function environment() {
  vi.stubEnv("DEV", true);
  const location = {
    hostname: "127.0.0.1",
    origin: "http://127.0.0.1:5173",
    pathname: "/index.html",
  };
  const parent = { location: { ...location, pathname: "/preview.html" } };
  vi.stubGlobal("location", location);
  vi.stubGlobal("window", { parent });
  vi.stubGlobal("sessionStorage", { getItem: () => null });
  return { location, parent };
}
describe("local membership preview boundary", () => {
  it("defaults on only in the local development preview frame", () => {
    environment();
    expect(previewMemberActive()).toBe(true);
    vi.stubGlobal("sessionStorage", { getItem: () => "account" });
    expect(previewMemberActive()).toBe(false);
  });
  it("cannot enable membership in production, remote hosts, unrelated parents or top-level app", () => {
    const e = environment();
    vi.stubEnv("DEV", false);
    expect(previewMemberActive()).toBe(false);
    vi.stubEnv("DEV", true);
    e.location.hostname = "example.com";
    expect(isLocalPreview()).toBe(false);
    e.location.hostname = "localhost";
    e.parent.location.pathname = "/other.html";
    expect(isLocalPreview()).toBe(false);
    e.parent.location.pathname = "/preview.html";
    e.parent.location.origin = "https://example.com";
    expect(isLocalPreview()).toBe(false);
    const top: any = {};
    top.parent = top;
    vi.stubGlobal("window", top);
    expect(isLocalPreview()).toBe(false);
  });
  it("opens local features for the hackathon entry and configured loopback AI previews", () => {
    const { location } = environment();
    const top: { parent?: unknown } = {};
    top.parent = top;
    vi.stubGlobal("window", top);
    vi.stubEnv("MODE", "ai-hackathon");
    expect(previewMemberActive()).toBe(true);
    location.hostname = "example.com";
    expect(previewMemberActive()).toBe(false);
    location.hostname = "127.0.0.1";
    vi.stubEnv("DEV", false);
    expect(previewMemberActive()).toBe(false);
    vi.stubEnv("DEV", true);
    vi.stubEnv("MODE", "ai-global");
    expect(previewMemberActive()).toBe(false);
    vi.stubEnv("STATIFY_LOCAL_AI_GUEST", "1");
    expect(isGuestPreview()).toBe(true);
    expect(previewMemberActive()).toBe(true);
    location.hostname = "example.com";
    expect(previewMemberActive()).toBe(false);
    location.hostname = "localhost";
    vi.stubEnv("DEV", false);
    expect(previewMemberActive()).toBe(false);
  });
  it("honors the workbench's explicit account mode even on a local AI preview", () => {
    const { parent } = environment();
    vi.stubEnv("STATIFY_LOCAL_AI_GUEST", "1");
    vi.stubGlobal("sessionStorage", { getItem: () => "account" });
    expect(isGuestPreview()).toBe(false);
    expect(previewMemberActive()).toBe(false);
    vi.stubGlobal("sessionStorage", { getItem: () => null });
    parent.location.pathname = "/other.html";
    expect(previewMemberActive()).toBe(false);
  });
});
