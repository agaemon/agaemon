import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));

const scopedRuntimeFiles = [
  "events.ts",
  "events.test.ts",
  "layout.test.ts",
  "replay.ts",
  "replay.test.ts",
  "verify.ts",
  "verify.test.ts",
];

describe("event indexer runtime file layout", () => {
  it("keeps LC3 event indexer files in the scoped runtime/indexer directory", async () => {
    const scopedPaths = scopedRuntimeFiles.map((file) => resolve(moduleDir, file));

    await expect(Promise.all(scopedPaths.map(pathExists))).resolves.toEqual(scopedPaths.map(() => true));
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
