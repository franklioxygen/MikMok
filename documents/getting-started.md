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

当前原型会直接进入首页播放态，不要求先登录。
完整 MVP 恢复鉴权后，首次密码取自 `MIKMOK_PASSWORD`。

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
HOST=0.0.0.0
MIKMOK_PASSWORD=changeme
CORS_ORIGIN=http://localhost:5173
ALLOWED_MOUNT_ROOTS=/Users/franklioxygen/Projects/test-shorts,/mounts
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
VITE_BACKEND_URL=http://127.0.0.1:5552
```

### 启动开发服务器

```bash
npm run dev
```

开发期通常是：

- 后端：`http://localhost:5552`
- 前端：`http://localhost:5173`

如果你要从局域网内其他设备访问：

- 后端默认监听 `0.0.0.0`
- 前端 Vite dev server 也监听 `0.0.0.0`
- 打开前端输出的 `Network` 地址即可

当前本地开发默认测试挂载目录：

- `/Users/franklioxygen/Projects/test-shorts`

---

## 添加挂载目录

当前原型已经接回挂载管理：

- 服务端会在首次启动时，把存在的 `ALLOWED_MOUNT_ROOTS` 目录一次性导入为默认挂载源
- 后续新增目录应通过前端“Folders”页面或 `POST /api/folders` 显式注册
- `GET /api/videos/feed` 只会从 SQLite 中已注册的挂载目录读取视频
- 每次扫描都会把结果写入 SQLite `videos` 表，之后首页和流播放都读这份快照

当前管理流程：

- 文件夹管理
- 添加路径
- 立即扫描或移除

Docker 场景要填写容器内路径，例如：

- `/mounts/travel-shorts`

不是宿主机路径：

- `/Users/you/Videos/travel-shorts`

系统会拒绝以下情况：

- 路径不存在
- 路径不可读
- 路径不在允许根目录下
- 路径与已有挂载目录互为父子目录

如果你删除了最后一个挂载目录，它不会再自动从环境变量恢复；需要手动重新添加。

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

- 当前原型上传成功后，会立即重扫系统内置的 `Uploads` 来源并刷新 feed
- 你可以在 `Folders -> Uploads` 里看到刚上传的视频
- 当前原型还没接入缩略图和转码队列，先按源文件直接播放验证链路

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

- 上传请求本身失败
- `Uploads` 来源还没完成本次重扫
- 上传文件类型不在当前允许列表里

先查看上传接口响应，再打开 `Folders -> Uploads` 确认该文件是否已经入库。

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
