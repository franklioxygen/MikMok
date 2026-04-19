# MikMok — 快速启动

本指南以当前仓库已经实现的功能为准。当前已经有缩略图、元数据提取、基础转码 job 和进程内 worker；尚未完成的是更完整的任务体系和正式鉴权。

## 1. Docker Compose

### 1.1 准备目录

```bash
mkdir -p ./data ./uploads ./mounts
```

### 1.2 创建 `docker-compose.yml`

推荐直接参考仓库内模板：

- [stacks/docker-compose.yml](/Users/franklioxygen/Projects/MikMok/stacks/docker-compose.yml:1)

最小示例：

```yaml
services:
  mikmok:
    image: ghcr.io/franklioxygen/mikmok:latest
    container_name: mikmok
    ports:
      - "5552:5552"
    volumes:
      - ./data:/app/backend/data
      - ./uploads:/app/backend/uploads
      - /path/to/your-media-root:/mounts:ro
    environment:
      - HOST=0.0.0.0
      - PORT=5552
      - CORS_ORIGIN=http://localhost:5552
      - MIKMOK_PASSWORD=changeme
      - ALLOWED_MOUNT_ROOTS=/mounts
      - SESSION_TTL_DAYS=7
      - MAX_UPLOAD_SIZE_MB=500
      - TRANSCODE_ENABLED=1
    restart: unless-stopped
```

### 1.3 启动

```bash
docker compose up -d
```

### 1.4 访问

打开：

- `http://localhost:5552`

当前原型会直接进入首页播放态，不要求先登录。

## 2. 容器路径规则

这部分是部署时最容易搞错的地方。

容器内真正可见的路径是：

- 数据库目录：`/app/backend/data`
- 上传目录：`/app/backend/uploads`
- 外部挂载根：`/mounts`

因此在 MikMok 的 `Folders` 页面中填写的必须是容器内路径，例如：

- `/mounts/travel-shorts`
- `/mounts/test-shorts`
- `/mounts/family-clips`

不能填宿主机路径，例如：

- `/share/Medias/travel-shorts`
- `/Users/you/Videos/travel-shorts`

## 3. 当前鉴权语义

当前代码的密码逻辑和完整 MVP 目标不同。

现状是：

- 登录密码直接来自 `MIKMOK_PASSWORD`
- `/api/auth/login` 会直接比较明文环境变量
- 会话只存在内存里，服务重启即失效
- 前端默认不拦截首页和主要操作

这意味着：

- 修改 `MIKMOK_PASSWORD` 后，重启服务就会生效
- 当前没有“密码首次写入数据库后永久保存”的逻辑
- 当前也没有强制要求先登录才能使用上传、扫描等操作

## 4. 本地开发

### 4.1 前置条件

- Node.js 22+
- Docker 可选

说明：

- 当前扫描、缩略图和转码都依赖 `ffmpeg` / `ffprobe`
- Docker 镜像内已经包含它们；本地开发若要验证媒体处理，也需要本机可执行

### 4.2 安装依赖

```bash
npm install
```

### 4.3 环境变量

后端示例：

```bash
# backend/.env
PORT=5552
HOST=0.0.0.0
MIKMOK_PASSWORD=changeme
CORS_ORIGIN=http://localhost:5173
ALLOWED_MOUNT_ROOTS=/mounts
SESSION_TTL_DAYS=7
MAX_UPLOAD_SIZE_MB=500
TRANSCODE_ENABLED=1
```

前端示例：

```bash
# frontend/.env
VITE_API_URL=/api
VITE_BACKEND_URL=http://127.0.0.1:5552
```

### 4.4 启动开发服务器

```bash
npm run dev
```

默认通常是：

- 后端：`http://localhost:5552`
- 前端：`http://localhost:5173` 或自动顺延端口

如果你要从局域网其他设备访问：

- 后端默认监听 `0.0.0.0`
- 前端 Vite dev server 也监听 `0.0.0.0`

## 5. 挂载目录管理

当前原型已经接回挂载管理，并且会把扫描结果持久化到 SQLite 索引里。

### 5.1 当前规则

- 服务端在首次空库启动时，会把存在的允许根目录一次性导入为默认挂载源
- 后续新增目录应通过 `Folders` 页面或 `POST /api/folders` 注册
- `GET /api/videos/feed` 只读取 SQLite 中已注册挂载的索引结果
- 每次扫描都会刷新该目录在 `videos` 表中的快照
- `Scan now` 现在是后台执行：请求会立即返回，目录先显示 `scanning`

### 5.2 常见操作

- 添加一个路径
- 点击 `Scan now`
- 等待 `Folders` 页面自动刷新，直到 `scanStatus` 从 `scanning` 变成 `ready` / `empty` / `error`
- 打开某个文件夹的视频列表
- 删除挂载配置

### 5.3 系统会拒绝以下情况

- 路径不存在
- 路径不是目录
- 路径不可读
- 路径不在允许根目录下
- 路径与已有挂载目录互为父子目录

### 5.4 一个重要细节

如果你已经有旧数据库，然后再修改 `ALLOWED_MOUNT_ROOTS`：

- 旧挂载记录不会自动替换成新的路径
- 需要在 UI 里重新注册新路径，或者清空旧数据库后重新初始化

另一个重要细节：

- 当前扫描虽然已经异步化，但还不是持久化 job
- 如果服务在扫描中重启，本轮扫描会中断；重启后需要重新点一次 `Scan now`

## 6. 上传视频

上传入口当前支持：

- 单文件选择
- 多文件选择

支持的输入格式：

- `.mp4`
- `.mov`
- `.mkv`
- `.avi`
- `.webm`
- `.m4v`
- `.3gp`
- `.flv`
- `.wmv`
- `.ts`

当前上传行为：

- 文件先进入 `backend/uploads/tmp`
- 再原子移动到 `backend/uploads/videos/<batch>/`
- 上传完成后立即重扫系统内置 `Uploads` 来源
- 新视频会进入同一套 SQLite 索引
- 扫描时会提取元数据并生成缩略图
- 如果源文件不满足直播放行规则，会自动创建 `transcode` job

当前尚未实现：

- 上传后处理进度 SSE
- `scan` / `upload_finalize` 这些独立 job 类型
- 更细粒度的任务重试与自动调度

## 7. 当前功能边界

这部分是当前部署时最需要知道的限制。

### 7.1 已完成

- 首页直接播放
- 真实挂载扫描
- SQLite 视频索引
- `ffprobe` 元数据提取
- 缩略图生成
- SQLite `jobs` + 进程内 `transcode` worker
- 非直播放视频转码到统一 MP4 播放产物
- 真实文件流播放
- 上传入库
- 播放进度持久化
- 单镜像 Docker 部署

### 7.2 未完成

- 更完整的任务队列与 SSE
- 标签
- 视频编辑
- 正式鉴权恢复
- PWA 离线壳

### 7.3 当前播放兼容性

当前后端会优先直播放行；不满足条件的文件会进入转码队列。  
因此如果首页看到“没有可播放视频”或播放器报错，最常见原因是：

- 浏览器本身不支持该源文件编码
- 转码 job 仍在 `processing` 或已经 `failed`
- 目录里没有可识别的视频文件
- 挂载路径没有真正注册进系统

## 8. 常见问题

### 8.1 首页空白或提示没有视频

先检查：

```bash
curl http://localhost:5552/api/folders
curl http://localhost:5552/api/videos/feed
```

重点看：

- 是否已经存在正确的 `/mounts/...` 路径
- `scanStatus` 是否为 `ready`
- `videoCount` 是否大于 `0`

### 8.2 NAS 上路径明明挂载了，为什么还是扫不到

最常见原因：

- 你在 UI 里填了宿主机路径，而不是容器内路径
- 你用了旧数据库，里面还保留着旧挂载记录
- 容器用户对该目录没有读取权限

### 8.3 为什么点了 `Scan now` 一直显示 `Scanning...`

现在扫描是后台执行，不会等整个目录处理完才返回。  
如果目录里有几百个视频，首次扫描可能需要一段时间，因为它会做：

- 文件遍历
- `ffprobe` 元数据提取
- 缩略图生成
- 播放状态判定
- 必要时创建转码任务

先检查：

- `GET /api/folders` 里该目录的 `scanStatus`
- `GET /api/health` 里 `ffmpegAvailable` / `ffprobeAvailable`
- 宿主机磁盘是否较慢，或挂载目录是否在网络盘上

### 8.4 为什么改了 `MIKMOK_PASSWORD` 立刻生效

因为当前代码没有把密码持久化到数据库里；它每次启动都直接读取环境变量。

### 8.5 为什么还看不到缩略图

先检查：

- `GET /api/health` 里的 `ffmpegAvailable` 和 `ffprobeAvailable` 是否都是 `true`
- 目标目录是否已经重新 `Scan now`
- `GET /api/videos/:id` 是否返回了 `thumbnailUrl` / `thumbnailSmUrl`

如果这几个条件都满足但仍然没有缩略图，通常是源文件损坏、ffmpeg 无法读取，或者缩略图文件对当前进程不可写。
