import { createElement } from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeCanvas, sampleData } from "./HomeCanvas";
import {
  defaults,
  referenceDefaults,
  abilityPositions,
  cardQuad,
  homography,
} from "../../public/whitebox/core.js";
import {
  freshDocument,
  reduceOperation,
  sharedCardKeys,
  // @ts-expect-error Shared browser/server reducer is plain JavaScript.
} from "../../public/whitebox/model.js";
describe("Shared homepage whitebox", () => {
  it("uses identical source and occupied rectangles for both card modes", () => {
    for (const key of sharedCardKeys)
      expect(referenceDefaults.cards.inner[key as keyof typeof defaults]).toBe(
        referenceDefaults.cards.orbit[key as keyof typeof defaults],
      );
    expect(referenceDefaults.cards.inner.cardShape).toBe("round");
  });
  it("stores each of eight edited defaults and reapplies every field", () => {
    let doc = freshDocument();
    for (const [group, items] of Object.entries(referenceDefaults))
      for (const [key, value] of Object.entries(items)) {
        const values = {
          ...value,
          ...(group === "cards"
            ? { cardDepth: 21 }
            : group === "top"
              ? { customY: 201 }
              : { buttonW: 91 }),
        };
        doc = reduceOperation(doc, {
          type: "saveDefault",
          theme: "peach",
          group,
          key,
          values,
        });
        doc = reduceOperation(doc, {
          type: "layout",
          theme: "peach",
          patch: doc.profiles.peach.defaults[group][key],
        });
        for (const [field, v] of Object.entries(values))
          expect(doc.profiles.peach.layout[field]).toBe(v);
      }
  });
  it("keeps theme edits independent while card dimensions share both saved modes", () => {
    let doc = freshDocument();
    doc = reduceOperation(doc, {
      type: "saveDefault",
      theme: "peach",
      group: "cards",
      key: "inner",
      values: { cardW: 150, cardH: 240 },
    });
    expect(doc.profiles.peach.defaults.cards.orbit.cardW).toBe(150);
    expect(doc.profiles.peach.defaults.cards.orbit.cardH).toBe(240);
    expect(doc.profiles["raven-wizard"].defaults.cards.inner.cardW).toBe(146);
  });
  it("merges independent editor operations without overwriting other fields", () => {
    let doc = freshDocument();
    doc = reduceOperation(doc, {
      type: "layout",
      theme: "peach",
      patch: { cardW: 150 },
    });
    doc = reduceOperation(doc, {
      type: "layout",
      theme: "peach",
      patch: { buttonW: 85 },
    });
    expect(doc.profiles.peach.layout.cardW).toBe(150);
    expect(doc.profiles.peach.layout.buttonW).toBe(85);
    expect(doc.revision).toBe(2);
  });
  it("preserves horizontal arc pills and six positions", () => {
    const s = { ...defaults, ...referenceDefaults.ability.arc };
    const positions = abilityPositions(s);
    expect(positions).toHaveLength(6);
    expect(positions.slice(0, 5).every((p) => p[2] > p[3])).toBe(true);
    expect(positions[5][1]).toBeGreaterThan(
      Math.max(...positions.slice(0, 5).map((p) => p[1] + p[3])),
    );
  });
  it("transforms every corner into its reference quadrilateral", () => {
    for (const cardMode of ["inner", "orbit"])
      for (const cardDepth of [0, 15, 28])
        for (const side of [-1, 0, 1]) {
          const s = { ...defaults, cardMode, cardDepth },
            q = cardQuad(s, side),
            m = homography(s.cardW, s.cardH, q)
              .slice(9, -1)
              .split(",")
              .map(Number);
          [
            [0, 0],
            [s.cardW, 0],
            [s.cardW, s.cardH],
            [0, s.cardH],
          ].forEach(([x, y], i) => {
            const z = m[3] * x + m[7] * y + m[15];
            expect((m[0] * x + m[4] * y + m[12]) / z).toBeCloseTo(q[i][0], 6);
            expect((m[1] * x + m[5] * y + m[13]) / z).toBeCloseTo(q[i][1], 6);
          });
        }
  });
  it("shows finite first and last cards, real values and no custom heading with data", () => {
    for (const active of [0, 2]) {
      const html = renderToStaticMarkup(
        createElement(HomeCanvas, {
          layout: defaults,
          data: sampleData,
          white: true,
          active,
        }),
      );
      expect(html.match(/class="card-slot /g) || []).toHaveLength(2);
      expect(html).not.toContain("自定义数值 ＋");
      expect(html).toContain("数值5");
      expect(html).toContain(
        active === 2 ? 'aria-label="下一张"' : 'aria-label="上一张"',
      );
    }
  });
});
