import { spawn } from "node:child_process";
import { join } from "node:path";

export interface BaseSepoliaReleaseAutomationParams {
  manifestPath?: string | undefined;
  checkpointPath?: string | undefined;
  releaseDir?: string | undefined;
  envExamplePath?: string | undefined;
  readinessRunUrl?: string | undefined;
  runner?: ReleaseAutomationRunner | undefined;
}

export interface BaseSepoliaReleaseAutomationStep {
  name: string;
  script: string;
  command: "npm";
  args: string[];
}

export interface ReleaseAutomationCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface BaseSepoliaReleaseAutomationStepResult
  extends BaseSepoliaReleaseAutomationStep,
    ReleaseAutomationCommandResult {
  passed: boolean;
}

export interface BaseSepoliaReleaseAutomationReport {
  manifestPath: string;
  checkpointPath: string;
  releaseDir: string;
  envExamplePath: string;
  readinessRunUrl: string | undefined;
  passed: boolean;
  steps: BaseSepoliaReleaseAutomationStepResult[];
}

export type ReleaseAutomationRunner = (
  step: BaseSepoliaReleaseAutomationStep,
) => Promise<ReleaseAutomationCommandResult>;

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_CHECKPOINT_PATH = "artifacts/base-sepolia-readiness-checkpoint.json";
const DEFAULT_RELEASE_DIR = "docs/releases";
const DEFAULT_ENV_EXAMPLE_PATH = ".env.example";

export function buildBaseSepoliaReleaseAutomationSteps(
  params: BaseSepoliaReleaseAutomationParams = {},
): BaseSepoliaReleaseAutomationStep[] {
  const manifestPath = params.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const checkpointPath = params.checkpointPath ?? DEFAULT_CHECKPOINT_PATH;
  const releaseDir = params.releaseDir ?? DEFAULT_RELEASE_DIR;
  const envExamplePath = params.envExamplePath ?? DEFAULT_ENV_EXAMPLE_PATH;
  const statusPath = join(releaseDir, "latest.json");
  const summaryPath = join(releaseDir, "CURRENT.md");

  return [
    npmStep("readiness-checkpoint", "base:readiness-checkpoint", [
      "--output",
      checkpointPath,
      "--manifest",
      manifestPath,
      ...(params.readinessRunUrl === undefined ? [] : ["--readiness-run-url", params.readinessRunUrl]),
    ]),
    npmStep("checkpoint-verify", "base:checkpoint-verify", [
      "--checkpoint",
      checkpointPath,
      "--manifest",
      manifestPath,
      "--require-run-url",
    ]),
    npmStep("release-note", "base:release-note", ["--checkpoint", checkpointPath, "--manifest", manifestPath]),
    npmStep("release-index", "base:release-index", ["--dir", releaseDir, "--manifest", manifestPath]),
    npmStep("release-status", "base:release-status", ["--dir", releaseDir, "--manifest", manifestPath]),
    npmStep("release-status-verify", "base:release-status-verify", ["--status", statusPath]),
    npmStep("release-summary", "base:release-summary", ["--status", statusPath, "--output", summaryPath]),
    npmStep("local-preflight", "base:local-preflight", [
      "--dir",
      releaseDir,
      "--manifest",
      manifestPath,
      "--env-example",
      envExamplePath,
    ]),
  ];
}

export async function runBaseSepoliaReleaseAutomation(
  params: BaseSepoliaReleaseAutomationParams = {},
): Promise<BaseSepoliaReleaseAutomationReport> {
  const manifestPath = params.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const checkpointPath = params.checkpointPath ?? DEFAULT_CHECKPOINT_PATH;
  const releaseDir = params.releaseDir ?? DEFAULT_RELEASE_DIR;
  const envExamplePath = params.envExamplePath ?? DEFAULT_ENV_EXAMPLE_PATH;
  const runner = params.runner ?? createChildProcessReleaseAutomationRunner();
  const steps = buildBaseSepoliaReleaseAutomationSteps(params);
  const results: BaseSepoliaReleaseAutomationStepResult[] = [];

  for (const step of steps) {
    const commandResult = await runner(step);
    const result = {
      ...step,
      ...commandResult,
      passed: commandResult.exitCode === 0,
    };
    results.push(result);
    if (!result.passed) break;
  }

  return {
    manifestPath,
    checkpointPath,
    releaseDir,
    envExamplePath,
    readinessRunUrl: params.readinessRunUrl,
    passed: results.length === steps.length && results.every((result) => result.passed),
    steps: results,
  };
}

export function formatBaseSepoliaReleaseAutomationSummary(
  report: BaseSepoliaReleaseAutomationReport,
): string {
  const passed = report.steps.filter((step) => step.passed).length;
  const failed = report.steps.length - passed;

  return [
    "Base Sepolia release automation",
    `manifest: ${report.manifestPath}`,
    `checkpoint: ${report.checkpointPath}`,
    `releaseDir: ${report.releaseDir}`,
    `readinessRunUrl: ${report.readinessRunUrl ?? "not provided"}`,
    `steps: ${report.steps.length}`,
    `passed: ${passed}`,
    `failed: ${failed}`,
    `overall: ${report.passed ? "passed" : "failed"}`,
    ...report.steps.map(formatStepSummary),
  ].join("\n");
}

export function createChildProcessReleaseAutomationRunner(): ReleaseAutomationRunner {
  return async (step) => {
    return await new Promise<ReleaseAutomationCommandResult>((resolve) => {
      const child = spawn(step.command, step.args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("close", (exitCode, signal) => {
        resolve({
          exitCode,
          signal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
    });
  };
}

function formatStepSummary(step: BaseSepoliaReleaseAutomationStepResult): string {
  const failure = step.passed ? "" : ` (${(step.stderr || step.stdout || "no output").replaceAll("\n", " ")})`;
  return `- ${step.name}: ${step.passed ? "passed" : "failed"}${failure}`;
}

function npmStep(name: string, script: string, args: string[]): BaseSepoliaReleaseAutomationStep {
  return {
    name,
    script,
    command: "npm",
    args: ["run", script, ...(args.length === 0 ? [] : ["--", ...args])],
  };
}
