import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatReleaseStatusVerifyCliOutput } from "./statusVerify.js";

import type { ReleaseStatusVerifyCliReport } from "./statusVerify.js";

type ReleaseStatusVerifyCliModule = typeof import("./statusVerify.js") & {
  isReleaseStatusVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseReleaseStatusVerifyCliArgs?: (argv: readonly string[]) => {
    statusPath: string;
    format: "json" | "summary";
  };
  runReleaseStatusVerifyCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    verifyStatus?: (json: string) => { passed: boolean; failures: string[] };
  }) => Promise<void>;
};

const REPORT: ReleaseStatusVerifyCliReport = {
  status: "docs/releases/latest.json",
  passed: false,
  failures: [
    "latest.commitSha must be a 40-character hex string",
    "releaseCount must equal releases length",
  ],
};

describe("formatReleaseStatusVerifyCliOutput", () => {
  it("keeps JSON release status verification output available for automation", () => {
    expect(formatReleaseStatusVerifyCliOutput(REPORT, "json")).toBe(JSON.stringify(REPORT, null, 2));
  });

  it("renders a readable release status verification summary when requested", () => {
    expect(formatReleaseStatusVerifyCliOutput(REPORT, "summary")).toBe([
      "Base Sepolia release status verification",
      "status: docs/releases/latest.json",
      "passed: false",
      "failures: 2",
      "- latest.commitSha must be a 40-character hex string",
      "- releaseCount must equal releases length",
    ].join("\n"));
  });

  it("rejects malformed release status verification reports before rendering", () => {
    expect(() => formatReleaseStatusVerifyCliOutput(
      null as unknown as ReleaseStatusVerifyCliReport,
      "json",
    )).toThrow("Release status verification report must be an object");
    expect(() => formatReleaseStatusVerifyCliOutput({
      ...REPORT,
      status: "",
    }, "json")).toThrow("Release status verification report status must not be empty");
    expect(() => formatReleaseStatusVerifyCliOutput({
      ...REPORT,
      passed: "false" as unknown as boolean,
    }, "json")).toThrow("Release status verification report passed must be a boolean");
  });

  it("rejects unsupported release status verification output formats before rendering", () => {
    expect(() => formatReleaseStatusVerifyCliOutput(
      REPORT,
      "text" as unknown as "json",
    )).toThrow("Release status verification output format must be json or summary");
  });

  it("rejects malformed release status verification failure lists before rendering", () => {
    expect(() => formatReleaseStatusVerifyCliOutput({
      ...REPORT,
      failures: "bad" as unknown as string[],
    }, "json")).toThrow("Release status verification report failures must be an array");
    expect(() => formatReleaseStatusVerifyCliOutput({
      ...REPORT,
      failures: [123 as unknown as string],
    }, "json")).toThrow("Release status verification report failure 0 must be a string");
    expect(() => formatReleaseStatusVerifyCliOutput({
      ...REPORT,
      failures: [""],
    }, "summary")).toThrow("Release status verification report failure 0 must not be empty");
  });
});

describe("isReleaseStatusVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;
    const scriptPath = resolve("runtime/cli/release/statusVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isReleaseStatusVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isReleaseStatusVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isReleaseStatusVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/release/status.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/release/statusVerify.ts")).href;

    expect(() => module.isReleaseStatusVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isReleaseStatusVerifyDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseReleaseStatusVerifyCliArgs", () => {
  it("uses release status verification defaults", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;

    expect(module.parseReleaseStatusVerifyCliArgs?.([])).toEqual({
      statusPath: "docs/releases/latest.json",
      format: "json",
    });
  });

  it("parses split and equals-form release status verification flags", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;

    expect(module.parseReleaseStatusVerifyCliArgs?.([
      "--status",
      "docs/releases/custom.json",
      "--format= summary ",
    ])).toEqual({
      statusPath: "docs/releases/custom.json",
      format: "summary",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;

    expect(() => module.parseReleaseStatusVerifyCliArgs?.(["--status", "a.json", "--status", "b.json"])).toThrow(
      "Duplicate argument: --status",
    );
    expect(() => module.parseReleaseStatusVerifyCliArgs?.(["--status"])).toThrow("--status requires a value");
    expect(() => module.parseReleaseStatusVerifyCliArgs?.(["--format", "text"])).toThrow(
      "--format must be json or summary",
    );
    expect(() => module.parseReleaseStatusVerifyCliArgs?.(["--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runReleaseStatusVerifyCli", () => {
  it("verifies injected status JSON and writes formatted output", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runReleaseStatusVerifyCli?.({
      argv: ["--status", "docs/releases/custom.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "{\"releaseCount\":1}";
      },
      verifyStatus: (json) => {
        calls.push(`verify:${json}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([
      formatReleaseStatusVerifyCliOutput({
        status: "docs/releases/custom.json",
        passed: true,
        failures: [],
      }, "json"),
    ]);
    expect(calls).toEqual(["read:docs/releases/custom.json", "verify:{\"releaseCount\":1}"]);
  });

  it("sets exit code after failed injected verification output", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runReleaseStatusVerifyCli?.({
      argv: ["--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{\"bad\":true}",
      verifyStatus: () => ({ passed: false, failures: REPORT.failures }),
    });

    expect(outputs).toEqual([formatReleaseStatusVerifyCliOutput(REPORT, "summary")]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before status reads", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseStatusVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed status JSON before verifier calls", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseStatusVerifyCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyStatus: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    })).rejects.toThrow("Release status JSON must not be empty");
    expect(calls).toEqual(["read"]);
  });

  it("rejects malformed injected verifier reports before output or exit-code mutation", async () => {
    const module = await import("./statusVerify.js") as ReleaseStatusVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseStatusVerifyCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => {
        calls.push("read");
        return "{}";
      },
      verifyStatus: () => {
        calls.push("verify");
        return { passed: "no", failures: [] } as unknown as { passed: boolean; failures: string[] };
      },
    })).rejects.toThrow("Release status verification report passed must be a boolean");
    expect(calls).toEqual(["read", "verify"]);
  });
});
