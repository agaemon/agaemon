import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BASE_READINESS_SCRIPTS } from "../base/readiness.js";
import {
  createBaseSepoliaReleaseNote,
  defaultBaseSepoliaReleaseNotePath,
  writeBaseSepoliaReleaseNote,
} from "./note.js";

import type { ReadinessCheckpoint } from "../base/checkpoint.js";

const MANIFEST = {
  network: "base-sepolia",
  chainId: 84532,
  deployedAt: "2026-06-25T04:01:18Z",
};
const MANIFEST_CONTENTS = JSON.stringify(MANIFEST, null, 2);
const MANIFEST_SHA256 = createHash("sha256").update(MANIFEST_CONTENTS).digest("hex");

describe("defaultBaseSepoliaReleaseNotePath", () => {
  it("uses the checkpoint date and short commit sha", () => {
    expect(defaultBaseSepoliaReleaseNotePath(createCheckpoint())).toBe(
      "docs/releases/base-sepolia-2026-06-25-0123456.md",
    );
  });
});

describe("createBaseSepoliaReleaseNote", () => {
  it("renders a concise rollout note from a valid checkpoint", () => {
    const markdown = createBaseSepoliaReleaseNote(createCheckpoint(), {
      manifestContents: MANIFEST_CONTENTS,
    });

    expect(markdown).toContain("# Base Sepolia Rollout Checkpoint");
    expect(markdown).toContain("| Commit | `0123456789abcdef0123456789abcdef01234567` |");
    expect(markdown).toContain("| Manifest SHA-256 | `");
    expect(markdown).toContain("| Readiness Run | https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383 |");
    expect(markdown).toContain("| Overall | `passed` |");
    expect(markdown).toContain(`| Checks | ${BASE_READINESS_SCRIPTS.length} passed, 0 failed |`);
    expect(markdown).toContain("| manifest | passed | `base:manifest-verify` |");
  });

  it("rejects failed checkpoints before rendering", () => {
    const checkpoint = createCheckpoint({
      failedCheckName: "swap",
    });

    expect(() =>
      createBaseSepoliaReleaseNote(checkpoint, {
        manifestContents: MANIFEST_CONTENTS,
      }),
    ).toThrow("readiness check swap failed");
  });

  it("requires a readiness run URL by default", () => {
    const checkpoint = createCheckpoint({ readinessRunUrl: undefined });

    expect(() =>
      createBaseSepoliaReleaseNote(checkpoint, {
        manifestContents: MANIFEST_CONTENTS,
      }),
    ).toThrow("readiness run URL is required");
  });

  it("rejects checkpoints without a generated timestamp", () => {
    const checkpoint = {
      ...createCheckpoint(),
      generatedAt: "",
    };

    expect(() =>
      createBaseSepoliaReleaseNote(checkpoint, {
        manifestContents: MANIFEST_CONTENTS,
      }),
    ).toThrow("checkpoint generatedAt is required");
  });
});

describe("writeBaseSepoliaReleaseNote", () => {
  it("creates parent directories before writing markdown", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "agentos-release-note-"));
    const outputPath = join(tempDir, "nested", "release.md");
    const markdown = createBaseSepoliaReleaseNote(createCheckpoint(), {
      manifestContents: MANIFEST_CONTENTS,
    });

    try {
      await writeBaseSepoliaReleaseNote(outputPath, markdown);

      expect(await readFile(outputPath, "utf8")).toBe(markdown);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function createCheckpoint(
  options: {
    failedCheckName?: string | undefined;
    readinessRunUrl?: string | undefined;
  } = {
    readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383",
  },
): ReadinessCheckpoint {
  const checks = BASE_READINESS_SCRIPTS.map((check) => {
    const passed = check.name !== options.failedCheckName;
    return {
      name: check.name,
      script: check.script,
      command: `npm run ${check.script} -- --manifest deployments/base-sepolia/latest.json`,
      passed,
      exitCode: passed ? 0 : 1,
      signal: null,
      stdout: `${check.name} output`,
      stderr: passed ? "" : `${check.name} failed`,
    };
  });
  const failed = options.failedCheckName === undefined ? 0 : 1;
  const passed = BASE_READINESS_SCRIPTS.length - failed;

  return {
    schemaVersion: 1,
    generatedAt: "2026-06-25T08:15:00.000Z",
    commit: {
      sha: "0123456789abcdef0123456789abcdef01234567",
    },
    manifest: {
      path: "deployments/base-sepolia/latest.json",
      sha256: MANIFEST_SHA256,
      network: "base-sepolia",
      chainId: 84532,
      deployedAt: "2026-06-25T04:01:18Z",
    },
    readiness: {
      ...(options.readinessRunUrl === undefined ? {} : { runUrl: options.readinessRunUrl }),
      summary: {
        checks: BASE_READINESS_SCRIPTS.length,
        passed,
        failed,
        overall: failed === 0 ? "passed" : "failed",
      },
      checks,
    },
  };
}
