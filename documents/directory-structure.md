# MikMok — 目录结构

以下目录结构对应当前设计文档中的可实施 MVP 方案。

```text
mikmok/
├── backend/
│   ├── src/
│   │   ├── app.ts                         # Express app，注册中间件与路由
│   │   ├── server.ts                      # HTTP 启动入口
│   │   ├── config/
│   │   │   └── env.ts                     # 环境变量读取与校验
│   │   ├── db/
│   │   │   ├── index.ts                   # Drizzle + SQLite 连接
│   │   │   ├── schema.ts                  # 表结构定义
│   │   │   └── migrations/                # 迁移文件
│   │   ├── routes/
│   │   │   ├── auth.ts                    # /api/auth/*
│   │   │   ├── videos.ts                  # /api/videos/*
│   │   │   ├── folders.ts                 # /api/folders/*
│   │   │   ├── uploads.ts                 # /api/uploads
│   │   │   ├── jobs.ts                    # /api/jobs/*
│   │   │   ├── settings.ts                # /api/settings*
│   │   │   ├── tags.ts                    # /api/tags
│   │   │   ├── stream.ts                  # /stream/:id
│   │   │   └── health.ts                  # /api/health/*
│   │   ├── controllers/
│   │   │   ├── authController.ts
│   │   │   ├── videoController.ts
│   │   │   ├── folderController.ts
│   │   │   ├── uploadController.ts
│   │   │   ├── jobController.ts
│   │   │   ├── settingsController.ts
│   │   │   ├── tagController.ts
│   │   │   ├── streamController.ts
│   │   │   └── healthController.ts
│   │   ├── services/
│   │   │   ├── auth/
│   │   │   │   ├── AuthService.ts         # 密码校验与登录登出
│   │   │   │   ├── SessionService.ts      # 会话生成、存储、失效
│   │   │   │   └── PasswordBootstrap.ts   # 首次启动密码初始化
│   │   │   ├── feed/
│   │   │   │   ├── FeedBuilder.ts         # Feed 结果构建
│   │   │   │   └── FeedSessionStore.ts    # 30 分钟 TTL 的内存会话
│   │   │   ├── jobs/
│   │   │   │   ├── JobRepository.ts       # jobs 表访问
│   │   │   │   ├── JobQueue.ts            # 内存任务调度
│   │   │   │   ├── JobWorker.ts           # worker 执行器
│   │   │   │   └── JobEvents.ts           # SSE 事件分发
│   │   │   ├── library/
│   │   │   │   ├── VideoService.ts        # 视频查询、编辑、隐藏
│   │   │   │   ├── FolderService.ts       # 挂载目录管理
│   │   │   │   ├── FolderScanner.ts       # 扫描外部目录
│   │   │   │   └── TagService.ts          # 标签增删改查
│   │   │   ├── media/
│   │   │   │   ├── MetadataExtractor.ts   # FFprobe 封装
│   │   │   │   ├── ThumbnailService.ts    # 缩略图生成
│   │   │   │   ├── PlaybackResolver.ts    # 判断直播或转码
│   │   │   │   └── TranscodeService.ts    # FFmpeg 转码
│   │   │   └── storage/
│   │   │       ├── PathGuard.ts           # realpath 与 allowed roots 校验
│   │   │       ├── UploadStore.ts         # tmp -> videos 原子移动
│   │   │       └── MountRegistry.ts       # 挂载路径规则校验
│   │   ├── middleware/
│   │   │   ├── auth.ts                    # 会话认证
│   │   │   ├── csrf.ts                    # CSRF 校验
│   │   │   ├── rateLimit.ts               # 速率限制
│   │   │   └── errorHandler.ts            # 统一错误响应
│   │   ├── workers/
│   │   │   ├── scheduler.ts               # 周期检查 auto scan
│   │   │   └── startupRecovery.ts         # 重启后恢复 running jobs
│   │   └── utils/
│   │       ├── time.ts
│   │       ├── ids.ts
│   │       └── ffmpeg.ts
│   ├── data/                              # SQLite 与内部状态
│   │   └── mikmok.db
│   ├── uploads/
│   │   ├── tmp/                           # 上传中的临时文件
│   │   ├── videos/                        # 上传原始视频
│   │   ├── transcodes/                    # 转码产物
│   │   ├── thumbnails/                    # 全尺寸缩略图
│   │   └── thumbnails-sm/                 # Feed 小图
│   ├── drizzle.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx                       # React 入口
│   │   ├── App.tsx                        # 路由定义
│   │   ├── pages/
│   │   │   ├── Feed.tsx                   # 全屏垂直滑动 Feed
│   │   │   ├── FolderBrowser.tsx          # 文件夹列表
│   │   │   ├── FolderVideos.tsx           # 单文件夹视频列表
│   │   │   ├── Upload.tsx                 # 上传页面
│   │   │   ├── Settings.tsx               # 设置页面
│   │   │   └── Login.tsx                  # 登录页
│   │   ├── components/
│   │   │   ├── FeedStack.tsx              # 当前 / 上一条 / 下一条容器
│   │   │   ├── VideoPlayer.tsx            # HTML5 视频播放器封装
│   │   │   ├── VideoOverlay.tsx           # 标题、标签、进度等覆盖层
│   │   │   ├── ActionBar.tsx              # 喜欢、标签、文件夹入口
│   │   │   ├── BottomNav.tsx              # 底部导航
│   │   │   ├── FolderCard.tsx             # 文件夹卡片
│   │   │   ├── TagFilterSheet.tsx         # 标签筛选
│   │   │   ├── UploadPanel.tsx            # 上传表单与网络进度
│   │   │   └── JobProgressSheet.tsx       # 扫描 / 上传后处理进度
│   │   ├── hooks/
│   │   │   ├── useAuth.ts                 # 会话状态
│   │   │   ├── useFeedSession.ts          # Feed sessionId、翻页、会话过期恢复
│   │   │   ├── useVideoPlayback.ts        # 自动播放 / 进度上报
│   │   │   ├── useJobEvents.ts            # SSE 任务进度
│   │   │   └── useUpload.ts               # 上传逻辑
│   │   ├── api/
│   │   │   ├── client.ts                  # fetch/axios 封装
│   │   │   ├── auth.ts
│   │   │   ├── videos.ts
│   │   │   ├── folders.ts
│   │   │   ├── uploads.ts
│   │   │   ├── jobs.ts
│   │   │   ├── settings.ts
│   │   │   └── tags.ts
│   │   ├── store/
│   │   │   ├── uiStore.ts                 # 底部 sheet、当前 tab、静音状态
│   │   │   └── playbackStore.ts           # 当前 index、feed mode、sessionId
│   │   └── styles/
│   │       ├── global.css
│   │       └── variables.css
│   ├── public/
│   │   ├── manifest.json
│   │   └── icons/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── documents/
│   ├── system-design.md
│   ├── api-endpoints.md
│   ├── directory-structure.md
│   └── getting-started.md
│
├── docker-compose.yml
├── Dockerfile
├── nginx.conf
├── package.json
└── README.md
```

## 运行时数据目录

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

## 目录设计原则

- `uploads/` 由应用自己完全管理
- `mounts/` 只读，应用不能删除其下文件
- `tmp/` 与正式存储分离，避免半文件进入视频库
- `services/` 按领域分组，而不是把所有逻辑堆在一个目录
- `workers/` 只放后台调度和恢复逻辑，不处理 HTTP
