import { it, expect } from "vitest";
import {
  cnAccountBackend,
  paymentEnvironment,
  paymentRegion,
} from "./deployment";
it("standard domestic build selects the sandbox PostgreSQL email account service", () => {
  expect(paymentRegion).toBe("cn");
  expect(paymentEnvironment).toBe("sandbox");
  expect(cnAccountBackend).toBe(true);
});
