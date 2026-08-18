import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
// HARD TEST ISOLATION (#230): every test file starts with the durable store
// DISABLED and aborts if a DATABASE_URL (real Neon) is present. Tests must
// never write the real credential store — see src/test/test-isolation.ts.
import { enforceTestDurableIsolation } from "./test-isolation";
enforceTestDurableIsolation();
// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});
