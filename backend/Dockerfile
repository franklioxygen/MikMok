FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM deps AS frontend-builder

WORKDIR /app

COPY tsconfig.base.json ./
COPY frontend ./frontend

ARG VITE_API_URL=/api
ARG VITE_BACKEND_URL=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

RUN npm run build --workspace frontend

FROM deps AS backend-builder

WORKDIR /app

COPY tsconfig.base.json ./
COPY backend ./backend

RUN npm run build --workspace backend

FROM node:22-bookworm-slim AS prod-deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace backend

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5552
ENV CORS_ORIGIN=http://localhost:5552
ENV ALLOWED_MOUNT_ROOTS=/mounts
ENV SESSION_TTL_DAYS=7
ENV MAX_UPLOAD_SIZE_MB=500
ENV TRANSCODE_ENABLED=1

COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p \
    /app/backend/data \
    /app/backend/uploads/videos \
    /app/backend/uploads/tmp \
    /app/backend/uploads/transcodes \
    /app/backend/uploads/thumbnails \
    /app/backend/uploads/thumbnails-sm \
    /mounts

EXPOSE 5552

CMD ["node", "backend/dist/server.js"]
