export interface PackageCliScriptCoverageInput {
  packageJson: unknown;
  cliFiles: readonly string[];
  fileExists: (path: string) => boolean;
}

export const BASE_PACKAGE_SCRIPT_NAMESPACE = "base:";
export const BASE_RUNTIME_CLI_ROOT = "runtime/cli";
export const BASE_RUNTIME_CLI_TARGET_PREFIX = `${BASE_RUNTIME_CLI_ROOT}/`;
export const BASE_PACKAGE_CLI_WRAPPER_EXCLUDED_SUFFIXES = [".test.ts", "/runnerShared.ts"] as const;

interface CliScriptTarget {
  script: string;
  target: string;
}

interface PackageScriptEntry {
  script: string;
  command: unknown;
}

export function collectRuntimeCliFiles(files: readonly string[]): string[] {
  return [...new Set(files)]
    .filter((file) => file.startsWith(BASE_RUNTIME_CLI_TARGET_PREFIX))
    .filter((file) => file.endsWith(".ts"))
    .sort();
}

export function validatePackageCliScriptCoverage(input: PackageCliScriptCoverageInput): string[] {
  const failures: string[] = [];
  const scripts = readScriptEntries(input.packageJson);
  if (!scripts) return ["package.json scripts must be an object"];

  const targets = collectCliScriptTargets(scripts);
  for (const entry of scripts) {
    const target = typeof entry.command === "string" ? parseTsxTarget(entry.command) : null;

    if (entry.script.startsWith(BASE_PACKAGE_SCRIPT_NAMESPACE) && typeof entry.command !== "string") {
      failures.push(`package script ${entry.script} command must be a string`);
      continue;
    }

    if (entry.script.startsWith(BASE_PACKAGE_SCRIPT_NAMESPACE) && (!target || !target.startsWith(BASE_RUNTIME_CLI_TARGET_PREFIX))) {
      failures.push(`package script ${entry.script} command must invoke tsx runtime/cli/**/*.ts`);
      continue;
    }

    if (target?.startsWith(BASE_RUNTIME_CLI_TARGET_PREFIX) && !entry.script.startsWith(BASE_PACKAGE_SCRIPT_NAMESPACE)) {
      failures.push(`package script ${entry.script} target ${target} must use a base:* script name`);
    }
  }

  for (const target of targets) {
    if (!isScopedRuntimeCliTypeScriptTarget(target.target)) {
      failures.push(`package script ${target.script} target ${target.target} must be a scoped runtime/cli TypeScript file`);
      continue;
    }
    if (!input.fileExists(target.target)) {
      failures.push(`package script ${target.script} target ${target.target} must exist`);
    }
  }

  const scriptsByTarget = new Map<string, string[]>();
  for (const target of targets.filter((target) => isScopedRuntimeCliTypeScriptTarget(target.target))) {
    scriptsByTarget.set(target.target, [...(scriptsByTarget.get(target.target) ?? []), target.script]);
  }

  for (const [target, scriptNames] of [...scriptsByTarget.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (scriptNames.length > 1) {
      failures.push(`runtime CLI target ${target} must have one package script, found ${scriptNames.join(", ")}`);
    }
  }

  for (const cliFile of collectOperatorCliWrappers(input.cliFiles)) {
    if (!scriptsByTarget.has(cliFile)) {
      failures.push(`runtime CLI wrapper ${cliFile} must have a package script`);
    }
  }

  return failures;
}

function readScriptEntries(packageJson: unknown): PackageScriptEntry[] | null {
  if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) return null;

  return Object.entries(packageJson.scripts).map(([script, command]) => ({ script, command }));
}

function collectCliScriptTargets(scripts: readonly PackageScriptEntry[]): CliScriptTarget[] {
  return scripts
    .filter((entry): entry is PackageScriptEntry & { command: string } => typeof entry.command === "string")
    .map((entry) => ({ script: entry.script, target: parseTsxTarget(entry.command) }))
    .filter((target): target is CliScriptTarget => target.target !== null)
    .filter((target) => target.target.startsWith(BASE_RUNTIME_CLI_TARGET_PREFIX));
}

function parseTsxTarget(command: string): string | null {
  const match = command.match(/^tsx\s+(\S+)/);
  return match?.[1] ?? null;
}

function collectOperatorCliWrappers(files: readonly string[]): string[] {
  return collectRuntimeCliFiles(files)
    .filter((file) => !BASE_PACKAGE_CLI_WRAPPER_EXCLUDED_SUFFIXES.some((suffix) => file.endsWith(suffix)));
}

function isScopedRuntimeCliTypeScriptTarget(target: string): boolean {
  const rest = target.slice(BASE_RUNTIME_CLI_TARGET_PREFIX.length);
  return target.startsWith(BASE_RUNTIME_CLI_TARGET_PREFIX) && rest.includes("/") && target.endsWith(".ts");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
