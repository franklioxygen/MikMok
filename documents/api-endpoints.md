# MikMok — API 接口参考

所有接口默认以 `/api` 为前缀，除 `GET /stream/:id` 外都走 API 域。

本文档分两部分：

- 当前已经实现并可依赖的接口
- 当前尚未实现、但已经确定的补齐设计

## 1. 当前原型约束

截至 `2026-04-18`：

- 首页不要求登录
- 后端仍保留 `/api/auth/*`
- 当前写接口还没有统一接回认证中间件和 CSRF 校验
- 当前媒体链路已包含元数据提取、缩略图生成和按需转码

## 2. 通用响应

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

## 3. 当前已实现接口

### `GET /api/health`

返回当前服务状态。

Response:

```json
{
  "success": true,
  "data": {
    "service": "mikmok-api",
    "status": "ok",
    "environment": "production",
    "timestamp": 1776561535,
    "transcodeEnabled": true,
    "ffmpegAvailable": true,
    "ffprobeAvailable": true,
    "jobs": {
      "queued": 0,
      "running": 0,
      "succeeded": 12,
      "failed": 1,
      "total": 13
    },
    "dbFile": "/app/backend/data/mikmok.db"
  }
}
```

### `POST /api/auth/login`

当前仍可用，但前端默认不再强制登录。

Request:

```json
{ "password": "changeme" }
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

说明：

- 当前密码直接来自 `MIKMOK_PASSWORD`
- 当前会话存在内存里，服务重启即失效

### `POST /api/auth/logout`

清除当前会话 Cookie。

### `GET /api/auth/status`

返回当前登录状态。

### `GET /api/videos/feed`

返回首页 Feed 列表。

当前行为：

- 从 SQLite `videos` 索引表读取
- 按 `source_mtime_ms` 倒序返回
- 不使用 `sessionId` 或 `cursor`
- 不做标签筛选或喜欢筛选
- 仅返回 `playbackStatus in ('direct', 'ready')` 的视频

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "vid_123",
      "title": "Vacation Clip",
      "sourceName": "vacation.mp4",
      "folderId": "fld_1",
      "folderName": "travel-shorts",
      "streamUrl": "/stream/vid_123",
      "mimeType": "video/mp4",
      "sourceSize": 15759651,
      "playbackStatus": "direct",
      "durationSeconds": 43.4,
      "width": 1080,
      "height": 1920,
      "thumbnailSmUrl": "/api/videos/vid_123/thumbnail-sm",
      "updatedAt": 1776554909
    }
  ],
  "meta": {
    "hasMore": false,
    "total": 1
  }
}
```

### `GET /api/videos/:id`

返回单个视频详情。

Response:

```json
{
  "success": true,
  "data": {
    "id": "vid_123",
    "title": "Vacation Clip",
    "sourceName": "vacation.mp4",
    "folderId": "fld_1",
    "folderName": "travel-shorts",
    "folderPath": "/mounts/travel-shorts",
    "streamUrl": "/stream/vid_123",
    "mimeType": "video/mp4",
    "sourceSize": 15759651,
    "playbackStatus": "direct",
    "durationSeconds": 43.4,
    "width": 1080,
    "height": 1920,
    "fps": 25,
    "videoCodec": "h264",
    "audioCodec": "aac",
    "thumbnailUrl": "/api/videos/vid_123/thumbnail",
    "thumbnailSmUrl": "/api/videos/vid_123/thumbnail-sm",
    "playCount": 1,
    "resumePositionSeconds": 33,
    "lastPlayedAt": 1776556213,
    "updatedAt": 1776554909
  }
}
```

### `GET /api/videos/:id/thumbnail`

返回全尺寸 JPG 缩略图。

错误码：

- `VIDEO_NOT_FOUND`
- `THUMBNAIL_NOT_FOUND`

### `GET /api/videos/:id/thumbnail-sm`

返回小尺寸 Feed 缩略图。

错误码：

- `VIDEO_NOT_FOUND`
- `THUMBNAIL_NOT_FOUND`

### `POST /api/videos/:id/play`

记录一次播放开始。

Request:

```json
{ "positionSeconds": 0 }
```

### `POST /api/videos/:id/progress`

记录播放进度。

Request:

```json
{
  "positionSeconds": 14.2,
  "completed": false
}
```

### `GET /stream/:id`

按 `videoId` 流式返回媒体文件，支持 HTTP Range。

当前行为：

- 先查 SQLite 索引
- `direct` 读取 `source_path`
- `ready` 读取 `playback_path`
- 不接受任何任意磁盘路径

错误码：

- `VIDEO_NOT_FOUND`
- `VIDEO_NOT_PLAYABLE`
- `FILE_MISSING`
- `RANGE_NOT_SATISFIABLE`

### `GET /api/folders`

列出所有已注册挂载源。

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "fld_1",
      "name": "travel-shorts",
      "mountPath": "/mounts/travel-shorts",
      "isActive": true,
      "isSystem": false,
      "autoScan": false,
      "scanIntervalMinutes": null,
      "maxDepth": null,
      "scanStatus": "ready",
      "lastScannedAt": 1776557090,
      "videoCount": 3
    }
  ]
}
```

### `POST /api/folders`

注册挂载路径。

Request:

```json
{
  "name": "Travel Shorts",
  "mountPath": "/mounts/travel-shorts",
  "autoScan": false,
  "scanIntervalMinutes": null,
  "maxDepth": null
}
```

错误码：

- `PATH_NOT_FOUND`
- `PATH_NOT_DIRECTORY`
- `PATH_NOT_READABLE`
- `PATH_OUTSIDE_ALLOWED_ROOTS`
- `PATH_OVERLAPS_EXISTING_MOUNT`

说明：

- `mountPath` 必须位于 `ALLOWED_MOUNT_ROOTS` 之下
- 如果数据库还是空库，首次启动会把当前允许根一次性导入为默认挂载源
- 创建成功后目录会立即进入后台扫描，返回值里的 `scanStatus` 可能是 `scanning`

### `DELETE /api/folders/:id`

移除挂载配置，不删除磁盘文件。

错误码：

- `FOLDER_NOT_FOUND`
- `FOLDER_PROTECTED`
- `FOLDER_SCAN_IN_PROGRESS`

### `POST /api/folders/:id/scan`

立即扫描指定挂载目录。

当前行为：

- 接口会立即返回 `202 Accepted`
- 返回值里的 `scanStatus` 会先变成 `scanning`
- 真正的目录扫描在后台继续执行，不再把 HTTP 请求挂到结束
- 扫描过程中若遇到非直播放视频，仍会创建 `transcode` job
- 当前扫描本身还不是持久化 `job`，服务重启会中断本轮扫描

Response:

```json
{
  "success": true,
  "data": {
    "id": "fld_1",
    "name": "travel-shorts",
    "mountPath": "/mounts/travel-shorts",
    "scanStatus": "scanning",
    "lastScannedAt": 1776557090,
    "videoCount": 3
  }
}
```

### `GET /api/folders/:id/videos`

返回某个挂载源下的视频列表。

当前不支持分页、排序和筛选参数。

返回字段已包含：

- `playbackStatus`
- `durationSeconds`
- `width`
- `height`
- `thumbnailSmUrl`

`scanStatus` 当前可能是：

- `pending`
- `scanning`
- `ready`
- `empty`
- `error`

### `POST /api/uploads`

上传一个或多个视频文件。

Request:

- `multipart/form-data`
- 字段：`files[]` 或 `files`

Response:

```json
{
  "success": true,
  "data": {
    "uploadBatchId": "upl_123",
    "accepted": 1,
    "rejected": [],
    "folderId": "uploads_folder",
    "folderName": "Uploads",
    "videos": [
      {
        "id": "vid_456",
        "title": "upload clip",
        "sourceName": "upload-clip.mp4",
        "streamUrl": "/stream/vid_456"
      }
    ]
  }
}
```

说明：

- 文件先进入 `backend/uploads/tmp`
- 然后原子移动到 `backend/uploads/videos/<batch>/`
- 上传完成后会立即重扫 `Uploads` 来源
- 若视频不满足直播放行规则，会自动创建 `transcode` job

### `GET /api/jobs`

返回最近的后台任务列表。

当前已实现的 job 类型只有：

- `transcode`

### `GET /api/jobs/:id`

返回单个任务状态。

错误码：

- `NO_FILES_UPLOADED`
- `FILE_TYPE_NOT_ALLOWED`
- `FILE_TOO_LARGE`
- `UPLOAD_WRITE_FAILED`

## 4. 当前未实现但已设计的接口

### `PATCH /api/videos/:id`

用途：

- 修改 `title`
- 修改 `description`
- 修改 `liked`
- 修改 `hidden`
- 修改 `tags`

建议 Request：

```json
{
  "title": "New Title",
  "description": "Updated description",
  "liked": true,
  "hidden": false,
  "tags": ["travel", "beach"]
}
```

设计要求：

- 允许部分更新
- 标签由服务端做归一化和去重
- 返回更新后的完整视频详情

### `DELETE /api/videos/:id`

语义：

- 软删除
- 不删除磁盘源文件
- 等价于 `hidden=1`

### `PATCH /api/folders/:id`

用途：

- 修改 `name`
- 修改 `autoScan`
- 修改 `scanIntervalMinutes`
- 修改 `maxDepth`
- 修改 `isActive`

语义：

- `isActive=false` 时，目录本身停用，相关视频不再进入 Feed
- `autoScan=false` 时，仅关闭自动扫描，不影响手动扫描

### `GET /api/jobs/:id/events`

通过 SSE 订阅任务进度。

Events:

```text
event: progress
data: {"status":"running","progressCurrent":120,"progressTotal":300}

event: done
data: {"status":"succeeded"}

event: error
data: {"status":"failed","lastError":"ffprobe failed"}
```

### `GET /api/tags`

返回标签列表及引用计数。

### `GET /api/settings`

返回当前设置。

建议字段：

- `feedDefaultMode`
- `autoplayEnabled`
- `loopVideo`
- `transcodeEnabled`
- `maxUploadSizeMb`

### `PATCH /api/settings`

更新非安全设置。

### `POST /api/settings/password`

修改登录密码。

设计要求：

- 校验当前密码
- 更新 `password_hash`
- 删除所有旧会话

## 5. 后续接口演进规则

### 5.1 认证恢复

当前虽然有 `/api/auth/*`，但还没有统一把写接口保护起来。  
恢复正式鉴权后：

- 登录成功返回 `mikmok_session`
- 同时下发 `mikmok_csrf`
- 所有写接口要求 `X-CSRF-Token`

### 5.2 任务化迁移

当前只有上传这条链路后续还会进一步升级为持久化异步 job；扫描已经先变成了后台异步执行：

- `POST /api/folders/:id/scan`
- `POST /api/uploads`

演进策略：

- 优先保持旧字段
- 在响应中追加 `jobId`
- 需要较长执行时间时使用或保留 `202 Accepted`

### 5.3 Feed 会话化

后续 `GET /api/videos/feed` 会增加：

- `mode`
- `sessionId`
- `cursor`
- `limit`
- `folderId`
- `tag`
- `likedOnly`

但兼容策略是：

- 首页无参请求仍然返回第一页
- 原型前端不需要马上重写
