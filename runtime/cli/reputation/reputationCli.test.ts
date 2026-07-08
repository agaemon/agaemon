import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { runInjectedOrDefault } from "./runnerShared.js";

const AGENT = "0x1111111111111111111111111111111111111111";
const REGISTRY = "0x3333333333333333333333333333333333333333";
const HISTORY = "0x4444444444444444444444444444444444444444";
const OWNER = "0x5555555555555555555555555555555555555555";
const HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TRANSACTION = { to: REGISTRY, value: "0", data: "0x1234" };

const parseReputationRunnerArgs = (argv: readonly string[]) => ({ first: argv[0] ?? "" });

describe("reputation CLI seams", () => {
  it("hardens reputation registry parsing and injected output", async () => {
    const module = await import("./registry.js");
    const scriptPath = resolve("runtime/cli/reputation/registry.ts");
    const outputs: string[] = [];

    expect(module.isReputationRegistryDirectRun(pathToFileURL(scriptPath).href, ["node", scriptPath])).toBe(true);
    expect(module.parseReputationRegistryCliArgs([
      "--send",
      "--manifest=custom.json",
      "--agent", AGENT,
      "--delta", "-2",
    ])).toEqual({ send: true, manifestPath: "custom.json", agent: AGENT, delta: "-2" });
    expect(() => module.parseReputationRegistryCliArgs(["--delta"])).toThrow("--delta requires a value");

    await module.runReputationRegistryCli({
      argv: ["--delta", "1"],
      writeOutput: (output: string) => outputs.push(output),
      executeCommand: async () => ({
        output: {
          mode: "dry-run",
          chainId: 84532,
          registry: REGISTRY,
          agent: AGENT,
          owner: OWNER,
          ownerMatchesManifest: true,
          score: "1",
          transaction: TRANSACTION,
          simulation: "passed",
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ registry: REGISTRY, simulation: "passed" });
  });

  it("hardens reputation registry safety reports", async () => {
    const module = await import("./registrySafetyCheck.js");
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    expect(module.parseReputationRegistrySafetyCheckCliArgs(["--manifest=custom.json"])).toEqual({ manifestPath: "custom.json" });

    await module.runReputationRegistrySafetyCheckCli({
      writeOutput: (output: string) => outputs.push(output),
      setExitCode: (code: number) => exitCodes.push(code),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          registry: REGISTRY,
          agent: AGENT,
          owner: OWNER,
          score: "1",
          checks: { positiveAdjustmentCallable: false },
        },
        exitCode: 1,
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ checks: { positiveAdjustmentCallable: false } });
    expect(exitCodes).toEqual([1]);
  });

  it("hardens reputation history parsing and injected output", async () => {
    const module = await import("./history.js");
    const outputs: string[] = [];

    expect(module.parseReputationHistoryCliArgs([
      "--send",
      "--record",
      "--manifest", "custom.json",
      "--agent", AGENT,
      "--action-label=action",
      "--evidence-uri", "agentos://evidence",
      "--delta", "3",
      "--outcome-action-label", "outcome",
      "--assignment-id=7",
    ])).toEqual({
      send: true,
      record: true,
      recordCoordinationOutcome: false,
      manifestPath: "custom.json",
      agent: AGENT,
      actionLabel: "action",
      evidenceURI: "agentos://evidence",
      delta: "3",
      outcomeActionLabel: "outcome",
      assignmentId: "7",
    });
    expect(() => module.parseReputationHistoryCliArgs(["--record", "--record-coordination-outcome"]))
      .toThrow("choose only one action: --record or --record-coordination-outcome");

    await module.runReputationHistoryCli({
      argv: ["--record"],
      writeOutput: (output: string) => outputs.push(output),
      executeCommand: async () => ({
        output: {
          mode: "dry-run",
          chainId: 84532,
          history: HISTORY,
          owner: OWNER,
          directory: REGISTRY,
          linkedDirectory: REGISTRY,
          agent: AGENT,
          eventCount: "0",
          transaction: TRANSACTION,
          operation: "record",
          scoreDelta: "1",
          simulation: "passed",
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ history: HISTORY, operation: "record" });
  });

  it("hardens reputation history safety reports", async () => {
    const module = await import("./historySafetyCheck.js");
    const outputs: string[] = [];

    expect(module.parseReputationHistorySafetyCheckCliArgs(["--manifest", "custom.json"])).toEqual({ manifestPath: "custom.json" });

    await module.runReputationHistorySafetyCheckCli({
      writeOutput: (output: string) => outputs.push(output),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          history: HISTORY,
          owner: OWNER,
          directory: REGISTRY,
          linkedDirectory: REGISTRY,
          agent: AGENT,
          eventCount: "0",
          checks: { recordCallable: true },
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ checks: { recordCallable: true } });
  });

  it("hardens reputation score sync parsing and injected receipt output", async () => {
    const module = await import("./scoreSync.js");
    const outputs: string[] = [];

    expect(module.parseReputationScoreSyncCliArgs(["--send", "--manifest=custom.json", "--agent", AGENT]))
      .toEqual({ send: true, manifestPath: "custom.json", agent: AGENT });
    expect(() => module.parseReputationScoreSyncCliArgs(["--unknown"])).toThrow("Unsupported argument: --unknown");

    await module.runReputationScoreSyncCli({
      argv: ["--send"],
      writeOutput: (output: string) => outputs.push(output),
      executeCommand: async () => ({
        output: {
          mode: "send",
          chainId: 84532,
          registry: REGISTRY,
          history: HISTORY,
          agent: AGENT,
          registryOwner: OWNER,
          registryScore: "1",
          historyScore: "2",
          syncDelta: "1",
          eventCount: "1",
          transaction: TRANSACTION,
          simulation: "passed",
          hash: HASH,
          receipt: { blockNumber: "123", status: "success" },
          nextScore: "2",
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ hash: HASH, receipt: { status: "success" } });
  });

  it("hardens reputation score sync safety reports", async () => {
    const module = await import("./scoreSyncSafetyCheck.js");
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    expect(module.parseReputationScoreSyncSafetyCheckCliArgs(["--manifest", "custom.json", "--agent", AGENT]))
      .toEqual({ manifestPath: "custom.json", agent: AGENT });

    await module.runReputationScoreSyncSafetyCheckCli({
      writeOutput: (output: string) => outputs.push(output),
      setExitCode: (code: number) => exitCodes.push(code),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          registry: REGISTRY,
          history: HISTORY,
          agent: AGENT,
          registryOwner: OWNER,
          historyOwner: OWNER,
          registryScore: "1",
          historyScore: "2",
          syncDelta: "1",
          eventCount: "1",
          checks: { syncCallable: false },
        },
        exitCode: 1,
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ checks: { syncCallable: false } });
    expect(exitCodes).toEqual([1]);
  });
});

describe("reputation command-specific injected report guards", () => {
  it("rejects malformed reputation registry reports before output", async () => {
    const module = await import("./registry.js");
    const calls: string[] = [];

    await expect(module.runReputationRegistryCli({
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      executeCommand: async () => ({ output: { mode: "dry-run", registry: REGISTRY } }),
    })).rejects.toThrow("Reputation registry report chainId must be a number");

    await expect(module.runReputationRegistryCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          mode: "dry-run",
          chainId: 84532,
          registry: REGISTRY,
          agent: AGENT,
          owner: OWNER,
          ownerMatchesManifest: true,
          score: "1",
          transaction: { ...TRANSACTION, value: 0 },
        },
      }),
    })).rejects.toThrow("Reputation registry transaction value must be a string");

    expect(calls).toEqual([]);
  });

  it("rejects malformed reputation registry safety reports before output", async () => {
    const module = await import("./registrySafetyCheck.js");
    const calls: string[] = [];

    await expect(module.runReputationRegistrySafetyCheckCli({
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          registry: REGISTRY,
          agent: AGENT,
          owner: OWNER,
          score: "1",
          checks: { positiveAdjustmentCallable: "yes" },
        },
        exitCode: 1,
      }),
    })).rejects.toThrow("Reputation registry safety checks values must be booleans");

    expect(calls).toEqual([]);
  });

  it("rejects malformed reputation history reports before output", async () => {
    const module = await import("./history.js");
    const calls: string[] = [];

    await expect(module.runReputationHistoryCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          mode: "send",
          chainId: 84532,
          history: HISTORY,
          owner: OWNER,
          directory: REGISTRY,
          linkedDirectory: REGISTRY,
          agent: AGENT,
          eventCount: "0",
          transaction: TRANSACTION,
          simulation: "passed",
          hash: HASH,
          receipt: { status: "success" },
        },
      }),
    })).rejects.toThrow("Reputation history receipt blockNumber must be a string");

    expect(calls).toEqual([]);
  });

  it("rejects malformed reputation history safety reports before output", async () => {
    const module = await import("./historySafetyCheck.js");
    const calls: string[] = [];

    await expect(module.runReputationHistorySafetyCheckCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          history: HISTORY,
          owner: OWNER,
          directory: REGISTRY,
          linkedDirectory: REGISTRY,
          agent: AGENT,
          eventCount: "0",
          checks: [],
        },
      }),
    })).rejects.toThrow("Reputation history safety checks must be an object");

    expect(calls).toEqual([]);
  });

  it("rejects malformed reputation score-sync reports before output", async () => {
    const module = await import("./scoreSync.js");
    const calls: string[] = [];

    await expect(module.runReputationScoreSyncCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          mode: "dry-run",
          chainId: 84532,
          registry: REGISTRY,
          history: HISTORY,
          agent: AGENT,
          registryOwner: OWNER,
          registryScore: "1",
          historyScore: "2",
          syncDelta: "1",
          eventCount: "1",
          transaction: null,
          simulation: "not-required",
          hash: HASH,
        },
      }),
    })).rejects.toThrow("Reputation score sync hash is only valid with a transaction receipt");

    expect(calls).toEqual([]);
  });

  it("rejects malformed reputation score-sync safety reports before output", async () => {
    const module = await import("./scoreSyncSafetyCheck.js");
    const calls: string[] = [];

    await expect(module.runReputationScoreSyncSafetyCheckCli({
      writeOutput: () => calls.push("output"),
      executeCommand: async () => ({
        output: {
          chainId: 84532,
          registry: REGISTRY,
          history: HISTORY,
          agent: AGENT,
          registryOwner: OWNER,
          historyOwner: OWNER,
          registryScore: "1",
          historyScore: 2,
          syncDelta: "1",
          eventCount: "1",
          checks: { syncCallable: true },
        },
      }),
    })).rejects.toThrow("Reputation score sync safety historyScore must be a string");

    expect(calls).toEqual([]);
  });
});

describe("reputation shared injected runner guards", () => {
  it("rejects malformed runner options and argv before command execution", async () => {
    const calls: string[] = [];

    await expect(runInjectedOrDefault(
      [] as never,
      parseReputationRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Reputation runner options must be an object");
    await expect(runInjectedOrDefault(
      { argv: [123], executeCommand: async () => ({ output: { ok: true } }) } as never,
      parseReputationRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("CLI argv must be an array of strings");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected dependencies before command execution", async () => {
    const calls: string[] = [];

    await expect(runInjectedOrDefault(
      {
        argv: [],
        setExitCode: "bad" as never,
        executeCommand: async () => {
          calls.push("execute");
          return { output: { ok: true } };
        },
      },
      parseReputationRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Exit code setter must be a function");
    await expect(runInjectedOrDefault(
      { argv: [], executeCommand: "bad" as never },
      parseReputationRunnerArgs,
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
        executeCommand: async () => "bad" as never,
      },
      parseReputationRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Injected command result must be an object");
    await expect(runInjectedOrDefault(
      {
        argv: [],
        writeOutput: () => calls.push("output"),
        executeCommand: async () => ({ ok: true }) as never,
      },
      parseReputationRunnerArgs,
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
        executeCommand: async () => ({ output: { ok: true }, exitCode: -1 }),
      },
      parseReputationRunnerArgs,
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
        executeCommand: async () => ({ output: () => "bad" }),
      },
      parseReputationRunnerArgs,
      async () => { calls.push("default"); },
    )).rejects.toThrow("Injected command output must be JSON serializable");
    expect(calls).toEqual([]);
  });
});
