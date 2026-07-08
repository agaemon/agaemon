import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatBaseSepoliaEnvExampleVerifyCliOutput } from "./exampleVerify.js";

type Module = typeof import("./exampleVerify.js") & {
  isBaseSepoliaEnvExampleVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBaseSepoliaEnvExampleVerifyCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBaseSepoliaEnvExampleVerifyCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyExample?: (contents: string) => unknown;
}

describe("base sepolia env example verify CLI seams", () => {
  it("formats valid env example verification reports as JSON", () => {
    const report = {
      envExample: ".env.example",
      passed: true,
      failures: [],
      variables: {
        BASE_SEPOLIA_CHAIN_ID: "84532",
        PRIVATE_KEY: "placeholder",
      },
    };

    expect(formatBaseSepoliaEnvExampleVerifyCliOutput(report)).toBe(JSON.stringify(report, null, 2));
  });

  it("rejects malformed env example verification reports before rendering", () => {
    const report = {
      envExample: ".env.example",
      passed: false,
      failures: ["missing key"],
      variables: {},
    };

    expect(() => formatBaseSepoliaEnvExampleVerifyCliOutput(null)).toThrow(
      "Env example verification report must be an object",
    );
    expect(() => formatBaseSepoliaEnvExampleVerifyCliOutput({
      ...report,
      envExample: "",
    })).toThrow("Env example verification report envExample must not be empty");
    expect(() => formatBaseSepoliaEnvExampleVerifyCliOutput({
      ...report,
      passed: "false",
    })).toThrow("Env example verification report passed must be a boolean");
    expect(() => formatBaseSepoliaEnvExampleVerifyCliOutput({
      ...report,
      failures: ["missing key", ""],
    })).toThrow("Env example verification report failure 1 must not be empty");
  });

  it("rejects malformed env example variable summaries before rendering", () => {
    const report = {
      envExample: ".env.example",
      passed: true,
      failures: [],
      variables: {
        BASE_SEPOLIA_CHAIN_ID: "84532",
      },
    };

    expect(() => formatBaseSepoliaEnvExampleVerifyCliOutput({
      ...report,
      variables: "vars",
    })).toThrow("Env example verification report variables must be an object");
    expect(() => formatBaseSepoliaEnvExampleVerifyCliOutput({
      ...report,
      variables: { "": "84532" },
    })).toThrow("Env example verification report variable name must not be empty");
    expect(() => formatBaseSepoliaEnvExampleVerifyCliOutput({
      ...report,
      variables: { BASE_SEPOLIA_CHAIN_ID: 84532 },
    })).toThrow("Env example verification report variable BASE_SEPOLIA_CHAIN_ID must be a string");
  });

  it("detects direct execution and parses strict args with defaults", async () => {
    const module = await import("./exampleVerify.js") as Module;
    const scriptPath = resolve("runtime/cli/env/exampleVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBaseSepoliaEnvExampleVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBaseSepoliaEnvExampleVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBaseSepoliaEnvExampleVerifyCliArgs?.([])).toEqual({ envExamplePath: ".env.example" });
    expect(module.parseBaseSepoliaEnvExampleVerifyCliArgs?.([
      "--env-example=.env.example.test",
    ])).toEqual({ envExamplePath: ".env.example.test" });
    expect(() => module.parseBaseSepoliaEnvExampleVerifyCliArgs?.([
      "--env-example", ".env.example",
      "--env-example", ".env.example.other",
    ])).toThrow("Duplicate argument: --env-example");
    expect(() => module.parseBaseSepoliaEnvExampleVerifyCliArgs?.(["--env-example"])).toThrow(
      "--env-example requires a value",
    );
  });

  it("runs through injected dependencies and sets failed exit after output", async () => {
    const module = await import("./exampleVerify.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBaseSepoliaEnvExampleVerifyCli?.({
      argv: ["--env-example", ".env.example.test"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "BASE_SEPOLIA_RPC_URL=\n";
      },
      verifyExample: (contents) => {
        calls.push(`verify:${contents}`);
        return { passed: false, failures: ["missing key"] };
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      envExample: ".env.example.test",
      passed: false,
      failures: ["missing key"],
    });
    expect(exitCodes).toEqual([1]);
    expect(calls[0]).toBe("read:.env.example.test");
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./exampleVerify.js") as Module;
    const calls: string[] = [];

    await expect(module.runBaseSepoliaEnvExampleVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyExample: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected verifier reports before output or exit-code mutation", async () => {
    const module = await import("./exampleVerify.js") as Module;
    const calls: string[] = [];

    await expect(module.runBaseSepoliaEnvExampleVerifyCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => {
        calls.push("read");
        return "BASE_SEPOLIA_CHAIN_ID=84532\n";
      },
      verifyExample: () => {
        calls.push("verify");
        return { passed: "no", failures: [] };
      },
    })).rejects.toThrow("Env example verification report passed must be a boolean");
    expect(calls).toEqual(["read", "verify"]);
  });
});
