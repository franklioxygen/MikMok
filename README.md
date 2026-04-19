# ![MikMok Logo](frontend/src/assets/images/logo.png)

# MikMok

MikMok is a self-hosted short-video app for local disks and NAS libraries. It opens directly into a TikTok-style full-screen feed so you can browse mounted videos, uploads, and processed clips with a mobile-first playback experience.

[中文](README-zh.md)

## Features

- Full-screen vertical feed with swipe navigation
- Pause, mute, playback speed, favorite, and info card actions
- Resume the last watched video and playback position after refresh
- Mount local or NAS folders and scan them into a persistent SQLite index
- Upload videos into the built-in `Uploads` source
- Basic media processing pipeline for metadata, thumbnails, and transcode jobs
- Docker-ready deployment for NAS and home server setups

## Project Structure

- `frontend/`: React + Vite application
- `backend/`: Express + SQLite API and media services
- `documents/`: system design, API docs, and setup guides
- `stacks/`: Docker Compose examples
- `scripts/release/`: image build and publish scripts

## Local Development

```bash
npm install
npm run dev
```

After startup:

- Frontend runs on the Vite dev server
- Backend API runs on `http://localhost:5552`

## Docker Deployment

```bash
docker compose -f stacks/docker-compose.yml up -d
```

Typical container mounts:

- Data: `/app/backend/data`
- Uploads: `/app/backend/uploads`
- External media roots: `/mounts`

## Documentation

- [System Design](documents/system-design.md)
- [API Endpoints](documents/api-endpoints.md)
- [Getting Started](documents/getting-started.md)
- [Directory Structure](documents/directory-structure.md)

