# MikMok — 快速启动

本指南对应当前 MVP 设计：单用户、Docker 优先、移动端 PWA 体验。

---

## 方式一：Docker Compose

### 1. 准备目录

```bash
mkdir -p ./data ./uploads
```

### 2. 创建 `docker-compose.yml`

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
      - ALLOWED_MOUNT_ROOTS=/mounts
      - SESSION_TTL_DAYS=7
      - MAX_UPLOAD_SIZE_MB=500
      - TRANSCODE_ENABLED=1
      - SCAN_CONCURRENCY=2
      - TRANSCODE_CONCURRENCY=1
      - SCAN_SCHEDULER_INTERVAL_SECONDS=60
    restart: unless-stopped
```

### 3. 启动

```bash
docker compose up -d
```

### 4. 访问

打开浏览器：

- `http://localhost:5552`

首次密码取自 `MIKMOK_PASSWORD`。

---

## 密码初始化规则

这是部署时最容易踩坑的地方：

- 首次启动时，如果数据库里还没有 `password_hash`，系统会读取 `MIKMOK_PASSWORD` 并写入哈希
- 一旦数据库已有密码，后续重启会忽略 `MIKMOK_PASSWORD`
- 只有显式设置 `MIKMOK_RESET_PASSWORD_ON_BOOT=1` 时，才允许启动时强制重置密码

这意味着：

- 修改环境变量本身，不会自动覆盖线上密码
- 正常修改密码应走应用内的“修改密码”接口

---

## 方式二：本地开发

### 前置条件

- Node.js 22+
- FFmpeg 和 FFprobe 可执行

macOS:

```bash
brew install ffmpeg
```

Ubuntu / Debian:

```bash
sudo apt install ffmpeg
```

### 安装依赖

```bash
npm install
```

### 配置环境变量

后端示例：

```bash
# backend/.env
PORT=5552
MIKMOK_PASSWORD=changeme
ALLOWED_MOUNT_ROOTS=/mounts
SESSION_TTL_DAYS=7
MAX_UPLOAD_SIZE_MB=500
TRANSCODE_ENABLED=1
SCAN_CONCURRENCY=2
TRANSCODE_CONCURRENCY=1
SCAN_SCHEDULER_INTERVAL_SECONDS=60
```

前端示例：

```bash
# frontend/.env
VITE_API_URL=/api
```

### 启动开发服务器

```bash
npm run dev
```

开发期通常是：

- 后端：`http://localhost:5552`
- 前端：`http://localhost:5173`

---

## 添加挂载目录

登录后进入：

- 设置
- 文件夹管理
- 添加路径

Docker 场景要填写容器内路径，例如：

- `/mounts/travel-shorts`

不是宿主机路径：

- `/Users/you/Videos/travel-shorts`

系统会拒绝以下情况：

- 路径不存在
- 路径不可读
- 路径不在允许根目录下
- 路径与已有挂载目录互为父子目录

---

## 上传视频

上传入口支持：

- 单文件选择
- 多文件选择
- 桌面端拖拽上传

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

注意：

- 并不是所有输入格式都能直接播放
- 非 `MP4 + H.264 + AAC` 的视频会进入后台转码
- Feed 默认只显示已可播放的视频

---

## PWA 安装

iOS Safari：

- 分享
- 添加到主屏幕

Android Chrome：

- 菜单
- 安装应用

MVP 只缓存应用壳，不缓存视频文件。

---

## 常见问题

### 视频上传后没有立刻出现在 Feed

可能原因：

- 仍在提取元数据
- 仍在生成缩略图
- 正在后台转码

先查看任务状态，再等待 `playback_status` 变为 `direct` 或 `ready`。

### 视频无法播放

最常见原因：

- 原文件不是 `MP4 + H.264 + AAC`
- 转码失败
- 原始文件已丢失

建议检查：

- `GET /api/jobs/:id`
- 服务端日志
- `ffmpeg -version`
- `ffprobe -version`

### 缩略图不显示

通常是 FFmpeg / FFprobe 未安装或不在 PATH 中。

### 为什么修改了 `MIKMOK_PASSWORD` 但旧密码还有效

因为数据库已有密码后，系统会忽略环境变量。除非显式设置：

- `MIKMOK_RESET_PASSWORD_ON_BOOT=1`

### 挂载路径添加失败

Docker 场景里，先确认 volume 已挂载到容器，再在 UI 中填写容器内路径。
