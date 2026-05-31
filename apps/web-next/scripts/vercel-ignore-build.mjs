import { execSync } from "node:child_process";

const ref =
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.GITHUB_HEAD_REF ||
  process.env.GITHUB_REF_NAME ||
  "";
const pullRequestId = process.env.VERCEL_GIT_PULL_REQUEST_ID || "";

const shouldSkipViaCommitMarker = () => {
  try {
    const subject = String(execSync("git log -1 --pretty=%s", { stdio: ["ignore", "pipe", "ignore"] }) || "").trim();
    return subject.includes("[skip vercel]") || subject.includes("[skip-vercel]");
  } catch {
    return false;
  }
};

if (shouldSkipViaCommitMarker()) {
  console.log("[vercel] ignoring build due to commit marker");
  process.exit(0);
}

if (ref.startsWith("automation/")) {
  console.log(`[vercel] ignoring build for ${ref}`);
  process.exit(0);
}

if (ref.startsWith("codex/") && !pullRequestId) {
  console.log(`[vercel] ignoring build for ${ref} without PR`);
  process.exit(0);
}

process.exit(1);
