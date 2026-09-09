import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASE_COMMAND_REFERENCE_SOURCE_DIRECTORIES,
  BASE_COMMAND_REFERENCE_SOURCE_FILES,
  BASE_COMMAND_REFERENCE_SCRIPT_NAMESPACE,
  BASE_OPERATOR_COMMAND_REFERENCE_SOURCE_FILES,
  collectCommandReferenceSourcePaths,
  extractBaseFencedNpmRunCommandReferences,
  extractBaseNpmRunCommandReferences,
  extractBaseCommandReferences,
  validateBaseCommandReferences,
  validateBaseOperatorFencedCommandInvocations,
  validateBaseOperatorCommandInvocations,
  validateBaseOperatorCommandReferences,
} from "./commandReferences.js";
import { BASE_PACKAGE_SCRIPT_NAMESPACE } from "./packageScripts.js";

const REFERENCE_SOURCE_PATHS = [
  ...BASE_COMMAND_REFERENCE_SOURCE_FILES,
  ...BASE_COMMAND_REFERENCE_SOURCE_DIRECTORIES.flatMap((directory) => collectCommandReferenceSourcePaths(directory)),
];
const OPERATOR_REFERENCE_SOURCE_PATHS = [...BASE_OPERATOR_COMMAND_REFERENCE_SOURCE_FILES];

function readPackageJson(): unknown {
  return JSON.parse(readFileSync("package.json", "utf8"));
}

function readReferenceSources(): Array<{ path: string; text: string }> {
  return REFERENCE_SOURCE_PATHS
    .filter((path) => statSync(path).isFile())
    .map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

function readOperatorReferenceSources(): Array<{ path: string; text: string }> {
  return OPERATOR_REFERENCE_SOURCE_PATHS.map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

describe("extractBaseCommandReferences", () => {
  it("keeps command-reference parsing aligned with the package script namespace", () => {
    expect(BASE_COMMAND_REFERENCE_SCRIPT_NAMESPACE).toBe(BASE_PACKAGE_SCRIPT_NAMESPACE);
  });

  it("extracts and deduplicates base command references from prose and commands", () => {
    expect(extractBaseCommandReferences([
      { path: "docs/example.md", text: "Run `npm run base:execute` then `base:manifest-verify` and base:execute again." },
    ])).toEqual(["base:execute", "base:manifest-verify"]);
  });

  it("extracts and deduplicates runnable npm base command invocations", () => {
    expect(extractBaseNpmRunCommandReferences([
      { path: "docs/example.md", text: "Run `npm run base:execute` then npm run base:manifest-verify and npm run base:execute again." },
    ])).toEqual(["base:execute", "base:manifest-verify"]);
  });

  it("extracts runnable npm base command invocations from fenced code blocks only", () => {
    expect(extractBaseFencedNpmRunCommandReferences([
      {
        path: "docs/example.md",
        text: "Prose npm run base:execute\n```bash\nnpm run base:manifest-verify\nnpm run base:execute\n```\n```text\nnpm run base:readiness\n```",
      },
    ])).toEqual(["base:execute", "base:manifest-verify", "base:readiness"]);
  });
});

describe("validateBaseCommandReferences", () => {
  it("rejects malformed package script maps", () => {
    const failures = validateBaseCommandReferences({
      packageJson: { scripts: "not-an-object" },
      sources: [{ path: "README.md", text: "npm run base:execute" }],
    });

    expect(failures).toEqual(["package.json scripts must be an object"]);
  });

  it("rejects malformed source entries", () => {
    const failures = validateBaseCommandReferences({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "README.md", text: 7 } as unknown as { path: string; text: string }],
    });

    expect(failures).toEqual(["command reference source README.md text must be a string"]);
  });

  it("rejects references to unknown base scripts", () => {
    const failures = validateBaseCommandReferences({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "README.md", text: "npm run base:execute\nnpm run base:missing" }],
    });

    expect(failures).toEqual(["README.md references unknown package script base:missing"]);
  });

  it("rejects package base scripts missing from checked references", () => {
    const failures = validateBaseCommandReferences({
      packageJson: {
        scripts: {
          "base:execute": "tsx runtime/cli/base/execute.ts",
          "base:manifest-verify": "tsx runtime/cli/base/manifestVerify.ts",
        },
      },
      sources: [{ path: "README.md", text: "npm run base:execute" }],
    });

    expect(failures).toEqual(["package script base:manifest-verify must be referenced by checked docs or workflows"]);
  });

  it("accepts broad checked references from non-operator docs", () => {
    const failures = validateBaseCommandReferences({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "docs/architecture.md", text: "`base:execute` is part of the runtime contract." }],
    });

    expect(failures).toEqual([]);
  });
});

describe("validateBaseOperatorCommandReferences", () => {
  it("rejects package base scripts missing from operator docs", () => {
    const failures = validateBaseOperatorCommandReferences({
      packageJson: {
        scripts: {
          "base:execute": "tsx runtime/cli/base/execute.ts",
          "base:manifest-verify": "tsx runtime/cli/base/manifestVerify.ts",
        },
      },
      sources: [{ path: "README.md", text: "npm run base:execute" }],
    });

    expect(failures).toEqual(["package script base:manifest-verify must be referenced by operator docs"]);
  });

  it("rejects unknown operator doc command references", () => {
    const failures = validateBaseOperatorCommandReferences({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "COMMANDS.md", text: "npm run base:execute\nnpm run base:missing" }],
    });

    expect(failures).toEqual(["COMMANDS.md references unknown package script base:missing"]);
  });

  it("rejects malformed operator source entries", () => {
    const failures = validateBaseOperatorCommandReferences({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "README.md", text: 7 } as unknown as { path: string; text: string }],
    });

    expect(failures).toEqual(["command reference source README.md text must be a string"]);
  });

  it("rejects non-operator docs as operator command reference sources", () => {
    const failures = validateBaseOperatorCommandReferences({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "docs/architecture.md", text: "`base:execute` is part of the runtime contract." }],
    });

    expect(failures).toEqual(["operator command reference source docs/architecture.md must be README.md, COMMANDS.md, or docs/base-testing.md"]);
  });
});

describe("validateBaseOperatorCommandInvocations", () => {
  it("rejects package base scripts missing from runnable operator invocations", () => {
    const failures = validateBaseOperatorCommandInvocations({
      packageJson: {
        scripts: {
          "base:execute": "tsx runtime/cli/base/execute.ts",
          "base:manifest-verify": "tsx runtime/cli/base/manifestVerify.ts",
        },
      },
      sources: [{ path: "README.md", text: "Mention base:manifest-verify, but only run npm run base:execute" }],
    });

    expect(failures).toEqual(["package script base:manifest-verify must be referenced by runnable operator commands"]);
  });

  it("rejects unknown runnable operator command invocations", () => {
    const failures = validateBaseOperatorCommandInvocations({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "COMMANDS.md", text: "npm run base:execute\nnpm run base:missing" }],
    });

    expect(failures).toEqual(["COMMANDS.md references unknown package script base:missing"]);
  });

  it("rejects malformed operator invocation source entries", () => {
    const failures = validateBaseOperatorCommandInvocations({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "README.md", text: 7 } as unknown as { path: string; text: string }],
    });

    expect(failures).toEqual(["command reference source README.md text must be a string"]);
  });

  it("rejects non-operator docs as runnable operator command sources", () => {
    const failures = validateBaseOperatorCommandInvocations({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "docs/prd.md", text: "`npm run base:execute` is required by the backlog." }],
    });

    expect(failures).toEqual(["operator command reference source docs/prd.md must be README.md, COMMANDS.md, or docs/base-testing.md"]);
  });
});

describe("validateBaseOperatorFencedCommandInvocations", () => {
  it("continues to accept separately supplied legacy operator docs", () => {
    expect(validateBaseOperatorFencedCommandInvocations({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "docs/base-testing.md", text: "```sh\nnpm run base:execute\n```" }],
    })).toEqual([]);
  });

  it("rejects package base scripts missing from fenced runnable operator examples", () => {
    const failures = validateBaseOperatorFencedCommandInvocations({
      packageJson: {
        scripts: {
          "base:execute": "tsx runtime/cli/base/execute.ts",
          "base:manifest-verify": "tsx runtime/cli/base/manifestVerify.ts",
        },
      },
      sources: [{ path: "README.md", text: "Prose npm run base:manifest-verify\n```bash\nnpm run base:execute\n```" }],
    });

    expect(failures).toEqual(["package script base:manifest-verify must be referenced by fenced operator commands"]);
  });

  it("rejects unknown fenced runnable operator command examples", () => {
    const failures = validateBaseOperatorFencedCommandInvocations({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "COMMANDS.md", text: "```bash\nnpm run base:execute\nnpm run base:missing\n```" }],
    });

    expect(failures).toEqual(["COMMANDS.md references unknown package script base:missing"]);
  });

  it("rejects malformed fenced operator command source entries", () => {
    const failures = validateBaseOperatorFencedCommandInvocations({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "README.md", text: 7 } as unknown as { path: string; text: string }],
    });

    expect(failures).toEqual(["command reference source README.md text must be a string"]);
  });

  it("rejects non-operator docs as fenced operator command sources", () => {
    const failures = validateBaseOperatorFencedCommandInvocations({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      sources: [{ path: "docs/architecture.md", text: "```bash\nnpm run base:execute\n```" }],
    });

    expect(failures).toEqual(["operator command reference source docs/architecture.md must be README.md, COMMANDS.md, or docs/base-testing.md"]);
  });
});

describe("collectCommandReferenceSourcePaths", () => {
  it("collects supported files recursively and ignores other extensions", () => {
    const root = mkdtempSync(join(tmpdir(), "command-references-"));
    try {
      mkdirSync(join(root, "nested"));
      for (const name of ["a.md", "b.json", "c.yml", "d.yaml", "ignored.txt"]) {
        writeFileSync(join(root, "nested", name), "fixture");
      }
      expect(collectCommandReferenceSourcePaths(root)).toEqual(
        ["a.md", "b.json", "c.yml", "d.yaml"].map((name) => join(root, "nested", name)),
      );
      expect(() => collectCommandReferenceSourcePaths(join(root, "missing"))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires the shipped public documentation and workflow sources", () => {
    expect(BASE_COMMAND_REFERENCE_SOURCE_FILES).toEqual(["README.md", "COMMANDS.md", "VALIDATION.md"]);
    expect(BASE_COMMAND_REFERENCE_SOURCE_DIRECTORIES).toEqual([".github/workflows"]);
    expect(BASE_OPERATOR_COMMAND_REFERENCE_SOURCE_FILES).toEqual(["README.md", "COMMANDS.md"]);
  });
});

describe("public command reference live repository coverage", () => {
  it("keeps checked base command references aligned with package scripts", () => {
    const failures = validateBaseCommandReferences({
      packageJson: readPackageJson(),
      sources: readReferenceSources(),
    });

    expect(failures).toEqual([]);
  });

  it("keeps operator-facing base command references aligned with package scripts", () => {
    const failures = validateBaseOperatorCommandReferences({
      packageJson: readPackageJson(),
      sources: readOperatorReferenceSources(),
    });

    expect(failures).toEqual([]);
  });

  it("keeps runnable operator-facing base command invocations aligned with package scripts", () => {
    const failures = validateBaseOperatorCommandInvocations({
      packageJson: readPackageJson(),
      sources: readOperatorReferenceSources(),
    });

    expect(failures).toEqual([]);
  });

  it("keeps fenced runnable operator-facing base command examples aligned with package scripts", () => {
    const failures = validateBaseOperatorFencedCommandInvocations({
      packageJson: readPackageJson(),
      sources: readOperatorReferenceSources(),
    });

    expect(failures).toEqual([]);
  });
});
