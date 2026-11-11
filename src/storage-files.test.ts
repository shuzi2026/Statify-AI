import { afterEach, expect, it, vi } from "vitest";
import {
  download,
  gzip,
  readImportFile,
  maxImportBytes,
} from "./storage-files";
const native = vi.hoisted(() => ({
  enabled: false,
  write: vi.fn(),
  share: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.enabled },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: native.write },
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: native.share } }));
afterEach(() => {
  native.enabled = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("identifies gzip by its header and preserves Unicode content", async () => {
  const raw = '{"内容":"旧存档🌱"}';
  expect(await readImportFile(new Blob([raw]), "save.json")).toBe(raw);
  expect(await readImportFile(await gzip(raw), "renamed.data")).toBe(raw);
});
it("rejects truncated gzip and files over the raw size limit", async () => {
  const good = await gzip("保存原件");
  await expect(readImportFile(good.slice(0, 12), "bad.gz")).rejects.toThrow();
  const file = new Blob(["x"]);
  Object.defineProperty(file, "size", { value: maxImportBytes + 1 });
  await expect(readImportFile(file)).rejects.toThrow(/64MB/);
});
it("keeps plain JSON available when compression support is missing", async () => {
  vi.stubGlobal("CompressionStream", undefined);
  vi.stubGlobal("DecompressionStream", undefined);
  await expect(gzip("{}")).rejects.toThrow(/完整备份/);
  expect(await readImportFile(new Blob(["{}"]))).toBe("{}");
  await expect(
    readImportFile(new Blob([new Uint8Array([31, 139])])),
  ).rejects.toThrow(/JSON/);
});
it("shares native text with explicit UTF8 and propagates cancellation", async () => {
  native.enabled = true;
  native.write.mockResolvedValue({ uri: "cache://save.json" });
  native.share.mockRejectedValueOnce(Error("cancelled"));
  await expect(download("旧档🌱", "save.json")).rejects.toThrow("cancelled");
  expect(native.write).toHaveBeenCalledWith({
    path: "save.json",
    data: "旧档🌱",
    directory: "CACHE",
    encoding: "utf8",
  });
  expect(native.share).toHaveBeenCalledWith(
    expect.objectContaining({ files: ["cache://save.json"] }),
  );
});
it("shares native binary data without corrupting bytes across chunk boundaries", async () => {
  native.enabled = true;
  native.write.mockResolvedValue({ uri: "cache://save.gz" });
  native.share.mockResolvedValue({});
  const bytes = Uint8Array.from({ length: 20000 }, (_, i) => i % 256);
  expect(await download(new Blob([bytes]), "save.gz")).toEqual({
    status: "handoff",
    method: "share",
  });
  const options = native.write.mock.calls[0][0];
  expect(options.encoding).toBeUndefined();
  expect(Uint8Array.from(atob(options.data), (c) => c.charCodeAt(0))).toEqual(
    bytes,
  );
});
it("releases a web download URL after dispatching a file download", async () => {
  vi.useFakeTimers();
  const anchor = { href: "", download: "", click: vi.fn() };
  vi.stubGlobal("document", { createElement: () => anchor });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  expect(await download("{}", "save.json")).toEqual({
    status: "handoff",
    method: "download",
  });
  expect(anchor.download).toBe("save.json");
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(revoke).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith("blob:test");
});
