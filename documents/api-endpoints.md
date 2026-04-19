# MikMok — API 接口参考

所有接口默认以 `/api` 为前缀，除 `GET /stream/:id` 外都走 API 域。

当前原型（2026-04-18）已实现的稳定子集：

- `GET /api/health`
- `GET /api/videos/feed`
- `GET /api/videos/:id`
- `POST /api/videos/:id/play`
- `POST /api/videos/:id/progress`
- `GET /api/folders`
- `POST /api/folders`
- `DELETE /api/folders/:id`
- `POST /api/folders/:id/scan`
- `GET /api/folders/:id/videos`
- `POST /api/uploads`
- `GET /stream/:id`

当前前端为验证“打开即播”的体验，暂时不启用登录拦截；`auth` 接口仍保留为后续恢复正式鉴权的接入点。

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

获取 Feed。

当前原型行为：

- 从 SQLite 中已注册的挂载目录生成列表
- 文件夹扫描结果会持久化到 SQLite `videos` 表
- 首次启动时会把存在的 `ALLOWED_MOUNT_ROOTS` 目录一次性导入为默认挂载源
- 按文件更新时间倒序返回
- 不需要 `sessionId`、`cursor`
- 首页默认使用第一条作为“正在播放”的推荐视频

Query:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | string | - | 预留；当前原型忽略 |
| `sessionId` | string | - | 预留；当前原型忽略 |
| `cursor` | string | - | 预留；当前原型忽略 |
| `limit` | number | - | 预留；当前原型忽略 |
| `folderId` | string | - | 预留；当前原型忽略 |
| `tag` | string | - | 预留；当前原型忽略 |
| `likedOnly` | boolean | - | 预留；当前原型忽略 |

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "ae9623fdce783a64a347e6bb0a1063b80dec0789",
      "title": "This.900mm.Lens.Is.WEIRD Tom.Calton 2023",
      "sourceName": "This.900mm.Lens.Is.WEIRD-Tom.Calton-2023.mp4",
      "folderName": "test-shorts",
      "streamUrl": "/stream/ae9623fdce783a64a347e6bb0a1063b80dec0789",
      "mimeType": "video/mp4",
      "sourceSize": 15759651,
      "updatedAt": 1776554909
    }
  ],
  "meta": {
    "hasMore": false,
    "total": 3
  }
}
```

后续完整 MVP 仍会恢复 `sessionId + cursor` 的 Feed 会话模型。

### `GET /api/videos/:id`

获取单个视频详情。

当前原型已实现。

Response:

```json
{
  "success": true,
  "data": {
    "id": "ae9623fdce783a64a347e6bb0a1063b80dec0789",
    "title": "This.900mm.Lens.Is.WEIRD Tom.Calton 2023",
    "sourceName": "This.900mm.Lens.Is.WEIRD-Tom.Calton-2023.mp4",
    "folderName": "test-shorts",
    "folderPath": "/Users/franklioxygen/Projects/test-shorts",
    "streamUrl": "/stream/ae9623fdce783a64a347e6bb0a1063b80dec0789",
    "mimeType": "video/mp4",
    "sourceSize": 15759651,
    "playbackStatus": "direct",
    "playCount": 1,
    "resumePositionSeconds": 33,
    "lastPlayedAt": 1776556213,
    "updatedAt": 1776554909
  }
}
```

### `PATCH /api/videos/:id`

更新视频元数据。

状态：设计中，当前原型未实现。

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

状态：设计中，当前原型未实现。

### `POST /api/videos/:id/play`

记录一次播放开始。

当前原型已实现。

Request:

```json
{ "positionSeconds": 0 }
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "ae9623fdce783a64a347e6bb0a1063b80dec0789",
    "lastPlayedAt": 1776556213,
    "playCount": 1,
    "resumePositionSeconds": 12
  }
}
```

### `POST /api/videos/:id/progress`

上报播放进度。

当前原型已实现。

Request:

```json
{
  "positionSeconds": 14.2,
  "completed": false
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "ae9623fdce783a64a347e6bb0a1063b80dec0789",
    "lastPlayedAt": 1776556213,
    "playCount": 1,
    "resumePositionSeconds": 33
  }
}
```

### `GET /api/videos/:id/thumbnail`

返回全尺寸缩略图。

状态：设计中，当前原型未实现。

### `GET /api/videos/:id/thumbnail-sm`

返回小尺寸缩略图。

状态：设计中，当前原型未实现。

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

当前原型会先从 SQLite `videos` 表解析 `videoId`，再从对应源文件流式输出。

错误码：

- `VIDEO_NOT_FOUND`
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
      "id": "f11fed3869384089b3ee110eccef83e3364322ab",
      "name": "test-shorts",
      "mountPath": "/Users/franklioxygen/Projects/test-shorts",
      "isActive": true,
      "isSystem": false,
      "autoScan": false,
      "scanIntervalMinutes": null,
      "maxDepth": null,
      "scanStatus": "ready",
      "lastScannedAt": null,
      "videoCount": 3
    }
  ]
}
```

### `POST /api/folders`

添加挂载路径。

当前原型已实现。

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
- 如果数据库里还没有任何挂载记录，服务端会在首次启动时把现有允许根目录一次性导入为挂载源

### `PATCH /api/folders/:id`

更新挂载目录配置。

状态：设计中，当前原型未实现。

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

移除挂载路径，不删除外部文件。

当前原型已实现。

说明：

- 当前原型删除的是挂载配置本身，不删除磁盘文件
- 删除最后一个挂载后，不会再次自动从环境变量补回；需要显式重新注册

### `POST /api/folders/:id/scan`

触发立即扫描。

当前原型已实现。

Response:

```json
{
  "success": true,
  "data": {
    "id": "f11fed3869384089b3ee110eccef83e3364322ab",
    "name": "test-shorts",
    "mountPath": "/Users/franklioxygen/Projects/test-shorts",
    "scanStatus": "ready",
    "lastScannedAt": 1776557090,
    "videoCount": 3
  }
}
```

说明：

- 该接口会刷新该文件夹在 SQLite `videos` 表中的快照

### `GET /api/folders/:id/videos`

列出某文件夹的视频。

当前原型已实现。

Query:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | number | - | 预留；当前原型忽略 |
| `limit` | number | - | 预留；当前原型忽略 |
| `sort` | string | - | 预留；当前原型忽略 |

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "ae9623fdce783a64a347e6bb0a1063b80dec0789",
      "folderId": "f11fed3869384089b3ee110eccef83e3364322ab",
      "folderName": "test-shorts",
      "title": "This.900mm.Lens.Is.WEIRD Tom.Calton 2023",
      "sourceName": "This.900mm.Lens.Is.WEIRD-Tom.Calton-2023.mp4",
      "streamUrl": "/stream/ae9623fdce783a64a347e6bb0a1063b80dec0789",
      "mimeType": "video/mp4",
      "sourceSize": 15759651,
      "updatedAt": 1776554909,
      "playCount": 1,
      "resumePositionSeconds": 52
    }
  ],
  "meta": {
    "folderName": "test-shorts",
    "total": 3
  }
}
```

---

## 上传

### `POST /api/uploads`

上传 1 个或多个视频文件。

当前原型已实现。

Request:

- `multipart/form-data`
- 字段：`files[]`

Response:

```json
{
  "success": true,
  "data": {
    "uploadBatchId": "upl_123",
    "accepted": 1,
    "rejected": [],
    "folderId": "a390b29c0f39b16791ad35b26f6cd4eb675eb2b5",
    "folderName": "Uploads",
    "videos": [
      {
        "id": "ba1343eb71133514a5e28bbeff2b17fcae72d6f2",
        "title": "UMP45 FrenchGunGuy 2024",
        "sourceName": "UMP45-FrenchGunGuy-2024.mp4",
        "streamUrl": "/stream/ba1343eb71133514a5e28bbeff2b17fcae72d6f2"
      }
    ]
  }
}
```

说明：

- 上传文件会写入系统内置的 `Uploads` 来源目录
- 上传成功后，服务端会立即重扫该目录并刷新 SQLite `videos` 索引
- 浏览器网络上传进度由前端本地上报

错误码：

- `NO_FILES_UPLOADED`
- `FILE_TYPE_NOT_ALLOWED`
- `FILE_TOO_LARGE`
- `UPLOAD_WRITE_FAILED`
- `FOLDER_PROTECTED`

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
