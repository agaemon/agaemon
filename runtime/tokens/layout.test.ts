import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = ["swap.ts", "swap.test.ts", "transfer.ts", "transfer.test.ts"];

const scopedCliFiles = ["swap.ts", "swapSafetyCheck.ts", "transfer.ts", "transferSafetyCheck.ts"];

const oldRuntimeFiles = ["swap.ts", "swap.test.ts", "erc20Transfer.ts", "erc20Transfer.test.ts"];

const oldCliFiles = ["baseSwap.ts", "baseSwapSafetyCheck.ts", "baseTokenTransfer.ts", "baseTokenSafetyCheck.ts"];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/tokens", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("token runtime file layout", () => {
  it("keeps swap and token transfer files in scoped directories with short filenames", async () => {
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
