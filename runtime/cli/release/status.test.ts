import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatReleaseStatusCliOutput } from "./status.js";

import type { BaseSepoliaReleaseNoteSource } from "../../release/index.js";
import type { ReleaseStatusCliReport } from "./status.js";

type ReleaseStatusCliModule = typeof import("./status.js") & {
  isReleaseStatusDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseReleaseStatusCliArgs?: (argv: readonly string[]) => {
    releaseDir: string;
    outputPath: string;
    manifestPath?: string | undefined;
    check: boolean;
    format: "json" | "summary";
  };
  runReleaseStatusCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    readReleaseNotes?: (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]>;
    mkdirp?: (dir: string) => Promise<void>;
    writeText?: (path: string, contents: string) => Promise<void>;
    createStatus?: (notes: readonly BaseSepoliaReleaseNoteSource[], options?: {
      manifestContents?: string | undefined;
    }) => string;
    verifyStatus?: (current: string, notes: readonly BaseSepoliaReleaseNoteSource[], options?: {
      manifestContents?: string | undefined;
    }) => { passed: boolean; failures: string[] };
  }) => Promise<void>;
};

const WRITE_REPORT: ReleaseStatusCliReport = {
  output: "docs/releases/latest.json",
  notes: 2,
  manifest: "deployments/base-sepolia/latest.json",
  written: true,
};

const CHECK_REPORT: ReleaseStatusCliReport = {
  output: "docs/releases/latest.json",
  notes: 2,
  passed: false,
  failures: ["release status is stale"],
};

const NOTES: BaseSepoliaReleaseNoteSource[] = [
  { path: "2026-06-25-base.md", markdown: "# Base release 1\n" },
  { path: "2026-06-26-base.md", markdown: "# Base release 2\n" },
];

describe("formatReleaseStatusCliOutput", () => {
  it("keeps JSON release status output available for automation", () => {
    expect(formatReleaseStatusCliOutput(WRITE_REPORT, "json")).toBe(JSON.stringify(WRITE_REPORT, null, 2));
    expect(formatReleaseStatusCliOutput(CHECK_REPORT, "json")).toBe(JSON.stringify(CHECK_REPORT, null, 2));
  });

  it("renders readable release status summaries when requested", () => {
    expect(formatReleaseStatusCliOutput(WRITE_REPORT, "summary")).toBe([
      "Base Sepolia release status",
      "output: docs/releases/latest.json",
      "notes: 2",
      "manifest: deployments/base-sepolia/latest.json",
      "written: true",
    ].join("\n"));

    expect(formatReleaseStatusCliOutput(CHECK_REPORT, "summary")).toBe([
      "Base Sepolia release status",
      "output: docs/releases/latest.json",
      "notes: 2",
      "passed: false",
      "failures: 1",
      "- release status is stale",
    ].join("\n"));
  });

  it("rejects malformed release status reports before rendering", () => {
    expect(() => formatReleaseStatusCliOutput(null as unknown as ReleaseStatusCliReport, "json")).toThrow(
      "Release status report must be an object",
    );
    expect(() => formatReleaseStatusCliOutput({
      ...WRITE_REPORT,
      output: "",
    }, "json")).toThrow("Release status report output must not be empty");
    expect(() => formatReleaseStatusCliOutput({
      ...WRITE_REPORT,
      manifest: 123 as unknown as string,
    }, "json")).toThrow("Release status report manifest must be a string");
    expect(() => formatReleaseStatusCliOutput({
      ...WRITE_REPORT,
      notes: -1,
    }, "json")).toThrow("Release status report notes must be a non-negative integer");
  });

  it("rejects unsupported release status output formats before rendering", () => {
    expect(() => formatReleaseStatusCliOutput(
      WRITE_REPORT,
      "text" as unknown as "json",
    )).toThrow("Release status output format must be json or summary");
  });

  it("rejects malformed release status write and check states before rendering", () => {
    expect(() => formatReleaseStatusCliOutput({
      ...WRITE_REPORT,
      written: "true" as unknown as boolean,
    }, "json")).toThrow("Release status report written must be a boolean");
    expect(() => formatReleaseStatusCliOutput({
      ...CHECK_REPORT,
      passed: "false" as unknown as boolean,
    }, "json")).toThrow("Release status verification report passed must be a boolean");
    expect(() => formatReleaseStatusCliOutput({
      ...CHECK_REPORT,
      failures: "stale" as unknown as string[],
    }, "json")).toThrow("Release status verification report failures must be an array");
    expect(() => formatReleaseStatusCliOutput({
      ...CHECK_REPORT,
      failures: [""],
    }, "summary")).toThrow("Release status verification report failure 0 must not be empty");
  });
});

describe("isReleaseStatusDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;
    const scriptPath = resolve("runtime/cli/release/status.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isReleaseStatusDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isReleaseStatusDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isReleaseStatusDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/release/summary.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/release/status.ts")).href;

    expect(() => module.isReleaseStatusDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isReleaseStatusDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseReleaseStatusCliArgs", () => {
  it("uses release status defaults", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;

    expect(module.parseReleaseStatusCliArgs?.([])).toEqual({
      releaseDir: "docs/releases",
      outputPath: "docs/releases/latest.json",
      check: false,
      format: "json",
    });
  });

  it("parses split and equals-form release status flags", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;

    expect(module.parseReleaseStatusCliArgs?.([
      "--dir",
      "docs/custom-releases",
      "--output=docs/custom-releases/latest.json",
      "--manifest",
      "deployments/base-sepolia/custom.json",
      "--check",
      "--format= summary ",
    ])).toEqual({
      releaseDir: "docs/custom-releases",
      outputPath: "docs/custom-releases/latest.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      check: true,
      format: "summary",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;

    expect(() => module.parseReleaseStatusCliArgs?.(["--output", "a", "--output", "b"])).toThrow(
      "Duplicate argument: --output",
    );
    expect(() => module.parseReleaseStatusCliArgs?.(["--check", "--check"])).toThrow(
      "Duplicate argument: --check",
    );
    expect(() => module.parseReleaseStatusCliArgs?.(["--dir"])).toThrow("--dir requires a value");
    expect(() => module.parseReleaseStatusCliArgs?.(["--format", "text"])).toThrow(
      "--format must be json or summary",
    );
    expect(() => module.parseReleaseStatusCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });
});

describe("runReleaseStatusCli", () => {
  it("writes injected release status snapshots before emitting output", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runReleaseStatusCli?.({
      argv: ["--manifest", "manifest.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "manifest";
      },
      readReleaseNotes: async (dir) => {
        calls.push(`notes:${dir}`);
        return NOTES;
      },
      createStatus: (notes, options) => {
        calls.push(`create:${notes.length}:${options?.manifestContents ?? ""}`);
        return "{\"releaseCount\":2}\n";
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
      verifyStatus: () => {
        throw new Error("verifyStatus should not be called");
      },
    });

    expect(outputs).toEqual([
      formatReleaseStatusCliOutput({
        ...WRITE_REPORT,
        manifest: "manifest.json",
      }, "json"),
    ]);
    expect(calls).toEqual([
      "read:manifest.json",
      "notes:docs/releases",
      "create:2:manifest",
      "mkdir:docs/releases",
      "write:docs/releases/latest.json:{\"releaseCount\":2}\n",
    ]);
  });

  it("sets exit code after failed injected check output", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runReleaseStatusCli?.({
      argv: ["--check", "--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "current";
      },
      readReleaseNotes: async (dir) => {
        calls.push(`notes:${dir}`);
        return NOTES;
      },
      verifyStatus: (current, notes) => {
        calls.push(`verify:${current}:${notes.length}`);
        return { passed: false, failures: ["release status is stale"] };
      },
      createStatus: () => {
        throw new Error("createStatus should not be called");
      },
      mkdirp: async () => {
        throw new Error("mkdirp should not be called");
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([formatReleaseStatusCliOutput(CHECK_REPORT, "summary")]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual(["notes:docs/releases", "read:docs/releases/latest.json", "verify:current:2"]);
  });

  it("rejects malformed arguments before release status reads or writes", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseStatusCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      readReleaseNotes: async () => {
        calls.push("notes");
        return NOTES;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed release note sources before check target reads", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseStatusCli?.({
      argv: ["--check"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "current";
      },
      readReleaseNotes: async () => {
        calls.push("notes");
        return [{ path: "", markdown: "# Release\n" }];
      },
      verifyStatus: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    })).rejects.toThrow("Release status note path must not be empty");
    expect(calls).toEqual(["notes"]);
  });

  it("rejects malformed generated release status JSON before writes or output", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseStatusCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      readReleaseNotes: async () => {
        calls.push("notes");
        return NOTES;
      },
      createStatus: () => {
        calls.push("create");
        return "";
      },
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Release status JSON must not be empty");
    expect(calls).toEqual(["notes", "create"]);
  });

  it("rejects malformed injected verifier reports before output or exit-code mutation", async () => {
    const module = await import("./status.js") as ReleaseStatusCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseStatusCli?.({
      argv: ["--check"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => {
        calls.push("read");
        return "current";
      },
      readReleaseNotes: async () => {
        calls.push("notes");
        return NOTES;
      },
      verifyStatus: () => {
        calls.push("verify");
        return { passed: "no", failures: [] } as unknown as { passed: boolean; failures: string[] };
      },
    })).rejects.toThrow("Release status verification report passed must be a boolean");
    expect(calls).toEqual(["notes", "read", "verify"]);
  });
});
