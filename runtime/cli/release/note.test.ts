import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatReleaseNoteCliOutput } from "./note.js";

import type { ReadinessCheckpoint } from "../../base/checkpoint.js";
import type { ReleaseNoteCliReport } from "./note.js";

type ReleaseNoteCliModule = typeof import("./note.js") & {
  isReleaseNoteDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseReleaseNoteCliArgs?: (argv: readonly string[]) => {
    checkpointPath: string;
    manifestPath?: string | undefined;
    outputPath?: string | undefined;
    requireRunUrl: boolean;
    format: "json" | "summary";
  };
  runReleaseNoteCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    readText?: (path: string) => Promise<string>;
    readCheckpoint?: (path: string) => Promise<ReadinessCheckpoint>;
    createNote?: (checkpoint: ReadinessCheckpoint, options?: {
      manifestContents?: string | undefined;
      requireRunUrl?: boolean | undefined;
    }) => string;
    defaultOutputPath?: (checkpoint: ReadinessCheckpoint) => string;
    writeNote?: (path: string, markdown: string) => Promise<void>;
  }) => Promise<void>;
};

const REPORT: ReleaseNoteCliReport = {
  checkpoint: "artifacts/base-sepolia-readiness-checkpoint.json",
  manifest: "deployments/base-sepolia/latest.json",
  output: "docs/releases/base-sepolia-2026-06-25-0123456.md",
  requireRunUrl: true,
  written: true,
};

const CHECKPOINT: ReadinessCheckpoint = {
  schemaVersion: 1,
  generatedAt: "2026-06-25T06:30:00.000Z",
  commit: {
    sha: "0123456789abcdef0123456789abcdef01234567",
  },
  manifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    network: "base-sepolia",
    chainId: 84532,
  },
  readiness: {
    summary: {
      checks: 1,
      passed: 1,
      failed: 0,
      overall: "passed",
    },
    checks: [
      {
        name: "manifest",
        script: "base:manifest-verify",
        command: "npm run base:manifest-verify -- --summary",
        passed: true,
        exitCode: 0,
        signal: null,
        stdout: "ok",
        stderr: "",
      },
    ],
  },
};

describe("formatReleaseNoteCliOutput", () => {
  it("keeps JSON release note output available for automation", () => {
    expect(formatReleaseNoteCliOutput(REPORT, "json")).toBe(JSON.stringify(REPORT, null, 2));
  });

  it("renders a readable release note creation summary when requested", () => {
    expect(formatReleaseNoteCliOutput(REPORT, "summary")).toBe([
      "Base Sepolia release note",
      "checkpoint: artifacts/base-sepolia-readiness-checkpoint.json",
      "manifest: deployments/base-sepolia/latest.json",
      "output: docs/releases/base-sepolia-2026-06-25-0123456.md",
      "requireRunUrl: true",
      "written: true",
    ].join("\n"));
  });

  it("rejects malformed release note reports before output formatting", () => {
    expect(() => formatReleaseNoteCliOutput(null as never, "json")).toThrow(
      "Release note report must be an object",
    );
  });

  it("rejects unsupported release note output formats", () => {
    expect(() => formatReleaseNoteCliOutput(REPORT, "text" as never)).toThrow(
      "Release note output format must be json or summary",
    );
  });

  it("rejects malformed release note report paths", () => {
    expect(() => formatReleaseNoteCliOutput({ ...REPORT, checkpoint: "  " }, "summary")).toThrow(
      "Release note report checkpoint must not be empty",
    );
    expect(() => formatReleaseNoteCliOutput({ ...REPORT, manifest: 7 } as never, "summary")).toThrow(
      "Release note report manifest must be a string",
    );
    expect(() => formatReleaseNoteCliOutput({ ...REPORT, output: "" }, "summary")).toThrow(
      "Release note report output must not be empty",
    );
  });

  it("rejects malformed release note report states", () => {
    expect(() => formatReleaseNoteCliOutput({ ...REPORT, requireRunUrl: "true" } as never, "json")).toThrow(
      "Release note report requireRunUrl must be a boolean",
    );
    expect(() => formatReleaseNoteCliOutput({ ...REPORT, written: "true" } as never, "json")).toThrow(
      "Release note report written must be a boolean",
    );
  });
});

describe("isReleaseNoteDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./note.js") as ReleaseNoteCliModule;
    const scriptPath = resolve("runtime/cli/release/note.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isReleaseNoteDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isReleaseNoteDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isReleaseNoteDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/release/noteVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./note.js") as ReleaseNoteCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/release/note.ts")).href;

    expect(() => module.isReleaseNoteDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isReleaseNoteDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseReleaseNoteCliArgs", () => {
  it("requires a checkpoint path", async () => {
    const module = await import("./note.js") as ReleaseNoteCliModule;

    expect(() => module.parseReleaseNoteCliArgs?.([])).toThrow("--checkpoint is required");
  });

  it("parses split and equals-form release note flags", async () => {
    const module = await import("./note.js") as ReleaseNoteCliModule;

    expect(module.parseReleaseNoteCliArgs?.([
      "--checkpoint",
      "artifacts/checkpoint.json",
      "--manifest=deployments/base-sepolia/custom.json",
      "--output",
      "docs/releases/custom.md",
      "--allow-missing-run-url",
      "--format= summary ",
    ])).toEqual({
      checkpointPath: "artifacts/checkpoint.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      outputPath: "docs/releases/custom.md",
      requireRunUrl: false,
      format: "summary",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./note.js") as ReleaseNoteCliModule;

    expect(() => module.parseReleaseNoteCliArgs?.(["--checkpoint", "a.json", "--checkpoint", "b.json"])).toThrow(
      "Duplicate argument: --checkpoint",
    );
    expect(() => module.parseReleaseNoteCliArgs?.(["--allow-missing-run-url", "--allow-missing-run-url"])).toThrow(
      "Duplicate argument: --allow-missing-run-url",
    );
    expect(() => module.parseReleaseNoteCliArgs?.(["--checkpoint"])).toThrow("--checkpoint requires a value");
    expect(() => module.parseReleaseNoteCliArgs?.(["--checkpoint", "a.json", "--format", "text"])).toThrow(
      "--format must be json or summary",
    );
    expect(() => module.parseReleaseNoteCliArgs?.(["--checkpoint", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runReleaseNoteCli", () => {
  async function runWithGeneratedNote(
    markdown: unknown,
    calls: string[] = [],
  ): Promise<void> {
    const module = await import("./note.js") as ReleaseNoteCliModule;

    await module.runReleaseNoteCli?.({
      argv: ["--checkpoint", "artifacts/checkpoint.json", "--output", "docs/releases/out.md"],
      writeOutput: () => calls.push("output"),
      readCheckpoint: async () => CHECKPOINT,
      createNote: () => markdown as string,
      writeNote: async () => {
        calls.push("write");
      },
    });
  }

  async function runWithDefaultOutputPath(outputPath: unknown, calls: string[] = []): Promise<void> {
    const module = await import("./note.js") as ReleaseNoteCliModule;

    await module.runReleaseNoteCli?.({
      argv: ["--checkpoint", "artifacts/checkpoint.json"],
      writeOutput: () => calls.push("output"),
      readCheckpoint: async () => CHECKPOINT,
      createNote: () => "# release\n",
      defaultOutputPath: () => outputPath as string,
      writeNote: async () => {
        calls.push("write");
      },
    });
  }

  it("writes injected release notes to explicit output paths", async () => {
    const module = await import("./note.js") as ReleaseNoteCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runReleaseNoteCli?.({
      argv: [
        "--checkpoint",
        "artifacts/base-sepolia-readiness-checkpoint.json",
        "--manifest",
        "deployments/base-sepolia/latest.json",
        "--output",
        "docs/releases/base-sepolia-2026-06-25-0123456.md",
      ],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "manifest";
      },
      readCheckpoint: async (path) => {
        calls.push(`checkpoint:${path}`);
        return CHECKPOINT;
      },
      createNote: (
        checkpoint: ReadinessCheckpoint,
        options?: { manifestContents?: string | undefined; requireRunUrl?: boolean | undefined },
      ) => {
        calls.push(`create:${checkpoint.schemaVersion}:${options?.manifestContents ?? ""}:${options?.requireRunUrl}`);
        return "# release\n";
      },
      defaultOutputPath: () => {
        throw new Error("defaultOutputPath should not be called");
      },
      writeNote: async (path, markdown) => {
        calls.push(`write:${path}:${markdown}`);
      },
    });

    expect(outputs).toEqual([formatReleaseNoteCliOutput(REPORT, "json")]);
    expect(calls).toEqual([
      "read:deployments/base-sepolia/latest.json",
      "checkpoint:artifacts/base-sepolia-readiness-checkpoint.json",
      "create:1:manifest:true",
      "write:docs/releases/base-sepolia-2026-06-25-0123456.md:# release\n",
    ]);
  });

  it("derives output paths through an injected resolver when output is omitted", async () => {
    const module = await import("./note.js") as ReleaseNoteCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runReleaseNoteCli?.({
      argv: ["--checkpoint", "artifacts/checkpoint.json", "--allow-missing-run-url", "--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      readCheckpoint: async () => CHECKPOINT,
      createNote: (_checkpoint, options) => {
        calls.push(`create:${options?.requireRunUrl}`);
        return "# derived\n";
      },
      defaultOutputPath: (checkpoint) => {
        calls.push(`default:${checkpoint.commit.sha.slice(0, 7)}`);
        return "docs/releases/derived.md";
      },
      writeNote: async (path, markdown) => {
        calls.push(`write:${path}:${markdown}`);
      },
    });

    expect(outputs).toEqual([formatReleaseNoteCliOutput({
      checkpoint: "artifacts/checkpoint.json",
      output: "docs/releases/derived.md",
      requireRunUrl: false,
      written: true,
    }, "summary")]);
    expect(calls).toEqual([
      "create:false",
      "default:0123456",
      "write:docs/releases/derived.md:# derived\n",
    ]);
  });

  it("rejects malformed generated release note markdown before writes or output", async () => {
    const calls: string[] = [];

    await expect(runWithGeneratedNote(7, calls)).rejects.toThrow(
      "Release note markdown must be a string",
    );
    expect(calls).toEqual([]);
  });

  it("rejects empty generated release note markdown before writes or output", async () => {
    const calls: string[] = [];

    await expect(runWithGeneratedNote("  ", calls)).rejects.toThrow(
      "Release note markdown must not be empty",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed default release note output paths before writes or output", async () => {
    const calls: string[] = [];

    await expect(runWithDefaultOutputPath(7, calls)).rejects.toThrow(
      "Release note output path must be a string",
    );
    expect(calls).toEqual([]);
  });

  it("rejects empty default release note output paths before writes or output", async () => {
    const calls: string[] = [];

    await expect(runWithDefaultOutputPath(" ", calls)).rejects.toThrow(
      "Release note output path must not be empty",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed arguments before release note reads or writes", async () => {
    const module = await import("./note.js") as ReleaseNoteCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseNoteCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      readCheckpoint: async () => {
        calls.push("checkpoint");
        return CHECKPOINT;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
