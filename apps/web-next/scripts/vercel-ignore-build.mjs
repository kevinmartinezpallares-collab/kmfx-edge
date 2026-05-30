const ref =
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.GITHUB_HEAD_REF ||
  process.env.GITHUB_REF_NAME ||
  "";
const pullRequestId = process.env.VERCEL_GIT_PULL_REQUEST_ID || "";

if (ref.startsWith("automation/")) {
  console.log(`[vercel] ignoring build for ${ref}`);
  process.exit(0);
}

if (ref.startsWith("codex/") && !pullRequestId) {
  console.log(`[vercel] ignoring build for ${ref} without PR`);
  process.exit(0);
}

process.exit(1);
