# MikMok to MyTube Connection Guide

[中文](../zh/mytube-connection.md)

This guide explains how to connect a MikMok instance to one or more MyTube backends and consume them as read-only sources.

## What the integration does

After a MyTube source is configured:

- MikMok merges remote MyTube videos into the same `/feed` as local videos
- MikMok proxies remote streams through `/stream/:id`
- MikMok proxies remote thumbnails and author avatars through its own backend
- MikMok builds author pages from the remote video catalog
- MikMok can scope a source to all content, selected collections, selected authors, or both

This integration is read-only. MikMok does not create, edit, or delete content on MyTube.

## Prerequisites

Before you configure the connection, make sure:

- MikMok is already running and you can log in locally
- The target MyTube backend is reachable from the MikMok backend
- The MyTube backend exposes `GET /api/videos` and `GET /api/collections`
- If you want API-key auth, the MyTube backend must allow read-only API key access for:
  - `GET /api/videos`
  - `GET /api/videos/:id`
  - `GET /api/mount-video/:id`
  - `GET /api/collections`

## Supported auth modes

MikMok currently supports three auth modes for MyTube sources:

- `None`
  Use this when the MyTube instance is already public for read-only endpoints.
- `Session Cookie`
  Use this when the MyTube instance requires a logged-in browser session and you want MikMok to forward the `Cookie` request header.
- `Integration API Key`
  Use this when MyTube is configured to accept a read-only API key for the endpoints listed above.

## Which auth mode to use

Recommended order:

- Use `Integration API Key` when your MyTube backend supports read-only API key access.
- Use `None` when the MyTube instance is intentionally public.
- Use `Session Cookie` when the instance is login-protected and no read-only API key is available.

## Prepare credentials on the MyTube side

### Option 1. Integration API Key

If your MyTube backend supports read-only API key access:

1. Open MyTube settings.
2. Enable API key authentication.
3. Generate or copy the API key.
4. Keep it ready for the MikMok `Credential` field.

### Option 2. Session Cookie

If you need to reuse a MyTube login session:

1. Log in to MyTube in your browser.
2. Open browser developer tools.
3. Find any request sent to MyTube after login.
4. Copy the `Cookie` request header value.
5. Paste only the header value into MikMok.

Example:

```text
session=abc123; another_cookie=xyz456
```

Do not paste `Set-Cookie` response attributes such as `Path`, `HttpOnly`, or `Secure`.

## Configure the source in MikMok

1. Log in to MikMok.
2. Open `/settings`.
3. Find the `MyTube Source` card.
4. Create a new source or select an existing one.
5. Fill the fields:
   - `Source name`: any non-empty display name
   - `Base URL`: the MyTube base URL, for example `https://mytube.example.com`
   - `Auth mode`: `None`, `Session Cookie`, or `Integration API Key`
   - `Credential`: required for `Session Cookie` and `Integration API Key`
   - `Scope mode`: `All content`, `Selected collections`, `Selected authors`, or `Collections + authors`
   - `Enabled`: whether the source contributes to the feed
6. Click `Save`.
7. Click `Test connection`.
8. Click `Discover authors & collections` if you want to limit scope.

## Field behavior

### Source name

This is only the label shown in MikMok. It does not need to match the MyTube site name.

### Base URL

Use the MyTube site origin, such as:

```text
https://mytube.example.com
```

MikMok normalizes trailing slashes automatically.

### Credential

- Required when `Auth mode` is not `None`
- Stored on the MikMok backend, not in browser local storage
- Left blank during edit means:
  - keep the saved credential if auth mode stays the same
  - clear the old credential if you switch auth mode

### Scope mode

- `All content`: import every reachable MyTube video
- `Selected collections`: only videos that belong to selected collections
- `Selected authors`: only videos whose derived author key matches a selected author
- `Collections + authors`: union of both filters

## Discovery and author selection

When you click `Discover authors & collections`, MikMok:

- fetches the MyTube video catalog
- derives collections from `/api/collections`
- derives authors from the video list
- stores selected author keys instead of raw display names

MyTube does not currently expose a dedicated author API. MikMok builds author entries from the video catalog.

## What MikMok fetches from MyTube

At the moment, MikMok mainly depends on:

- `GET /api/videos`
- `GET /api/videos/:id`
- `GET /api/collections`
- `GET /api/mount-video/:id`
- thumbnail, image, and avatar asset paths returned by MyTube

Streams, thumbnails, and avatars are proxied by MikMok so the browser only talks to MikMok.

## Troubleshooting

### `String must contain at least 1 character(s)`

This is usually not the credential itself. It most often means `Source name` is empty.

### `Credential is required when auth mode is enabled.`

You selected `Session Cookie` or `Integration API Key` but saved without a credential.

### Test connection returns `403`

Most likely causes:

- the API key does not have read access in MyTube
- the session cookie is expired
- the target MyTube instance is not public and `Auth mode` is set to `None`

### Videos appear, but avatars or thumbnails do not

Most likely causes:

- MyTube is returning asset paths that are not reachable from the configured base URL
- the same credential works for JSON endpoints but not for protected asset paths
- the upstream asset URL points to another origin that does not accept the forwarded request

### Author pages exist in MikMok, but not in MyTube

This is expected. MikMok derives authors from videos because MyTube does not currently expose `/api/authors`.

## Current implementation notes

As currently implemented:

- remote source management routes require a local MikMok login
- write actions on remote sources require a CSRF token
- the source catalog is cached briefly on the MikMok backend
- author IDs in MikMok are source-scoped derived keys, not native MyTube author IDs
