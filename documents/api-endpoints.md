# MikMok — API 接口参考

所有接口默认以 `/api` 为前缀，除 `GET /stream/:id` 外都走 API 域。除登录、健康检查外，其余接口都要求已登录。

写接口要求：

- 认证 Cookie：`mikmok_session`
- CSRF Header：`X-CSRF-Token`

---

## 通用响应

### 成功

```json
{
  "success": true,
  "data": {}
}
```

### 失败

```json
{
  "success": false,
  "error": "Readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

---

## 认证

### `POST /api/auth/login`

登录并创建会话。

Request:

```json
{ "password": "your_password" }
```

Response:

```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "sessionExpiresAt": 1713456789
  }
}
```

### `POST /api/auth/logout`

退出当前会话并清除 Cookie。

### `GET /api/auth/status`

检查当前登录状态。

Response:

```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "sessionExpiresAt": 1713456789
  }
}
```

---

## Feed 与视频

### `GET /api/videos/feed`

获取 Feed。随机模式通过服务端 `sessionId` 保持顺序稳定。

Query:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | string | `random` | `random` / `latest` / `by_folder` |
| `sessionId` | string | - | 首次不传，翻页时传回 |
| `cursor` | string | - | 不透明游标 |
| `limit` | number | `10` | 每页条数，最大 20 |
| `folderId` | string | - | 限定文件夹 |
| `tag` | string | - | 按标签过滤 |
| `likedOnly` | boolean | `false` | 仅喜欢的视频 |

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "vid_123",
      "title": "Vacation Clip",
      "durationSeconds": 31.5,
      "width": 1080,
      "height": 1920,
      "thumbnailSmUrl": "/api/videos/vid_123/thumbnail-sm",
      "streamUrl": "/stream/vid_123",
      "folderId": "fld_1",
      "tags": ["travel", "beach"],
      "liked": false,
      "resumePositionSeconds": 0
    }
  ],
  "meta": {
    "sessionId": "feed_sess_abc",
    "nextCursor": "eyJvZmZzZXQiOjEwfQ==",
    "hasMore": true
  }
}
```

错误码：

- `INVALID_FEED_MODE`
- `SESSION_EXPIRED`
- `INVALID_CURSOR`

前端处理建议：

- 收到 `SESSION_EXPIRED` 或 `INVALID_CURSOR` 后，清空本地 `sessionId` 和 `cursor`
- 保留当前筛选条件，重新请求第一页

### `GET /api/videos/:id`

获取单个视频详情。

Response:

```json
{
  "success": true,
  "data": {
    "id": "vid_123",
    "title": "Vacation Clip",
    "description": null,
    "durationSeconds": 31.5,
    "width": 1080,
    "height": 1920,
    "container": "mp4",
    "videoCodec": "h264",
    "audioCodec": "aac",
    "playbackStatus": "direct",
    "thumbnailUrl": "/api/videos/vid_123/thumbnail",
    "thumbnailSmUrl": "/api/videos/vid_123/thumbnail-sm",
    "streamUrl": "/stream/vid_123",
    "sourceType": "mount",
    "folderId": "fld_1",
    "folderName": "Travel Shorts",
    "tags": ["travel", "beach"],
    "playCount": 12,
    "resumePositionSeconds": 8.2,
    "liked": true,
    "hidden": false,
    "createdAt": 1713400000
  }
}
```

### `PATCH /api/videos/:id`

更新视频元数据。

Request:

```json
{
  "title": "New Title",
  "description": "Updated description",
  "tags": ["travel", "sunset"],
  "liked": true
}
```

### `DELETE /api/videos/:id`

软删除视频，不删除磁盘文件。

### `POST /api/videos/:id/play`

记录一次播放开始。

Request:

```json
{ "positionSeconds": 0 }
```

### `POST /api/videos/:id/progress`

上报播放进度。

Request:

```json
{
  "positionSeconds": 14.2,
  "completed": false
}
```

### `GET /api/videos/:id/thumbnail`

返回全尺寸缩略图。

### `GET /api/videos/:id/thumbnail-sm`

返回小尺寸缩略图。

---

## 视频流

### `GET /stream/:id`

流式传输视频文件，支持 HTTP Range。

Headers:

```text
Range: bytes=0-1048576
```

典型响应：

```text
206 Partial Content
Content-Type: video/mp4
Content-Range: bytes 0-1048576/12345678
Accept-Ranges: bytes
```

错误码：

- `VIDEO_NOT_FOUND`
- `VIDEO_NOT_PLAYABLE`
- `FILE_MISSING`
- `RANGE_NOT_SATISFIABLE`

---

## 文件夹

### `GET /api/folders`

列出所有挂载路径。

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "fld_1",
      "name": "Travel Shorts",
      "mountPath": "/mounts/travel-shorts",
      "isActive": true,
      "autoScan": true,
      "scanIntervalMinutes": 60,
      "maxDepth": 6,
      "scanStatus": "done",
      "lastScannedAt": 1713456789,
      "videoCount": 42
    }
  ]
}
```

### `POST /api/folders`

添加挂载路径。

Request:

```json
{
  "name": "Travel Shorts",
  "mountPath": "/mounts/travel-shorts",
  "autoScan": true,
  "scanIntervalMinutes": 60,
  "maxDepth": 6
}
```

错误码：

- `PATH_NOT_FOUND`
- `PATH_NOT_DIRECTORY`
- `PATH_NOT_READABLE`
- `PATH_OUTSIDE_ALLOWED_ROOTS`
- `PATH_OVERLAPS_EXISTING_MOUNT`

说明：

- `mountPath` 必须位于服务端配置的 `ALLOWED_MOUNT_ROOTS` 之下，默认是 `/mounts`

### `PATCH /api/folders/:id`

更新挂载目录配置。

Request:

```json
{
  "name": "Travel Shorts",
  "autoScan": true,
  "scanIntervalMinutes": 30,
  "maxDepth": 4,
  "isActive": true
}
```

语义：

- `isActive=false` 会停用该挂载目录，并把该目录下已有视频统一隐藏
- `isActive=true` 会重新启用该挂载目录；视频可见性在下一次扫描后恢复
- `autoScan=false` 仅关闭自动扫描，不影响手动扫描

### `DELETE /api/folders/:id`

移除挂载路径，不删除外部文件。该目录下视频会被标记为隐藏。

### `POST /api/folders/:id/scan`

触发立即扫描。

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "job_scan_123"
  }
}
```

### `GET /api/folders/:id/videos`

列出某文件夹的视频。

Query:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | number | `1` | 页码 |
| `limit` | number | `20` | 每页条数 |
| `sort` | string | `created_at` | `created_at` / `title` / `duration` |

---

## 上传

### `POST /api/uploads`

上传 1 个或多个视频文件。

Request:

- `multipart/form-data`
- 字段：`files[]`

Response:

```json
{
  "success": true,
  "data": {
    "uploadBatchId": "upl_123",
    "jobId": "job_upload_finalize_123",
    "accepted": 3
  }
}
```

说明：

- 浏览器网络上传进度由前端本地上报
- `jobId` 用于查询服务端后处理状态

错误码：

- `FILE_TYPE_NOT_ALLOWED`
- `FILE_TOO_LARGE`
- `UPLOAD_WRITE_FAILED`

---

## 任务

### `GET /api/jobs/:id`

获取任务状态。

Response:

```json
{
  "success": true,
  "data": {
    "id": "job_scan_123",
    "type": "scan",
    "status": "running",
    "attemptCount": 1,
    "relatedEntityType": "folder",
    "relatedEntityId": "fld_1",
    "progressCurrent": 120,
    "progressTotal": 300,
    "progressMessage": "Scanning /mounts/travel-shorts",
    "lastError": null,
    "createdAt": 1713456000,
    "startedAt": 1713456010,
    "finishedAt": null
  }
}
```

### `GET /api/jobs/:id/events`

通过 SSE 订阅任务状态。

Events:

```text
event: progress
data: {"status":"running","progressCurrent":120,"progressTotal":300}

event: done
data: {"status":"succeeded"}

event: error
data: {"status":"failed","lastError":"ffprobe failed"}
```

---

## 标签

### `GET /api/tags`

返回标签列表和引用计数。

Response:

```json
{
  "success": true,
  "data": [
    { "name": "travel", "count": 12 },
    { "name": "beach", "count": 4 }
  ]
}
```

---

## 设置

### `GET /api/settings`

Response:

```json
{
  "success": true,
  "data": {
    "feedDefaultMode": "random",
    "autoplayEnabled": true,
    "loopVideo": false,
    "transcodeEnabled": true,
    "maxUploadSizeMb": 500
  }
}
```

### `PATCH /api/settings`

更新非安全设置。

Request:

```json
{
  "feedDefaultMode": "latest",
  "autoplayEnabled": false
}
```

### `POST /api/settings/password`

修改登录密码，并使所有会话失效。

Request:

```json
{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

---

## 健康检查

### `GET /api/health/live`

进程存活检查。

### `GET /api/health/ready`

检查数据库、上传目录、FFmpeg、FFprobe 是否就绪。
