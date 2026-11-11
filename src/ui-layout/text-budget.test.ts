import { describe, it, expect } from "vitest";
import { attributeCaption, graphemes } from "./text-budget";
import {
  importRegistrations,
  exportRegistrations,
  setRegistration,
  registrationFor,
  defaultRegistration,
} from "../themes/registration";
describe("approved panel contracts", () => {
  it("retains four Han glyphs and switches to two at level 100 without mutating names", () => {
    expect(attributeCaption("逻辑思考", 99)).toBe("逻辑思考");
    expect(attributeCaption("逻辑思考力", 99)).toBe("逻辑思…");
    expect(attributeCaption("逻辑思考", 100)).toBe("逻辑…");
    expect(attributeCaption("专注", 100)).toBe("专注");
    expect(attributeCaption("Cognition", 100)).toBe("Cognition");
  });
  it("does not split joined emoji or combining marks", () => {
    expect(graphemes("👩‍💻é认")).toEqual(["👩‍💻", "é", "认"]);
  });
  it("imports artwork config atomically and leaves prior config on invalid input", () => {
    importRegistrations('{"schema":1,"themes":{}}');
    setRegistration("raven-wizard", "companion", {
      ...defaultRegistration,
      scale: 1.1,
    });
    const saved = exportRegistrations();
    expect(() =>
      importRegistrations(
        '{"schema":1,"themes":{"raven-wizard":{"companion":{"scale":99}}}}',
      ),
    ).toThrow();
    expect(exportRegistrations()).toBe(saved);
    expect(registrationFor("raven-wizard", "companion").scale).toBe(1.1);
  });
});
