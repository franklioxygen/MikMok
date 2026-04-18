# MikMok — 系统设计文档

> 单用户私有短视频平台，移动端优先，PWA 形态，强调稳定可实施的 MVP。

---

## 目录

1. [产品范围](#1-产品范围)
2. [核心设计决策](#2-核心设计决策)
3. [系统架构](#3-系统架构)
4. [运行时目录与边界](#4-运行时目录与边界)
5. [数据模型](#5-数据模型)
6. [媒体兼容与播放策略](#6-媒体兼容与播放策略)
7. [任务与处理流水线](#7-任务与处理流水线)
8. [Feed 设计](#8-feed-设计)
9. [API 设计](#9-api-设计)
10. [前端架构](#10-前端架构)
11. [部署与运维](#11-部署与运维)
12. [安全设计](#12-安全设计)
13. [测试与交付计划](#13-测试与交付计划)

---

## 1. 产品范围

### 1.1 目标

| 维度 | 设计 |
|------|------|
| 用户模型 | 单用户私有实例，无注册、无多租户 |
| 设备形态 | 移动端优先，桌面端可管理 |
| 内容来源 | 本地挂载目录 + 手动上传 |
| 内容形态 | 短视频优先，默认建议 <= 5 分钟 |
| 核心体验 | 垂直滑动 Feed，静音自动播放，快速切换 |
| 部署场景 | 家用服务器、NAS、Docker 主机、本地开发机 |

### 1.2 MVP 范围

MVP 只解决以下问题：

- 安全地挂载本地目录并扫描视频文件
- 上传视频到本地存储
- 为视频提取元数据、生成缩略图、必要时转码
- 提供移动端可用的 Feed、文件夹浏览、标签过滤
- 提供单密码登录、会话管理、基础运维与备份能力

### 1.3 明确不做

- 多用户账号体系
- 点赞/评论/分享等社交能力
- 云对象存储、CDN、分布式转码
- AI 推荐、复杂画像、跨设备同步
- 原生 iOS/Android App

### 1.4 成功标准

- 局域网内首屏进入 Feed 后 2 秒内看到首个视频封面
- 已可播放视频在滑动切换后 500ms 内开始播放
- 扫描和转码任务在进程重启后可恢复
- 所有文件访问都受允许目录约束

---

## 2. 核心设计决策

### 2.1 技术栈

#### 后端

| 技术 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js 22 + TypeScript | 与参考项目一致，生态成熟 |
| Web 框架 | Express.js | 足够轻，便于中间件和流式响应 |
| 数据库 | SQLite 3 + Drizzle ORM | 单实例场景下简单、可备份 |
| 视频处理 | FFprobe + FFmpeg | 元数据、缩略图、转码的事实标准 |
| 任务执行 | 进程内持久化任务队列 | 单实例足够，无需 Redis |
| 反向代理 | Nginx | 静态资源、上传限制、缓存头、反向代理 |

#### 前端

| 技术 | 选择 | 理由 |
|------|------|------|
| 框架 | React 19 + TypeScript | 组件模型成熟 |
| 构建工具 | Vite | 开发体验好，PWA 方案成熟 |
| 路由 | React Router v7 | SPA 路由清晰 |
| 服务端状态 | TanStack Query v5 | Feed、任务进度、设置等查询适合 |
| 客户端状态 | Zustand | 播放索引、静音状态、界面状态轻量存储 |
| 样式 | Tailwind + 自定义 CSS 变量 | 便于做移动端沉浸式布局 |
| PWA | vite-plugin-pwa | 安装到主屏幕和离线壳 |

### 2.2 关键取舍

#### 播放策略

MVP 不做 HLS，自适应码率也不做。统一采用以下规则：

- 仅 `MP4 + H.264 + AAC` 视为“可直接播放”
- 其他容器或编码进入后台转码，产物仍为 `MP4 + H.264 + AAC`
- Feed 默认只展示 `playback_status in ('direct', 'ready')` 的视频

理由：

- iOS Safari、Chrome Mobile、PWA 对媒体格式支持不一致
- 直接把“浏览器能播什么”交给用户文件原格式，会导致体验不可预测
- 单用户场景优先稳定性，先不引入 HLS 清单、分片、缓存失效复杂度

#### 鉴权策略

MVP 不使用 JWT。采用服务端会话：

- 登录成功后发放随机会话 ID
- Cookie 中只存会话 ID，不存可自验证的令牌
- 服务端持久化 `auth_sessions`
- 所有写接口要求 CSRF Token

理由：

- 单实例系统不需要 JWT 的跨服务优势
- 会话可撤销，修改密码后能主动失效所有旧会话

#### 任务队列

队列在进程内运行，但任务状态持久化到 SQLite：

- `queued` / `running` / `succeeded` / `failed` / `cancelled`
- 进程重启后把 `running` 任务恢复为 `queued`

理由：

- 单实例下足够简单
- 比纯内存队列更可恢复

---

## 3. 系统架构

```text
Mobile Browser / PWA
        |
        | HTTPS
        v
      Nginx
  /           -> React SPA
  /api/*      -> Express API
  /stream/*   -> Express stream endpoint
        |
        v
     Express
  - auth/session
  - feed/video/folder/tag/settings APIs
  - upload controller
  - stream controller
  - job scheduler + workers
        |
        +------------------> SQLite (/app/data/mikmok.db)
        |
        +------------------> Upload storage (/app/uploads)
        |
        +------------------> Mounted folders (/mounts/*, read-only)
        |
        +------------------> FFprobe / FFmpeg
```

### 3.1 核心模块

```text
AuthService
  |- PasswordBootstrap
  |- SessionService
  `- CsrfService

LibraryService
  |- VideoService
  |- FolderService
  |- TagService
  `- FeedBuilder

MediaService
  |- MetadataExtractor
  |- ThumbnailService
  |- PlaybackResolver
  `- TranscodeService

JobSystem
  |- JobRepository
  |- JobQueue
  |- JobWorker
  `- StartupRecovery

StorageService
  |- PathGuard
  |- UploadStore
  `- MountRegistry
```

### 3.2 运行原则

- 所有媒体文件读取都必须先走数据库查找，再由 `PathGuard` 校验真实路径
- 所有扫描、上传后处理、转码都进入任务系统，不在 HTTP 请求内长时间阻塞
- 所有 API 写操作统一返回资源状态或 `jobId`
- 前端不直接拼接磁盘路径，只使用 API 和 `videoId`

---

## 4. 运行时目录与边界

### 4.1 仓库目录结构

```text
mikmok/
├── backend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   │   └── env.ts
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── schema.ts
│   │   │   └── migrations/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── videos.ts
│   │   │   ├── folders.ts
│   │   │   ├── uploads.ts
│   │   │   ├── jobs.ts
│   │   │   ├── settings.ts
│   │   │   ├── tags.ts
│   │   │   ├── stream.ts
│   │   │   └── health.ts
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── auth/
│   │   │   ├── feed/
│   │   │   ├── jobs/
│   │   │   ├── library/
│   │   │   ├── media/
│   │   │   └── storage/
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── csrf.ts
│   │   │   ├── rateLimit.ts
│   │   │   └── errorHandler.ts
│   │   ├── workers/
│   │   │   ├── scheduler.ts
│   │   │   └── startupRecovery.ts
│   │   └── utils/
│   ├── data/
│   ├── uploads/
│   │   ├── tmp/
│   │   ├── videos/
│   │   ├── transcodes/
│   │   ├── thumbnails/
│   │   └── thumbnails-sm/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   ├── store/
│   │   └── styles/
│   └── package.json
├── documents/
├── docker-compose.yml
├── Dockerfile
└── nginx.conf
```

### 4.2 容器内运行时目录

```text
/app/
├── data/
│   └── mikmok.db
├── uploads/
│   ├── tmp/
│   ├── videos/
│   ├── transcodes/
│   ├── thumbnails/
│   └── thumbnails-sm/
└── frontend/dist/

/mounts/
├── family-clips/
└── travel-shorts/
```

### 4.3 目录职责

| 路径 | 用途 | 说明 |
|------|------|------|
| `/app/data` | SQLite 和内部状态 | 必须持久化备份 |
| `/app/uploads/videos` | 上传原始文件 | MikMok 自己拥有写权限 |
| `/app/uploads/transcodes` | 转码产物 | 可清理重建 |
| `/app/uploads/thumbnails*` | 缩略图 | 可清理重建 |
| `/mounts/*` | 外部视频目录 | 只读挂载，不由应用删除 |

外部目录只允许注册到配置项 `ALLOWED_MOUNT_ROOTS` 之下，默认值为 `/mounts`。

---

## 5. 数据模型

### 5.1 `videos`

```sql
CREATE TABLE videos (
  id                      TEXT PRIMARY KEY,
  title                   TEXT NOT NULL,
  description             TEXT,
  source_type             TEXT NOT NULL,             -- upload | mount
  folder_id               TEXT REFERENCES folders(id),
  source_path             TEXT NOT NULL UNIQUE,
  source_size             INTEGER NOT NULL,
  source_mtime_ms         INTEGER NOT NULL,
  source_mime             TEXT,
  container               TEXT,                      -- mp4 / mov / mkv / webm ...
  video_codec             TEXT,                      -- h264 / hevc / vp9 / av1 ...
  audio_codec             TEXT,                      -- aac / opus / mp3 ...
  duration_seconds        REAL,
  width                   INTEGER,
  height                  INTEGER,
  fps                     REAL,
  thumbnail_path          TEXT,
  thumbnail_sm_path       TEXT,
  playback_path           TEXT,                      -- null 表示直接播放 source_path
  playback_status         TEXT NOT NULL,             -- direct | queued | processing | ready | failed
  resume_position_seconds REAL NOT NULL DEFAULT 0,
  play_count              INTEGER NOT NULL DEFAULT 0,
  liked                   INTEGER NOT NULL DEFAULT 0,
  hidden                  INTEGER NOT NULL DEFAULT 0,
  last_played_at          INTEGER,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
```

#### 说明

- `source_path` 永远保存原始文件路径
- `playback_path` 仅在转码完成时填写
- `playback_status='direct'` 时，流接口直接读取 `source_path`
- `hidden=1` 代表不进入 Feed，但不删除记录

### 5.2 `folders`

```sql
CREATE TABLE folders (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  mount_path             TEXT NOT NULL UNIQUE,
  is_active              INTEGER NOT NULL DEFAULT 1,
  auto_scan              INTEGER NOT NULL DEFAULT 1,
  scan_interval_minutes  INTEGER NOT NULL DEFAULT 60,
  max_depth              INTEGER NOT NULL DEFAULT 6,
  scan_status            TEXT NOT NULL DEFAULT 'idle', -- idle | queued | scanning | done | error
  last_scanned_at        INTEGER,
  last_scan_error        TEXT,
  video_count            INTEGER NOT NULL DEFAULT 0,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);
```

#### `folders` 字段语义

- `is_active=1`：挂载配置启用，目录可参与手动扫描、自动扫描、文件夹列表展示
- `is_active=0`：挂载配置停用，不参与自动扫描，也不允许触发手动扫描；该目录下既有视频记录保留，但统一按 `hidden=1` 处理，不进入 Feed
- `auto_scan=1`：仅在 `is_active=1` 前提下，允许调度器按 `scan_interval_minutes` 自动入队扫描任务
- `auto_scan=0`：只关闭自动扫描，不影响手动扫描，也不影响该目录下已可播放视频的浏览

### 5.3 `tags`

```sql
CREATE TABLE tags (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  normalized_name  TEXT NOT NULL UNIQUE,
  created_at       INTEGER NOT NULL
);
```

### 5.4 `video_tags`

```sql
CREATE TABLE video_tags (
  video_id    TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (video_id, tag_id)
);
```

### 5.5 `jobs`

```sql
CREATE TABLE jobs (
  id                  TEXT PRIMARY KEY,
  type                TEXT NOT NULL, -- scan | upload_finalize | transcode | thumbnail_rebuild
  status              TEXT NOT NULL, -- queued | running | succeeded | failed | cancelled
  related_entity_type TEXT,          -- folder | video | upload_batch
  related_entity_id   TEXT,
  payload_json        TEXT NOT NULL,
  progress_current    INTEGER NOT NULL DEFAULT 0,
  progress_total      INTEGER NOT NULL DEFAULT 0,
  progress_message    TEXT,
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  created_at          INTEGER NOT NULL,
  started_at          INTEGER,
  finished_at         INTEGER,
  updated_at          INTEGER NOT NULL
);
```

### 5.6 `scan_logs`

```sql
CREATE TABLE scan_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id     TEXT NOT NULL REFERENCES folders(id),
  job_id        TEXT REFERENCES jobs(id),
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  scanned_files INTEGER NOT NULL DEFAULT 0,
  added_videos  INTEGER NOT NULL DEFAULT 0,
  updated_videos INTEGER NOT NULL DEFAULT 0,
  hidden_videos INTEGER NOT NULL DEFAULT 0,
  error         TEXT
);
```

### 5.7 `settings`

```sql
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

推荐键：

- `password_hash`
- `feed_default_mode`
- `autoplay_enabled`
- `loop_video`
- `transcode_enabled`
- `max_upload_size_mb`

### 5.8 `auth_sessions`

```sql
CREATE TABLE auth_sessions (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);
```

### 5.9 索引

```sql
CREATE INDEX idx_videos_visible_created
  ON videos(hidden, playback_status, created_at DESC);

CREATE INDEX idx_videos_folder_visible
  ON videos(folder_id, hidden, created_at DESC);

CREATE INDEX idx_videos_last_played
  ON videos(hidden, last_played_at DESC);

CREATE INDEX idx_jobs_status_type
  ON jobs(status, type, created_at);

CREATE INDEX idx_video_tags_tag
  ON video_tags(tag_id, video_id);
```

---

## 6. 媒体兼容与播放策略

### 6.1 直接播放规则

只有满足以下条件的视频才能直接进入可播放集合：

- 容器：`mp4`
- 视频编码：`h264`
- 音频编码：`aac` 或无音轨

其他情况一律视为“需要转码”：

- `mov`, `mkv`, `avi`, `webm`, `flv`, `wmv`, `ts`
- `hevc`, `vp9`, `av1`, `mpeg4` 等编码
- 缺少 `faststart`、移动端 seek 表现不稳定的文件

### 6.2 播放状态机

```text
new file
  |
  +--> direct playable --------------------------> playback_status=direct
  |
  `--> needs transcode -> queued -> processing -> ready / failed
```

### 6.3 转码策略

默认转码输出：

```text
video codec: h264
audio codec: aac
container:   mp4
profile:     main
movflags:    +faststart
target:      keep original resolution, cap long edge at 1920
```

示例命令：

```bash
ffmpeg -i input.mkv \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  -vf "scale='if(gt(iw,ih),min(iw,1920),-2)':'if(gt(ih,iw),min(ih,1920),-2)'" \
  output.mp4
```

### 6.4 缩略图策略

- 抽帧默认取第 1 秒
- 若视频时长小于 1 秒，取中间帧
- 生成两种缩略图：
  - `thumbnails/<id>.jpg`
  - `thumbnails-sm/<id>.jpg`，宽度 360

### 6.5 前端播放规则

移动端播放器默认属性：

- `muted`
- `playsInline`
- `autoPlay`
- `preload="metadata"`

说明：

- 静音自动播放是移动端浏览器可依赖的最小公约数
- 用户主动点声音后，仅当前会话记住是否取消静音

---

## 7. 任务与处理流水线

### 7.1 扫描流程

```text
用户添加挂载目录
  -> 校验路径
  -> 建 folder 记录
  -> 入队 scan job

scan worker:
  1. 读取 folder 配置
  2. 递归遍历目录
  3. 过滤扩展名
  4. realpath 校验必须仍在 mount_path 下
  5. 以 source_path + mtime + size 判断新增/变更/未变化
  6. 新增或变更文件:
     - ffprobe
     - 生成缩略图
     - 计算播放策略
     - 入库或更新
     - 必要时入队 transcode job
  7. 对本轮未再出现的旧文件设 hidden=1
  8. 更新 folder.scan_status / video_count / scan_logs
```

### 7.2 扫描约束

- 支持扩展名：`.mp4 .mov .mkv .avi .webm .m4v .3gp .flv .wmv .ts`
- 默认最大递归深度：6
- 跳过隐藏文件和系统文件
- 跳过符号链接，或解析后发现越界则拒绝

### 7.3 上传流程

```text
浏览器上传 -> /app/uploads/tmp
  -> HTTP 返回 uploadBatchId + accepted files
  -> 后台入队 upload_finalize job
  -> 原子移动到 /app/uploads/videos
  -> ffprobe / thumbnail / playback resolve
  -> 必要时入队 transcode
  -> 写 videos 表
```

设计说明：

- 网络上传进度由浏览器本地 XHR/Fetch 进度负责
- 服务端 `job` 只负责“落盘后的后处理进度”

### 7.4 转码流程

```text
transcode job
  -> 检查 source_path 是否存在
  -> 输出到 /app/uploads/transcodes/<videoId>.mp4
  -> 成功后写 playback_path
  -> playback_status=ready
  -> 失败则 playback_status=failed
```

### 7.5 调度与恢复

调度器每 `SCAN_SCHEDULER_INTERVAL_SECONDS` 秒检查一次：

- 哪些 `folders.is_active=1 and auto_scan=1`
- 哪些目录已超过自己的 `scan_interval_minutes`
- 是否已有同目录未完成扫描任务

启动恢复逻辑：

- 所有 `jobs.status='running'` 重置为 `queued`
- 所有 `folders.scan_status='scanning'` 重置为 `queued`
- 调度器重新拉起任务

### 7.6 重试策略

`attempt_count` 记录任务实际开始执行的次数，规则如下：

- worker 从 `queued` 拉起任务并置为 `running` 时，`attempt_count + 1`
- 首次执行也计入 `attempt_count`
- 仅在任务真正开始执行时递增，排队中断不计数

自动重试策略：

- `upload_finalize`：最多 3 次，延迟 30 秒、2 分钟、10 分钟
- `transcode`：最多 3 次，延迟 1 分钟、5 分钟、15 分钟
- `thumbnail_rebuild`：最多 2 次，延迟 1 分钟、5 分钟
- `scan`：默认不自动重试，避免目录权限错误或大规模 I/O 故障导致重复扫描风暴；由用户手动重试或等待下一次自动调度

不可自动重试的错误类型：

- 路径越界或权限校验失败
- 文件不存在且已确认不是临时抖动
- 输入格式明确不受支持且转码已禁用

可自动重试的错误类型：

- FFmpeg / FFprobe 进程异常退出
- 临时 I/O 失败
- 目标文件原子移动失败

达到最大次数后：

- 任务状态置为 `failed`
- `last_error` 保留最后一次错误
- 相关资源进入可见失败态，供管理页手动重试

### 7.7 幂等性

以下操作必须幂等：

- 重复扫描同一路径
- 重试同一个转码任务
- 上传后处理在重启后的恢复执行

---

## 8. Feed 设计

### 8.1 Feed 模式

| 模式 | 说明 |
|------|------|
| `random` | 在可见视频集合上构建一次随机顺序 |
| `latest` | 按 `created_at DESC` |
| `by_folder` | 先按文件夹，再按时间倒序 |

过滤条件：

- `folderId`
- `tag`
- `likedOnly`

### 8.2 为什么不用 `last_video_id` 做随机游标

随机顺序如果只用“上一条视频 ID”做游标，服务端无法稳定保证：

- 不重复
- 不跳项
- 切页后顺序不抖动

因此 MikMok 采用 Feed 会话：

- 首次请求不带 `sessionId`
- 服务端按当前模式和过滤条件生成一个有序 ID 列表
- 列表保存在内存中，TTL 30 分钟
- 后续分页使用 `sessionId + cursor`

### 8.3 Feed 会话模型

```text
FeedSession {
  id: string
  mode: "random" | "latest" | "by_folder"
  filters: { folderId?: string, tag?: string, likedOnly?: boolean }
  orderedVideoIds: string[]
  expiresAt: number
}
```

说明：

- `cursor` 是下一个 offset 的不透明字符串
- 会话过期或服务重启后，前端重新拉取第一页
- 单用户单实例场景下，内存会话足够，避免把临时顺序写入数据库

前端恢复流程：

1. `GET /api/videos/feed` 返回 `SESSION_EXPIRED` 或 `INVALID_CURSOR`
2. 前端清空本地 `sessionId`、`cursor` 和已缓存分页
3. 保留当前 `mode`、`folderId`、`tag`、`likedOnly` 筛选条件
4. 重新请求第一页
5. 若第一页成功，则替换当前 Feed 栈；若失败，则展示错误态并允许用户重试

### 8.4 Feed 可见性规则

进入 Feed 的前提：

- `hidden = 0`
- `playback_status in ('direct', 'ready')`
- 文件仍存在

`failed` 状态不进入 Feed，但在管理页可见，便于用户重试。

---

## 9. API 设计

### 9.1 通用响应

```typescript
type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

type ApiError = {
  success: false;
  error: string;
  code: string;
};
```

### 9.2 认证

#### `POST /api/auth/login`

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

行为：

- 设置 `mikmok_session` HTTP-only Cookie
- 设置 `mikmok_csrf` Cookie

#### `POST /api/auth/logout`

- 清除会话 Cookie
- 删除当前 `auth_sessions` 记录

#### `GET /api/auth/status`

```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "sessionExpiresAt": 1713456789
  }
}
```

### 9.3 视频与 Feed

#### `GET /api/videos/feed`

Query:

| 参数 | 类型 | 说明 |
|------|------|------|
| `mode` | string | `random` / `latest` / `by_folder` |
| `sessionId` | string | 首次不传，后续分页携带 |
| `cursor` | string | 不透明 offset cursor |
| `limit` | number | 默认 10，最大 20 |
| `folderId` | string | 可选 |
| `tag` | string | 可选 |
| `likedOnly` | boolean | 可选 |

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

#### `GET /api/videos/:id`

返回完整视频详情、标签、当前播放状态，以及可直接用于展示的媒体 URL。

#### `PATCH /api/videos/:id`

可更新字段：

- `title`
- `description`
- `liked`
- `tags`

#### `DELETE /api/videos/:id`

语义：

- 软删除，`hidden=1`
- 不删除原始文件和转码文件

#### `POST /api/videos/:id/play`

Request:

```json
{ "positionSeconds": 0 }
```

行为：

- `play_count + 1`
- 更新 `last_played_at`

#### `POST /api/videos/:id/progress`

Request:

```json
{
  "positionSeconds": 12.4,
  "completed": false
}
```

行为：

- 更新 `resume_position_seconds`
- 若 `completed=true`，可把进度归零或记为视频末尾，具体由前端策略决定

#### `GET /api/videos/:id/thumbnail`

- 返回全尺寸 JPG

#### `GET /api/videos/:id/thumbnail-sm`

- 返回小图 JPG

#### `GET /stream/:id`

行为：

- 根据 `playback_status` 选择 `playback_path` 或 `source_path`
- 支持 HTTP Range
- 永远不接受任意文件路径参数

错误码：

- `VIDEO_NOT_FOUND`
- `VIDEO_NOT_PLAYABLE`
- `FILE_MISSING`
- `RANGE_NOT_SATISFIABLE`

### 9.4 文件夹

#### `GET /api/folders`

列出所有挂载目录及其状态。

#### `POST /api/folders`

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

校验：

- 路径存在且为目录
- 真实路径可读
- 不能与现有挂载路径互为父子目录
- 必须位于 `ALLOWED_MOUNT_ROOTS` 允许的根目录之下

#### `PATCH /api/folders/:id`

可更新：

- `name`
- `autoScan`
- `scanIntervalMinutes`
- `maxDepth`
- `isActive`

语义：

- `isActive=false` 会停用该挂载配置，并把该目录下已有视频统一隐藏
- `isActive=true` 会恢复该挂载配置；原有视频需在下一次扫描确认文件仍存在后重新可见
- `autoScan=false` 只关闭自动扫描，不影响手动扫描和既有视频浏览

#### `DELETE /api/folders/:id`

语义：

- 移除挂载配置
- 该目录下已发现的视频保留记录，但统一 `hidden=1`

#### `POST /api/folders/:id/scan`

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "job_scan_123"
  }
}
```

#### `GET /api/folders/:id/videos`

Query:

- `page`
- `limit`
- `sort=created_at|title|duration`

### 9.5 上传

#### `POST /api/uploads`

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

- 网络上传进度不走 SSE
- `jobId` 仅表示上传完成后的服务端处理进度

### 9.6 任务

#### `GET /api/jobs/:id`

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

#### `GET /api/jobs/:id/events`

Server-Sent Events：

```text
event: progress
data: {"status":"running","progressCurrent":120,"progressTotal":300}

event: done
data: {"status":"succeeded"}
```

### 9.7 标签

#### `GET /api/tags`

返回所有标签及引用计数，用于筛选器和编辑器。

### 9.8 设置

#### `GET /api/settings`

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

#### `PATCH /api/settings`

允许更新非安全类设置。

#### `POST /api/settings/password`

Request:

```json
{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

行为：

- 更新 `password_hash`
- 删除所有旧会话，要求重新登录

### 9.9 健康检查

- `GET /api/health/live`
- `GET /api/health/ready`

`ready` 检查项：

- 数据库可连通
- 上传目录可写
- FFmpeg / FFprobe 可执行

---

## 10. 前端架构

### 10.1 页面

```text
/             -> Feed
/folders      -> 文件夹列表
/folders/:id  -> 文件夹视频列表
/upload       -> 上传页
/settings     -> 设置页
/login        -> 登录页
```

### 10.2 状态划分

#### TanStack Query

- auth status
- feed pages
- folder list
- job status
- settings
- tags

#### Zustand

- 当前播放索引
- 当前是否静音
- 当前 Feed mode
- 当前激活的 `sessionId`
- UI sheet / modal 状态

### 10.3 Feed 页面结构

```text
FeedPage
  |- FeedStack
  |   |- VideoPlayer (current)
  |   |- VideoPlayer (next preview)
  |   `- placeholder poster
  |- VideoOverlay
  |- ActionBar
  `- BottomNav
```

### 10.4 播放与预加载

- DOM 中最多保留 3 个卡片：上一条、当前、下一条
- 仅当前条目真正播放
- 下一条只预载 `metadata`
- 当前条开始播放后，再触发下一条资源准备
- 前端用 `IntersectionObserver` 或当前索引驱动播放/暂停

### 10.5 PWA 策略

MVP 只提供离线壳，不缓存视频文件：

- 缓存 HTML/CSS/JS/图标
- 不把 `/stream/*` 放入 service worker cache
- 缩略图可做短期缓存

原因：

- 视频文件体积大，浏览器缓存行为不可控
- 自建离线媒体缓存会显著增加复杂度和存储占用

---

## 11. 部署与运维

### 11.1 Docker Compose

```yaml
services:
  mikmok:
    image: ghcr.io/franklioxygen/mikmok:latest
    container_name: mikmok
    ports:
      - "5552:80"
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
      - /path/to/travel-shorts:/mounts/travel-shorts:ro
    environment:
      - MIKMOK_PASSWORD=changeme
      - SESSION_TTL_DAYS=7
      - MAX_UPLOAD_SIZE_MB=500
      - TRANSCODE_ENABLED=1
      - SCAN_CONCURRENCY=2
      - TRANSCODE_CONCURRENCY=1
      - SCAN_SCHEDULER_INTERVAL_SECONDS=60
    restart: unless-stopped
```

### 11.2 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `5552` | 后端监听端口 |
| `MIKMOK_PASSWORD` | 无 | 首次初始化密码 |
| `MIKMOK_RESET_PASSWORD_ON_BOOT` | `0` | 仅在显式要求时重置密码 |
| `ALLOWED_MOUNT_ROOTS` | `/mounts` | 允许注册的挂载根目录，逗号分隔 |
| `SESSION_TTL_DAYS` | `7` | 会话有效期 |
| `MAX_UPLOAD_SIZE_MB` | `500` | 单文件上传大小限制 |
| `TRANSCODE_ENABLED` | `1` | 是否允许后台转码 |
| `SCAN_CONCURRENCY` | `2` | 扫描并发数 |
| `TRANSCODE_CONCURRENCY` | `1` | 转码并发数 |
| `SCAN_SCHEDULER_INTERVAL_SECONDS` | `60` | 调度器轮询周期 |

### 11.3 密码初始化规则

- 若数据库内不存在 `password_hash`，启动时读取 `MIKMOK_PASSWORD` 并写入哈希
- 一旦数据库已有密码，后续启动忽略 `MIKMOK_PASSWORD`
- 只有 `MIKMOK_RESET_PASSWORD_ON_BOOT=1` 时，才允许用环境变量强制覆盖

### 11.4 Nginx 要点

- `client_max_body_size` 与 `MAX_UPLOAD_SIZE_MB` 对齐
- `/api/videos/*/thumbnail*` 可加短期缓存头
- `/stream/*` 关闭代理缓冲，保留 Range 支持
- 强制只暴露 SPA、API、stream 路径，不暴露上传目录真实文件树

### 11.5 备份

必须备份：

- `/app/data`
- `/app/uploads`

无需备份：

- `/mounts/*`，因为它们是外部原始目录

说明：

- `thumbnails/` 和 `transcodes/` 理论上可重建，但备份能加速恢复

---

## 12. 安全设计

### 12.1 认证与会话

- 密码使用 `bcrypt`
- 会话 Cookie：`httpOnly`
- 同站策略：`sameSite=strict`
- HTTPS 下启用 `secure`
- 登录、修改密码、上传、删除等写操作都要求 `X-CSRF-Token`

### 12.2 路径安全

所有真实文件访问都必须经过以下校验：

1. 从数据库或受控配置得到候选路径
2. `realpath()` 解析符号链接
3. 判断目标是否位于允许根目录之下

安全判断应使用目录边界，而不是简单 `startsWith`：

```typescript
function isWithinRoot(resolvedPath: string, root: string): boolean {
  const relative = path.relative(root, resolvedPath);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
```

允许根目录：

- 新增挂载目录时：`ALLOWED_MOUNT_ROOTS`
- 读取已注册视频文件时：`/app/uploads` + 所有已注册 `folders.mount_path`

### 12.3 挂载目录约束

新增目录时必须拒绝：

- 与现有目录完全相同
- 是现有目录的子目录
- 是现有目录的父目录

原因：

- 避免重复扫描
- 避免同一文件被多次发现
- 避免路径权限边界变得模糊

### 12.4 上传安全

- 扩展名白名单
- MIME type 仅作辅助手段，不可单独信任
- 上传先写入 `tmp/`，完成后原子移动
- 上传目录不允许目录遍历、不允许执行

### 12.5 速率限制

| 接口 | 限制 |
|------|------|
| 登录 | 10 次 / 分钟 |
| 上传 | 5 次 / 分钟 |
| 触发扫描 | 10 次 / 分钟 |
| 普通读取 API | 120 次 / 分钟 |

### 12.6 最小暴露面

- 不提供任意路径下载
- 不提供数据库文件下载
- 不暴露 FFmpeg 原始命令输入给客户端

---

## 13. 测试与交付计划

### 13.1 测试层次

#### 单元测试

- `PathGuard`
- `PlaybackResolver`
- `FeedBuilder`
- `SessionService`

#### 集成测试

- SQLite + Drizzle migration
- 上传后处理链路
- Range 流式接口
- 扫描任务的新增/更新/隐藏逻辑

#### 端到端测试

- 登录
- 添加挂载目录并完成首次扫描
- 上传 1 个视频并进入 Feed
- 滑动切换并记录播放进度

#### 手工兼容验证

- iOS Safari
- Android Chrome
- 桌面 Chrome

### 13.2 里程碑

#### M1: 后端基线

- 数据库 schema
- 登录 / 会话 / CSRF
- 文件夹管理
- 扫描与缩略图
- Range 播放

#### M2: 前端核心体验

- 登录页
- Feed
- 文件夹浏览
- 上传页
- 设置页

#### M3: 稳定性

- 转码队列
- 任务恢复
- 健康检查
- Docker / Nginx
- 备份与恢复流程

### 13.3 参考项目

- **MyTube**：认证中间件、SQLite + Drizzle、FFmpeg 工具链、路径安全模型
- **TikTok**：移动端 Feed 交互模式和视图节奏
