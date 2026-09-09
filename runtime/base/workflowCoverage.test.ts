import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("public checkout CI coverage", () => {
  it("runs for pushes and pull requests without path exclusions", () => {
    expect(workflow).toContain("  push:");
    expect(workflow).toContain("  pull_request:");
    expect(workflow).not.toMatch(/paths(?:-ignore)?:|branches-ignore:/);
  });

  it("uses locked dependencies and runs the full required checks", () => {
    for (const command of ["npm ci", "npm run typecheck", "npm test", "forge test", "git diff --check"]) {
      expect(workflow.split("\n").map((line) => line.trim())).toContain(`- run: ${command}`);
    }
    expect(workflow).not.toMatch(/continue-on-error|--passWithNoTests|--exclude|if:.*false/);
  });

  it("pins external actions and installs the toolchains", () => {
    const actions = [...workflow.matchAll(/uses: (\S+)/g)].map((match) => match[1]!);
    expect(actions).toHaveLength(3);
    for (const action of actions) expect(action).toMatch(/@[a-f0-9]{40}$/);
    expect(workflow).toContain("node-version: '24'");
    expect(workflow).toContain("foundry-rs/foundry-toolchain@");
    expect(workflow).toMatch(/version: v\d+\.\d+\.\d+/);
  });

  it("has no live operations or private evidence dependencies", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toMatch(/secrets\.|schedule:|pull_request_target:|--send|--broadcast|docs\/releases|BASE_SEPOLIA_RPC_URL/);
    expect(workflow).toContain("timeout-minutes: 15");
  });
});
