import { describe, expect, it } from "vitest";

import {
  createAgentOsSdkExampleCatalog,
  formatAgentOsSdkExampleCatalogSummary,
  verifyAgentOsSdkExampleCatalog,
} from "./exampleCatalog.js";

const GENERATED_AT = "2026-07-03T12:00:00.000Z";

describe("AgentOS SDK example catalog", () => {
  it("creates a local-only catalog for the documented SDK examples", () => {
    const catalog = createAgentOsSdkExampleCatalog({ generatedAt: GENERATED_AT });

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.generatedAt).toBe(GENERATED_AT);
    expect(catalog.chainId).toBe(84532);
    expect(catalog.trustBoundary).toEqual({
      ai: "proposes",
      policy: "decides",
      accounts: "execute",
      callClass: "local-only",
      mainnet: false,
      liveFunds: false,
    });
    expect(catalog.examples.map((example) => [example.id, example.kind])).toEqual([
      ["treasury-payment-intent", "intent"],
      ["erc20-transfer-intent", "intent"],
      ["swap-exact-eth-for-token-intent", "intent"],
      ["memory-commit-plan", "plan"],
      ["reputation-score-sync", "owner-transaction"],
      ["coordination-lifecycle-plan", "plan"],
    ]);
  });

  it("verifies fresh catalogs and rejects stale example contents", () => {
    const catalog = createAgentOsSdkExampleCatalog({ generatedAt: GENERATED_AT });
    expect(verifyAgentOsSdkExampleCatalog({ catalog }).passed).toBe(true);

    const stale = {
      ...catalog,
      examples: catalog.examples.map((example) =>
        example.id === "treasury-payment-intent"
          ? { ...example, artifact: { ...(example.artifact as Record<string, unknown>), objective: "Edited objective" } }
          : example
      ),
    };

    const verification = verifyAgentOsSdkExampleCatalog({ catalog: stale });

    expect(verification.passed).toBe(false);
    expect(verification.failures).toEqual(["SDK example catalog is stale"]);
  });

  it("formats a compact operator summary", () => {
    const catalog = createAgentOsSdkExampleCatalog({ generatedAt: GENERATED_AT });

    expect(formatAgentOsSdkExampleCatalogSummary(catalog)).toContain("AgentOS SDK example catalog");
    expect(formatAgentOsSdkExampleCatalogSummary(catalog)).toContain("examples: 6");
    expect(formatAgentOsSdkExampleCatalogSummary(catalog)).toContain("callClass: local-only");
  });

  it("rejects malformed catalogs without generation metadata", () => {
    const { generatedAt: _generatedAt, ...catalog } = createAgentOsSdkExampleCatalog({ generatedAt: GENERATED_AT });

    expect(() => verifyAgentOsSdkExampleCatalog({
      catalog: catalog as ReturnType<typeof createAgentOsSdkExampleCatalog>,
    })).toThrow("SDK example catalog generatedAt must be a string");
  });
});
