import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { BASE_READINESS_SCRIPTS } from "../base/readiness.js";
import {
  createBaseSepoliaReleaseStatus,
  verifyBaseSepoliaReleaseStatus,
  verifyBaseSepoliaReleaseStatusSnapshot,
} from "./status.js";
import { createBaseSepoliaReleaseNote } from "./note.js";

import type { ReadinessCheckpoint } from "../base/checkpoint.js";

const MANIFEST = {
  network: "base-sepolia",
  chainId: 84532,
  deployedAt: "2026-06-25T04:01:18Z",
};
const MANIFEST_CONTENTS = JSON.stringify(MANIFEST, null, 2);
const MANIFEST_SHA256 = createHash("sha256").update(MANIFEST_CONTENTS).digest("hex");

describe("createBaseSepoliaReleaseStatus", () => {
  it("renders deterministic JSON for the newest verified release note", () => {
    const json = createBaseSepoliaReleaseStatus(
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
    const status = JSON.parse(json) as Record<string, unknown>;

    expect(status).toMatchObject({
      schemaVersion: 1,
      network: "base-sepolia",
      releaseCount: 2,
      latest: {
        note: "base-sepolia-2026-06-25-bbbbbbb.md",
        generatedAt: "2026-06-25T08:00:00.000Z",
        commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        shortCommitSha: "bbbbbbb",
        manifestSha256: MANIFEST_SHA256,
        readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28199999999",
        readinessRunId: "28199999999",
        checksSummary: `${BASE_READINESS_SCRIPTS.length} passed, 0 failed`,
      },
    });
    expect(json.endsWith("\n")).toBe(true);
  });

  it("rejects invalid release notes before rendering status", () => {
    const markdown = createReleaseNote({
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      generatedAt: "2026-06-24T08:00:00.000Z",
      runId: "28100000000",
    }).replace("| Overall | `passed` |", "| Overall | `failed` |");

    expect(() =>
      createBaseSepoliaReleaseStatus([{ path: "invalid.md", markdown }], {
        manifestContents: MANIFEST_CONTENTS,
      }),
    ).toThrow("release note invalid.md failed verification: overall status must be passed");
  });
});

describe("verifyBaseSepoliaReleaseStatus", () => {
  it("detects a stale checked-in status snapshot", () => {
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
    const current = createBaseSepoliaReleaseStatus(notes, { manifestContents: MANIFEST_CONTENTS }).replace(
      "\"shortCommitSha\": \"bbbbbbb\"",
      "\"shortCommitSha\": \"ccccccc\"",
    );

    expect(
      verifyBaseSepoliaReleaseStatus(current, notes, {
        manifestContents: MANIFEST_CONTENTS,
      }),
    ).toMatchObject({
      passed: false,
      failures: ["release status is stale"],
    });
  });
});

describe("verifyBaseSepoliaReleaseStatusSnapshot", () => {
  it("accepts a generated latest.json snapshot without release-note inputs", () => {
    const json = createBaseSepoliaReleaseStatus(
      [
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

    expect(verifyBaseSepoliaReleaseStatusSnapshot(json)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects malformed latest release evidence", () => {
    const snapshot = JSON.parse(
      createBaseSepoliaReleaseStatus(
        [
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
      ),
    ) as Record<string, unknown>;
    snapshot.latest = {
      ...(snapshot.latest as Record<string, unknown>),
      commitSha: "not-a-commit",
      readinessRunUrl: "https://example.com/run",
    };

    expect(verifyBaseSepoliaReleaseStatusSnapshot(JSON.stringify(snapshot))).toEqual({
      passed: false,
      failures: [
        "latest.commitSha must be a 40-character hex string",
        "latest.readinessRunUrl must be a GitHub Actions run URL",
        "latest.shortCommitSha must match the first 7 characters of latest.commitSha",
        "latest.readinessRunId must match latest.readinessRunUrl",
        "latest.commitSha must match releases[0].commitSha",
        "latest.readinessRunUrl must match releases[0].readinessRunUrl",
      ],
    });
  });

  it("rejects a release count mismatch", () => {
    const snapshot = JSON.parse(
      createBaseSepoliaReleaseStatus(
        [
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
      ),
    ) as Record<string, unknown>;
    snapshot.releaseCount = 2;

    expect(verifyBaseSepoliaReleaseStatusSnapshot(JSON.stringify(snapshot))).toEqual({
      passed: false,
      failures: ["releaseCount must equal releases length"],
    });
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
