import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { runInjectedOrDefault } from "./runnerShared.js";

const AGENT = "0x1111111111111111111111111111111111111111";
const ASSIGNEE = "0x2222222222222222222222222222222222222222";
const DIRECTORY = "0x3333333333333333333333333333333333333333";
const COORDINATION = "0x4444444444444444444444444444444444444444";
const OWNER = "0x5555555555555555555555555555555555555555";
const CAPABILITIES = "0x6666666666666666666666666666666666666666";
const POLICY_ENGINE = "0x7777777777777777777777777777777777777777";
const REPUTATION_REGISTRY = "0x8888888888888888888888888888888888888888";
const MEMORY_REGISTRY = "0x9999999999999999999999999999999999999999";
const REPUTATION_HISTORY = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TRANSACTION = { to: AGENT, value: "0", data: "0x1234" };
const PROFILE = {
  roleHash: HASH,
  metadataURIHash: HASH,
  active: true,
  registered: true,
};
const COMMITMENT = { roleHash: HASH, metadataURIHash: HASH };

const parseAgentCoreRunnerArgs = (argv: readonly string[]) => ({ first: argv[0] ?? "" });

describe("agent-core CLI seams", () => {
  it("hardens directory parsing and injected output", async () => {
    const module = await import("./directory.js");
    const scriptPath = resolve("runtime/cli/agentCore/directory.ts");
    const outputs: string[] = [];

    expect(module.isAgentDirectoryDirectRun(pathToFileURL(scriptPath).href, ["node", scriptPath])).toBe(true);
    expect(module.parseAgentDirectoryCliArgs([
      "--send",
      "--register",
      "--manifest=custom.json",
      "--role-label", "agent.role",
      "--metadata-uri", "memory://profile",
    ])).toEqual({
      send: true,
      register: true,
      activate: false,
      deactivate: false,
      manifestPath: "custom.json",
      roleLabel: "agent.role",
      metadataURI: "memory://profile",
    });
    expect(() => module.parseAgentDirectoryCliArgs(["--register", "--activate"]))
      .toThrow("Choose only one operation: --register, --activate, or --deactivate");

    await module.runAgentDirectoryCli({
      argv: ["--register"],
      writeOutput: (output: string) => outputs.push(output),
      executeCommand: async () => ({
        output: {
          mode: "dry-run",
          chainId: 84532,
          directory: DIRECTORY,
          owner: OWNER,
          ownerMatchesManifest: true,
          agent: AGENT,
          roleLabel: "agent.role",
          metadataURI: "memory://profile",
          desired: COMMITMENT,
          profile: PROFILE,
          operation: "register",
          transaction: TRANSACTION,
          simulation: "passed",
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ directory: DIRECTORY, operation: "register" });
  });

  it("hardens directory safety reports", async () => {
    const module = await import("./directorySafetyCheck.js");
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    expect(module.parseAgentDirectorySafetyCheckCliArgs(["--manifest=custom.json"])).toEqual({ manifestPath: "custom.json" });

    await module.runAgentDirectorySafetyCheckCli({
      writeOutput: (output: string) => outputs.push(output),
      setExitCode: (code: number) => exitCodes.push(code),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          directory: DIRECTORY,
          owner: OWNER,
          agent: AGENT,
          roleLabel: "agent.role",
          metadataURI: "memory://profile",
          desired: COMMITMENT,
          profile: PROFILE,
          checks: { registerCallable: false },
        },
        exitCode: 1,
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ checks: { registerCallable: false } });
    expect(exitCodes).toEqual([1]);
  });

  it("hardens account parsing and injected output", async () => {
    const module = await import("./account.js");
    const outputs: string[] = [];

    expect(module.parseAgentAccountCliArgs(["--send", "--manifest", "custom.json", "--delegate", AGENT]))
      .toEqual({ send: true, manifestPath: "custom.json", delegate: AGENT, pause: false, unpause: false });
    expect(() => module.parseAgentAccountCliArgs(["--pause", "--unpause"]))
      .toThrow("Choose only one operation: --delegate, --pause, or --unpause");

    await module.runAgentAccountCli({
      argv: ["--pause"],
      writeOutput: (output: string) => outputs.push(output),
      executeCommand: async () => ({
        output: {
          mode: "dry-run",
          chainId: 84532,
          agent: AGENT,
          owner: OWNER,
          paused: false,
          capabilities: CAPABILITIES,
          policyEngine: POLICY_ENGINE,
          reputationRegistry: REPUTATION_REGISTRY,
          reputation: "1",
          operation: "pause",
          transaction: TRANSACTION,
          simulation: "passed",
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ agent: AGENT, operation: "pause" });
  });

  it("hardens account safety reports", async () => {
    const module = await import("./accountSafetyCheck.js");
    const outputs: string[] = [];

    expect(module.parseAgentAccountSafetyCheckCliArgs(["--manifest", "custom.json"])).toEqual({ manifestPath: "custom.json" });

    await module.runAgentAccountSafetyCheckCli({
      writeOutput: (output: string) => outputs.push(output),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          agent: AGENT,
          owner: OWNER,
          paused: false,
          capabilities: CAPABILITIES,
          policyEngine: POLICY_ENGINE,
          reputationRegistry: REPUTATION_REGISTRY,
          reputation: "1",
          checks: { pauseCallable: true },
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ checks: { pauseCallable: true } });
  });

  it("hardens coordination parsing and injected receipt output", async () => {
    const module = await import("./coordination.js");
    const outputs: string[] = [];

    expect(module.parseAgentCoordinationCliArgs([
      "--send",
      "--assign",
      "--manifest=custom.json",
      "--assigner", AGENT,
      "--assignee", ASSIGNEE,
      "--task-label", "task",
      "--context-uri=agentos://context",
      "--result-uri", "agentos://result",
      "--cancellation-uri", "agentos://cancel",
      "--result-memory-id-label", "memory.label",
      "--result-content", "content",
      "--result-storage-uri", "memory://result",
      "--amount-eth", "0.01",
      "--assignment-id", "7",
      "--payout-tx-hash", HASH,
    ])).toMatchObject({
      send: true,
      action: "assign",
      manifestPath: "custom.json",
      assigner: AGENT,
      assignee: ASSIGNEE,
      assignmentId: "7",
      payoutTxHash: HASH,
    });
    expect(() => module.parseAgentCoordinationCliArgs(["--assign", "--accept"]))
      .toThrow("choose only one action");

    await module.runAgentCoordinationCli({
      argv: ["--send", "--assign"],
      writeOutput: (output: string) => outputs.push(output),
      executeCommand: async () => ({
        output: {
          mode: "send",
          chainId: 84532,
          agent: AGENT,
          coordination: COORDINATION,
          owner: OWNER,
          directory: DIRECTORY,
          linkedDirectory: DIRECTORY,
          memoryRegistry: MEMORY_REGISTRY,
          linkedMemoryRegistry: MEMORY_REGISTRY,
          reputationHistory: REPUTATION_HISTORY,
          assigner: AGENT,
          assignee: ASSIGNEE,
          assignmentCount: "0",
          transaction: TRANSACTION,
          operation: "assign",
          policyDecision: null,
          executionSimulation: "passed",
          hash: HASH,
          receipt: { blockNumber: "123", status: "success" },
          nextAssignmentCount: "1",
          nextSelectedAssignmentId: "0",
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ coordination: COORDINATION, hash: HASH });
  });

  it("hardens coordination safety reports", async () => {
    const module = await import("./coordinationSafetyCheck.js");
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    expect(module.parseAgentCoordinationSafetyCheckCliArgs(["--manifest=custom.json"])).toEqual({ manifestPath: "custom.json" });

    await module.runAgentCoordinationSafetyCheckCli({
      writeOutput: (output: string) => outputs.push(output),
      setExitCode: (code: number) => exitCodes.push(code),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          coordination: COORDINATION,
          owner: OWNER,
          directory: DIRECTORY,
          linkedDirectory: DIRECTORY,
          memoryRegistry: MEMORY_REGISTRY,
          linkedMemoryRegistry: MEMORY_REGISTRY,
          reputationHistory: REPUTATION_HISTORY,
          assigner: AGENT,
          assignee: ASSIGNEE,
          assignmentCount: "0",
          checks: { assignmentCallable: false },
        },
        exitCode: 1,
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ checks: { assignmentCallable: false } });
    expect(exitCodes).toEqual([1]);
  });
});

describe("agent-core command-specific injected report guards", () => {
  it("rejects malformed directory reports before output", async () => {
    const module = await import("./directory.js");
    const calls: string[] = [];

    await expect(module.runAgentDirectoryCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({ output: { mode: "dry-run", directory: DIRECTORY } }),
    })).rejects.toThrow("Agent directory report chainId must be a number");

    await expect(module.runAgentDirectoryCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          mode: "dry-run",
          chainId: 84532,
          directory: DIRECTORY,
          owner: OWNER,
          ownerMatchesManifest: true,
          agent: AGENT,
          profile: PROFILE,
          transaction: { ...TRANSACTION, data: 123 },
        },
      }),
    })).rejects.toThrow("Agent directory transaction data must be a string");

    expect(calls).toEqual([]);
  });

  it("rejects malformed directory safety reports before output", async () => {
    const module = await import("./directorySafetyCheck.js");
    const calls: string[] = [];

    await expect(module.runAgentDirectorySafetyCheckCli({
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          directory: DIRECTORY,
          owner: OWNER,
          agent: AGENT,
          profile: PROFILE,
          checks: { registerCallable: "no" },
        },
        exitCode: 1,
      }),
    })).rejects.toThrow("Agent directory safety checks values must be booleans");

    expect(calls).toEqual([]);
  });

  it("rejects malformed account reports before output", async () => {
    const module = await import("./account.js");
    const calls: string[] = [];

    await expect(module.runAgentAccountCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          mode: "dry-run",
          chainId: 84532,
          agent: AGENT,
          owner: OWNER,
          paused: "false",
        },
      }),
    })).rejects.toThrow("Agent account report paused must be a boolean");

    expect(calls).toEqual([]);
  });

  it("rejects malformed account safety reports before output", async () => {
    const module = await import("./accountSafetyCheck.js");
    const calls: string[] = [];

    await expect(module.runAgentAccountSafetyCheckCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          agent: AGENT,
          owner: OWNER,
          paused: false,
          capabilities: CAPABILITIES,
          policyEngine: POLICY_ENGINE,
          reputationRegistry: REPUTATION_REGISTRY,
          reputation: 1,
          checks: { pauseCallable: true },
        },
      }),
    })).rejects.toThrow("Agent account safety reputation must be a string");

    expect(calls).toEqual([]);
  });

  it("rejects malformed coordination reports before output", async () => {
    const module = await import("./coordination.js");
    const calls: string[] = [];

    await expect(module.runAgentCoordinationCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          mode: "send",
          chainId: 84532,
          agent: AGENT,
          coordination: COORDINATION,
          owner: OWNER,
          directory: DIRECTORY,
          linkedDirectory: DIRECTORY,
          memoryRegistry: MEMORY_REGISTRY,
          linkedMemoryRegistry: MEMORY_REGISTRY,
          reputationHistory: REPUTATION_HISTORY,
          assigner: AGENT,
          assignee: ASSIGNEE,
          assignmentCount: "0",
          transaction: TRANSACTION,
          executionSimulation: "passed",
          hash: HASH,
          receipt: { status: "success" },
        },
      }),
    })).rejects.toThrow("Agent coordination receipt blockNumber must be a string");

    expect(calls).toEqual([]);
  });

  it("rejects malformed coordination safety reports before output", async () => {
    const module = await import("./coordinationSafetyCheck.js");
    const calls: string[] = [];

    await expect(module.runAgentCoordinationSafetyCheckCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          coordination: COORDINATION,
          owner: OWNER,
          directory: DIRECTORY,
          linkedDirectory: DIRECTORY,
          memoryRegistry: MEMORY_REGISTRY,
          linkedMemoryRegistry: MEMORY_REGISTRY,
          reputationHistory: REPUTATION_HISTORY,
          assigner: AGENT,
          assignee: ASSIGNEE,
          assignmentCount: "0",
          checks: [],
        },
      }),
    })).rejects.toThrow("Agent coordination safety checks must be an object");

    expect(calls).toEqual([]);
  });
});

describe("agent-core shared injected runner guards", () => {
  it("rejects malformed runner options and argv before command execution", async () => {
    const calls: string[] = [];

    await expect(runInjectedOrDefault(
      null as never,
      parseAgentCoreRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Agent Core runner options must be an object");
    await expect(runInjectedOrDefault(
      { argv: "bad", executeCommand: async () => ({ output: { ok: true } }) } as never,
      parseAgentCoreRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("CLI argv must be an array of strings");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected dependencies before command execution", async () => {
    const calls: string[] = [];

    await expect(runInjectedOrDefault(
      {
        argv: [],
        writeOutput: "bad" as never,
        executeCommand: async () => {
          calls.push("execute");
          return { output: { ok: true } };
        },
      },
      parseAgentCoreRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Output writer must be a function");
    await expect(runInjectedOrDefault(
      { argv: [], executeCommand: "bad" as never },
      parseAgentCoreRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Injected command executor must be a function");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected command results before output", async () => {
    const calls: string[] = [];

    await expect(runInjectedOrDefault(
      {
        argv: [],
        writeOutput: () => calls.push("output"),
        executeCommand: async () => null as never,
      },
      parseAgentCoreRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Injected command result must be an object");
    await expect(runInjectedOrDefault(
      {
        argv: [],
        writeOutput: () => calls.push("output"),
        executeCommand: async () => ({ output: undefined }),
      },
      parseAgentCoreRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Injected command output must not be undefined");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected exit codes before output or exit mutation", async () => {
    const calls: string[] = [];

    await expect(runInjectedOrDefault(
      {
        argv: [],
        writeOutput: () => calls.push("output"),
        setExitCode: () => calls.push("exit"),
        executeCommand: async () => ({ output: { ok: true }, exitCode: 1.5 }),
      },
      parseAgentCoreRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Injected command exitCode must be an integer from 0 to 255");
    expect(calls).toEqual([]);
  });

  it("rejects non-JSON-serializable injected output before output", async () => {
    const calls: string[] = [];

    await expect(runInjectedOrDefault(
      {
        argv: [],
        writeOutput: () => calls.push("output"),
        executeCommand: async () => ({ output: 1n }),
      },
      parseAgentCoreRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Injected command output must be JSON serializable");
    expect(calls).toEqual([]);
  });
});
