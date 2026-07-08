import { describe, expect, it } from "vitest";

import { verifyBaseSepoliaEnvExample } from "./exampleVerifier.js";

const VALID_ENV_EXAMPLE = [
  "PRIVATE_KEY=0xreplace_with_base_sepolia_test_wallet_private_key",
  "BASE_SEPOLIA_RPC_URL=https://sepolia.base.org",
  "BASE_SEPOLIA_CHAIN_ID=84532",
].join("\n");

describe("verifyBaseSepoliaEnvExample", () => {
  it("accepts a Base Sepolia env template with placeholders and chain id", () => {
    expect(verifyBaseSepoliaEnvExample(VALID_ENV_EXAMPLE)).toEqual({
      passed: true,
      failures: [],
      variables: {
        BASE_SEPOLIA_RPC_URL: "present",
        BASE_SEPOLIA_CHAIN_ID: "84532",
        PRIVATE_KEY: "placeholder",
      },
    });
  });

  it("rejects missing broadcast-scope variables", () => {
    expect(verifyBaseSepoliaEnvExample("BASE_SEPOLIA_RPC_URL=https://sepolia.base.org\n")).toMatchObject({
      passed: false,
      failures: [
        "BASE_SEPOLIA_CHAIN_ID is required in .env.example",
        "PRIVATE_KEY is required in .env.example",
      ],
    });
  });

  it("requires the Base Sepolia chain id", () => {
    expect(
      verifyBaseSepoliaEnvExample(
        VALID_ENV_EXAMPLE.replace("BASE_SEPOLIA_CHAIN_ID=84532", "BASE_SEPOLIA_CHAIN_ID=1"),
      ),
    ).toMatchObject({
      passed: false,
      failures: ["BASE_SEPOLIA_CHAIN_ID must be 84532"],
    });
  });

  it("rejects real-looking private keys", () => {
    const privateKey = `0x${"a".repeat(64)}`;

    expect(
      verifyBaseSepoliaEnvExample(
        VALID_ENV_EXAMPLE.replace(
          "PRIVATE_KEY=0xreplace_with_base_sepolia_test_wallet_private_key",
          `PRIVATE_KEY=${privateKey}`,
        ),
      ),
    ).toMatchObject({
      passed: false,
      failures: ["PRIVATE_KEY must be a placeholder in .env.example"],
    });
  });

  it("handles quoted values and comments", () => {
    expect(
      verifyBaseSepoliaEnvExample(
        [
          "# Base Sepolia",
          "PRIVATE_KEY='0xreplace_with_base_sepolia_test_wallet_private_key'",
          'BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"',
          "BASE_SEPOLIA_CHAIN_ID='84532'",
        ].join("\n"),
      ).passed,
    ).toBe(true);
  });
});
