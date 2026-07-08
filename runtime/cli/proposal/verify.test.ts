import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalVerifyCliModule = typeof import("./verify.js") & {
  isProposalVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalVerifyCliArgs?: (argv: readonly string[]) => {
    proposalPath: string;
  };
  runProposalVerifyCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    verifyProposal?: (json: string) => ProposalVerificationFixture;
  }) => Promise<void>;
};

interface ProposalVerificationFixture {
  passed: boolean;
  failures: readonly string[];
  source: string;
  sourcePath: string;
  chainId: number;
  executable: boolean;
  steps: number;
  transactions: number;
}

const VERIFICATION: ProposalVerificationFixture = {
  passed: true,
  failures: [],
  source: "plan",
  sourcePath: "artifacts/plan.json",
  chainId: 84532,
  executable: true,
  steps: 1,
  transactions: 1,
};

describe("isProposalVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposal/verify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposal/summary.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposal/verify.ts")).href;

    expect(() => module.isProposalVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalVerifyCliArgs", () => {
  it("requires a proposal path", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;

    expect(() => module.parseProposalVerifyCliArgs?.([])).toThrow("--proposal is required");
  });

  it("parses split and equals-form proposal verification flags", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;

    expect(module.parseProposalVerifyCliArgs?.(["--proposal= artifacts/proposal.json "])).toEqual({
      proposalPath: "artifacts/proposal.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;

    expect(() => module.parseProposalVerifyCliArgs?.(["--proposal", "a.json", "--proposal", "b.json"])).toThrow(
      "Duplicate argument: --proposal",
    );
    expect(() => module.parseProposalVerifyCliArgs?.(["--proposal"])).toThrow("--proposal requires a value");
    expect(() => module.parseProposalVerifyCliArgs?.(["--proposal", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalVerifyCli", () => {
  it("prints injected proposal verification reports", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalVerifyCli?.({
      argv: ["--proposal", "artifacts/proposal.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "{\"proposal\":true}";
      },
      verifyProposal: (json) => {
        calls.push(`verify:${json}`);
        return VERIFICATION;
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      proposal: "artifacts/proposal.json",
      ...VERIFICATION,
    }, null, 2)]);
    expect(calls).toEqual(["read:artifacts/proposal.json", "verify:{\"proposal\":true}"]);
  });

  it("sets exit code after failed proposal verification output", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalVerifyCli?.({
      argv: ["--proposal", "artifacts/proposal.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyProposal: () => ({
        ...VERIFICATION,
        passed: false,
        failures: ["executable proposals must include transaction payloads for every step"],
      }),
    });

    expect(outputs).toEqual([JSON.stringify({
      proposal: "artifacts/proposal.json",
      ...VERIFICATION,
      passed: false,
      failures: ["executable proposals must include transaction payloads for every step"],
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyProposal: () => {
        calls.push("verify");
        return VERIFICATION;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected verification reports before output or exit-code mutation", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalVerifyCli?.({
      argv: ["--proposal", "artifacts/proposal.json"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      verifyProposal: () => ({
        ...VERIFICATION,
        passed: false,
        failures: "none",
      } as unknown as ProposalVerificationFixture),
    })).rejects.toThrow("Proposal verification report failures must be an array");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected verification metadata before output", async () => {
    const module = await import("./verify.js") as ProposalVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalVerifyCli?.({
      argv: ["--proposal", "artifacts/proposal.json"],
      writeOutput: () => calls.push("output"),
      readText: async () => "{}",
      verifyProposal: () => ({
        ...VERIFICATION,
        transactions: Number.NaN,
      }),
    })).rejects.toThrow("Proposal verification report transactions must be a number");
    expect(calls).toEqual([]);
  });
});
