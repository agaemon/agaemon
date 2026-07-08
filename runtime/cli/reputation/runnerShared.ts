import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface InjectedCommandResult {
  output: unknown;
  exitCode?: number | undefined;
}

export type InjectedOutputValidator = (output: unknown) => void;

export interface ReputationRunnerOptions<TArgs> {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  executeCommand?: (args: TArgs) => Promise<InjectedCommandResult>;
}

export function isDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export async function runInjectedOrDefault<TArgs>(
  options: ReputationRunnerOptions<TArgs>,
  parseArgs: (argv: readonly string[]) => TArgs,
  runDefault: () => Promise<void>,
  validateOutput?: InjectedOutputValidator,
): Promise<void> {
  validateRunnerOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  validateArgv(argv);
  const args = parseArgs(argv);
  if (options.executeCommand === undefined) {
    await runDefault();
    return;
  }

  validateCommandExecutor(options.executeCommand);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  validateOutputWriter(writeOutput);
  validateExitCodeSetter(setExitCode);
  const result = await options.executeCommand(args);
  validateInjectedCommandResult(result);
  validateOutput?.(result.output);
  const output = stringifyInjectedCommandOutput(result.output);
  writeOutput(output);
  if (result.exitCode !== undefined) setExitCode(result.exitCode);
}

export function parseValues(
  argv: readonly string[],
  valueFlags: readonly string[],
  booleanFlags: readonly string[] = [],
): { options: Map<string, string>; booleans: Set<string> } {
  validateArgv(argv);
  const options = new Map<string, string>();
  const booleans = new Set<string>();
  const valuePattern = new RegExp(`^(${valueFlags.join("|")})=(.*)$`, "u");
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (booleanFlags.includes(arg)) {
      if (booleans.has(arg)) throw new Error(`Duplicate argument: ${arg}`);
      booleans.add(arg);
      continue;
    }
    if (valueFlags.includes(arg)) {
      setOption(options, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(valuePattern);
    if (equals !== null) {
      setOption(options, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return { options, booleans };
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateArgv(argv: unknown, message = "CLI argv must be an array of strings"): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateRunnerOptions(options: unknown): asserts options is ReputationRunnerOptions<unknown> {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Reputation runner options must be an object");
  }
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateCommandExecutor(
  executeCommand: unknown,
): asserts executeCommand is (args: unknown) => Promise<InjectedCommandResult> {
  if (typeof executeCommand !== "function") {
    throw new Error("Injected command executor must be a function");
  }
}

function validateInjectedCommandResult(result: unknown): asserts result is InjectedCommandResult {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Injected command result must be an object");
  }

  const record = result as Record<string, unknown>;
  if (record.output === undefined) {
    throw new Error("Injected command output must not be undefined");
  }

  if (record.exitCode !== undefined) {
    const exitCode = record.exitCode;
    if (typeof exitCode !== "number" || !Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
      throw new Error("Injected command exitCode must be an integer from 0 to 255");
    }
  }
}

function stringifyInjectedCommandOutput(output: unknown): string {
  try {
    const serialized = JSON.stringify(output, null, 2);
    if (typeof serialized !== "string") throw new Error("non-string JSON output");
    return serialized;
  } catch {
    throw new Error("Injected command output must be JSON serializable");
  }
}

export function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
}

export function requireNumber(value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
}

export function requireBoolean(value: unknown, message: string): void {
  if (typeof value !== "boolean") throw new Error(message);
}

export function validateTransactionEvidence(value: unknown, label: string): void {
  if (value === null) return;
  const transaction = requireObject(value, `${label} transaction must be an object or null`);
  requireString(transaction.to, `${label} transaction to must be a string`);
  requireString(transaction.value, `${label} transaction value must be a string`);
  requireString(transaction.data, `${label} transaction data must be a string`);
}

export function validateReceiptEvidence(value: unknown, label: string): void {
  const receipt = requireObject(value, `${label} receipt must be an object`);
  requireString(receipt.blockNumber, `${label} receipt blockNumber must be a string`);
  requireString(receipt.status, `${label} receipt status must be a string`);
}

export function validateChecksEvidence(value: unknown, label: string): void {
  const checks = requireObject(value, `${label} checks must be an object`);
  if (Object.values(checks).some((check) => typeof check !== "boolean")) {
    throw new Error(`${label} checks values must be booleans`);
  }
}
