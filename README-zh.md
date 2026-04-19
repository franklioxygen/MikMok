<p align="center">
  <img src="frontend/src/assets/images/logo.png" alt="MikMok Logo" width="200" height="200" />
</p>

# MikMok

MikMok 是一个面向本地硬盘和 NAS 视频库的自托管短视频应用。它默认直接进入类似 TikTok 的全屏播放流，让你可以用移动端优先的方式浏览挂载目录、上传内容和已处理的视频。

[English](README.md)

<p align="center">
  <img width="407" height="720" alt="MikMok 预览" src="https://github.com/user-attachments/assets/5839c494-6f07-4345-a1c8-2a57a1c60058" />
</p>


## 功能特点

- 全屏竖屏 Feed，支持上下滑动切换视频
- 支持暂停、静音、倍速、收藏和信息卡操作
- 刷新页面后可恢复上次观看的视频和播放进度
- 支持挂载本地或 NAS 目录，并扫描写入持久化 SQLite 索引
- 支持上传视频到内置 `Uploads` 来源
- 已具备基础媒体处理链路，包括元数据、缩略图和转码任务
- 支持 Docker 部署，适合 NAS 和家庭服务器场景

## 项目结构

- `frontend/`：React + Vite 前端
- `backend/`：Express + SQLite API 与媒体服务
- `documents/`：系统设计、接口文档和使用说明
- `stacks/`：Docker Compose 示例
- `scripts/release/`：镜像构建与发布脚本

## 本地开发

```bash
npm install
npm run dev
```

启动后：

- 前端运行在 Vite 开发服务器
- 后端 API 运行在 `http://localhost:5552`

## Docker 部署

```bash
docker compose -f stacks/docker-compose.yml up -d
```

常见容器挂载路径：

- 数据目录：`/app/backend/data`
- 上传目录：`/app/backend/uploads`
- 外部媒体根目录：`/mounts`

## 相关文档

- [系统设计](documents/system-design.md)
- [API 文档](documents/api-endpoints.md)
- [快速开始](documents/getting-started.md)
- [目录结构](documents/directory-structure.md)
