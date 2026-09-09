import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BASE_PACKAGE_SCRIPT_NAMESPACE } from "./packageScripts.js";

export interface CommandReferenceSource {
  path: string;
  text: string;
}

export interface BaseCommandReferenceValidationInput {
  packageJson: unknown;
  sources: readonly CommandReferenceSource[];
}

// Only shipped public sources are mandatory. Internal release evidence is supplied separately.
export const BASE_COMMAND_REFERENCE_SOURCE_FILES = ["README.md", "COMMANDS.md", "VALIDATION.md"] as const;
export const BASE_COMMAND_REFERENCE_SOURCE_DIRECTORIES = [".github/workflows"] as const;
export const BASE_OPERATOR_COMMAND_REFERENCE_SOURCE_FILES = ["README.md", "COMMANDS.md"] as const;
export const BASE_COMMAND_REFERENCE_SCRIPT_NAMESPACE = BASE_PACKAGE_SCRIPT_NAMESPACE;

interface ReferenceWithSource {
  sourcePath: string;
  command: string;
}

const escapedCommandReferenceScriptNamespace = escapeRegExp(BASE_COMMAND_REFERENCE_SCRIPT_NAMESPACE);
const commandReferencePattern = new RegExp(`\\b${escapedCommandReferenceScriptNamespace}[A-Za-z0-9:-]+\\b`, "g");
const npmRunCommandReferencePattern = new RegExp(`\\bnpm\\s+run\\s+(${escapedCommandReferenceScriptNamespace}[A-Za-z0-9:-]+)\\b`, "g");
const markdownFencePattern = /```[^\n]*\n([\s\S]*?)```/g;
const checkedSourceExtensions = new Set([".md", ".json", ".yml", ".yaml"]);
const operatorCommandReferenceSourcePaths: ReadonlySet<string> = new Set([...BASE_OPERATOR_COMMAND_REFERENCE_SOURCE_FILES, "docs/base-testing.md"]);

export function collectCommandReferenceSourcePaths(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map((entry) => join(root, String(entry)))
    .filter((path) => statSync(path).isFile())
    .filter((path) => hasCheckedSourceExtension(path))
    .sort();
}

export function extractBaseCommandReferences(sources: readonly CommandReferenceSource[]): string[] {
  return [...new Set(collectReferences(sources).map((reference) => reference.command))].sort();
}

export function extractBaseNpmRunCommandReferences(sources: readonly CommandReferenceSource[]): string[] {
  return [...new Set(collectNpmRunReferences(sources).map((reference) => reference.command))].sort();
}

export function extractBaseFencedNpmRunCommandReferences(sources: readonly CommandReferenceSource[]): string[] {
  return [...new Set(collectFencedNpmRunReferences(sources).map((reference) => reference.command))].sort();
}

export function validateBaseCommandReferences(input: BaseCommandReferenceValidationInput): string[] {
  return validateCommandReferences(input, "checked docs or workflows", collectReferences);
}

export function validateBaseOperatorCommandReferences(input: BaseCommandReferenceValidationInput): string[] {
  return validateCommandReferences(input, "operator docs", collectReferences, { requireOperatorSources: true });
}

export function validateBaseOperatorCommandInvocations(input: BaseCommandReferenceValidationInput): string[] {
  return validateCommandReferences(input, "runnable operator commands", collectNpmRunReferences, { requireOperatorSources: true });
}

export function validateBaseOperatorFencedCommandInvocations(input: BaseCommandReferenceValidationInput): string[] {
  return validateCommandReferences(input, "fenced operator commands", collectFencedNpmRunReferences, { requireOperatorSources: true });
}

function validateCommandReferences(
  input: BaseCommandReferenceValidationInput,
  coverageLabel: string,
  collect: (sources: readonly CommandReferenceSource[]) => ReferenceWithSource[],
  options: { requireOperatorSources?: boolean } = {},
): string[] {
  const scripts = readBaseScriptNames(input.packageJson);
  if (!scripts) return ["package.json scripts must be an object"];

  const sourceFailure = validateSources(input.sources);
  if (sourceFailure) return [sourceFailure];

  if (options.requireOperatorSources) {
    const operatorSourceFailure = validateOperatorSources(input.sources);
    if (operatorSourceFailure) return [operatorSourceFailure];
  }

  const failures: string[] = [];
  const references = collect(input.sources);
  const referencedCommands = new Set(references.map((reference) => reference.command));

  for (const reference of references) {
    if (!scripts.has(reference.command)) {
      failures.push(`${reference.sourcePath} references unknown package script ${reference.command}`);
    }
  }

  for (const script of [...scripts].sort()) {
    if (!referencedCommands.has(script)) {
      failures.push(`package script ${script} must be referenced by ${coverageLabel}`);
    }
  }

  return failures;
}

function collectReferences(sources: readonly CommandReferenceSource[]): ReferenceWithSource[] {
  const references: ReferenceWithSource[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (typeof source.text !== "string" || typeof source.path !== "string") continue;

    for (const match of source.text.matchAll(commandReferencePattern)) {
      const command = match[0];
      const key = `${source.path}\0${command}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({ sourcePath: source.path, command });
    }
  }

  return references;
}

function collectNpmRunReferences(sources: readonly CommandReferenceSource[]): ReferenceWithSource[] {
  return collectPatternReferences(sources, npmRunCommandReferencePattern, 1);
}

function collectFencedNpmRunReferences(sources: readonly CommandReferenceSource[]): ReferenceWithSource[] {
  return collectPatternReferences(
    sources.flatMap((source) => extractFenceSources(source)),
    npmRunCommandReferencePattern,
    1,
  );
}

function extractFenceSources(source: CommandReferenceSource): CommandReferenceSource[] {
  if (typeof source.text !== "string" || typeof source.path !== "string") return [];

  return [...source.text.matchAll(markdownFencePattern)].map((match) => ({
    path: source.path,
    text: match[1] ?? "",
  }));
}

function collectPatternReferences(
  sources: readonly CommandReferenceSource[],
  pattern: RegExp,
  commandGroup: number,
): ReferenceWithSource[] {
  const references: ReferenceWithSource[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (typeof source.text !== "string" || typeof source.path !== "string") continue;

    for (const match of source.text.matchAll(pattern)) {
      const command = match[commandGroup];
      if (!command) continue;
      const key = `${source.path}\0${command}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({ sourcePath: source.path, command });
    }
  }

  return references;
}

function readBaseScriptNames(packageJson: unknown): Set<string> | null {
  if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) return null;

  return new Set(
    Object.keys(packageJson.scripts)
      .filter((script) => script.startsWith(BASE_COMMAND_REFERENCE_SCRIPT_NAMESPACE))
      .sort(),
  );
}

function validateSources(sources: readonly CommandReferenceSource[]): string | null {
  if (!Array.isArray(sources)) return "command reference sources must be an array";

  for (const source of sources) {
    if (!isRecord(source) || typeof source.path !== "string") return "command reference source path must be a string";
    if (typeof source.text !== "string") return `command reference source ${source.path} text must be a string`;
  }

  return null;
}

function validateOperatorSources(sources: readonly CommandReferenceSource[]): string | null {
  for (const source of sources) {
    if (!operatorCommandReferenceSourcePaths.has(source.path)) {
      return `operator command reference source ${source.path} must be README.md, COMMANDS.md, or docs/base-testing.md`;
    }
  }

  return null;
}

function hasCheckedSourceExtension(path: string): boolean {
  return [...checkedSourceExtensions].some((extension) => path.endsWith(extension));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
