import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatAgentOsSdkExampleCatalogVerificationSummary,
  validateAgentOsSdkExampleCatalogVerification,
  verifyAgentOsSdkExampleCatalog,
} from "../../sdk/exampleCatalog.js";

import type {
  AgentOsSdkExampleCatalog,
  AgentOsSdkExampleCatalogVerification,
  VerifyAgentOsSdkExampleCatalogParams,
} from "../../sdk/exampleCatalog.js";

const DEFAULT_CATALOG_PATH = "artifacts/sdk/agentos-sdk-examples.json";

export type AgentOsSdkExampleCatalogVerifyCliFormat = "json" | "summary";

export interface AgentOsSdkExampleCatalogVerifyCliArgs {
  catalogPath: string;
  outputPath?: string | undefined;
  format: AgentOsSdkExampleCatalogVerifyCliFormat;
}

export interface AgentOsSdkExampleCatalogVerifyCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  verifyCatalog?: (params: VerifyAgentOsSdkExampleCatalogParams) => AgentOsSdkExampleCatalogVerification;
  setExitCode?: (code: number) => void;
}

if (isAgentOsSdkExampleCatalogVerifyDirectRun(import.meta.url, process.argv)) {
  await runAgentOsSdkExampleCatalogVerifyCli();
}

export async function runAgentOsSdkExampleCatalogVerifyCli(
  options: AgentOsSdkExampleCatalogVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const verifyCatalog = options.verifyCatalog ?? verifyAgentOsSdkExampleCatalog;
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  validateReader(readText);
  validateWriter(writeText, "Output writer must be a function");
  validateWriter(mkdirp, "Directory writer must be a function");
  validateVerifier(verifyCatalog);
  const args = parseAgentOsSdkExampleCatalogVerifyCliArgs(argv);
  const catalogJson = await readText(args.catalogPath);
  const verification = verifyCatalog({ catalog: JSON.parse(catalogJson) as AgentOsSdkExampleCatalog });
  validateAgentOsSdkExampleCatalogVerification(verification);

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatAgentOsSdkExampleCatalogVerifyCliOutput(verification, args.format));
  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseAgentOsSdkExampleCatalogVerifyCliArgs(
  argv: readonly string[],
): AgentOsSdkExampleCatalogVerifyCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--catalog" || arg === "--output" || arg === "--format") {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--catalog|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    catalogPath: values.get("--catalog") ?? DEFAULT_CATALOG_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatAgentOsSdkExampleCatalogVerifyCliOutput(
  report: AgentOsSdkExampleCatalogVerification,
  format: AgentOsSdkExampleCatalogVerifyCliFormat,
): string {
  validateFormat(format);
  validateAgentOsSdkExampleCatalogVerification(report);
  return format === "summary" ? formatAgentOsSdkExampleCatalogVerificationSummary(report) : JSON.stringify(report, null, 2);
}

export function isAgentOsSdkExampleCatalogVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): AgentOsSdkExampleCatalogVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "AgentOS SDK example catalog verify output format must be json or summary",
): asserts value is AgentOsSdkExampleCatalogVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is AgentOsSdkExampleCatalogVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("AgentOS SDK example catalog verify options must be an object");
  }
}

function validateStringArray(argv: unknown, message: string): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Input reader must be a function");
}

function validateWriter(value: unknown, message: string): asserts value is (path: string, contents: string) => Promise<void> {
  if (typeof value !== "function") throw new Error(message);
}

function validateVerifier(
  verifyCatalog: unknown,
): asserts verifyCatalog is (params: VerifyAgentOsSdkExampleCatalogParams) => AgentOsSdkExampleCatalogVerification {
  if (typeof verifyCatalog !== "function") throw new Error("Catalog verifier must be a function");
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}
