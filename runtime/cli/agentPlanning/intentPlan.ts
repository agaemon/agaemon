import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAgentIntentPlan,
  formatAgentIntentPlan,
  parseAgentIntentDocument,
} from "../../agentPlanning/intentCompiler.js";
import { validateAgentIntentPlanCliReport } from "../../agentPlanning/reportValidation.js";
import { readDeploymentManifest } from "../../base/deploymentManifest.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export interface IntentPlanCliArgs {
  intentPath: string;
  manifestPath: string;
  outputPath?: string | undefined;
}

export interface IntentPlanCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  readManifest?: (path: string) => Promise<unknown>;
  readText?: (path: string) => string;
  parseIntentDocument?: (value: unknown) => Record<string, unknown>;
  createPlan?: (params: unknown) => { steps: readonly unknown[] };
  formatPlan?: (plan: { steps: readonly unknown[] }) => unknown;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

if (isIntentPlanDirectRun(import.meta.url, process.argv)) await runIntentPlanCli();

export async function runIntentPlanCli(options: IntentPlanCliOptions = {}): Promise<void> {
  validateIntentPlanOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readManifest = options.readManifest ?? (async (path: string) => readDeploymentManifest(path));
  const readText = options.readText ?? ((path: string) => readFileSync(path, "utf8"));
  const parseIntent = options.parseIntentDocument ?? ((value: unknown) => parseAgentIntentDocument(value) as unknown as Record<string, unknown>);
  const createPlan = options.createPlan ?? ((params: unknown) => createAgentIntentPlan(params as Parameters<typeof createAgentIntentPlan>[0]) as unknown as { steps: readonly unknown[] });
  const formatPlan = options.formatPlan ?? ((plan: { steps: readonly unknown[] }) => formatAgentIntentPlan(plan as Parameters<typeof formatAgentIntentPlan>[0]));
  const mkdirp = options.mkdirp ?? ((dir: string) => mkdir(dir, { recursive: true }));
  const writeText = options.writeText ?? writeFile;

  validateIntentPlanOutputWriter(writeOutput);
  validateIntentPlanArgv(argv);
  const args = parseIntentPlanCliArgs(argv);
  validateIntentPlanManifestReader(readManifest);
  validateIntentPlanTextReader(readText);
  validateIntentPlanParser(parseIntent);
  validateIntentPlanCreator(createPlan);
  validateIntentPlanFormatter(formatPlan);

  const manifest = await readManifest(args.manifestPath);
  const intentDocument = parseIntent(JSON.parse(readText(args.intentPath)) as unknown);
  const plan = createPlan({ manifest, ...intentDocument });
  const formattedPlan = formatPlan(plan);
  validateAgentIntentPlanCliReport(formattedPlan);
  const output = `${JSON.stringify(formattedPlan, null, 2)}\n`;

  if (args.outputPath === undefined) {
    writeOutput(output.trimEnd());
    return;
  }

  validateIntentPlanDirectoryCreator(mkdirp);
  validateIntentPlanTextWriter(writeText);
  await mkdirp(dirname(args.outputPath));
  await writeText(args.outputPath, output);
  writeOutput(
    JSON.stringify(
      {
        intent: args.intentPath,
        manifest: args.manifestPath,
        output: args.outputPath,
        steps: plan.steps.length,
        written: true,
      },
      null,
      2,
    ),
  );
}

export function parseIntentPlanCliArgs(argv: readonly string[]): IntentPlanCliArgs {
  validateIntentPlanArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--intent" || arg === "--manifest" || arg === "--output") {
      setIntentPlanOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--intent|--manifest|--output)=(.*)$/u);
    if (equals !== null) {
      setIntentPlanOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const intentPath = values.get("--intent");
  if (intentPath === undefined) throw new Error("--intent is required");

  return {
    intentPath,
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isIntentPlanDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateIntentPlanArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setIntentPlanOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateIntentPlanOptions(options: unknown): asserts options is IntentPlanCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Intent plan options must be an object");
  }
}

function validateIntentPlanArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateIntentPlanOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateIntentPlanManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<unknown> {
  if (typeof readManifest !== "function") {
    throw new Error("Manifest reader must be a function");
  }
}

function validateIntentPlanTextReader(readText: unknown): asserts readText is (path: string) => string {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateIntentPlanParser(parseIntent: unknown): asserts parseIntent is (value: unknown) => Record<string, unknown> {
  if (typeof parseIntent !== "function") {
    throw new Error("Intent parser must be a function");
  }
}

function validateIntentPlanCreator(createPlan: unknown): asserts createPlan is (params: unknown) => { steps: readonly unknown[] } {
  if (typeof createPlan !== "function") {
    throw new Error("Intent plan creator must be a function");
  }
}

function validateIntentPlanFormatter(formatPlan: unknown): asserts formatPlan is (plan: { steps: readonly unknown[] }) => unknown {
  if (typeof formatPlan !== "function") {
    throw new Error("Intent plan formatter must be a function");
  }
}

function validateIntentPlanDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateIntentPlanTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}
