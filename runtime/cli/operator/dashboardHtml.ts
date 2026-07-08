import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateOperatorDashboardSnapshot } from "../../operator/dashboard.js";
import {
  formatOperatorDashboardHtmlSummary,
  renderOperatorDashboardHtml,
} from "../../operator/dashboardHtml.js";

import type { OperatorDashboardSnapshot } from "../../operator/dashboard.js";

const DEFAULT_DASHBOARD_PATH = "artifacts/operator-dashboard.json";
const DEFAULT_OUTPUT_PATH = "artifacts/operator-dashboard.html";

export type OperatorDashboardHtmlCliFormat = "html" | "summary";

export interface OperatorDashboardHtmlCliArgs {
  dashboardPath: string;
  outputPath?: string | undefined;
  format: OperatorDashboardHtmlCliFormat;
}

export interface OperatorDashboardHtmlCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  renderHtml?: (snapshot: OperatorDashboardSnapshot) => string;
}

if (isOperatorDashboardHtmlDirectRun(import.meta.url, process.argv)) await runOperatorDashboardHtmlCli();

export async function runOperatorDashboardHtmlCli(options: OperatorDashboardHtmlCliOptions = {}): Promise<void> {
  validateOperatorDashboardHtmlOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const renderHtml = options.renderHtml ?? renderOperatorDashboardHtml;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  const args = parseOperatorDashboardHtmlCliArgs(argv);
  const snapshot = JSON.parse(await readText(args.dashboardPath)) as OperatorDashboardSnapshot;
  validateOperatorDashboardSnapshot(snapshot);
  const html = renderHtml(snapshot);
  const outputPath = args.outputPath ?? DEFAULT_OUTPUT_PATH;

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, html);
  }

  writeOutput(formatOperatorDashboardHtmlCliOutput(snapshot, args.format, outputPath, html));
}

export function parseOperatorDashboardHtmlCliArgs(argv: readonly string[]): OperatorDashboardHtmlCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (isValueFlag(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--dashboard|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    dashboardPath: values.get("--dashboard") ?? DEFAULT_DASHBOARD_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "html"),
  };
}

export function formatOperatorDashboardHtmlCliOutput(
  snapshot: OperatorDashboardSnapshot,
  format: OperatorDashboardHtmlCliFormat,
  outputPath = DEFAULT_OUTPUT_PATH,
  html = renderOperatorDashboardHtml(snapshot),
): string {
  validateFormat(format);
  validateOperatorDashboardSnapshot(snapshot);
  return format === "summary" ? formatOperatorDashboardHtmlSummary(snapshot, outputPath) : html;
}

export function isOperatorDashboardHtmlDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--dashboard" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): OperatorDashboardHtmlCliFormat {
  validateFormat(value, "--format must be html or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Operator dashboard HTML output format must be html or summary",
): asserts value is OperatorDashboardHtmlCliFormat {
  if (value !== "html" && value !== "summary") throw new Error(message);
}

function validateOperatorDashboardHtmlOptions(options: unknown): asserts options is OperatorDashboardHtmlCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Operator dashboard HTML options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}
