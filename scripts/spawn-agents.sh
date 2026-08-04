#!/usr/bin/env bash
#
# Spawn N background Claude Code agents, each in its own git worktree, each
# ready to run `pnpm build` immediately.
#
#   scripts/spawn-agents.sh "fix the KR popover clear bug" "add a Jira retry"
#
# Why this exists instead of plain `claude --bg -w <name>`:
#   `.env.local` and `node_modules` are both gitignored, so a freshly created
#   worktree has neither. Every script in scripts/ runs via
#   `node --env-file=.env.local`, and `pnpm build` needs deps. An agent dropped
#   into a bare worktree fails on its first command. This seeds both first.
#
# Env overrides:
#   BASE_REF=main            branch/ref the worktrees fork from (default origin/main)
#   SKIP_INSTALL=1           don't run pnpm install (you'll seed deps yourself)
#   PREFIX=agent             worktree/branch name prefix

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
# When invoked from inside a worktree, --show-toplevel points at the worktree.
# Resolve to the main checkout so worktrees are always created in one place.
COMMON_DIR="$(git rev-parse --git-common-dir)"
MAIN_ROOT="$(cd "$(dirname "$COMMON_DIR")" && pwd)"

BASE_REF="${BASE_REF:-origin/main}"
PREFIX="${PREFIX:-agent}"
WORKTREE_DIR="$MAIN_ROOT/.claude/worktrees"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 \"task one\" \"task two\" ..." >&2
  echo "" >&2
  echo "Each argument becomes one background agent in its own worktree." >&2
  exit 1
fi

command -v claude >/dev/null || { echo "error: claude CLI not on PATH" >&2; exit 1; }
command -v pnpm   >/dev/null || { echo "error: pnpm not on PATH" >&2; exit 1; }

if [ ! -f "$MAIN_ROOT/.env.local" ]; then
  echo "error: $MAIN_ROOT/.env.local not found — agents would fail on every script" >&2
  exit 1
fi

# Make sure BASE_REF exists before creating anything.
git -C "$MAIN_ROOT" fetch --quiet origin 2>/dev/null || true
if ! git -C "$MAIN_ROOT" rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  echo "error: base ref '$BASE_REF' does not exist" >&2
  exit 1
fi

# Short slug from the task text, so the agent view is readable at a glance.
slugify() {
  echo "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | cut -c1-32 \
    | sed -E 's/-+$//'
}

mkdir -p "$WORKTREE_DIR"

i=0
for TASK in "$@"; do
  i=$((i + 1))
  SLUG="$(slugify "$TASK")"
  [ -n "$SLUG" ] || SLUG="task"
  NAME="$PREFIX-$i-$SLUG"
  PATH_WT="$WORKTREE_DIR/$NAME"
  BRANCH="$NAME"

  if [ -e "$PATH_WT" ]; then
    echo "skip: $PATH_WT already exists" >&2
    continue
  fi

  echo "==> [$i/$#] $NAME"
  echo "    task: $TASK"

  git -C "$MAIN_ROOT" worktree add --quiet -b "$BRANCH" "$PATH_WT" "$BASE_REF"

  # Symlink rather than copy so a rotated key propagates to running agents.
  ln -s "$MAIN_ROOT/.env.local" "$PATH_WT/.env.local"

  if [ -z "${SKIP_INSTALL:-}" ]; then
    echo "    installing deps..."
    # pnpm hardlinks from the shared store, so this is cheap per worktree.
    (cd "$PATH_WT" && pnpm install --frozen-lockfile --silent)
  fi

  # `claude --bg` inherits the shell cwd, so cd in rather than passing a flag.
  (cd "$PATH_WT" && claude --bg "$TASK") >/dev/null
  echo "    dispatched"
done

echo ""
echo "All dispatched. Watch them with:  claude agents"
echo "Or as JSON:                       claude agents --cwd \"$MAIN_ROOT\" --json"
