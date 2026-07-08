import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBaseReadinessChecks,
  createChildProcessReadinessRunner,
  formatBaseReadinessSummary,
  runBaseReadinessChecks,
} from "../../base/readiness.js";

import type {
  ReadinessBuildOptions,
  ReadinessCheck,
  ReadinessCheckResult,
  ReadinessRunner,
} from "../../base/readiness.js";

export type ReadinessCliFormat = "summary" | "json";

export interface ReadinessCliArgs {
  manifestPath?: string | undefined;
  format: ReadinessCliFormat;
}

export interface ReadinessCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  writeError?: (output: string) => void;
  setExitCode?: (code: number) => void;
  buildChecks?: (options?: ReadinessBuildOptions) => ReadinessCheck[];
  createRunner?: () => ReadinessRunner;
  runChecks?: (
    checks: readonly ReadinessCheck[],
    runner: ReadinessRunner,
  ) => Promise<ReadinessCheckResult[]>;
}

if (isReadinessDirectRun(import.meta.url, process.argv)) await runReadinessCli();

export async function runReadinessCli(options: ReadinessCliOptions = {}): Promise<void> {
  validateReadinessOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const writeError = options.writeError ?? ((output: string) => console.error(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const buildChecks = options.buildChecks ?? buildBaseReadinessChecks;
  const createRunner = options.createRunner ?? createChildProcessReadinessRunner;
  const runChecks = options.runChecks ?? runBaseReadinessChecks;

  validateReadinessOutputWriter(writeOutput);
  validateReadinessErrorWriter(writeError);
  validateReadinessArgv(argv);
  const args = parseReadinessCliArgs(argv);
  validateReadinessCheckBuilder(buildChecks);
  const checks = buildChecks(args.manifestPath === undefined ? {} : { manifestPath: args.manifestPath });
  validateReadinessRunnerFactory(createRunner);
  validateReadinessCheckRunner(runChecks);
  const runner = createRunner();
  const results = await runChecks(checks, runner);
  validateReadinessCliRunResults(results);
  const failed = results.filter((result) => !result.passed);

  writeOutput(formatReadinessCliOutput(results, args.format));

  if (failed.length > 0) {
    writeError("\nFailed readiness checks:");
    for (const result of failed) {
      writeError(`\n${result.name} (${result.script}) exited with ${result.exitCode ?? result.signal ?? "unknown"}`);
      const output = result.stderr.trim() || result.stdout.trim();
      if (output.length > 0) writeError(output);
    }
    validateReadinessExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function formatReadinessCliOutput(
  results: readonly ReadinessCheckResult[],
  format: ReadinessCliFormat,
): string {
  validateReadinessCliResults(results);
  validateReadinessCliFormat(format);

  if (format === "json") {
    return JSON.stringify({
      passed: results.every((result) => result.passed),
      checks: results,
    }, null, 2);
  }

  return formatBaseReadinessSummary(results);
}

export function parseReadinessCliArgs(argv: readonly string[]): ReadinessCliArgs {
  validateReadinessArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--manifest" || arg === "--format") {
      setReadinessOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--manifest|--format)=(.*)$/u);
    if (equals !== null) {
      setReadinessOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    format: readReadinessCliFormat(values.get("--format") ?? "summary"),
  };
}

export function isReadinessDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateReadinessArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setReadinessOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readReadinessCliFormat(value: string): ReadinessCliFormat {
  validateReadinessCliFormat(value, "--format must be summary or json");
  return value;
}

function validateReadinessOptions(options: unknown): asserts options is ReadinessCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Readiness options must be an object");
  }
}

function validateReadinessArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateReadinessOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateReadinessErrorWriter(writeError: unknown): asserts writeError is (output: string) => void {
  if (typeof writeError !== "function") {
    throw new Error("Error writer must be a function");
  }
}

function validateReadinessExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateReadinessCheckBuilder(
  buildChecks: unknown,
): asserts buildChecks is (options?: ReadinessBuildOptions) => ReadinessCheck[] {
  if (typeof buildChecks !== "function") {
    throw new Error("Readiness check builder must be a function");
  }
}

function validateReadinessRunnerFactory(createRunner: unknown): asserts createRunner is () => ReadinessRunner {
  if (typeof createRunner !== "function") {
    throw new Error("Readiness runner factory must be a function");
  }
}

function validateReadinessCheckRunner(
  runChecks: unknown,
): asserts runChecks is (
  checks: readonly ReadinessCheck[],
  runner: ReadinessRunner,
) => Promise<ReadinessCheckResult[]> {
  if (typeof runChecks !== "function") {
    throw new Error("Readiness check runner must be a function");
  }
}

function validateReadinessCliFormat(
  format: unknown,
  message = "Readiness output format must be summary or json",
): asserts format is ReadinessCliFormat {
  if (format !== "summary" && format !== "json") {
    throw new Error(message);
  }
}

function validateReadinessCliResults(results: unknown): asserts results is readonly ReadinessCheckResult[] {
  if (!Array.isArray(results)) {
    throw new Error("Readiness output results must be an array");
  }

  for (const result of results) {
    validateReadinessCliResult(result);
  }
}

function validateReadinessCliResult(result: unknown): asserts result is ReadinessCheckResult {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Readiness output result must be an object");
  }

  if (!("name" in result) || typeof result.name !== "string") {
    throw new Error("Readiness output result name must be a string");
  }

  if (result.name.trim() === "") {
    throw new Error("Readiness output result name must not be empty");
  }

  if (!("passed" in result) || typeof result.passed !== "boolean") {
    throw new Error(`Readiness output result ${result.name} passed must be a boolean`);
  }
}

function validateReadinessCliRunResults(results: unknown): asserts results is readonly ReadinessCheckResult[] {
  if (!Array.isArray(results)) {
    throw new Error("Readiness CLI results must be an array");
  }

  for (const result of results) {
    validateReadinessCliRunResult(result);
  }
}

function validateReadinessCliRunResult(result: unknown): asserts result is ReadinessCheckResult {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Readiness CLI result must be an object");
  }

  if (!("name" in result) || typeof result.name !== "string") {
    throw new Error("Readiness CLI result name must be a string");
  }

  if (result.name.trim() === "") {
    throw new Error("Readiness CLI result name must not be empty");
  }

  if (!("passed" in result) || typeof result.passed !== "boolean") {
    throw new Error(`Readiness CLI result ${result.name} passed must be a boolean`);
  }

  if (result.passed) return;

  if (!("script" in result) || typeof result.script !== "string") {
    throw new Error(`Readiness CLI result ${result.name} script must be a string`);
  }

  if (result.script.trim() === "") {
    throw new Error(`Readiness CLI result ${result.name} script must not be empty`);
  }

  if (!("exitCode" in result) || !(typeof result.exitCode === "number" || result.exitCode === null)) {
    throw new Error(`Readiness CLI result ${result.name} exitCode must be a number or null`);
  }

  if (!("signal" in result) || !(typeof result.signal === "string" || result.signal === null)) {
    throw new Error(`Readiness CLI result ${result.name} signal must be a string or null`);
  }

  if (!("stdout" in result) || typeof result.stdout !== "string") {
    throw new Error(`Readiness CLI result ${result.name} stdout must be a string`);
  }

  if (!("stderr" in result) || typeof result.stderr !== "string") {
    throw new Error(`Readiness CLI result ${result.name} stderr must be a string`);
  }
}
