// Tests host environment security policy parity with documented rules.
import fs from "node:fs";
import path from "node:path";
import { sortUniqueStrings } from "@openclaw/normalization-core/string-normalization";
import { describe, expect, it } from "vitest";
import { loadHostEnvSecurityPolicy } from "./host-env-security-policy.js";

describe("host env security policy parity", () => {
  it("derives inherited and override lists from explicit policy buckets", () => {
    const repoRoot = process.cwd();
    const policyPath = path.join(repoRoot, "src/infra/host-env-security-policy.json");
    const rawPolicy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    const policy = loadHostEnvSecurityPolicy(rawPolicy);
    const allowedInheritedOverrideOnlyKeys = new Set(
      (rawPolicy.allowedInheritedOverrideOnlyKeys ?? []).map((value: string) =>
        value.toUpperCase(),
      ),
    );

    expect(policy.blockedKeys).toEqual(sortUniqueStrings([...policy.blockedEverywhereKeys]));
    expect(policy.blockedOverrideKeys).toEqual(
      sortUniqueStrings([...policy.blockedOverrideOnlyKeys]),
    );
    expect(policy.blockedInheritedKeys).toEqual(
      sortUniqueStrings([
        ...policy.blockedEverywhereKeys,
        ...policy.blockedOverrideOnlyKeys.filter(
          (value) => !allowedInheritedOverrideOnlyKeys.has(value.toUpperCase()),
        ),
      ]),
    );
    expect(policy.blockedInheritedPrefixes).toEqual(
      sortUniqueStrings(rawPolicy.blockedInheritedPrefixes ?? rawPolicy.blockedPrefixes ?? []),
    );
  });
});
