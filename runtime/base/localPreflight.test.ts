import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { BASE_READINESS_SCRIPTS } from "./readiness.js";
import { verifyBaseSepoliaLocalPreflight } from "./localPreflight.js";
import { createBaseSepoliaReleaseIndex } from "../release/index.js";
import { createBaseSepoliaReleaseNote } from "../release/note.js";
import { createBaseSepoliaReleaseStatus } from "../release/status.js";
import { createBaseSepoliaReleaseSummary } from "../release/summary.js";

import type { ReadinessCheckpoint } from "./checkpoint.js";

const VALID_ENV_EXAMPLE = [
  "PRIVATE_KEY=0xreplace_with_base_sepolia_test_wallet_private_key",
  "BASE_SEPOLIA_RPC_URL=https://sepolia.base.org",
  "BASE_SEPOLIA_CHAIN_ID=84532",
].join("\n");

const MANIFEST = {
  network: "base-sepolia",
  chainId: 84532,
  deployedAt: "2026-06-25T04:01:18Z",
};
const MANIFEST_CONTENTS = JSON.stringify(MANIFEST, null, 2);
const MANIFEST_SHA256 = createHash("sha256").update(MANIFEST_CONTENTS).digest("hex");

describe("verifyBaseSepoliaLocalPreflight", () => {
  it("passes when every local Base Sepolia release artifact is current", () => {
    const artifacts = createArtifacts();

    expect(verifyBaseSepoliaLocalPreflight(artifacts)).toEqual({
      passed: true,
      checks: [
        { name: "env-example", passed: true, failures: [] },
        { name: "release-notes", passed: true, failures: [] },
        { name: "release-index", passed: true, failures: [] },
        { name: "release-status", passed: true, failures: [] },
        { name: "release-status-schema", passed: true, failures: [] },
        { name: "release-summary", passed: true, failures: [] },
      ],
    });
  });

  it("reports per-check failures for invalid or stale local artifacts", () => {
    const artifacts = createArtifacts({
      envExampleContents: VALID_ENV_EXAMPLE.replace(
        "PRIVATE_KEY=0xreplace_with_base_sepolia_test_wallet_private_key",
        `PRIVATE_KEY=0x${"a".repeat(64)}`,
      ),
    });

    expect(
      verifyBaseSepoliaLocalPreflight({
        ...artifacts,
        releaseSummaryMarkdown: artifacts.releaseSummaryMarkdown.replace("| Release Count | 1 |", "| Release Count | 2 |"),
      }),
    ).toMatchObject({
      passed: false,
      checks: [
        {
          name: "env-example",
          passed: false,
          failures: ["PRIVATE_KEY must be a placeholder in .env.example"],
        },
        { name: "release-notes", passed: true, failures: [] },
        { name: "release-index", passed: true, failures: [] },
        { name: "release-status", passed: true, failures: [] },
        { name: "release-status-schema", passed: true, failures: [] },
        {
          name: "release-summary",
          passed: false,
          failures: ["release summary is stale"],
        },
      ],
    });
  });
});

function createArtifacts(overrides: { envExampleContents?: string } = {}) {
  const releaseNotes = [
    {
      path: "base-sepolia-2026-06-25-bbbbbbb.md",
      markdown: createBaseSepoliaReleaseNote(createCheckpoint(), {
        manifestContents: MANIFEST_CONTENTS,
      }),
    },
  ];
  const releaseStatusJson = createBaseSepoliaReleaseStatus(releaseNotes, {
    manifestContents: MANIFEST_CONTENTS,
  });

  return {
    envExampleContents: overrides.envExampleContents ?? VALID_ENV_EXAMPLE,
    releaseNotes,
    releaseIndexMarkdown: createBaseSepoliaReleaseIndex(releaseNotes, {
      manifestContents: MANIFEST_CONTENTS,
    }),
    releaseStatusJson,
    releaseSummaryMarkdown: createBaseSepoliaReleaseSummary(releaseStatusJson),
    manifestContents: MANIFEST_CONTENTS,
  };
}

function createCheckpoint(): ReadinessCheckpoint {
  return {
    schemaVersion: 1,
    generatedAt: "2026-06-25T08:00:00.000Z",
    commit: {
      sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    manifest: {
      path: "deployments/base-sepolia/latest.json",
      sha256: MANIFEST_SHA256,
      network: "base-sepolia",
      chainId: 84532,
      deployedAt: "2026-06-25T04:01:18Z",
    },
    readiness: {
      runUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28199999999",
      summary: {
        checks: BASE_READINESS_SCRIPTS.length,
        passed: BASE_READINESS_SCRIPTS.length,
        failed: 0,
        overall: "passed",
      },
      checks: BASE_READINESS_SCRIPTS.map((check) => ({
        name: check.name,
        script: check.script,
        command: `npm run ${check.script} -- --manifest deployments/base-sepolia/latest.json`,
        passed: true,
        exitCode: 0,
        signal: null,
        stdout: `${check.name} output`,
        stderr: "",
      })),
    },
  };
}
