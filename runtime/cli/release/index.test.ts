import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatReleaseIndexCliOutput } from "./index.js";

import type { BaseSepoliaReleaseNoteSource } from "../../release/index.js";
import type { ReleaseIndexCliReport } from "./index.js";

type ReleaseIndexCliModule = typeof import("./index.js") & {
  isReleaseIndexDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseReleaseIndexCliArgs?: (argv: readonly string[]) => {
    releaseDir: string;
    outputPath: string;
    manifestPath?: string | undefined;
    check: boolean;
    format: "json" | "summary";
  };
  runReleaseIndexCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    readReleaseNotes?: (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]>;
    mkdirp?: (dir: string) => Promise<void>;
    writeText?: (path: string, contents: string) => Promise<void>;
    createIndex?: (notes: readonly BaseSepoliaReleaseNoteSource[], options?: {
      manifestContents?: string | undefined;
    }) => string;
    verifyIndex?: (current: string, notes: readonly BaseSepoliaReleaseNoteSource[], options?: {
      manifestContents?: string | undefined;
    }) => { passed: boolean; failures: string[] };
  }) => Promise<void>;
};

const WRITE_REPORT: ReleaseIndexCliReport = {
  output: "docs/releases/README.md",
  notes: 2,
  manifest: "deployments/base-sepolia/latest.json",
  written: true,
};

const CHECK_REPORT: ReleaseIndexCliReport = {
  output: "docs/releases/README.md",
  notes: 2,
  passed: false,
  failures: ["release index is stale"],
};

const NOTES: BaseSepoliaReleaseNoteSource[] = [
  { path: "2026-06-25-base.md", markdown: "# Base release 1\n" },
  { path: "2026-06-26-base.md", markdown: "# Base release 2\n" },
];

describe("formatReleaseIndexCliOutput", () => {
  it("keeps JSON release index output available for automation", () => {
    expect(formatReleaseIndexCliOutput(WRITE_REPORT, "json")).toBe(JSON.stringify(WRITE_REPORT, null, 2));
    expect(formatReleaseIndexCliOutput(CHECK_REPORT, "json")).toBe(JSON.stringify(CHECK_REPORT, null, 2));
  });

  it("renders readable release index summaries when requested", () => {
    expect(formatReleaseIndexCliOutput(WRITE_REPORT, "summary")).toBe([
      "Base Sepolia release index",
      "output: docs/releases/README.md",
      "notes: 2",
      "manifest: deployments/base-sepolia/latest.json",
      "written: true",
    ].join("\n"));

    expect(formatReleaseIndexCliOutput(CHECK_REPORT, "summary")).toBe([
      "Base Sepolia release index",
      "output: docs/releases/README.md",
      "notes: 2",
      "passed: false",
      "failures: 1",
      "- release index is stale",
    ].join("\n"));
  });

  it("rejects malformed release index reports before rendering", () => {
    expect(() => formatReleaseIndexCliOutput(null as unknown as ReleaseIndexCliReport, "json")).toThrow(
      "Release index report must be an object",
    );
    expect(() => formatReleaseIndexCliOutput({
      ...WRITE_REPORT,
      output: "",
    }, "json")).toThrow("Release index report output must not be empty");
    expect(() => formatReleaseIndexCliOutput({
      ...WRITE_REPORT,
      manifest: 123 as unknown as string,
    }, "json")).toThrow("Release index report manifest must be a string");
    expect(() => formatReleaseIndexCliOutput({
      ...WRITE_REPORT,
      notes: 1.5,
    }, "json")).toThrow("Release index report notes must be a non-negative integer");
  });

  it("rejects unsupported release index output formats before rendering", () => {
    expect(() => formatReleaseIndexCliOutput(
      WRITE_REPORT,
      "text" as unknown as "json",
    )).toThrow("Release index output format must be json or summary");
  });

  it("rejects malformed release index write and check states before rendering", () => {
    expect(() => formatReleaseIndexCliOutput({
      ...WRITE_REPORT,
      written: "true" as unknown as boolean,
    }, "json")).toThrow("Release index report written must be a boolean");
    expect(() => formatReleaseIndexCliOutput({
      ...CHECK_REPORT,
      passed: "false" as unknown as boolean,
    }, "json")).toThrow("Release index verification report passed must be a boolean");
    expect(() => formatReleaseIndexCliOutput({
      ...CHECK_REPORT,
      failures: "stale" as unknown as string[],
    }, "json")).toThrow("Release index verification report failures must be an array");
    expect(() => formatReleaseIndexCliOutput({
      ...CHECK_REPORT,
      failures: [""],
    }, "summary")).toThrow("Release index verification report failure 0 must not be empty");
  });
});

describe("isReleaseIndexDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;
    const scriptPath = resolve("runtime/cli/release/index.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isReleaseIndexDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isReleaseIndexDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isReleaseIndexDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/release/status.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/release/index.ts")).href;

    expect(() => module.isReleaseIndexDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isReleaseIndexDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseReleaseIndexCliArgs", () => {
  it("uses release index defaults", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;

    expect(module.parseReleaseIndexCliArgs?.([])).toEqual({
      releaseDir: "docs/releases",
      outputPath: "docs/releases/README.md",
      check: false,
      format: "json",
    });
  });

  it("parses split and equals-form release index flags", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;

    expect(module.parseReleaseIndexCliArgs?.([
      "--dir",
      "docs/custom-releases",
      "--output=docs/custom-releases/README.md",
      "--manifest",
      "deployments/base-sepolia/custom.json",
      "--check",
      "--format= summary ",
    ])).toEqual({
      releaseDir: "docs/custom-releases",
      outputPath: "docs/custom-releases/README.md",
      manifestPath: "deployments/base-sepolia/custom.json",
      check: true,
      format: "summary",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;

    expect(() => module.parseReleaseIndexCliArgs?.(["--dir", "a", "--dir", "b"])).toThrow(
      "Duplicate argument: --dir",
    );
    expect(() => module.parseReleaseIndexCliArgs?.(["--check", "--check"])).toThrow(
      "Duplicate argument: --check",
    );
    expect(() => module.parseReleaseIndexCliArgs?.(["--manifest"])).toThrow("--manifest requires a value");
    expect(() => module.parseReleaseIndexCliArgs?.(["--format", "text"])).toThrow(
      "--format must be json or summary",
    );
    expect(() => module.parseReleaseIndexCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });
});

describe("runReleaseIndexCli", () => {
  it("writes injected release indexes before emitting output", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runReleaseIndexCli?.({
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
      createIndex: (notes, options) => {
        calls.push(`create:${notes.length}:${options?.manifestContents ?? ""}`);
        return "# index\n";
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
      verifyIndex: () => {
        throw new Error("verifyIndex should not be called");
      },
    });

    expect(outputs).toEqual([
      formatReleaseIndexCliOutput({
        ...WRITE_REPORT,
        manifest: "manifest.json",
      }, "json"),
    ]);
    expect(calls).toEqual([
      "read:manifest.json",
      "notes:docs/releases",
      "create:2:manifest",
      "mkdir:docs/releases",
      "write:docs/releases/README.md:# index\n",
    ]);
  });

  it("sets exit code after failed injected check output", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runReleaseIndexCli?.({
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
      verifyIndex: (current, notes) => {
        calls.push(`verify:${current}:${notes.length}`);
        return { passed: false, failures: ["release index is stale"] };
      },
      createIndex: () => {
        throw new Error("createIndex should not be called");
      },
      mkdirp: async () => {
        throw new Error("mkdirp should not be called");
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([formatReleaseIndexCliOutput(CHECK_REPORT, "summary")]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual(["notes:docs/releases", "read:docs/releases/README.md", "verify:current:2"]);
  });

  it("rejects malformed arguments before release index reads or writes", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseIndexCli?.({
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
    const module = await import("./index.js") as ReleaseIndexCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseIndexCli?.({
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
      verifyIndex: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    })).rejects.toThrow("Release index note path must not be empty");
    expect(calls).toEqual(["notes"]);
  });

  it("rejects malformed generated release index markdown before writes or output", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseIndexCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      readReleaseNotes: async () => {
        calls.push("notes");
        return NOTES;
      },
      createIndex: () => {
        calls.push("create");
        return "";
      },
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Release index markdown must not be empty");
    expect(calls).toEqual(["notes", "create"]);
  });

  it("rejects malformed injected verifier reports before output or exit-code mutation", async () => {
    const module = await import("./index.js") as ReleaseIndexCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseIndexCli?.({
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
      verifyIndex: () => {
        calls.push("verify");
        return { passed: "no", failures: [] } as unknown as { passed: boolean; failures: string[] };
      },
    })).rejects.toThrow("Release index verification report passed must be a boolean");
    expect(calls).toEqual(["notes", "read", "verify"]);
  });
});
