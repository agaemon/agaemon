import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import { readDeploymentManifest } from "../../base/deploymentManifest.js";
import {
  formatDeploymentManifestVerifySummary,
  verifyDeploymentManifest,
} from "../../base/manifestVerifier.js";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type {
  DeploymentManifestVerifyClient,
  DeploymentManifestVerifyReport,
} from "../../base/manifestVerifier.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DOTENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export interface ManifestVerifyCliReport extends DeploymentManifestVerifyReport {
  manifestPath: string;
  explorerUrl: string;
}

export interface ManifestVerifyCliArgs {
  manifestPath: string;
  summary: boolean;
}

export interface ManifestVerifyCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readManifest?: (path: string) => Promise<DeploymentManifest>;
  createPublicClient?: (rpcUrl: string) => DeploymentManifestVerifyClient;
  verifyManifest?: typeof verifyDeploymentManifest;
}

if (isManifestVerifyDirectRun(import.meta.url, process.argv)) await runManifestVerifyCli();

export async function runManifestVerifyCli(options: ManifestVerifyCliOptions = {}): Promise<void> {
  validateManifestVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadManifestVerifyDotEnv;
  const readManifest = options.readManifest ?? readDeploymentManifest;
  const createManifestPublicClient = options.createPublicClient ?? createManifestVerifyPublicClient;
  const verifyManifest = options.verifyManifest ?? verifyDeploymentManifest;

  validateManifestVerifyOutputWriter(writeOutput);
  validateManifestVerifyArgv(argv);
  const args = parseManifestVerifyCliArgs(argv);
  validateManifestVerifyEnv(env);
  validateManifestVerifyDotEnvLoader(loadDotEnv);
  loadDotEnv(".env", env);

  validateManifestVerifyManifestReader(readManifest);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = readRequiredManifestVerifyEnv(env, manifest.rpcUrlEnv);

  validateManifestVerifyPublicClientFactory(createManifestPublicClient);
  const publicClient = createManifestPublicClient(rpcUrl);
  validateManifestVerifyVerifier(verifyManifest);
  const report = await verifyManifest(manifest, publicClient);
  const cliReport = {
    ...report,
    manifestPath: args.manifestPath,
    explorerUrl: manifest.explorerUrl,
  };

  writeOutput(formatManifestVerifyCliOutput(cliReport, args.summary));

  if (!report.summary.passed) {
    validateManifestVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function formatManifestVerifyCliOutput(report: ManifestVerifyCliReport, summary: boolean): string {
  return summary ? formatDeploymentManifestVerifySummary(report) : JSON.stringify(report, null, 2);
}

export function parseManifestVerifyCliArgs(argv: readonly string[]): ManifestVerifyCliArgs {
  let summary = false;
  let manifestPath = DEFAULT_MANIFEST_PATH;
  let hasManifest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--summary") {
      if (summary) throw new Error("Duplicate argument: --summary");
      summary = true;
      continue;
    }

    if (arg === "--manifest") {
      if (hasManifest) throw new Error("Duplicate argument: --manifest");
      const value = argv[index + 1];
      const manifestValue = value?.trim();
      if (manifestValue === undefined || manifestValue.length === 0 || manifestValue.startsWith("--")) {
        throw new Error("--manifest requires a value");
      }

      hasManifest = true;
      manifestPath = manifestValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("--manifest=")) {
      if (hasManifest) throw new Error("Duplicate argument: --manifest");
      const value = arg.slice("--manifest=".length).trim();
      if (value.length === 0 || value.startsWith("--")) {
        throw new Error("--manifest requires a value");
      }

      hasManifest = true;
      manifestPath = value;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return { manifestPath, summary };
}

export function readRequiredManifestVerifyEnv(
  env: Record<string, string | undefined>,
  key: string,
): string {
  validateManifestVerifyEnv(env);
  validateManifestVerifyEnvValues(env);
  validateManifestVerifyEnvKey(key);
  const value = env[key];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }

  return value;
}

export function loadManifestVerifyDotEnv(
  path: string,
  env: Record<string, string | undefined>,
  readText = readManifestVerifyDotEnvFile,
): void {
  let contents: string;
  try {
    contents = readText(path);
  } catch {
    return;
  }

  applyManifestVerifyDotEnv(contents, env);
}

function readManifestVerifyDotEnvFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function applyManifestVerifyDotEnv(
  contents: string,
  env: Record<string, string | undefined>,
): void {
  validateManifestVerifyEnv(env);
  for (const [key, value] of parseManifestVerifyDotEnv(contents)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

export function parseManifestVerifyDotEnv(contents: string): readonly (readonly [string, string])[] {
  const entries: [string, string][] = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const rawKey = line.slice(0, separator).trim();
    if (rawKey === "export") continue;

    const exportedKey = rawKey.match(/^export\s+(.+)$/u);
    const key = exportedKey?.[1]?.trim() ?? rawKey;
    const value = line.slice(separator + 1).trim();
    if (DOTENV_KEY_PATTERN.test(key)) {
      entries.push([key, stripQuotes(value)]);
    }
  }

  return entries;
}

export function createManifestVerifyPublicClient(rpcUrl: string): DeploymentManifestVerifyClient {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}

export function isManifestVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateManifestVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function validateManifestVerifyOptions(options: unknown): asserts options is ManifestVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Manifest verify options must be an object");
  }
}

function validateManifestVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateManifestVerifyEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) {
    throw new Error("Environment must be an object");
  }
}

function validateManifestVerifyEnvValues(env: Record<string, string | undefined>): void {
  if (Object.values(env).some((value) => value !== undefined && typeof value !== "string")) {
    throw new Error("Environment values must be strings when defined");
  }
}

function validateManifestVerifyEnvKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || !DOTENV_KEY_PATTERN.test(key)) {
    throw new Error("Environment key must be a valid environment key");
  }
}

function validateManifestVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateManifestVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateManifestVerifyDotEnvLoader(
  loadDotEnv: unknown,
): asserts loadDotEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadDotEnv !== "function") {
    throw new Error("Dotenv loader must be a function");
  }
}

function validateManifestVerifyManifestReader(
  readManifest: unknown,
): asserts readManifest is (path: string) => Promise<DeploymentManifest> {
  if (typeof readManifest !== "function") {
    throw new Error("Manifest reader must be a function");
  }
}

function validateManifestVerifyPublicClientFactory(
  createPublicClient: unknown,
): asserts createPublicClient is (rpcUrl: string) => DeploymentManifestVerifyClient {
  if (typeof createPublicClient !== "function") {
    throw new Error("Public client factory must be a function");
  }
}

function validateManifestVerifyVerifier(
  verifyManifest: unknown,
): asserts verifyManifest is typeof verifyDeploymentManifest {
  if (typeof verifyManifest !== "function") {
    throw new Error("Manifest verifier must be a function");
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
