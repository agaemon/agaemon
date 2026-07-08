import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBaseSepoliaEnvChecklist,
} from "../../env/checklist.js";

import type { BaseSepoliaEnvChecklistScope } from "../../env/checklist.js";
import type { BaseSepoliaEnvChecklistReport } from "../../env/checklist.js";

export interface BaseSepoliaEnvCheckCliArgs {
  envFilePath: string;
  scope: BaseSepoliaEnvChecklistScope;
}

export interface BaseSepoliaEnvCheckCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  createChecklist?: (params: unknown) => BaseSepoliaEnvChecklistReport;
}

if (isBaseSepoliaEnvCheckDirectRun(import.meta.url, process.argv)) {
  await runBaseSepoliaEnvCheckCli();
}

export async function runBaseSepoliaEnvCheckCli(
  options: BaseSepoliaEnvCheckCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadBaseSepoliaEnvCheckDotEnv;
  const createChecklist = options.createChecklist ?? ((params: unknown) =>
    createBaseSepoliaEnvChecklist(params as Parameters<typeof createBaseSepoliaEnvChecklist>[0]));

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBaseSepoliaEnvCheckCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateChecklistCreator(createChecklist);

  loadDotEnv(args.envFilePath, env);
  const report = createChecklist({ scope: args.scope, env });
  validateEnvCheckReport(report);

  writeOutput(formatBaseSepoliaEnvCheckCliOutput(report));
  if (!report.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBaseSepoliaEnvCheckCliArgs(argv: readonly string[]): BaseSepoliaEnvCheckCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--env-file", "--scope"]);
  return {
    envFilePath: values.get("--env-file") ?? ".env",
    scope: readScope(values.get("--scope") ?? "all"),
  };
}

export function formatBaseSepoliaEnvCheckCliOutput(report: unknown): string {
  validateEnvCheckReport(report);
  return JSON.stringify(report, null, 2);
}

export function isBaseSepoliaEnvCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadBaseSepoliaEnvCheckDotEnv(path: string, env: Record<string, string | undefined>): void {
  validateEnv(env);
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key.length > 0 && env[key] === undefined) env[key] = stripQuotes(value);
  }
}

function readScope(value: string): BaseSepoliaEnvChecklistScope {
  if (value === "release" || value === "readiness" || value === "broadcast" || value === "all") return value;
  throw new Error("--scope must be one of release, readiness, broadcast, all");
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

function validateOptions(options: unknown): asserts options is BaseSepoliaEnvCheckCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Base Sepolia env check options must be an object");
  }
}

function validateArgv(argv: unknown, message = "CLI argv must be an array of strings"): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) throw new Error("Environment must be an object");
  for (const value of Object.values(env)) {
    if (value !== undefined && typeof value !== "string") throw new Error("Environment values must be strings when defined");
  }
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateDotEnvLoader(
  loadDotEnv: unknown,
): asserts loadDotEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadDotEnv !== "function") throw new Error("Dotenv loader must be a function");
}

function validateChecklistCreator(
  createChecklist: unknown,
): asserts createChecklist is (params: unknown) => BaseSepoliaEnvChecklistReport {
  if (typeof createChecklist !== "function") throw new Error("Env checklist creator must be a function");
}

function validateEnvCheckReport(report: unknown): asserts report is BaseSepoliaEnvChecklistReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Env check report must be an object");
  }

  const reportRecord = report as Record<string, unknown>;
  validateEnvCheckScope(reportRecord.scope, "Env check report scope");

  if (typeof reportRecord.passed !== "boolean") {
    throw new Error("Env check report passed must be a boolean");
  }

  if (!Array.isArray(reportRecord.missing) || reportRecord.missing.some((missing) => typeof missing !== "string")) {
    throw new Error("Env check report missing must be an array of strings");
  }

  if (!Array.isArray(reportRecord.variables)) {
    throw new Error("Env check report variables must be an array");
  }

  reportRecord.variables.forEach(validateEnvCheckVariable);

  if (!Array.isArray(reportRecord.notes)) {
    throw new Error("Env check report notes must be an array");
  }

  reportRecord.notes.forEach((note, index) => {
    if (typeof note !== "string") {
      throw new Error(`Env check report note ${index} must be a string`);
    }
    if (note.trim() === "") {
      throw new Error(`Env check report note ${index} must not be empty`);
    }
  });
}

function validateEnvCheckVariable(variable: unknown, index: number): void {
  if (typeof variable !== "object" || variable === null || Array.isArray(variable)) {
    throw new Error(`Env check report variable ${index} must be an object`);
  }

  const variableRecord = variable as Record<string, unknown>;
  validateEnvCheckText(variableRecord.name, `Env check report variable ${index} name`);
  validateEnvCheckText(variableRecord.reason, `Env check report variable ${index} reason`);

  if (typeof variableRecord.required !== "boolean") {
    throw new Error(`Env check report variable ${index} required must be a boolean`);
  }

  if (typeof variableRecord.configured !== "boolean") {
    throw new Error(`Env check report variable ${index} configured must be a boolean`);
  }

  if (typeof variableRecord.secret !== "boolean") {
    throw new Error(`Env check report variable ${index} secret must be a boolean`);
  }

  if (variableRecord.displayValue !== undefined && typeof variableRecord.displayValue !== "string") {
    throw new Error(`Env check report variable ${index} displayValue must be a string when defined`);
  }
}

function validateEnvCheckScope(value: unknown, field: string): asserts value is BaseSepoliaEnvChecklistScope {
  if (value !== "release" && value !== "readiness" && value !== "broadcast" && value !== "all") {
    throw new Error(`${field} must be one of release, readiness, broadcast, all`);
  }
}

function validateEnvCheckText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`${field} must not be empty`);
  }
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}
