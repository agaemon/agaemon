import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { BASE_READINESS_SCRIPTS } from "../base/readiness.js";
import { createBaseSepoliaReleaseNote } from "./note.js";
import { verifyBaseSepoliaReleaseNote } from "./noteVerifier.js";

import type { ReadinessCheckpoint } from "../base/checkpoint.js";

const MANIFEST = {
  network: "base-sepolia",
  chainId: 84532,
  deployedAt: "2026-06-25T04:01:18Z",
};
const MANIFEST_CONTENTS = JSON.stringify(MANIFEST, null, 2);
const MANIFEST_SHA256 = createHash("sha256").update(MANIFEST_CONTENTS).digest("hex");
const READINESS_RUN_URL = "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869";

describe("verifyBaseSepoliaReleaseNote", () => {
  it("passes a generated note whose manifest hash matches the current manifest", () => {
    expect(verifyBaseSepoliaReleaseNote(createReleaseNote(), { manifestContents: MANIFEST_CONTENTS })).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects a note whose manifest hash does not match the current manifest", () => {
    const staleManifestContents = JSON.stringify({ ...MANIFEST, deployedAt: "2026-06-25T05:00:00Z" }, null, 2);

    expect(verifyBaseSepoliaReleaseNote(createReleaseNote(), { manifestContents: staleManifestContents }).failures).toContain(
      "manifest sha256 does not match current manifest",
    );
  });

  it("rejects a note without a valid readiness run URL", () => {
    const note = createReleaseNote().replace(
      `| Readiness Run | ${READINESS_RUN_URL} |`,
      "| Readiness Run | not recorded |",
    );

    expect(verifyBaseSepoliaReleaseNote(note, { manifestContents: MANIFEST_CONTENTS }).failures).toContain(
      "readiness run URL is invalid",
    );
  });

  it("rejects a note with a failed readiness check row", () => {
    const note = createReleaseNote().replace(
      "| swap | passed | `base:swap-safety-check` |",
      "| swap | failed | `base:swap-safety-check` |",
    );

    expect(verifyBaseSepoliaReleaseNote(note, { manifestContents: MANIFEST_CONTENTS }).failures).toContain(
      "readiness check swap status must be passed",
    );
  });

  it("rejects a note missing an expected readiness check row", () => {
    const note = createReleaseNote().replace("| token | passed | `base:token-safety-check` |\n", "");

    expect(verifyBaseSepoliaReleaseNote(note, { manifestContents: MANIFEST_CONTENTS }).failures).toContain(
      `readiness checks table must contain ${BASE_READINESS_SCRIPTS.length} rows`,
    );
  });
});

function createReleaseNote(): string {
  return createBaseSepoliaReleaseNote(createCheckpoint(), {
    manifestContents: MANIFEST_CONTENTS,
  });
}

function createCheckpoint(): ReadinessCheckpoint {
  return {
    schemaVersion: 1,
    generatedAt: "2026-06-25T08:05:49.658Z",
    commit: {
      sha: "4c7e8c241f7daedade7a864af3692723fc6978dd",
    },
    manifest: {
      path: "deployments/base-sepolia/latest.json",
      sha256: MANIFEST_SHA256,
      network: "base-sepolia",
      chainId: 84532,
      deployedAt: "2026-06-25T04:01:18Z",
    },
    readiness: {
      runUrl: READINESS_RUN_URL,
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
