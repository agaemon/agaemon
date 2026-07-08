import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { BASE_READINESS_SCRIPTS } from "../base/readiness.js";
import {
  createBaseSepoliaReleaseIndex,
  isBaseSepoliaReleaseNoteFilename,
  verifyBaseSepoliaReleaseIndex,
} from "./index.js";
import { createBaseSepoliaReleaseNote } from "./note.js";

import type { ReadinessCheckpoint } from "../base/checkpoint.js";

const MANIFEST = {
  network: "base-sepolia",
  chainId: 84532,
  deployedAt: "2026-06-25T04:01:18Z",
};
const MANIFEST_CONTENTS = JSON.stringify(MANIFEST, null, 2);
const MANIFEST_SHA256 = createHash("sha256").update(MANIFEST_CONTENTS).digest("hex");

describe("createBaseSepoliaReleaseIndex", () => {
  it("renders release notes newest-first with note links and evidence summaries", () => {
    const markdown = createBaseSepoliaReleaseIndex(
      [
        {
          path: "base-sepolia-2026-06-24-aaaaaaaa.md",
          markdown: createReleaseNote({
            commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            generatedAt: "2026-06-24T08:00:00.000Z",
            runId: "28100000000",
          }),
        },
        {
          path: "base-sepolia-2026-06-25-bbbbbbb.md",
          markdown: createReleaseNote({
            commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            generatedAt: "2026-06-25T08:00:00.000Z",
            runId: "28199999999",
          }),
        },
      ],
      { manifestContents: MANIFEST_CONTENTS },
    );

    const newestIndex = markdown.indexOf("[base-sepolia-2026-06-25-bbbbbbb.md]");
    const oldestIndex = markdown.indexOf("[base-sepolia-2026-06-24-aaaaaaaa.md]");

    expect(markdown).toContain("# Base Sepolia Release Index");
    expect(newestIndex).toBeGreaterThan(-1);
    expect(oldestIndex).toBeGreaterThan(-1);
    expect(newestIndex).toBeLessThan(oldestIndex);
    expect(markdown).toContain("| 2026-06-25T08:00:00.000Z | `bbbbbbb` |");
    expect(markdown).toContain("[28199999999](https://github.com/sagaratalatti/agentos-kernel/actions/runs/28199999999)");
    expect(markdown).toContain(`| ${BASE_READINESS_SCRIPTS.length} passed, 0 failed |`);
  });

  it("rejects invalid release notes before indexing them", () => {
    const markdown = createReleaseNote({
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      generatedAt: "2026-06-24T08:00:00.000Z",
      runId: "28100000000",
    }).replace("| Overall | `passed` |", "| Overall | `failed` |");

    expect(() =>
      createBaseSepoliaReleaseIndex([{ path: "invalid.md", markdown }], {
        manifestContents: MANIFEST_CONTENTS,
      }),
    ).toThrow("release note invalid.md failed verification: overall status must be passed");
  });
});

describe("verifyBaseSepoliaReleaseIndex", () => {
  it("detects a stale checked-in release index", () => {
    const notes = [
      {
        path: "base-sepolia-2026-06-25-bbbbbbb.md",
        markdown: createReleaseNote({
          commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          generatedAt: "2026-06-25T08:00:00.000Z",
          runId: "28199999999",
        }),
      },
    ];
    const current = createBaseSepoliaReleaseIndex(notes, { manifestContents: MANIFEST_CONTENTS }).replace(
      "`bbbbbbb`",
      "`ccccccc`",
    );

    expect(
      verifyBaseSepoliaReleaseIndex(current, notes, {
        manifestContents: MANIFEST_CONTENTS,
      }),
    ).toMatchObject({
      passed: false,
      failures: ["release index is stale"],
    });
  });
});

describe("isBaseSepoliaReleaseNoteFilename", () => {
  it("accepts only generated Base Sepolia rollout note filenames", () => {
    expect(isBaseSepoliaReleaseNoteFilename("base-sepolia-2026-06-25-4c7e8c2.md")).toBe(true);
    expect(isBaseSepoliaReleaseNoteFilename("CURRENT.md")).toBe(false);
    expect(isBaseSepoliaReleaseNoteFilename("README.md")).toBe(false);
    expect(isBaseSepoliaReleaseNoteFilename("base-sepolia-latest.json")).toBe(false);
  });
});

function createReleaseNote(params: { commitSha: string; generatedAt: string; runId: string }): string {
  return createBaseSepoliaReleaseNote(createCheckpoint(params), {
    manifestContents: MANIFEST_CONTENTS,
  });
}

function createCheckpoint(params: { commitSha: string; generatedAt: string; runId: string }): ReadinessCheckpoint {
  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt,
    commit: {
      sha: params.commitSha,
    },
    manifest: {
      path: "deployments/base-sepolia/latest.json",
      sha256: MANIFEST_SHA256,
      network: "base-sepolia",
      chainId: 84532,
      deployedAt: "2026-06-25T04:01:18Z",
    },
    readiness: {
      runUrl: `https://github.com/sagaratalatti/agentos-kernel/actions/runs/${params.runId}`,
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
