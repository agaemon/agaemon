import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatBaseSepoliaEnvCheckCliOutput } from "./check.js";

type Module = typeof import("./check.js") & {
  isBaseSepoliaEnvCheckDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBaseSepoliaEnvCheckCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBaseSepoliaEnvCheckCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  createChecklist?: (params: unknown) => unknown;
}

describe("base sepolia env check CLI seams", () => {
  it("formats valid env check reports as JSON", () => {
    const report = {
      scope: "broadcast",
      passed: false,
      missing: ["PRIVATE_KEY"],
      variables: [
        {
          name: "PRIVATE_KEY",
          required: true,
          configured: false,
          secret: true,
          reason: "Required only when broadcasting transactions.",
        },
      ],
      notes: ["release commands read local files"],
    };

    expect(formatBaseSepoliaEnvCheckCliOutput(report)).toBe(JSON.stringify(report, null, 2));
  });

  it("rejects malformed env check reports before rendering", () => {
    const report = {
      scope: "broadcast",
      passed: false,
      missing: ["PRIVATE_KEY"],
      variables: [],
      notes: [],
    };

    expect(() => formatBaseSepoliaEnvCheckCliOutput(null)).toThrow("Env check report must be an object");
    expect(() => formatBaseSepoliaEnvCheckCliOutput({
      ...report,
      scope: "bad",
    })).toThrow("Env check report scope must be one of release, readiness, broadcast, all");
    expect(() => formatBaseSepoliaEnvCheckCliOutput({
      ...report,
      passed: "false",
    })).toThrow("Env check report passed must be a boolean");
    expect(() => formatBaseSepoliaEnvCheckCliOutput({
      ...report,
      missing: ["PRIVATE_KEY", 123],
    })).toThrow("Env check report missing must be an array of strings");
    expect(() => formatBaseSepoliaEnvCheckCliOutput({
      ...report,
      notes: ["ok", ""],
    })).toThrow("Env check report note 1 must not be empty");
  });

  it("rejects malformed env check variables before rendering", () => {
    const report = {
      scope: "broadcast",
      passed: false,
      missing: ["PRIVATE_KEY"],
      variables: [
        {
          name: "PRIVATE_KEY",
          required: true,
          configured: false,
          secret: true,
          reason: "Required only when broadcasting transactions.",
        },
      ],
      notes: [],
    };

    expect(() => formatBaseSepoliaEnvCheckCliOutput({
      ...report,
      variables: "vars",
    })).toThrow("Env check report variables must be an array");
    expect(() => formatBaseSepoliaEnvCheckCliOutput({
      ...report,
      variables: [{ ...report.variables[0], name: "" }],
    })).toThrow("Env check report variable 0 name must not be empty");
    expect(() => formatBaseSepoliaEnvCheckCliOutput({
      ...report,
      variables: [{ ...report.variables[0], configured: "false" }],
    })).toThrow("Env check report variable 0 configured must be a boolean");
    expect(() => formatBaseSepoliaEnvCheckCliOutput({
      ...report,
      variables: [{ ...report.variables[0], displayValue: 123 }],
    })).toThrow("Env check report variable 0 displayValue must be a string when defined");
  });

  it("detects direct execution and parses strict args with defaults", async () => {
    const module = await import("./check.js") as Module;
    const scriptPath = resolve("runtime/cli/env/check.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBaseSepoliaEnvCheckDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBaseSepoliaEnvCheckDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBaseSepoliaEnvCheckCliArgs?.([])).toEqual({ envFilePath: ".env", scope: "all" });
    expect(module.parseBaseSepoliaEnvCheckCliArgs?.([
      "--env-file=.env.local",
      "--scope", "release",
    ])).toEqual({ envFilePath: ".env.local", scope: "release" });
    expect(() => module.parseBaseSepoliaEnvCheckCliArgs?.([
      "--scope", "release",
      "--scope", "readiness",
    ])).toThrow("Duplicate argument: --scope");
    expect(() => module.parseBaseSepoliaEnvCheckCliArgs?.(["--env-file"])).toThrow("--env-file requires a value");
    expect(() => module.parseBaseSepoliaEnvCheckCliArgs?.(["--scope", "bad"])).toThrow(
      "--scope must be one of release, readiness, broadcast, all",
    );
  });

  it("runs through injected dependencies and sets failed exit after output", async () => {
    const module = await import("./check.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];
    const env: Record<string, string | undefined> = {};

    await module.runBaseSepoliaEnvCheckCli?.({
      argv: ["--env-file", ".env.test", "--scope", "broadcast"],
      env,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: (path, targetEnv) => {
        calls.push(`dotenv:${path}`);
        targetEnv.BASE_SEPOLIA_RPC_URL = "https://example.invalid";
      },
      createChecklist: (params) => {
        calls.push(`checklist:${JSON.stringify(params)}`);
        return {
          scope: "broadcast",
          passed: false,
          missing: ["BASE_SEPOLIA_CHAIN_ID"],
          variables: [
            {
              name: "BASE_SEPOLIA_CHAIN_ID",
              required: true,
              configured: false,
              secret: false,
              reason: "Must be 84532 for Base Sepolia broadcasts.",
            },
          ],
          notes: [],
        };
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false });
    expect(exitCodes).toEqual([1]);
    expect(calls[0]).toBe("dotenv:.env.test");
    expect(calls[1]).toContain("\"scope\":\"broadcast\"");
    expect(env.BASE_SEPOLIA_RPC_URL).toBe("https://example.invalid");
  });

  it("rejects malformed arguments before dotenv loading", async () => {
    const module = await import("./check.js") as Module;
    const calls: string[] = [];

    await expect(module.runBaseSepoliaEnvCheckCli?.({
      argv: ["--unknown"],
      loadDotEnv: () => {
        calls.push("dotenv");
      },
      createChecklist: () => ({ passed: true, checks: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected checklist reports before output or exit-code mutation", async () => {
    const module = await import("./check.js") as Module;
    const calls: string[] = [];

    await expect(module.runBaseSepoliaEnvCheckCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => calls.push("dotenv"),
      createChecklist: () => {
        calls.push("checklist");
        return { passed: "no", checks: [] };
      },
    })).rejects.toThrow("Env check report scope must be one of release, readiness, broadcast, all");
    expect(calls).toEqual(["dotenv", "checklist"]);
  });
});
