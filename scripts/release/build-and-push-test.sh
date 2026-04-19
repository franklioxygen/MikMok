#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

DOCKER_PATH="${DOCKER_PATH:-docker}"
USERNAME="${USERNAME:-franklioxygen}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/$USERNAME/mikmok}"
PLATFORM="${PLATFORM:-linux/amd64}"
TAG="${TAG:-test}"

echo "🔍 Checking if Docker is running..."
$DOCKER_PATH ps > /dev/null 2>&1 || {
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
}
echo "✅ Docker is running!"

echo ""
echo "🏗️ Building and pushing test image..."
echo "Image repository: $IMAGE_REPOSITORY"
echo "Platform: $PLATFORM"
echo "Tag: $TAG"
echo ""

$DOCKER_PATH buildx build \
  --platform "$PLATFORM" \
  --provenance=false \
  --sbom=false \
  -f backend/Dockerfile \
  -t "$IMAGE_REPOSITORY:$TAG" \
  --push \
  .

echo ""
echo "✅ Successfully built and pushed test image!"
echo "  - $IMAGE_REPOSITORY:$TAG"
echo ""
echo "🕐 Build completed at: $(date '+%Y-%m-%d %H:%M:%S %Z')"
