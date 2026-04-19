# MikMok — 目录结构

本文档区分两部分：

- 当前仓库已经存在的目录与文件
- 为补齐剩余缺口而建议新增的目录

## 1. 当前仓库结构

```text
mikmok/
├── backend/
│   ├── src/
│   │   ├── app.ts                         # Express app，注册 API、stream、静态前端
│   │   ├── server.ts                      # HTTP 启动入口
│   │   ├── config/
│   │   │   └── env.ts                     # 环境变量读取与校验
│   │   ├── db/
│   │   │   ├── index.ts                   # SQLite 连接与建表
│   │   │   └── schema.ts                  # 预留 schema 入口，当前仍是占位
│   │   ├── middleware/
│   │   │   └── errorHandler.ts            # 统一错误响应
│   │   ├── routes/
│   │   │   ├── auth.ts                    # /api/auth/*
│   │   │   ├── folders.ts                 # /api/folders/*
│   │   │   ├── health.ts                  # /api/health
│   │   │   ├── jobs.ts                    # /api/jobs/*
│   │   │   ├── stream.ts                  # /stream/:id
│   │   │   ├── uploads.ts                 # /api/uploads
│   │   │   └── videos.ts                  # /api/videos/*
│   │   ├── services/
│   │   │   ├── auth/
│   │   │   │   ├── AuthService.ts         # 当前密码校验
│   │   │   │   └── SessionService.ts      # 当前内存会话
│   │   │   ├── jobs/
│   │   │   │   ├── jobService.ts          # SQLite jobs 访问
│   │   │   │   └── jobWorker.ts           # 进程内 job worker
│   │   │   ├── library/
│   │   │   │   ├── mediaLibrary.ts        # Feed / folder / stream 查询
│   │   │   │   ├── mountedFolders.ts      # 挂载目录注册与扫描
│   │   │   │   ├── playbackState.ts       # 播放状态持久化
│   │   │   │   ├── scanner.ts             # 扫描目录中的视频文件
│   │   │   │   └── videoIndex.ts          # SQLite 视频索引访问
│   │   │   ├── media/
│   │   │   │   ├── mediaProcessor.ts      # 扫描时接元数据/缩略图/播放状态
│   │   │   │   ├── metadataExtractor.ts   # ffprobe 元数据提取
│   │   │   │   ├── playbackPolicy.ts      # 直播放行规则
│   │   │   │   ├── thumbnailService.ts    # ffmpeg 缩略图生成
│   │   │   │   └── transcodeService.ts    # ffmpeg 转码
│   │   │   └── storage/
│   │   │       └── uploadStore.ts         # tmp -> videos 原子移动
│   │   └── utils/
│   │       └── http.ts                    # 通用响应与 AppError
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts                  # fetch 封装
│   │   ├── components/
│   │   │   ├── AppShell.tsx
│   │   │   └── BottomNav.tsx
│   │   ├── hooks/
│   │   │   └── useAuth.tsx
│   │   ├── pages/
│   │   │   ├── Feed.tsx
│   │   │   ├── FolderBrowser.tsx
│   │   │   ├── FolderVideos.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Upload.tsx
│   │   ├── store/
│   │   │   └── uiStore.ts
│   │   └── styles/
│   │       ├── global.css
│   │       └── variables.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── documents/
│   ├── api-endpoints.md
│   ├── directory-structure.md
│   ├── getting-started.md
│   └── system-design.md
├── scripts/
│   └── release/
│       ├── build-and-push.sh
│       └── build-and-push-test.sh
├── stacks/
│   └── docker-compose.yml
├── .dockerignore
├── package.json
├── package-lock.json
└── tsconfig.base.json
```

## 2. 当前运行时数据目录

```text
/app/backend/
├── data/
│   └── mikmok.db
└── uploads/
    ├── tmp/
    ├── videos/
    ├── transcodes/
    ├── thumbnails/
    └── thumbnails-sm/

/mounts/
└── ...
```

说明：

- `data/` 和 `uploads/` 必须持久化
- `mounts/` 是只读外部媒体根
- `transcodes/` 和 `thumbnails*/` 已经被当前原型使用

## 3. 为补齐缺口建议新增

后续要完成任务系统、缩略图、转码、正式鉴权时，建议新增以下目录：

```text
backend/src/
├── middleware/
│   ├── auth.ts                           # 正式会话认证
│   └── csrf.ts                           # CSRF 校验
├── routes/
│   ├── settings.ts                       # /api/settings*
│   └── tags.ts                           # /api/tags
├── services/
│   ├── jobs/
│   │   ├── JobEvents.ts
│   │   └── Scheduler.ts
│   └── tags/
│       └── TagService.ts
└── workers/
    ├── scheduler.ts
    └── startupRecovery.ts
```

前端建议新增：

```text
frontend/src/
├── api/
│   ├── jobs.ts
│   ├── settings.ts
│   └── tags.ts
├── hooks/
│   ├── useJobEvents.ts
│   ├── useUpload.ts
│   └── useVideoEditor.ts
└── components/
    ├── FeedInfoCard.tsx
    ├── TagFilterSheet.tsx
    └── JobProgressSheet.tsx
```

## 4. 目录设计原则

- `backend/services/library` 继续负责“已入库视频”和“挂载目录”的核心逻辑
- 媒体处理能力单独放进 `services/media`
- 后台任务逻辑不要混在 HTTP 路由里，独立到 `services/jobs` 和 `workers`
- 前端继续保持“页面驱动 + 轻量组件”；复杂度上升后再抽离更多 hooks 和 api 模块
- 文档中的路径示例优先写容器内路径，避免把宿主机路径误写进 UI
