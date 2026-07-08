import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionPreflightCliModule = typeof import("./preflight.js") & {
  isProposalExecutionPreflightDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionPreflightCliArgs?: (argv: readonly string[]) => PreflightCliArgs;
  runProposalExecutionPreflightCli?: (options?: PreflightRunnerOptions) => Promise<void>;
};

interface PreflightCliArgs {
  previewPath: string;
  runbookPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface PreflightRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPreflight?: (params: unknown) => PreflightReport;
}

interface PreflightReport {
  passed: boolean;
  checks: readonly unknown[];
}

const PREFLIGHT_ARGS = [
  "--preview",
  "artifacts/preview.json",
  "--runbook",
  "artifacts/runbook.md",
  "--bundle",
  "artifacts/bundle.json",
  "--approval",
  "artifacts/approval.json",
  "--manifest",
  "artifacts/manifest.json",
  "--proposal",
  "artifacts/proposal.json",
  "--summary",
  "artifacts/summary.md",
] as const;

describe("isProposalExecutionPreflightDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/preflight.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionPreflightDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionPreflightDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionPreflightDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/bundle.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/preflight.ts")).href;

    expect(() => module.isProposalExecutionPreflightDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionPreflightCliArgs", () => {
  it("requires preview, runbook, bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;

    expect(() => module.parseProposalExecutionPreflightCliArgs?.([])).toThrow("--preview is required");
    expect(() => module.parseProposalExecutionPreflightCliArgs?.(["--preview", "preview.json"])).toThrow(
      "--runbook is required",
    );
  });

  it("parses split and equals-form proposal execution preflight flags", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;

    expect(module.parseProposalExecutionPreflightCliArgs?.([
      "--preview=artifacts/preview.json",
      "--runbook",
      "artifacts/runbook.md",
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      previewPath: "artifacts/preview.json",
      runbookPath: "artifacts/runbook.md",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;

    expect(() => module.parseProposalExecutionPreflightCliArgs?.([
      "--preview",
      "a.json",
      "--preview",
      "b.json",
    ])).toThrow("Duplicate argument: --preview");
    expect(() => module.parseProposalExecutionPreflightCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionPreflightCliArgs?.(["--preview", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionPreflightCli", () => {
  it("prints injected proposal execution preflight reports", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const report: PreflightReport = {
      passed: true,
      checks: [{ name: "execution-package", passed: true, failures: [] }],
    };

    await module.runProposalExecutionPreflightCli?.({
      argv: PREFLIGHT_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyPreflight: (params) => {
        calls.push(`verify:${typeof params}`);
        return report;
      },
    });

    expect(outputs).toEqual([JSON.stringify(report, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/preview.json",
      "read:artifacts/runbook.md",
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed preflight output", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const report: PreflightReport = {
      passed: false,
      checks: [{ name: "execution-package", passed: false, failures: ["bundle verification failed"] }],
    };

    await module.runProposalExecutionPreflightCli?.({
      argv: PREFLIGHT_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPreflight: () => report,
    });

    expect(outputs).toEqual([JSON.stringify(report, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or preflight verification", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionPreflightCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyPreflight: () => {
        calls.push("verify");
        return { passed: true, checks: [] };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected preflight reports before output or exit-code mutation", async () => {
    const module = await import("./preflight.js") as ProposalExecutionPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionPreflightCli?.({
      argv: PREFLIGHT_ARGS,
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      verifyPreflight: () => ({
        passed: false,
        checks: "none",
      } as unknown as PreflightReport),
    })).rejects.toThrow("Proposal execution preflight report checks must be an array");
    expect(calls).toEqual([]);
  });
});
