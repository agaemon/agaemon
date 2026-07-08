import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = ["action.ts", "action.test.ts", "policy.ts", "policy.test.ts"];
const oldRuntimeFiles = ["action.ts", "policySimulator.ts"];

const scopedPaths = scopedRuntimeFiles.map((file) => resolve(moduleDir, file));
const oldFlatPaths = oldRuntimeFiles.map((file) => resolve(runtimeRoot, file));

describe("runtime core file layout", () => {
  it("keeps shared action and policy primitives in the scoped core directory", async () => {
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
