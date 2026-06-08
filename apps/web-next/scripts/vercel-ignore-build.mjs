import { execSync } from "node:child_process";

const normalizeRef = (value) => {
  const ref = String(value || "").trim();
  if (!ref) return "";
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
  if (ref.startsWith("remotes/origin/")) return ref.slice("remotes/origin/".length);
  return ref;
};

const tryExec = (command) => {
  try {
    return String(execSync(command, { stdio: ["ignore", "pipe", "ignore"] }) || "").trim();
  } catch {
    return "";
  }
};

const resolveGitRefFromRepo = () => {
  const symbolic = normalizeRef(tryExec("git symbolic-ref -q --short HEAD"));
  if (symbolic && symbolic !== "HEAD") return symbolic;

  const nameRev = normalizeRef(tryExec("git name-rev --name-only --no-undefined HEAD"));
  if (nameRev) {
    const cleaned = nameRev.replace(/^origin\//, "").replace(/^remotes\/origin\//, "");
    if (cleaned && cleaned !== "HEAD") return cleaned;
  }

  const pointedAt = tryExec("git for-each-ref --points-at HEAD --format='%(refname:short)' refs/heads refs/remotes/origin");
  if (pointedAt) {
    const candidates = pointedAt
      .split(/\r?\n/g)
      .map((line) => normalizeRef(line.replace(/^'+|'+$/g, "")))
      .filter(Boolean)
      .map((line) => line.replace(/^origin\//, "").replace(/^remotes\/origin\//, ""));

    const preferred = candidates.find((c) => c.startsWith("automation/") || c.startsWith("codex/")) || candidates[0];
    if (preferred && preferred !== "HEAD") return preferred;
  }

  return "";
};

const resolveGitRef = () => {
  const ref =
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    "";
  const normalized = normalizeRef(ref);
  if (normalized) return normalized;

  return resolveGitRefFromRepo();
};

const ref = resolveGitRef();
const pullRequestId = process.env.VERCEL_GIT_PULL_REQUEST_ID || "";

const shouldSkipViaCommitMarker = () => {
  const subject = tryExec("git log -1 --pretty=%s");
  return subject.includes("[skip vercel]") || subject.includes("[skip-vercel]");
};

const shouldForceRunViaCommitMarker = () => {
  const subject = tryExec("git log -1 --pretty=%s");
  return subject.includes("[run vercel]") || subject.includes("[run-vercel]");
};

if (shouldSkipViaCommitMarker()) {
  console.log("[vercel] ignoring build due to commit marker");
  process.exit(0);
}

if (ref.startsWith("automation/")) {
  console.log(`[vercel] ignoring build for ${ref}`);
  process.exit(0);
}

if (ref.startsWith("codex/") && !pullRequestId && !shouldForceRunViaCommitMarker()) {
  const prLabel = pullRequestId ? `PR ${pullRequestId}` : "no PR";
  console.log(`[vercel] ignoring build for ${ref} (${prLabel}); add [run vercel] to force`);
  process.exit(0);
}

process.exit(1);
