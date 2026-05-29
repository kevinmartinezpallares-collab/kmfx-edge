import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const runtimeSourceRoot = path.join(process.cwd(), "src");

const blockedProviderRuntimePatterns = [
  /from\s+["'](?:@supabase|stripe|openai)\b/,
  /require\(["'](?:@supabase|stripe|openai)\b/,
];

const blockedRuntimePatterns = [
  /from\s+["'](?:node:)?(?:fs|child_process|net|tls)["']/,
  /require\(["'](?:node:)?(?:fs|child_process|net|tls)["']\)/,
  /from\s+["'](?:\.\.\/){2,}/,
  /require\(["'](?:\.\.\/){2,}/,
  /\bSTRIPE_(?:SECRET|WEBHOOK|PRICE|PRODUCT)/,
  /\bSUPABASE_(?:SERVICE_ROLE|JWT_SECRET)/,
  /\bKMFXConnector\b/,
  /\baccount_service\b/,
  /\baccount_store\b/,
];

function collectRuntimeFiles(directory = runtimeSourceRoot): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) return collectRuntimeFiles(absolutePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (entry.name.includes(".test.")) return [];

    return [absolutePath];
  });
}

describe("migration scope guardrails", () => {
  it("keeps Next runtime isolated from sensitive legacy and provider code", () => {
    const violations = collectRuntimeFiles().flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const relativePath = path.relative(process.cwd(), filePath);
      const providerViolations = relativePath.startsWith("src/lib/supabase/")
        ? []
        : blockedProviderRuntimePatterns
            .filter((pattern) => pattern.test(source))
            .map((pattern) => `${relativePath} -> ${pattern}`);

      return blockedRuntimePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} -> ${pattern}`)
        .concat(providerViolations);
    });

    expect(violations).toEqual([]);
  });

  it("keeps Supabase access behind the dedicated auth wrapper", () => {
    const supabaseRuntimeFiles = collectRuntimeFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return blockedProviderRuntimePatterns.some((pattern) => pattern.test(source));
    });

    expect(
      supabaseRuntimeFiles.map((filePath) => path.relative(process.cwd(), filePath)).sort(),
    ).toEqual([
      "src/lib/supabase/client.ts",
      "src/lib/supabase/proxy.ts",
      "src/lib/supabase/server.ts",
    ]);
  });
});
