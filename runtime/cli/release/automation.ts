import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatBaseSepoliaReleaseAutomationSummary,
  runBaseSepoliaReleaseAutomation,
} from "../../release/automation.js";

import type { BaseSepoliaReleaseAutomationReport } from "../../release/automation.js";

export interface ReleaseAutomationCliArgs {
  manifestPath?: string | undefined;
  checkpointPath?: string | undefined;
  releaseDir?: string | undefined;
  envExamplePath?: string | undefined;
  readinessRunUrl?: string | undefined;
  summary: boolean;
}

export interface ReleaseAutomationCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  runAutomation?: typeof runBaseSepoliaReleaseAutomation;
}

if (isReleaseAutomationDirectRun(import.meta.url, process.argv)) await runReleaseAutomationCli();

export async function runReleaseAutomationCli(options: ReleaseAutomationCliOptions = {}): Promise<void> {
  validateReleaseAutomationOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const runAutomation = options.runAutomation ?? runBaseSepoliaReleaseAutomation;

  validateReleaseAutomationOutputWriter(writeOutput);
  validateReleaseAutomationArgv(argv);
  const args = parseReleaseAutomationCliArgs(argv);
  validateReleaseAutomationRunner(runAutomation);
  const report = await runAutomation({
    ...(args.manifestPath === undefined ? {} : { manifestPath: args.manifestPath }),
    ...(args.checkpointPath === undefined ? {} : { checkpointPath: args.checkpointPath }),
    ...(args.releaseDir === undefined ? {} : { releaseDir: args.releaseDir }),
    ...(args.envExamplePath === undefined ? {} : { envExamplePath: args.envExamplePath }),
    ...(args.readinessRunUrl === undefined ? {} : { readinessRunUrl: args.readinessRunUrl }),
  });
  validateReleaseAutomationReport(report);

  writeOutput(formatReleaseAutomationCliOutput(report, args.summary));

  if (!report.passed) {
    validateReleaseAutomationExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseReleaseAutomationCliArgs(argv: readonly string[]): ReleaseAutomationCliArgs {
  validateReleaseAutomationArgv(argv);
  const values = new Map<string, string>();
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--summary") {
      if (summary) throw new Error("Duplicate argument: --summary");
      summary = true;
      continue;
    }

    if (
      arg === "--manifest"
      || arg === "--checkpoint"
      || arg === "--dir"
      || arg === "--env-example"
      || arg === "--readiness-run-url"
    ) {
      setReleaseAutomationOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--manifest|--checkpoint|--dir|--env-example|--readiness-run-url)=(.*)$/u);
    if (equals !== null) {
      setReleaseAutomationOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    ...(values.has("--checkpoint") ? { checkpointPath: values.get("--checkpoint")! } : {}),
    ...(values.has("--dir") ? { releaseDir: values.get("--dir")! } : {}),
    ...(values.has("--env-example") ? { envExamplePath: values.get("--env-example")! } : {}),
    ...(values.has("--readiness-run-url") ? { readinessRunUrl: values.get("--readiness-run-url")! } : {}),
    summary,
  };
}

export function formatReleaseAutomationCliOutput(
  report: BaseSepoliaReleaseAutomationReport,
  summary: boolean,
): string {
  validateReleaseAutomationSummaryFlag(summary);
  validateReleaseAutomationReport(report);

  return summary ? formatBaseSepoliaReleaseAutomationSummary(report) : JSON.stringify(report, null, 2);
}

export function isReleaseAutomationDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateReleaseAutomationArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setReleaseAutomationOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateReleaseAutomationOptions(options: unknown): asserts options is ReleaseAutomationCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Release automation options must be an object");
  }
}

function validateReleaseAutomationArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateReleaseAutomationOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateReleaseAutomationExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateReleaseAutomationRunner(
  runAutomation: unknown,
): asserts runAutomation is typeof runBaseSepoliaReleaseAutomation {
  if (typeof runAutomation !== "function") {
    throw new Error("Release automation runner must be a function");
  }
}

function validateReleaseAutomationSummaryFlag(summary: unknown): asserts summary is boolean {
  if (typeof summary !== "boolean") {
    throw new Error("Release automation summary flag must be a boolean");
  }
}

function validateReleaseAutomationReport(report: unknown): asserts report is BaseSepoliaReleaseAutomationReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Release automation report must be an object");
  }

  const reportRecord = report as Record<string, unknown>;
  validateReleaseAutomationPath(reportRecord.manifestPath, "manifestPath");
  validateReleaseAutomationPath(reportRecord.checkpointPath, "checkpointPath");
  validateReleaseAutomationPath(reportRecord.releaseDir, "releaseDir");
  validateReleaseAutomationPath(reportRecord.envExamplePath, "envExamplePath");

  if (reportRecord.readinessRunUrl !== undefined) {
    validateReleaseAutomationPath(reportRecord.readinessRunUrl, "readinessRunUrl");
  }

  if (typeof reportRecord.passed !== "boolean") {
    throw new Error("Release automation report passed must be a boolean");
  }

  if (!Array.isArray(reportRecord.steps)) {
    throw new Error("Release automation report steps must be an array");
  }

  reportRecord.steps.forEach(validateReleaseAutomationStepResult);
}

function validateReleaseAutomationStepResult(step: unknown, index: number): void {
  if (typeof step !== "object" || step === null || Array.isArray(step)) {
    throw new Error(`Release automation report step ${index} must be an object`);
  }

  const stepRecord = step as Record<string, unknown>;
  validateReleaseAutomationStepText(stepRecord.name, index, "name");
  validateReleaseAutomationStepText(stepRecord.script, index, "script");

  if (stepRecord.command !== "npm") {
    throw new Error(`Release automation report step ${index} command must be npm`);
  }

  if (!Array.isArray(stepRecord.args) || stepRecord.args.some((arg) => typeof arg !== "string")) {
    throw new Error(`Release automation report step ${index} args must be an array of strings`);
  }

  if (stepRecord.exitCode !== null && !Number.isInteger(stepRecord.exitCode)) {
    throw new Error(`Release automation report step ${index} exitCode must be an integer or null`);
  }

  if (stepRecord.signal !== null && typeof stepRecord.signal !== "string") {
    throw new Error(`Release automation report step ${index} signal must be a string or null`);
  }

  if (typeof stepRecord.stdout !== "string") {
    throw new Error(`Release automation report step ${index} stdout must be a string`);
  }

  if (typeof stepRecord.stderr !== "string") {
    throw new Error(`Release automation report step ${index} stderr must be a string`);
  }

  if (typeof stepRecord.passed !== "boolean") {
    throw new Error(`Release automation report step ${index} passed must be a boolean`);
  }
}

function validateReleaseAutomationPath(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release automation report ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release automation report ${field} must not be empty`);
  }
}

function validateReleaseAutomationStepText(value: unknown, index: number, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release automation report step ${index} ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release automation report step ${index} ${field} must not be empty`);
  }
}
