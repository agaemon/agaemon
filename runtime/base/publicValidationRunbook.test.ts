import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync("VALIDATION.md", "utf8");

describe("public validation runbook", () => {
  it("documents dependency installation before all local checks", () => {
    for (const command of ["npm run typecheck", "npm test", "forge test", "git diff --check"]) {
      expect(runbook.indexOf(command)).toBeGreaterThan(runbook.indexOf("npm ci"));
    }
    expect(runbook.indexOf("npm ci")).toBeGreaterThan(-1);
  });

  it("separates local validation from release and transaction authority", () => {
    expect(runbook).toContain(".github/workflows/ci.yml");
    expect(runbook).toContain("No mainnet, no live funds, no signer secret, and no transaction submission.");
    expect(runbook).toContain("Missing evidence must remain a failure");
    expect(runbook).toContain("not deployed-account or");
    expect(runbook).toContain("verified economic evidence before launch-gate");
  });
});
