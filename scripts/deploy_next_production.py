#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB_NEXT = ROOT / "apps" / "web-next"
VERCEL_PROJECT = WEB_NEXT / ".vercel" / "project.json"


def run(
    command: list[str],
    *,
    cwd: Path = ROOT,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=check,
        text=True,
    )


def output(command: list[str], *, cwd: Path = ROOT) -> str:
    return subprocess.check_output(command, cwd=cwd, text=True).strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deploy apps/web-next to the KMFX production Vercel project from a clean git worktree.",
    )
    parser.add_argument(
        "--ref",
        default="HEAD",
        help="Git ref to deploy. Defaults to HEAD.",
    )
    parser.add_argument(
        "--keep-worktree",
        action="store_true",
        help="Keep the temporary worktree for debugging.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not VERCEL_PROJECT.exists():
        print(
            f"missing_vercel_project_link: {VERCEL_PROJECT}",
            file=sys.stderr,
        )
        return 2

    commit = output(["git", "rev-parse", args.ref])
    worktree_root = Path(tempfile.mkdtemp(prefix="kmfx-next-production-deploy-"))
    deploy_root = worktree_root / "repo"

    try:
        run(["git", "worktree", "add", "--detach", str(deploy_root), commit])

        deploy_web_next = deploy_root / "apps" / "web-next"
        deploy_vercel_dir = deploy_web_next / ".vercel"
        deploy_vercel_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(VERCEL_PROJECT, deploy_vercel_dir / "project.json")

        print(f"deploying_ref={args.ref}")
        print(f"deploying_commit={commit}")
        run(["npx", "--yes", "vercel@latest", "deploy", "--prod"], cwd=deploy_web_next)
        print("next_production_deploy_complete")
        return 0
    finally:
        if args.keep_worktree:
            print(f"kept_worktree={deploy_root}")
        else:
            run(["git", "worktree", "remove", str(deploy_root), "--force"], check=False)
            shutil.rmtree(worktree_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
