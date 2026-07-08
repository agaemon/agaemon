import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BASE_READINESS_SCRIPTS } from "./readiness.js";
import {
  createReadinessCheckpoint,
  deriveGitHubActionsRunUrl,
  verifyReadinessCheckpoint,
} from "./checkpoint.js";

import type { ReadinessCheckpoint } from "./checkpoint.js";

const MANIFEST = {
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://sepolia.basescan.org",
  deployedAt: "2026-06-25T04:01:18Z",
  owner: "0x3124475af0ba367fFf33a5DC9BcE78c41f493713",
  agentProfile: {
    roleLabel: "agentos.kernel.operator",
    metadataURI: "ipfs://bafkreidohkf2rz54ulzhl7ffl3bb6xqxt67imopitmfgjcbgghorwvzheq",
  },
  contracts: {
    capabilityRegistry: "0x0000000000000000000000000000000000001001",
    policyEngine: "0x0000000000000000000000000000000000001002",
    reputationRegistry: "0x0000000000000000000000000000000000001003",
    agentAccount: "0x0000000000000000000000000000000000001004",
    testTargetProtocol: "0x0000000000000000000000000000000000001005",
  },
  transactions: {
    deployCapabilityRegistry: "0x1111111111111111111111111111111111111111111111111111111111111111",
    deployPolicyEngine: "0x2222222222222222222222222222222222222222222222222222222222222222",
    deployReputationRegistry: "0x3333333333333333333333333333333333333333333333333333333333333333",
    deployAgentAccount: "0x4444444444444444444444444444444444444444444444444444444444444444",
    deployTestTargetProtocol: "0x5555555555555555555555555555555555555555555555555555555555555555",
    setCapability: "0x6666666666666666666666666666666666666666666666666666666666666666",
    setPolicy: "0x7777777777777777777777777777777777777777777777777777777777777777",
    smokeExecute: "0x8888888888888888888888888888888888888888888888888888888888888888",
  },
  smokeTest: {
    capability: "0x497a7733c30c446bed91d579fce5ede8c3e0fbcdbe90a491d0a07e91d5b88b71",
    targetWasCalled: true,
  },
} as const;

describe("createReadinessCheckpoint", () => {
  it("records commit, manifest hash, run URL, and every readiness check result", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "agentos-checkpoint-"));
    const manifestPath = join(tempDir, "latest.json");
    const manifestContents = JSON.stringify(MANIFEST, null, 2);
    await writeFile(manifestPath, manifestContents);

    try {
      const checkpoint = await createReadinessCheckpoint({
        manifestPath,
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        generatedAt: "2026-06-25T06:30:00.000Z",
        readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383",
        runner: async (check) => ({
          exitCode: check.name === "swap" ? 1 : 0,
          signal: null,
          stdout: `${check.name} stdout`,
          stderr: check.name === "swap" ? "swap failed" : "",
        }),
      });

      expect(checkpoint.schemaVersion).toBe(1);
      expect(checkpoint.generatedAt).toBe("2026-06-25T06:30:00.000Z");
      expect(checkpoint.commit.sha).toBe("0123456789abcdef0123456789abcdef01234567");
      expect(checkpoint.manifest).toEqual({
        path: manifestPath,
        sha256: createHash("sha256").update(manifestContents).digest("hex"),
        network: "base-sepolia",
        chainId: 84532,
        deployedAt: "2026-06-25T04:01:18Z",
      });
      expect(checkpoint.readiness.runUrl).toBe(
        "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383",
      );
      expect(checkpoint.readiness.summary).toEqual({
        checks: BASE_READINESS_SCRIPTS.length,
        passed: BASE_READINESS_SCRIPTS.length - 1,
        failed: 1,
        overall: "failed",
      });
      expect(checkpoint.readiness.checks).toHaveLength(BASE_READINESS_SCRIPTS.length);
      expect(checkpoint.readiness.checks.find((check) => check.name === "swap")).toMatchObject({
        name: "swap",
        script: "base:swap-safety-check",
        command: `npm run base:swap-safety-check -- --manifest ${manifestPath}`,
        passed: false,
        exitCode: 1,
        signal: null,
        stdout: "swap stdout",
        stderr: "swap failed",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("deriveGitHubActionsRunUrl", () => {
  it("builds a run URL from GitHub Actions environment variables", () => {
    expect(
      deriveGitHubActionsRunUrl({
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "sagaratalatti/agentos-kernel",
        GITHUB_RUN_ID: "28151904383",
      }),
    ).toBe("https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383");
  });

  it("returns undefined when GitHub Actions environment variables are incomplete", () => {
    expect(deriveGitHubActionsRunUrl({ GITHUB_SERVER_URL: "https://github.com" })).toBeUndefined();
  });
});

describe("verifyReadinessCheckpoint", () => {
  it("passes a complete checkpoint whose manifest hash matches the current manifest", async () => {
    const { checkpoint, manifestContents, cleanup } = await createPassingCheckpoint();

    try {
      expect(verifyReadinessCheckpoint(checkpoint, { manifestContents, requireRunUrl: true })).toEqual({
        passed: true,
        failures: [],
      });
    } finally {
      await cleanup();
    }
  });

  it("rejects a checkpoint with a failed readiness check", async () => {
    const { checkpoint, manifestContents, cleanup } = await createPassingCheckpoint();

    try {
      const failedCheckpoint: ReadinessCheckpoint = {
        ...checkpoint,
        readiness: {
          ...checkpoint.readiness,
          summary: {
            checks: checkpoint.readiness.summary.checks,
            passed: checkpoint.readiness.summary.passed - 1,
            failed: 1,
            overall: "failed",
          },
          checks: checkpoint.readiness.checks.map((check) =>
            check.name === "swap" ? { ...check, passed: false, exitCode: 1, stderr: "swap failed" } : check,
          ),
        },
      };

      expect(verifyReadinessCheckpoint(failedCheckpoint, { manifestContents }).failures).toContain(
        "readiness check swap failed",
      );
    } finally {
      await cleanup();
    }
  });

  it("rejects a checkpoint when the current manifest hash differs", async () => {
    const { checkpoint, cleanup } = await createPassingCheckpoint();

    try {
      expect(
        verifyReadinessCheckpoint(checkpoint, {
          manifestContents: JSON.stringify({ ...MANIFEST, deployedAt: "2026-06-25T05:00:00Z" }, null, 2),
        }).failures,
      ).toContain("manifest sha256 does not match current manifest");
    } finally {
      await cleanup();
    }
  });

  it("rejects a checkpoint without a run URL when one is required", async () => {
    const { checkpoint, manifestContents, cleanup } = await createPassingCheckpoint({ readinessRunUrl: undefined });

    try {
      expect(verifyReadinessCheckpoint(checkpoint, { manifestContents, requireRunUrl: true }).failures).toContain(
        "readiness run URL is required",
      );
    } finally {
      await cleanup();
    }
  });
});

async function createPassingCheckpoint(
  options: { readinessRunUrl?: string | undefined } = {
    readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383",
  },
): Promise<{ checkpoint: ReadinessCheckpoint; manifestContents: string; cleanup: () => Promise<void> }> {
  const tempDir = await mkdtemp(join(tmpdir(), "agentos-checkpoint-"));
  const manifestPath = join(tempDir, "latest.json");
  const manifestContents = JSON.stringify(MANIFEST, null, 2);
  await writeFile(manifestPath, manifestContents);
  const checkpoint = await createReadinessCheckpoint({
    manifestPath,
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    generatedAt: "2026-06-25T06:30:00.000Z",
    readinessRunUrl: options.readinessRunUrl,
    environment: {},
    runner: async (check) => ({
      exitCode: 0,
      signal: null,
      stdout: `${check.name} stdout`,
      stderr: "",
    }),
  });

  return {
    checkpoint,
    manifestContents,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
