import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAgentOsSdkExampleCatalog,
  formatAgentOsSdkExampleCatalogSummary,
  validateAgentOsSdkExampleCatalog,
} from "../../sdk/exampleCatalog.js";

import type {
  AgentOsSdkExampleCatalog,
  CreateAgentOsSdkExampleCatalogParams,
} from "../../sdk/exampleCatalog.js";

export type AgentOsSdkExampleCatalogCliFormat = "json" | "summary";

export interface AgentOsSdkExampleCatalogCliArgs {
  outputPath?: string | undefined;
  format: AgentOsSdkExampleCatalogCliFormat;
}

export interface AgentOsSdkExampleCatalogCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createCatalog?: (params?: CreateAgentOsSdkExampleCatalogParams) => AgentOsSdkExampleCatalog;
}

if (isAgentOsSdkExampleCatalogDirectRun(import.meta.url, process.argv)) await runAgentOsSdkExampleCatalogCli();

export async function runAgentOsSdkExampleCatalogCli(
  options: AgentOsSdkExampleCatalogCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createCatalog = options.createCatalog ?? createAgentOsSdkExampleCatalog;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  validateWriter(writeText, "Output writer must be a function");
  validateWriter(mkdirp, "Directory writer must be a function");
  validateCatalogCreator(createCatalog);
  const args = parseAgentOsSdkExampleCatalogCliArgs(argv);
  const catalog = createCatalog();
  validateAgentOsSdkExampleCatalog(catalog);

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  }

  writeOutput(formatAgentOsSdkExampleCatalogCliOutput(catalog, args.format));
}

export function parseAgentOsSdkExampleCatalogCliArgs(argv: readonly string[]): AgentOsSdkExampleCatalogCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--output" || arg === "--format") {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatAgentOsSdkExampleCatalogCliOutput(
  catalog: AgentOsSdkExampleCatalog,
  format: AgentOsSdkExampleCatalogCliFormat,
): string {
  validateFormat(format);
  validateAgentOsSdkExampleCatalog(catalog);
  return format === "summary" ? formatAgentOsSdkExampleCatalogSummary(catalog) : JSON.stringify(catalog, null, 2);
}

export function isAgentOsSdkExampleCatalogDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): AgentOsSdkExampleCatalogCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "AgentOS SDK example catalog output format must be json or summary",
): asserts value is AgentOsSdkExampleCatalogCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is AgentOsSdkExampleCatalogCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("AgentOS SDK example catalog options must be an object");
  }
}

function validateStringArray(argv: unknown, message: string): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateWriter(value: unknown, message: string): asserts value is (path: string, contents: string) => Promise<void> {
  if (typeof value !== "function") throw new Error(message);
}

function validateCatalogCreator(
  createCatalog: unknown,
): asserts createCatalog is (params?: CreateAgentOsSdkExampleCatalogParams) => AgentOsSdkExampleCatalog {
  if (typeof createCatalog !== "function") throw new Error("Catalog creator must be a function");
}
