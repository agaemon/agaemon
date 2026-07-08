import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "rule.ts",
  "rule.test.ts",
  "coordination.ts",
  "coordination.test.ts",
  "receipt.ts",
  "receipt.test.ts",
];

const scopedCliFiles = ["payout.ts", "safetyCheck.ts"];

const oldRuntimeFiles = [
  "payoutRule.ts",
  "payoutRule.test.ts",
  "coordinationPayout.ts",
  "coordinationPayout.test.ts",
  "coordinationPayoutReceipt.ts",
  "coordinationPayoutReceipt.test.ts",
];

const oldCliFiles = ["basePayout.ts", "basePayoutSafetyCheck.ts"];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/payouts", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("payout runtime file layout", () => {
  it("keeps payout files in scoped directories with short filenames", async () => {
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
