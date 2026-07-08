import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = ["policyDecisions.ts", "policyDecisions.test.ts", "layout.test.ts"];
const oldRuntimeFiles = ["policyDecisionFixtures.ts", "policyDecisionFixtures.test.ts"];

const scopedPaths = scopedRuntimeFiles.map((file) => resolve(moduleDir, file));
const oldFlatPaths = oldRuntimeFiles.map((file) => resolve(runtimeRoot, file));

describe("runtime fixture file layout", () => {
  it("keeps policy decision fixtures in the scoped fixtures directory", async () => {
    await expect(Promise.all(scopedPaths.map(pathExists))).resolves.toEqual(scopedPaths.map(() => true));
    await expect(Promise.all(oldFlatPaths.map(pathExists))).resolves.toEqual(oldFlatPaths.map(() => false));
  });
});

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
