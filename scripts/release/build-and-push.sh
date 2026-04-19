#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

DOCKER_PATH="${DOCKER_PATH:-docker}"
USERNAME="${USERNAME:-franklioxygen}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/$USERNAME/mikmok}"
VERSION="${1:-}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
BUILDER_NAME="${BUILDER_NAME:-mikmokbuilder}"
ATTESTATION_FLAGS=(--provenance=false --sbom=false)

echo "🔍 Checking if Docker is running..."
$DOCKER_PATH ps > /dev/null 2>&1 || {
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
}
echo "✅ Docker is running!"

echo "🔍 Setting up Docker Buildx builder..."
$DOCKER_PATH buildx inspect "$BUILDER_NAME" > /dev/null 2>&1 || \
  $DOCKER_PATH buildx create --name "$BUILDER_NAME" --use
$DOCKER_PATH buildx use "$BUILDER_NAME"
$DOCKER_PATH buildx inspect --bootstrap > /dev/null
echo "✅ Buildx builder ready!"

TAGS=(-t "$IMAGE_REPOSITORY:latest")

if [ -n "$VERSION" ]; then
  echo "🔖 Version specified: $VERSION"
  TAGS+=(-t "$IMAGE_REPOSITORY:$VERSION")
fi

echo ""
echo "🏗️ Building and pushing MikMok image..."
echo "Image repository: $IMAGE_REPOSITORY"
echo "Platforms: $PLATFORMS"
echo ""

$DOCKER_PATH buildx build \
  --platform "$PLATFORMS" \
  "${ATTESTATION_FLAGS[@]}" \
  -f backend/Dockerfile \
  "${TAGS[@]}" \
  --push \
  .

echo ""
echo "✅ Successfully built and pushed MikMok image!"
echo "  - $IMAGE_REPOSITORY:latest"
if [ -n "$VERSION" ]; then
  echo "  - $IMAGE_REPOSITORY:$VERSION"
fi
echo ""
echo "Compose deployment:"
echo "  docker compose -f stacks/docker-compose.yml up -d"
echo ""
echo "🕐 Build completed at: $(date '+%Y-%m-%d %H:%M:%S %Z')"
