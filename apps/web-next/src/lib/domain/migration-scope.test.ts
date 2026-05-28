import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const runtimeSourceRoot = path.join(process.cwd(), "src");

const blockedRuntimePatterns = [
  /from\s+["'](?:@supabase|stripe|openai)\b/,
  /require\(["'](?:@supabase|stripe|openai)\b/,
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

      return blockedRuntimePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} -> ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
