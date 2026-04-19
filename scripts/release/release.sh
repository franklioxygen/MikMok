#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
SKIP_DOCKER_PUSH="${SKIP_DOCKER_PUSH:-0}"

usage() {
  echo "Usage: $0 <version|major|minor|patch>"
  echo ""
  echo "Examples:"
  echo "  $0 0.2.0"
  echo "  $0 patch"
  echo ""
  echo "Environment:"
  echo "  DEFAULT_BRANCH=main      Branch expected for release pushes"
  echo "  SKIP_DOCKER_PUSH=1       Skip scripts/release/build-and-push.sh"
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

INPUT_VERSION="$1"

for required_command in git node npm docker; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "❌ Required command not found: $required_command"
    exit 1
  fi
done

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Git workspace is not clean. Please commit or stash changes first."
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "$DEFAULT_BRANCH" ]; then
  echo "⚠️  You are not on the $DEFAULT_BRANCH branch (current: $CURRENT_BRANCH)."
  read -r -p "Do you want to continue? (y/N) " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "🧪 Running typecheck..."
npm run typecheck

echo "🏗️  Building project..."
npm run build

echo "🔄 Updating version numbers..."
npm version "$INPUT_VERSION" --no-git-tag-version --allow-same-version

NEW_VERSION="$(node -p "require('./package.json').version")"
echo "✅ New version: $NEW_VERSION"

(
  cd frontend
  npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
)

(
  cd backend
  npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
)

if git rev-parse -q --verify "refs/tags/v$NEW_VERSION" >/dev/null 2>&1; then
  echo "❌ Git tag already exists: v$NEW_VERSION"
  exit 1
fi

if [ "$SKIP_DOCKER_PUSH" != "1" ]; then
  echo "🐳 Building and pushing Docker image..."
  "$SCRIPT_DIR/build-and-push.sh" "$NEW_VERSION"
else
  echo "⏭️  Skipping Docker image build and push (SKIP_DOCKER_PUSH=1)."
fi

echo "📦 Committing release metadata..."
git add package.json frontend/package.json backend/package.json package-lock.json
git commit -m "chore(release): v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo "🚀 Pushing branch and tag..."
git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"

echo ""
echo "✅ Release complete: v$NEW_VERSION"
echo "   Branch: $CURRENT_BRANCH"
echo "   Tag: v$NEW_VERSION"
