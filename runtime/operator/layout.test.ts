import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));

const scopedRuntimeFiles = [
  "dashboard.ts",
  "dashboard.test.ts",
  "dashboardVerify.ts",
  "dashboardVerify.test.ts",
  "server.ts",
  "server.test.ts",
  "layout.test.ts",
];

describe("operator runtime file layout", () => {
  it("keeps LC4 operator files in the scoped runtime/operator directory", async () => {
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
