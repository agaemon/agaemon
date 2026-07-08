import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

describe("runtime root file layout", () => {
  it("keeps runtime/index.ts as the only root-level TypeScript file", async () => {
    const entries = await readdir(runtimeRoot, { withFileTypes: true });
    const rootTypescriptFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name)
      .sort();

    expect(rootTypescriptFiles).toEqual(["index.ts"]);
  });
});
