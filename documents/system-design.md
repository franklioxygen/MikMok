# MikMok — 系统设计文档

> 单用户私有短视频平台，移动端优先，首页默认进入播放态。本文档同时描述当前已落地实现，以及尚未完成部分的补齐设计。

## 1. 当前状态

截至 `2026-04-18`，当前仓库已经完成的是“可演示原型”，不是完整 MVP。

已落地：

- 首页打开后直接进入推荐视频播放态，不先展示登录页或管理页
- Feed 已实现上一条 / 当前 / 下一条三卡舞台，支持上滑、下滑、滚轮、方向键切换
- 右下角已有透明操作按钮：`Favorite`、`Info`、`Sound`
- `Folders / Upload / Settings` 已接到底部导航
- 后端已实现挂载目录持久化注册、首次导入允许根、手动扫描、移除挂载
- 手动扫描现在会立即切到后台执行，目录状态先变成 `scanning`
- 扫描结果会写入 SQLite `videos` 索引表，Feed、详情、流播放都读这份快照
- 扫描阶段已接入 `ffprobe` 元数据提取和 `ffmpeg` 缩略图生成
- 扫描阶段的媒体处理已经改成有限并发，避免大目录首次扫描把单次请求一直卡住
- 已实现 `playback_status` 判定：`direct` / `processing` / `ready` / `failed`
- 非直播放视频会进入 SQLite `jobs` 表，由进程内 worker 自动转码到 `/app/backend/uploads/transcodes`
- 上传文件会落到系统内置 `Uploads` 来源并立即重扫入库
- 已实现 `GET /api/videos/feed`、`GET /api/videos/:id`、`GET /api/videos/:id/thumbnail*`、`POST /api/videos/:id/play`、`POST /api/videos/:id/progress`、`GET /stream/:id`
- 已实现 `GET /api/jobs`、`GET /api/jobs/:id`，`health` 也会返回当前 job 计数
- 播放状态已持久化到 SQLite
- 后端生产模式下会直接托管 `frontend/dist`，单镜像即可部署
- 已有 Docker image 构建与 GHCR 推送脚本

当前缺口：

- 扫描任务当前只是进程内后台 promise，不是持久化 `job`
- 还没有 `scan` / `upload_finalize` / `thumbnail_rebuild` 等更完整的 job 类型
- 还没有 job 进度 SSE、自动调度和更细粒度恢复策略
- 还没有标签、描述、视频元数据编辑
- 还没有正式鉴权恢复；当前首页与写接口都未强制登录
- 当前登录密码直接来自环境变量，会话存在内存中，重启即丢
- 还没有 PWA 离线壳、service worker、安装流程

## 2. 缺口补齐顺序

建议按以下顺序继续开发：

1. 任务系统补齐：`scan/upload` job、SSE、自动调度、失败重试策略
2. 正式鉴权：密码哈希、`auth_sessions`、CSRF、中间件接回
3. 视频编辑能力：标题、描述、喜欢、隐藏、标签
4. Feed 会话与筛选：`mode`、`folderId`、`tag`、`likedOnly`
5. PWA 与部署增强：manifest、service worker、反向代理建议

## 3. 产品范围

### 3.1 目标

| 维度 | 设计 |
|------|------|
| 用户模型 | 单用户私有实例，无注册、无多租户 |
| 设备形态 | 移动端优先，桌面端可管理 |
| 内容来源 | 本地挂载目录 + 手动上传 |
| 内容形态 | 短视频优先 |
| 首页体验 | 打开首页立即播放一条推荐视频 |
| 部署场景 | NAS、家用服务器、Docker 主机、本地开发机 |

### 3.2 当前原型范围

当前原型已经解决：

- 安全地注册和扫描受控挂载目录
- 大目录扫描不再把前端请求挂到目录处理完成
- 上传文件进入统一索引
- 元数据提取、缩略图生成、直播放行和按需转码
- 首页播放、上下切换、播放进度记录
- 文件夹浏览与流式播放
- SQLite 持久化 job 与进程内转码 worker
- Docker 单镜像部署

当前原型尚未解决：

- 更完整的后台任务体系
- 鉴权闭环
- 任务恢复闭环
- 视频元数据管理
- 标签与筛选

### 3.3 成功标准

完整 MVP 以以下指标为目标：

- 局域网内打开首页后 2 秒内看到首个可播放视频
- 已可播放视频在切换后 500ms 内开始播放
- 扫描、缩略图、转码任务在进程重启后可恢复
- 所有文件访问都受允许目录约束
- 登录、上传、删除、设置修改都受会话和 CSRF 保护

## 4. 技术决策

### 4.1 当前实现

#### 后端

| 项目 | 当前实现 |
|------|----------|
| 运行时 | Node.js 22 + TypeScript |
| Web 框架 | Express |
| 数据库 | SQLite + `better-sqlite3` + 手写 SQL |
| 媒体流 | `direct` 读源文件，`ready` 读转码产物，统一支持 HTTP Range |
| 上传 | `multer` 落盘到 `backend/uploads/tmp` 后再原子移动 |
| 部署 | 单镜像，Express 同时提供 API、流和前端静态资源 |

#### 前端

| 项目 | 当前实现 |
|------|----------|
| 框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| 路由 | React Router v7 |
| 客户端状态 | Zustand |
| 服务端请求 | 轻量 `fetch` 包装 + 组件内加载 |
| 样式 | 自定义 CSS 变量 + 手写 CSS |

### 4.2 仍待补齐设计

以下是当前还没做完的补齐方向：

| 领域 | 补齐方案 |
|------|----------|
| 媒体处理 | 已接入 `ffprobe`/`ffmpeg`；后续补 job 解耦、更多状态和更稳健恢复 |
| 数据访问 | 继续保留 SQLite；若 schema 复杂度继续上升，再引入 Drizzle schema/migration |
| 任务系统 | 使用进程内 worker + SQLite 持久化 `jobs` 表 |
| 前端查询 | 当任务进度、筛选和设置页变复杂时，再引入 TanStack Query |
| PWA | 在媒体处理链路稳定后再接入 manifest 和 service worker |
| 反向代理 | 当前单镜像已可直接部署；有 HTTPS、域名或大上传需求时，再建议加 Nginx/Caddy |

### 4.3 核心取舍

#### 首页优先级

首页永远不是控制台，而是正在播放的视频本身：

- 默认路由直接进入 Feed
- 所有全局入口沉到底部
- 信息卡按需展开，不默认盖住视频

#### 播放策略

当前实现已经是“先判断直播放行，再按需转码”的两段式策略：

- `direct`：源文件可直接播放
- `needs_transcode`：已识别为非直播放文件，但尚未入队或正在等待重试
- `processing`：已入队处理
- `ready`：已有统一播放产物
- `failed`：处理失败，仅在管理页可见

#### 鉴权策略

当前原型保留了 `/api/auth/*`，但尚未接回全局认证中间件。  
完整 MVP 不使用 JWT，而使用服务端会话：

- Cookie 里只放随机会话 token
- 服务端持久化 `auth_sessions`
- 所有写接口校验 CSRF

## 5. 系统架构

### 5.1 当前运行结构

```text
Mobile Browser
    |
    v
Express single-container app
  |- React SPA static files
  |- /api/*
  |- /stream/:id
  |
  +--> SQLite (/app/backend/data/mikmok.db)
  +--> Upload storage (/app/backend/uploads)
  +--> Mounted folders (/mounts, read-only)
```

### 5.2 补齐后的目标结构

```text
Mobile Browser / PWA
    |
    v
Express app
  |- auth/session middleware
  |- videos/folders/uploads/settings/tags APIs
  |- job APIs
  |- stream endpoint
  |
  +--> SQLite
  |     |- mounted_folders
  |     |- videos
  |     |- playback_state
  |     |- jobs
  |     |- tags / video_tags
  |     `- auth_sessions / settings
  |
  +--> Upload storage
  +--> Mounted folders
  +--> FFprobe / FFmpeg workers
```

### 5.3 运行原则

- 所有媒体访问都必须先查索引，再解析真实路径
- 外部挂载目录只能位于 `ALLOWED_MOUNT_ROOTS` 之下
- 当前扫描已异步化，但还没进入持久化 job system；后续迁移时 API 返回格式尽量保持兼容
- 前端不直接拼磁盘路径，只使用 API 返回的 `videoId` 和 `streamUrl`

## 6. 运行时目录与边界

### 6.1 当前仓库目录

```text
mikmok/
├── backend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/env.ts
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   └── schema.ts
│   │   ├── middleware/
│   │   │   └── errorHandler.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── folders.ts
│   │   │   ├── health.ts
│   │   │   ├── stream.ts
│   │   │   ├── uploads.ts
│   │   │   └── videos.ts
│   │   ├── services/
│   │   │   ├── auth/
│   │   │   ├── library/
│   │   │   └── storage/
│   │   └── utils/http.ts
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/client.ts
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── store/uiStore.ts
│   │   └── styles/
│   ├── vite.config.ts
│   └── package.json
├── documents/
├── scripts/release/
├── stacks/docker-compose.yml
└── package.json
```

### 6.2 计划新增目录

后续补齐缺口时建议新增：

```text
backend/src/
├── routes/
│   ├── jobs.ts
│   ├── settings.ts
│   └── tags.ts
├── middleware/
│   ├── auth.ts
│   └── csrf.ts
├── services/
│   ├── jobs/
│   ├── media/
│   └── tags/
└── workers/
    ├── scheduler.ts
    └── startupRecovery.ts
```

### 6.3 当前容器内路径

```text
/app/backend/data
/app/backend/uploads/tmp
/app/backend/uploads/videos
/app/backend/uploads/transcodes
/app/backend/uploads/thumbnails
/app/backend/uploads/thumbnails-sm
/mounts
```

### 6.4 目录职责

| 路径 | 用途 | 当前状态 |
|------|------|----------|
| `/app/backend/data` | SQLite 与内部状态 | 已使用 |
| `/app/backend/uploads/videos` | 应用自己接收的上传源文件 | 已使用 |
| `/app/backend/uploads/tmp` | 上传临时目录 | 已使用 |
| `/app/backend/uploads/transcodes` | 转码产物 | 已接入第一版转码链路 |
| `/app/backend/uploads/thumbnails*` | 缩略图产物 | 已接入缩略图生成 |
| `/mounts` | 外部只读挂载根 | 已使用 |

## 7. 数据模型

### 7.1 当前已落地表

#### `app_state`

用于保存一次性初始化标记，例如：

- `mounted_folders_seeded`
- `videos_index_seeded`

#### `mounted_folders`

当前用于保存挂载目录本身：

- `id`
- `name`
- `mount_path`
- `is_active`
- `auto_scan`
- `scan_interval_minutes`
- `max_depth`
- `scan_status`
- `last_scanned_at`
- `created_at`
- `updated_at`

#### `videos`

当前只是“索引快照表”，保存：

- `id`
- `folder_id`
- `title`
- `source_name`
- `source_path`
- `mime_type`
- `extension`
- `source_size`
- `source_mtime_ms`
- `indexed_at`

#### `playback_state`

当前保存：

- `video_id`
- `play_count`
- `resume_position_seconds`
- `last_played_at`
- `updated_at`

### 7.2 补齐后的表设计

#### 扩展 `videos`

在现有索引表上追加以下字段：

- `description`
- `source_type`，值为 `upload | mount`
- `container`
- `video_codec`
- `audio_codec`
- `duration_seconds`
- `width`
- `height`
- `fps`
- `thumbnail_path`
- `thumbnail_sm_path`
- `playback_path`
- `playback_status`
- `liked`
- `hidden`
- `created_at`
- `updated_at`

目标语义：

- `source_path` 始终指向原始文件
- `playback_path` 仅在转码完成后填写
- `hidden=1` 代表不出现在 Feed，但不删源文件

#### `tags`

```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
```

#### `video_tags`

```sql
CREATE TABLE video_tags (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, tag_id)
);
```

#### `jobs`

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  payload_json TEXT NOT NULL,
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  progress_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  updated_at INTEGER NOT NULL
);
```

#### `settings`

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

推荐键：

- `password_hash`
- `feed_default_mode`
- `autoplay_enabled`
- `loop_video`
- `transcode_enabled`
- `max_upload_size_mb`

#### `auth_sessions`

```sql
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
```

### 7.3 迁移原则

- 现有 `mounted_folders`、`videos`、`playback_state` 不推倒重来
- 缺失字段优先通过 `ALTER TABLE` 追加
- 新的 `settings`、`auth_sessions`、`jobs`、`tags`、`video_tags` 直接新建
- 当前 `schema.ts` 为空壳，补齐阶段再决定是否正式引入 Drizzle schema/migrations

## 8. 媒体兼容与播放策略

### 8.1 当前行为

当前后端只做两件事：

- 扫描文件扩展名并入库
- 按 `stream/:id` 直接读取源文件

也就是说，当前是否能播取决于浏览器本身对源文件的支持。

### 8.2 补齐后的直播放行规则

完整 MVP 采用以下判断：

- 容器必须是 `mp4`
- 视频编码必须是 `h264`
- 音频编码必须是 `aac` 或无音轨

满足以上条件：

- `playback_status=direct`
- `stream/:id` 直接读 `source_path`

不满足以上条件：

- `playback_status=needs_transcode`
- 入队转码
- worker 执行时切到 `processing`
- 转码完成后写 `playback_path`
- 切换为 `playback_status=ready`

### 8.3 缩略图设计

- 默认抽第 1 秒帧
- 若视频时长不足 1 秒，则抽中间帧
- 生成两种产物：
  - `thumbnails/<videoId>.jpg`
  - `thumbnails-sm/<videoId>.jpg`

### 8.4 转码设计

目标输出：

```text
container: mp4
video codec: h264
audio codec: aac
movflags: +faststart
```

产物路径：

```text
/app/backend/uploads/transcodes/<videoId>.mp4
```

## 9. 任务与处理流水线

### 9.1 当前链路

当前已经有第一版通用 job system。  
现状是：

- 手动扫描会立刻返回，并在后台继续执行
- 扫描状态通过 `mounted_folders.scan_status` 暴露，前端轮询 `GET /api/folders` 刷新
- 当前扫描后台执行仍是进程内 promise，不会写入 `jobs` 表
- 上传落盘后立即同步重扫 `Uploads`
- `transcode` 会写入 SQLite `jobs` 表
- 进程内 worker 会轮询 `queued` job 并执行
- 启动时会把 `running` job 重置回 `queued`
- 还没有进度 SSE，也还没有 `scan/upload_finalize` 这些 job 类型

### 9.2 补齐后的任务类型

计划支持：

- `scan`
- `upload_finalize`
- `thumbnail_rebuild`
- `transcode`

### 9.3 扫描任务设计

```text
用户添加或手动扫描目录
  -> 创建 / 复用 folder 记录
  -> 入队 scan job

scan worker:
  1. 遍历目录
  2. 过滤扩展名
  3. realpath 校验不越界
  4. 对新增或变更文件跑 ffprobe
  5. 更新 videos 记录
  6. 生成缩略图
  7. 需要转码则入队 transcode
  8. 本轮缺失的旧文件标记 hidden=1
```

### 9.4 上传任务设计

```text
浏览器上传
  -> /tmp
  -> 原子移动到 /videos/<batch>/<file>
  -> 入队 upload_finalize

upload_finalize worker:
  -> 触发 Uploads 目录扫描
  -> 返回视频索引结果
```

### 9.5 调度与恢复

启动恢复规则：

- 所有 `jobs.status='running'` 重置为 `queued`
- 所有 `mounted_folders.scan_status='scanning'` 重置为 `pending`

轮询调度器：

- 检查 `is_active=1 and auto_scan=1`
- 判断是否超过自己的扫描间隔
- 避免同目录重复入队

### 9.6 重试策略

- `scan`：默认不自动重试
- `upload_finalize`：最多 3 次
- `thumbnail_rebuild`：最多 2 次
- `transcode`：最多 3 次

不可自动重试：

- 路径越界
- 权限错误
- 文件已确认不存在

可自动重试：

- 临时 I/O 失败
- FFmpeg / FFprobe 子进程异常退出

## 10. Feed 设计

### 10.1 当前行为

当前 Feed 已具备：

- 三卡舞台：上一条 / 当前 / 下一条
- 仅当前卡真正播放
- 邻近卡 `preload="metadata"`
- 上滑 / 下滑 / 滚轮 / 键盘切换
- 右侧透明操作区
- 底部导航
- 收藏仅存前端 `localStorage`

### 10.2 补齐设计

后续补齐以下能力：

- 服务端 `mode=random|latest|by_folder`
- `folderId`、`tag`、`likedOnly` 过滤
- Feed 会话 `sessionId + cursor`
- 从当前播放状态恢复首条推荐
- 后端侧“可播放优先”过滤，排除 `processing/failed`

### 10.3 Feed 会话模型

```text
FeedSession {
  id: string
  mode: "random" | "latest" | "by_folder"
  filters: { folderId?: string, tag?: string, likedOnly?: boolean }
  orderedVideoIds: string[]
  expiresAt: number
}
```

### 10.4 收藏设计

当前收藏只保存在浏览器本地。  
后续设计迁移为：

- `videos.liked` 持久化到 SQLite
- `PATCH /api/videos/:id` 可更新
- Feed 可按 `likedOnly=true` 过滤

## 11. API 设计摘要

当前已实现的稳定子集以 [api-endpoints.md](/Users/franklioxygen/Projects/MikMok/documents/api-endpoints.md) 为准。  
这里仅记录两类信息：

- 当前已经可依赖的接口
- 当前未实现、但后续会补齐的接口设计方向

### 11.1 当前已实现

- `GET /api/health`
- `GET /api/videos/feed`
- `GET /api/videos/:id`
- `GET /api/videos/:id/thumbnail`
- `GET /api/videos/:id/thumbnail-sm`
- `POST /api/videos/:id/play`
- `POST /api/videos/:id/progress`
- `GET /api/folders`
- `POST /api/folders`
- `DELETE /api/folders/:id`
- `POST /api/folders/:id/scan`
- `GET /api/folders/:id/videos`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/uploads`
- `GET /stream/:id`

### 11.2 后续补齐

- `PATCH /api/videos/:id`
- `DELETE /api/videos/:id`
- `PATCH /api/folders/:id`
- `GET /api/jobs/:id/events`
- `GET /api/tags`
- `GET /api/settings`
- `PATCH /api/settings`
- `POST /api/settings/password`

### 11.3 兼容性要求

未来补齐 scan/upload 持久化任务后：

- `POST /api/folders/:id/scan` 可在当前 `202` 的基础上继续附带 `jobId`
- `POST /api/uploads` 可在保留 `accepted/rejected` 的同时附带 `jobId`

原则：

- 优先追加字段，不轻易破坏现有前端
- 保留当前原型能工作的最小返回结构

## 12. 前端架构

### 12.1 当前页面

```text
/             -> Feed
/folders      -> 文件夹页
/folders/:id  -> 文件夹视频列表
/upload       -> 上传页
/settings     -> 设置页
/login        -> 登录页（当前默认不拦截）
```

### 12.2 当前状态分工

#### 组件内加载 / API 包装

- feed 列表
- 视频详情
- 文件夹列表
- 上传请求
- health 信息

#### Zustand

- 当前播放索引
- 当前是否静音
- 当前 UI 导航状态

### 12.3 后续补齐

- 任务进度查询和 SSE 订阅
- 标签筛选和编辑
- 登录态恢复与 CSRF 注入
- PWA manifest / service worker

## 13. 部署与运维

### 13.1 当前单镜像部署

当前发布产物是单镜像：

```text
ghcr.io/franklioxygen/mikmok:latest
```

运行方式参考 [getting-started.md](/Users/franklioxygen/Projects/MikMok/documents/getting-started.md) 和 [stacks/docker-compose.yml](/Users/franklioxygen/Projects/MikMok/stacks/docker-compose.yml:1)。

### 13.2 当前关键环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `5552` | 服务端口 |
| `CORS_ORIGIN` | `http://localhost:5552` | CORS 允许来源 |
| `MIKMOK_PASSWORD` | `changeme` | 当前原型直接比对的明文密码 |
| `ALLOWED_MOUNT_ROOTS` | `/mounts` | 允许注册的挂载根 |
| `SESSION_TTL_DAYS` | `7` | 当前内存会话过期时间 |
| `MAX_UPLOAD_SIZE_MB` | `500` | 上传大小限制 |
| `TRANSCODE_ENABLED` | `1` | 控制是否自动为非直播放视频入队转码 |

### 13.3 当前密码语义

当前代码没有密码 bootstrap，也没有密码哈希落库。  
现状是：

- `MIKMOK_PASSWORD` 每次启动都直接生效
- `/api/auth/login` 直接与环境变量做安全比较
- 会话存在内存里，服务重启即失效

### 13.4 补齐后的密码设计

计划升级为：

- `settings.password_hash` 持久化
- 首次启动时若无 `password_hash`，再从 `MIKMOK_PASSWORD` 引导初始化
- `POST /api/settings/password` 修改密码后，使所有 `auth_sessions` 失效

### 13.5 备份

必须备份：

- `/app/backend/data`
- `/app/backend/uploads`

无需备份：

- `/mounts/*`

## 14. 安全设计

### 14.1 当前已做

- 挂载目录必须位于 `ALLOWED_MOUNT_ROOTS` 之下
- 注册目录前会做 `realpath`、存在性、可读性、目录类型校验
- 视频流不接受任意文件路径，只接受 `videoId`

### 14.2 当前未做

- 没有全局登录拦截
- 没有写接口 CSRF 校验
- 没有密码哈希
- 没有会话持久化
- 没有速率限制

### 14.3 补齐后的安全要求

- 密码使用 `bcrypt` 或等价安全哈希
- 会话 Cookie 使用 `httpOnly`
- `sameSite=lax` 或 `strict`
- HTTPS 下启用 `secure`
- 上传、删除、设置修改、视频编辑等写接口统一要求 `X-CSRF-Token`
- 对登录和上传接口加入速率限制

## 15. 交付里程碑

### 15.1 已完成

- 首页直接播放
- 三卡切换
- 挂载注册和扫描
- 上传入库
- SQLite 视频索引
- 播放状态持久化
- Docker 单镜像和发布脚本

### 15.2 下一步

1. 元数据和缩略图
2. 任务表和 worker
3. 转码流水线
4. 正式鉴权恢复
5. 视频编辑与标签
6. Feed 会话与筛选
