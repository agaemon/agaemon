import { spawn as spawnChildProcess } from "node:child_process";
import { BASE_PACKAGE_SCRIPT_NAMESPACE } from "./packageScripts.js";

export interface ReadinessScript {
  name: string;
  script: string;
  args?: string[] | undefined;
}

export interface ReadinessBuildOptions {
  manifestPath?: string | undefined;
  readinessScripts?: readonly ReadinessScript[] | undefined;
}

export interface ReadinessCheck extends ReadinessScript {
  command: "npm";
  args: string[];
}

export interface ReadinessPackageScriptCoverageInput {
  packageJson: unknown;
  readinessScripts?: readonly unknown[] | undefined;
}

export interface ReadinessCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface ReadinessCheckResult extends ReadinessCheck, ReadinessCommandResult {
  passed: boolean;
}

export type ReadinessRunner = (check: ReadinessCheck) => Promise<ReadinessCommandResult>;

export interface ReadinessChildRunnerOptions {
  spawn?: ReadinessSpawn | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
}

export interface ReadinessSpawnOptions {
  env: NodeJS.ProcessEnv;
  stdio: ["ignore", "pipe", "pipe"];
}

export interface ReadinessChildProcess {
  stdout?: ReadinessReadableStream | null | undefined;
  stderr?: ReadinessReadableStream | null | undefined;
  on(event: "close", listener: (exitCode: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
}

export interface ReadinessReadableStream {
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
}

export type ReadinessSpawn = (
  command: string,
  args: string[],
  options: ReadinessSpawnOptions,
) => ReadinessChildProcess;

export const BASE_READINESS_SCRIPTS: readonly ReadinessScript[] = [
  { name: "manifest", script: "base:manifest-verify", args: ["--summary"] },
  { name: "agent-account", script: "base:agent-account-safety-check" },
  { name: "agent-directory", script: "base:agent-directory-safety-check" },
  { name: "agent-coordination", script: "base:agent-coordination-safety-check" },
  { name: "memory", script: "base:memory-safety-check" },
  { name: "payout", script: "base:payout-safety-check" },
  { name: "reputation", script: "base:reputation-safety-check" },
  { name: "reputation-history", script: "base:reputation-history-safety-check" },
  { name: "reputation-score-sync", script: "base:reputation-score-sync-safety-check" },
  { name: "payment", script: "base:safety-check" },
  { name: "swap", script: "base:swap-safety-check" },
  { name: "token", script: "base:token-safety-check" },
];

export function buildBaseReadinessChecks(options: ReadinessBuildOptions = {}): ReadinessCheck[] {
  const normalizedOptions = normalizeReadinessBuildOptions(options);

  return normalizedOptions.readinessScripts.map((script) => {
    const forwardedArgs = [...(script.args ?? [])];
    if (normalizedOptions.manifestPath !== undefined) forwardedArgs.push("--manifest", normalizedOptions.manifestPath);

    return {
      name: script.name,
      script: script.script,
      command: "npm",
      args: ["run", script.script, ...(forwardedArgs.length === 0 ? [] : ["--", ...forwardedArgs])],
    };
  });
}

export function validateBaseReadinessPackageScripts(input: ReadinessPackageScriptCoverageInput): string[] {
  if (!isRecord(input.packageJson) || !isRecord(input.packageJson.scripts)) {
    return ["package.json scripts must be an object"];
  }

  if (input.readinessScripts !== undefined && !Array.isArray(input.readinessScripts)) {
    return ["readiness scripts must be an array"];
  }

  const packageScripts = input.packageJson.scripts;
  const failures: string[] = [];
  const readinessNames = new Map<string, string>();
  const readinessPackageScripts = new Map<string, string>();

  for (const readinessScript of input.readinessScripts ?? BASE_READINESS_SCRIPTS) {
    if (!isRecord(readinessScript) || typeof readinessScript.name !== "string") {
      failures.push("readiness script name must be a string");
      continue;
    }

    if (readinessScript.name.trim() === "") {
      failures.push("readiness script name must not be empty");
      continue;
    }

    if (typeof readinessScript.script !== "string") {
      failures.push(`readiness script ${readinessScript.name} script must be a string`);
      continue;
    }

    if (readinessScript.script.trim() === "") {
      failures.push(`readiness script ${readinessScript.name} script must not be empty`);
      continue;
    }

    const argsValid = validateReadinessScriptArgs(readinessScript.name, readinessScript.args, failures);

    const existingNameScript = readinessNames.get(readinessScript.name);
    if (existingNameScript !== undefined) {
      failures.push(`readiness script name ${readinessScript.name} must be unique, already used by ${existingNameScript}`);
      continue;
    }
    readinessNames.set(readinessScript.name, readinessScript.script);

    if (!readinessScript.script.startsWith(BASE_PACKAGE_SCRIPT_NAMESPACE)) {
      failures.push(`readiness script ${readinessScript.name} must use a base:* package script name`);
      continue;
    }

    const existingScriptName = readinessPackageScripts.get(readinessScript.script);
    if (existingScriptName !== undefined) {
      failures.push(`readiness package script ${readinessScript.script} must be unique, already used by ${existingScriptName}`);
      continue;
    }
    readinessPackageScripts.set(readinessScript.script, readinessScript.name);

    if (Object.hasOwn(packageScripts, readinessScript.script)) {
      const packageScriptValue = packageScripts[readinessScript.script];
      if (typeof packageScriptValue !== "string") {
        failures.push(`readiness package script ${readinessScript.script} value must be a string`);
      } else if (packageScriptValue.trim() === "") {
        failures.push(`readiness package script ${readinessScript.script} value must not be empty`);
      }
    } else if (argsValid) {
      failures.push(`readiness script ${readinessScript.name} references missing package script ${readinessScript.script}`);
    }
  }

  return failures;
}

export async function runBaseReadinessChecks(
  checks: readonly ReadinessCheck[],
  runner: ReadinessRunner,
): Promise<ReadinessCheckResult[]> {
  validateReadinessChecksForRun(checks);
  validateReadinessRunner(runner);

  const results: ReadinessCheckResult[] = [];

  for (const check of checks) {
    const result = await runner(check);
    validateReadinessCommandResult(check.name, result);
    results.push({
      ...check,
      ...result,
      passed: result.exitCode === 0,
    });
  }

  return results;
}

export function formatBaseReadinessSummary(results: readonly ReadinessCheckResult[]): string {
  validateReadinessSummaryResults(results);
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  return [
    "Base Sepolia readiness",
    `checks: ${results.length}`,
    `passed: ${passed}`,
    `failed: ${failed}`,
    `overall: ${failed === 0 ? "passed" : "failed"}`,
    ...results.map((result) => `- ${result.name}: ${result.passed ? "passed" : "failed"}`),
  ].join("\n");
}

export function createChildProcessReadinessRunner(options: ReadinessChildRunnerOptions = {}): ReadinessRunner {
  validateReadinessChildRunnerOptions(options);
  const spawn = options.spawn ?? (spawnChildProcess as ReadinessSpawn);
  const environment = options.environment ?? process.env;

  return async (check) => {
    return await new Promise<ReadinessCommandResult>((resolve) => {
      const child = spawn(check.command, check.args, {
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;

      child.stdout?.on("data", (chunk: Buffer | string) => stdout.push(toBuffer(chunk)));
      child.stderr?.on("data", (chunk: Buffer | string) => stderr.push(toBuffer(chunk)));
      child.on("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        resolve({
          exitCode,
          signal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        resolve({
          exitCode: 1,
          signal: null,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: formatSpawnError(error),
        });
      });
    });
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeReadinessBuildOptions(options: ReadinessBuildOptions): {
  manifestPath?: string | undefined;
  readinessScripts: readonly ReadinessScript[];
} {
  if (!isRecord(options)) {
    throw new Error("readiness build options must be an object");
  }

  let manifestPath: string | undefined;
  if (options.manifestPath !== undefined) {
    if (typeof options.manifestPath !== "string") {
      throw new Error("readiness manifest path must be a string");
    }

    manifestPath = options.manifestPath.trim();
    if (manifestPath.length === 0) {
      throw new Error("readiness manifest path must not be empty");
    }
  }

  if (options.readinessScripts !== undefined && !Array.isArray(options.readinessScripts)) {
    throw new Error("readiness scripts must be an array");
  }

  const readinessScripts = options.readinessScripts ?? BASE_READINESS_SCRIPTS;
  for (const readinessScript of readinessScripts) {
    validateReadinessScriptForBuild(readinessScript);
  }

  return { manifestPath, readinessScripts };
}

function validateReadinessScriptForBuild(readinessScript: unknown): asserts readinessScript is ReadinessScript {
  if (!isRecord(readinessScript) || typeof readinessScript.name !== "string") {
    throw new Error("readiness script name must be a string");
  }

  if (readinessScript.name.trim() === "") {
    throw new Error("readiness script name must not be empty");
  }

  if (typeof readinessScript.script !== "string") {
    throw new Error(`readiness script ${readinessScript.name} script must be a string`);
  }

  if (readinessScript.script.trim() === "") {
    throw new Error(`readiness script ${readinessScript.name} script must not be empty`);
  }

  const failures: string[] = [];
  validateReadinessScriptArgs(readinessScript.name, readinessScript.args, failures);
  if (failures.length > 0) {
    throw new Error(failures[0]);
  }
}

function validateReadinessScriptArgs(name: string, args: unknown, failures: string[]): boolean {
  if (args === undefined) return true;

  if (!Array.isArray(args)) {
    failures.push(`readiness script ${name} args must be an array`);
    return false;
  }

  let valid = true;
  args.forEach((arg, index) => {
    if (typeof arg !== "string") {
      failures.push(`readiness script ${name} arg ${index} must be a string`);
      valid = false;
      return;
    }

    if (arg.trim() === "") {
      failures.push(`readiness script ${name} arg ${index} must not be empty`);
      valid = false;
    }
  });

  return valid;
}

function validateReadinessChecksForRun(checks: unknown): asserts checks is readonly ReadinessCheck[] {
  if (!Array.isArray(checks)) {
    throw new Error("readiness checks must be an array");
  }

  for (const check of checks) {
    validateReadinessCheckForRun(check);
  }
}

function validateReadinessCheckForRun(check: unknown): asserts check is ReadinessCheck {
  if (!isRecord(check) || typeof check.name !== "string") {
    throw new Error("readiness check name must be a string");
  }

  if (check.name.trim() === "") {
    throw new Error("readiness check name must not be empty");
  }

  if (typeof check.script !== "string") {
    throw new Error(`readiness check ${check.name} script must be a string`);
  }

  if (check.script.trim() === "") {
    throw new Error(`readiness check ${check.name} script must not be empty`);
  }

  if (check.command !== "npm") {
    throw new Error(`readiness check ${check.name} command must be npm`);
  }

  const failures: string[] = [];
  validateStringArray(`readiness check ${check.name}`, check.args, failures);
  if (failures.length > 0) throw new Error(failures[0]);
}

function validateReadinessRunner(runner: unknown): asserts runner is ReadinessRunner {
  if (typeof runner !== "function") {
    throw new Error("readiness runner must be a function");
  }
}

function validateReadinessCommandResult(name: string, result: unknown): asserts result is ReadinessCommandResult {
  if (!isRecord(result)) {
    throw new Error(`readiness result ${name} must be an object`);
  }

  if (!(typeof result.exitCode === "number" || result.exitCode === null)) {
    throw new Error(`readiness result ${name} exitCode must be a number or null`);
  }

  if (!(typeof result.signal === "string" || result.signal === null)) {
    throw new Error(`readiness result ${name} signal must be a string or null`);
  }

  if (typeof result.stdout !== "string") {
    throw new Error(`readiness result ${name} stdout must be a string`);
  }

  if (typeof result.stderr !== "string") {
    throw new Error(`readiness result ${name} stderr must be a string`);
  }
}

function validateStringArray(label: string, value: unknown, failures: string[]): boolean {
  if (!Array.isArray(value)) {
    failures.push(`${label} args must be an array`);
    return false;
  }

  let valid = true;
  value.forEach((arg, index) => {
    if (typeof arg !== "string") {
      failures.push(`${label} arg ${index} must be a string`);
      valid = false;
      return;
    }

    if (arg.trim() === "") {
      failures.push(`${label} arg ${index} must not be empty`);
      valid = false;
    }
  });

  return valid;
}

function validateReadinessSummaryResults(results: unknown): asserts results is readonly ReadinessCheckResult[] {
  if (!Array.isArray(results)) {
    throw new Error("readiness summary results must be an array");
  }

  for (const result of results) {
    validateReadinessSummaryResult(result);
  }
}

function validateReadinessSummaryResult(result: unknown): asserts result is ReadinessCheckResult {
  if (!isRecord(result)) {
    throw new Error("readiness summary result must be an object");
  }

  if (typeof result.name !== "string") {
    throw new Error("readiness summary result name must be a string");
  }

  if (result.name.trim() === "") {
    throw new Error("readiness summary result name must not be empty");
  }

  if (typeof result.passed !== "boolean") {
    throw new Error(`readiness summary result ${result.name} passed must be a boolean`);
  }
}

function validateReadinessChildRunnerOptions(options: unknown): asserts options is ReadinessChildRunnerOptions {
  if (!isRecord(options)) {
    throw new Error("readiness child runner options must be an object");
  }

  if (options.spawn !== undefined && typeof options.spawn !== "function") {
    throw new Error("readiness child runner spawn must be a function");
  }

  if (options.environment !== undefined) {
    if (!isRecord(options.environment)) {
      throw new Error("readiness child runner environment must be an object");
    }

    for (const [key, value] of Object.entries(options.environment)) {
      if (typeof value !== "string" && value !== undefined) {
        throw new Error(`readiness child runner environment ${key} must be a string or undefined`);
      }
    }
  }
}

function toBuffer(chunk: Buffer | string): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

function formatSpawnError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return String(error);
}
