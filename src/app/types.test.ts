import { expectTypeOf, test } from "vitest";
import type { Modal } from "./types";

test("root modal requests require action IDs and reject IDs on unrelated dialogs", () => {
  expectTypeOf<{ kind: "finish"; id: string }>().toMatchTypeOf<Modal>();
  expectTypeOf<{ kind: "abandon"; id: string }>().toMatchTypeOf<Modal>();
  expectTypeOf<{ kind: "card" }>().toMatchTypeOf<Modal>();
  expectTypeOf<{ kind: "meter"; id: string }>().toMatchTypeOf<Modal>();
  expectTypeOf<{ kind: "status" }>().toMatchTypeOf<Modal>();
  expectTypeOf<{ kind: "finish" }>().not.toMatchTypeOf<Modal>();
  expectTypeOf<{ kind: "abandon" }>().not.toMatchTypeOf<Modal>();
  expectTypeOf<{ kind: "status"; id: string }>().not.toMatchTypeOf<Modal>();
  expectTypeOf<{ kind: "unknown" }>().not.toMatchTypeOf<Modal>();
});
