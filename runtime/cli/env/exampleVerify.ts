import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyBaseSepoliaEnvExample } from "../../env/exampleVerifier.js";

export interface BaseSepoliaEnvExampleVerifyCliArgs {
  envExamplePath: string;
}

export interface BaseSepoliaEnvExampleVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyExample?: (contents: string) => BaseSepoliaEnvExampleVerifyCliResult;
}

interface BaseSepoliaEnvExampleVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
  variables?: Record<string, string> | undefined;
}

interface BaseSepoliaEnvExampleVerifyCliReport extends BaseSepoliaEnvExampleVerifyCliResult {
  envExample: string;
}

if (isBaseSepoliaEnvExampleVerifyDirectRun(import.meta.url, process.argv)) {
  await runBaseSepoliaEnvExampleVerifyCli();
}

export async function runBaseSepoliaEnvExampleVerifyCli(
  options: BaseSepoliaEnvExampleVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyExample = options.verifyExample ?? verifyBaseSepoliaEnvExample;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBaseSepoliaEnvExampleVerifyCliArgs(argv);
  validateTextReader(readText);
  validateExampleVerifier(verifyExample);

  const contents = await readText(args.envExamplePath);
  const verification = verifyExample(contents);
  validateEnvExampleVerificationResult(verification);

  writeOutput(formatBaseSepoliaEnvExampleVerifyCliOutput({
    envExample: args.envExamplePath,
    ...verification,
  }));

  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBaseSepoliaEnvExampleVerifyCliArgs(
  argv: readonly string[],
): BaseSepoliaEnvExampleVerifyCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--env-example"]);
  return { envExamplePath: values.get("--env-example") ?? ".env.example" };
}

export function formatBaseSepoliaEnvExampleVerifyCliOutput(report: unknown): string {
  validateEnvExampleVerifyReport(report);
  return JSON.stringify(report, null, 2);
}

export function isBaseSepoliaEnvExampleVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function parseValues(argv: readonly string[], flags: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  const pattern = new RegExp(`^(${flags.join("|")})=(.*)$`, "u");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (flags.includes(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(pattern);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return values;
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateOptions(options: unknown): asserts options is BaseSepoliaEnvExampleVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Base Sepolia env example verify options must be an object");
  }
}

function validateArgv(argv: unknown, message = "CLI argv must be an array of strings"): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateExampleVerifier(
  verifyExample: unknown,
): asserts verifyExample is (contents: string) => BaseSepoliaEnvExampleVerifyCliResult {
  if (typeof verifyExample !== "function") throw new Error("Env example verifier must be a function");
}

function validateEnvExampleVerifyReport(report: unknown): asserts report is BaseSepoliaEnvExampleVerifyCliReport {
  validateEnvExampleVerificationResult(report);
  const reportRecord = report as unknown as Record<string, unknown>;
  validateEnvExampleText(reportRecord.envExample, "Env example verification report envExample");
}

function validateEnvExampleVerificationResult(
  verification: unknown,
): asserts verification is BaseSepoliaEnvExampleVerifyCliResult {
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    throw new Error("Env example verification report must be an object");
  }

  const verificationRecord = verification as unknown as Record<string, unknown>;
  if (typeof verificationRecord.passed !== "boolean") {
    throw new Error("Env example verification report passed must be a boolean");
  }

  if (
    !Array.isArray(verificationRecord.failures)
    || verificationRecord.failures.some((failure) => typeof failure !== "string")
  ) {
    throw new Error("Env example verification report failures must be an array of strings");
  }

  verificationRecord.failures.forEach((failure, index) => {
    if (failure.trim() === "") {
      throw new Error(`Env example verification report failure ${index} must not be empty`);
    }
  });

  if (verificationRecord.variables !== undefined) {
    validateEnvExampleVariables(verificationRecord.variables);
  }
}

function validateEnvExampleVariables(variables: unknown): asserts variables is Record<string, string> {
  if (typeof variables !== "object" || variables === null || Array.isArray(variables)) {
    throw new Error("Env example verification report variables must be an object");
  }

  for (const [name, value] of Object.entries(variables)) {
    if (name.trim() === "") {
      throw new Error("Env example verification report variable name must not be empty");
    }

    if (typeof value !== "string") {
      throw new Error(`Env example verification report variable ${name} must be a string`);
    }
  }
}

function validateEnvExampleText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`${field} must not be empty`);
  }
}
