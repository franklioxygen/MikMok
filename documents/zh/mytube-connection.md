# MikMok 连接 MyTube 指南

[English](../en/mytube-connection.md)

本文说明如何把一个或多个 MyTube 后端接入 MikMok，并作为只读远程源消费。

## 这个集成会做什么

配置完成后：

- MikMok 会把远程 MyTube 视频并入同一个 `/feed`
- MikMok 会通过 `/stream/:id` 代理远程视频流
- MikMok 会通过自己的后端代理远程缩略图和作者头像
- MikMok 会基于远程视频目录生成作者页
- MikMok 可以按全部内容、指定集合、指定作者，或两者混合进行接入

这个集成是只读的。MikMok 不会在 MyTube 上创建、修改或删除内容。

## 前置条件

开始配置前，请确认：

- MikMok 已经启动，并且你可以在本地正常登录
- MikMok 后端可以访问目标 MyTube 后端
- 目标 MyTube 后端可提供 `GET /api/videos` 和 `GET /api/collections`
- 如果你准备使用 API key，MyTube 后端必须允许 API key 读取这些只读接口：
  - `GET /api/videos`
  - `GET /api/videos/:id`
  - `GET /api/mount-video/:id`
  - `GET /api/collections`

## 当前支持的认证模式

MikMok 目前支持 3 种 MyTube 远程源认证模式：

- `None`
  适用于目标 MyTube 的只读接口本来就是公开可读的情况。
- `Session Cookie`
  适用于目标 MyTube 依赖登录态访问，MikMok 需要转发浏览器 `Cookie` 请求头的情况。
- `Integration API Key`
  适用于目标 MyTube 已支持通过只读 API key 访问上述只读接口的情况。

## 应该选哪种 auth mode

推荐顺序：

- 如果你的 MyTube 已支持只读 API key，优先使用 `Integration API Key`
- 如果 MyTube 本来就是公开只读实例，使用 `None`
- 如果 MyTube 需要登录且没有只读 API key，使用 `Session Cookie`

## 在 MyTube 侧准备凭据

### 方案 1：Integration API Key

如果你的 MyTube 已支持只读 API key：

1. 打开 MyTube 的设置页。
2. 启用 API key 认证。
3. 生成或复制 API key。
4. 稍后把它填到 MikMok 的 `Credential` 字段里。

### 方案 2：Session Cookie

如果你要复用浏览器中的 MyTube 登录态：

1. 先在浏览器里登录 MyTube。
2. 打开浏览器开发者工具。
3. 找到一个登录后发往 MyTube 的请求。
4. 复制它的 `Cookie` 请求头值。
5. 只把请求头值本身粘贴到 MikMok。

示例：

```text
session=abc123; another_cookie=xyz456
```

不要把 `Set-Cookie` 的响应属性一起粘进去，例如 `Path`、`HttpOnly`、`Secure` 这些都不要。

## 在 MikMok 里配置远程源

1. 登录 MikMok。
2. 打开 `/settings`。
3. 找到 `MyTube Source` 卡片。
4. 新建一个 source，或选中已有 source。
5. 填写这些字段：
   - `Source name`：任意非空显示名
   - `Base URL`：MyTube 的基础地址，例如 `https://mytube.example.com`
   - `Auth mode`：`None`、`Session Cookie` 或 `Integration API Key`
   - `Credential`：当 `Session Cookie` 或 `Integration API Key` 时必填
   - `Scope mode`：`All content`、`Selected collections`、`Selected authors` 或 `Collections + authors`
   - `Enabled`：是否让这个源参与 Feed 聚合
6. 点击 `Save`。
7. 点击 `Test connection`。
8. 如果你要限制范围，再点击 `Discover authors & collections`。

## 各字段的实际语义

### Source name

这只是 MikMok 内部显示给你的名字，不需要和 MyTube 站点名一致。

### Base URL

这里应该填 MyTube 的站点根地址，例如：

```text
https://mytube.example.com
```

MikMok 会自动去掉尾部多余的斜杠。

### Credential

- 当 `Auth mode` 不是 `None` 时必填
- 会保存在 MikMok 后端，不会放在浏览器本地存储里
- 编辑已有 source 时，如果留空，语义是：
  - auth mode 不变时，保留原来的凭据
  - auth mode 切换时，旧凭据会被清掉

### Scope mode

- `All content`：接入这个 MyTube 源里全部可读视频
- `Selected collections`：只接入属于所选 collections 的视频
- `Selected authors`：只接入作者 key 命中的视频
- `Collections + authors`：两者取并集

## Discover authors & collections 的工作方式

当你点击 `Discover authors & collections` 时，MikMok 会：

- 拉取 MyTube 视频目录
- 通过 `/api/collections` 推导可选集合
- 基于视频列表推导作者
- 保存作者的稳定 key，而不是直接保存裸作者显示名

MyTube 目前没有单独的作者接口，因此作者列表是 MikMok 从视频目录里聚合出来的。

## MikMok 会从 MyTube 读取什么

当前 MikMok 主要依赖这些接口和资源：

- `GET /api/videos`
- `GET /api/videos/:id`
- `GET /api/collections`
- `GET /api/mount-video/:id`
- MyTube 返回的视频、缩略图、头像等资源路径

视频流、缩略图和头像最终都会由 MikMok 代理给浏览器，所以浏览器只和 MikMok 通信。

## 常见问题

### `String must contain at least 1 character(s)`

这通常不是 credential 本身的问题，最常见原因是 `Source name` 留空了。

### `Credential is required when auth mode is enabled.`

你选择了 `Session Cookie` 或 `Integration API Key`，但保存时没有填写凭据。

### 测试连接返回 `403`

常见原因：

- 这个 API key 在 MyTube 里没有只读权限
- session cookie 已经过期
- 目标 MyTube 不是公开实例，但你把 `Auth mode` 设成了 `None`

### 视频能出来，但头像或缩略图不显示

常见原因：

- MyTube 返回的资源路径在当前 `Base URL` 下不可访问
- 同一份凭据能访问 JSON 接口，但不能访问受保护的资源路径
- 上游资源实际落在另一个 origin，转发请求头后仍然不被接受

### MikMok 里有作者页，但 MyTube 没有作者接口

这是预期行为。MikMok 会从视频列表里聚合作者，因为 MyTube 目前没有 `/api/authors`。

## 当前实现上的补充说明

按当前实现：

- 远程源管理接口要求先在 MikMok 本地登录
- 远程源的写操作需要 CSRF token
- MikMok 后端会对远程源目录做短时间缓存
- MikMok 里的作者 ID 是按 source 派生出来的 key，不是 MyTube 原生作者 ID
