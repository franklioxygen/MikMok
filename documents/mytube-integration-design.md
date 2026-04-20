# MikMok × MyTube 只读接入设计

> 目标：让 `MikMok` 作为一个只读消费端，从远程 `MyTube` 实例读取视频、作者头像和集合信息，并在 `Feed` 中播放这些视频。本文档基于本机 `mytube` 仓库中的 API 文档与当前实现整理，结论以截至 `2026-04-20` 的本地代码为准。

## 1. 目标范围

本次设计只覆盖“只读接入”：

- 在 `MikMok` 的 `Settings` 中配置一个 `MyTube` 远程源
- 配置项至少包括：
  - `baseUrl`
  - 凭据
  - 读取范围：`all` / 指定 `collection` / 指定 `author`
- `Feed` 显示来自 `MyTube` 的视频
- `Feed` 显示作者头像
- 点击作者头像进入 `MikMok` 内部的作者页
- `MikMok` 不向 `MyTube` 发起写操作

不在本次范围：

- 从 `MikMok` 远程修改 `MyTube` 视频元数据
- 从 `MikMok` 远程创建或修改 `MyTube` collection
- 从 `MikMok` 远程下载、删除或上传视频
- 双向同步

## 2. 对 MyTube 现有 API 的核对结论

### 2.1 已确认存在的能力

根据 `mytube/documents/en/api-endpoints.md` 和当前后端实现：

- `GET /api/videos`
  - 已存在
  - 当前返回全部视频
  - 当前实现没有服务端分页、排序或筛选
- `GET /api/videos/:id`
  - 已存在
  - 可返回单个视频详情
  - 对云端视频会注入 `signedUrl` / `signedThumbnailUrl`
  - 对挂载目录视频会注入 `signedUrl = /api/mount-video/:id`
- `GET /api/collections`
  - 已存在
  - 可返回全部 collection
- 静态或可播放资源路径已存在
  - `/videos/*`
  - `/images/*`
  - `/images-small/*`
  - `/avatars/*`
  - `/subtitles/*`
  - `/api/mount-video/:id`
- 视频对象中已经有本次接入需要的大部分字段
  - `id`
  - `title`
  - `author`
  - `thumbnailUrl`
  - `thumbnailPath`
  - `videoPath`
  - `addedAt`
  - `progress`
  - `viewCount`
  - `authorAvatarPath`

### 2.2 已确认存在但不适合作为直接集成接口的点

- `GET /api/videos` 当前返回原始数组，不是一个专门为外部集成设计的稳定 envelope
- `GET /api/collections` 当前也返回原始数组
- `MyTube` 前端的作者页不是通过专门的作者 API 获取，而是先拿全量视频，再按 `author` 字段在前端过滤
- `MyTube` 当前没有“外部集成专用”的作者列表或作者详情接口
- `MyTube` 当前没有“按 collection / author 服务端过滤视频列表”的稳定只读接口

### 2.3 当前认证模型对本设计的直接影响

`MyTube` 文档明确说明：

- Cookie/JWT 是主要认证方式
- API key 认证当前只允许用于 `POST /api/download`
- 把 API key 用在其它 endpoint 上会返回 `403`

这意味着：

- 如果 `MikMok` 设置页只保存 “`MyTube` 地址 + API key”，那它当前**不能**仅靠这个 API key 去读 `GET /api/videos`、`GET /api/collections`、`GET /api/videos/:id`
- 所以“地址 + API key”这套产品设计，和 `MyTube` 当前认证模型并不完全匹配

## 3. 结论：MyTube 需要改吗

### 3.1 不一定需要立刻改的部分

如果满足下面条件，`MikMok` 第一版可以先不改 `MyTube` API：

- `MyTube` 实例本身就是公开只读，或
- `MikMok backend` 能保存并使用 `MyTube` 的会话 Cookie，或
- 你接受先用“非 API key”的方式做只读接入

在这种前提下，`MikMok backend` 可以直接组合现有接口：

- `GET /api/videos`
- `GET /api/collections`
- 必要时 `GET /api/videos/:id`

然后在 `MikMok` 侧自己做：

- collection 过滤
- author 过滤
- feed 排序
- 作者页聚合
- MikMok 字段映射

### 3.2 需要修改 MyTube 的部分

如果下面任何一条是硬要求，就建议改 `MyTube`：

- `MikMok` 设置里必须只填 “地址 + API key”，不能依赖 session cookie
- 希望远程读取是“明确、稳定、受限”的只读集成能力，而不是复用当前前端内部接口
- 希望大库场景下避免 `GET /api/videos` 全量拉取
- 希望直接拿到作者列表、作者头像、集合过滤结果，而不是由 `MikMok` 自己推导

最小必须改动是：

- 给 `MyTube` 增加“只读集成 API key”或“只读 integration token”
- 允许它访问只读 endpoint

换句话说：

- “显示作者头像、按 collection/author 过滤”本身**不是**强制要改 `MyTube`
- “在 `MikMok` 里只填地址和 API key 就能工作”这件事，当前则**需要**改 `MyTube`

## 4. 推荐的总体架构

### 4.1 不采用前端直连 MyTube

不建议让 `MikMok` 前端直接请求 `MyTube`。

推荐结构：

```text
MikMok Frontend
    |
    v
MikMok Backend
    |
    v
MyTube Backend
```

原因：

- 不暴露 `MyTube` 凭据给浏览器
- 不把 `MyTube` 的认证模型强耦合到 `MikMok` 前端
- 由 `MikMok backend` 统一做字段映射
- 由 `MikMok backend` 统一处理 cloud/mount/local 三种播放地址
- 可以在 `MikMok backend` 做缓存和容错

### 4.2 本地安全前置条件

在 `MikMok` 把第三方凭据持久化到后端之前，必须先恢复本地写接口保护。

当前 `MikMok` 仓库仍处于原型态，`Settings` 和若干写接口还没有完整接回登录与 CSRF 保护。因此，`remote sources` 相关接口不能先于这些基础能力独立上线。

硬要求：

- `remote-sources` 的 `POST` / `PATCH` / `DELETE` / `test` / `discover` 只能对已登录管理员开放
- 所有会修改配置、或会携带远端凭据发起请求的接口，都要求 CSRF 保护
- 如果正式鉴权还未恢复，这组接口应保持关闭、隐藏，或仅用于本地开发环境

换句话说：

- “把 `MyTube` 凭据安全地保存在 `MikMok backend`” 这件事本身依赖 `MikMok` 先补齐本地安全基线
- 远程源功能不应绕开 `MikMok` 自己的登录模型直接上线

### 4.3 MikMok 侧新增“远程源”概念

建议 `MikMok` 新增一个 `remote sources` 配置层，第一种 source type 是 `mytube`。

建议的数据结构：

```ts
type RemoteSourceType = "mytube";

type RemoteSourceScopeMode = "all" | "collections" | "authors" | "mixed";

type RemoteSourceAuthMode =
  | "none"
  | "session_cookie"
  | "integration_api_key";

type DiscoveredAuthor = {
  key: string;
  name: string;
  avatarUrl: string | null;
};

type MyTubeRemoteSource = {
  id: string;
  type: "mytube";
  enabled: boolean;
  name: string;
  baseUrl: string;
  authMode: RemoteSourceAuthMode;
  apiKeyEncrypted: string | null;
  sessionCookieEncrypted: string | null;
  scopeMode: RemoteSourceScopeMode;
  collectionIds: string[];
  authorKeys: string[];
  lastValidatedAt: number | null;
};
```

说明：

- `apiKeyEncrypted` 和 `sessionCookieEncrypted` 只存后端
- 前端设置页只做编辑，不直接持有真实密钥
- `authorKeys` 存储的是 `MikMok backend` 生成的 source-scoped 稳定键，而不是裸 `author` 显示名
- 第一版 `authorKey` 可以基于 `remoteSourceId + normalizedAuthorName` 生成；如果未来 `MyTube` 补稳定作者 ID，前端契约不需要变化
- `scopeMode` 支持：
  - `all`
  - `collections`
  - `authors`
  - `mixed`

## 5. MikMok 侧功能设计

### 5.1 Settings 页

`Settings` 新增一个 `MyTube Source` 卡片，至少包含：

- `Enabled`
- `Base URL`
- `Auth Mode`
  - `None`
  - `Session Cookie`
  - `Integration API Key`
- `Credential`
- `Scope Mode`
  - `All content`
  - `Selected collections`
  - `Selected authors`
  - `Collections + authors`
- `Selected collections`
- `Selected authors`
- `Test connection`

建议新增本地 API：

- `POST /api/remote-sources`
- `GET /api/remote-sources`
- `PATCH /api/remote-sources/:id`
- `DELETE /api/remote-sources/:id`
- `POST /api/remote-sources/:id/test`
- `POST /api/remote-sources/:id/discover`

其中：

- `test` 用于验证 base URL 与凭据
- `discover` 用于拉取远程 collections 和 authors 供前端选择
- `discover` 返回的作者项应包含 `DiscoveredAuthor.key`，前端展示作者名，但配置里保存 `authorKey`
- 上述接口都必须建立在 `MikMok` 自身已恢复登录与 CSRF 保护的前提下

### 5.2 Feed 数据模型扩展

当前 `MikMok` 的 `FeedVideo` 只包含 folder 维度，不包含作者维度。接入 `MyTube` 后建议补这些字段：

```ts
type FeedVideoAuthor = {
  id: string | null;
  name: string;
  avatarUrl: string | null;
};

type FeedVideoCollection = {
  id: string;
  name: string;
};

type FeedVideo = {
  id: string;
  title: string;
  sourceName: string;
  streamUrl: string;
  thumbnailSmUrl: string | null;
  thumbnailUrl?: string | null;
  mimeType: string;
  sourceSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  playbackStatus: string;
  updatedAt: number;
  folderId: string;
  folderName: string;
  author?: FeedVideoAuthor;
  collections?: FeedVideoCollection[];
  remoteSourceId?: string;
  remoteVideoId?: string;
};
```

说明：

- `id` 不再等同于“本地库里的原始 videoId”，而是 `MikMok` 统一的 canonical clip id
- 这个 canonical clip id 是前端收藏、`lastActiveVideoId`、恢复播放位置、`/feed?video=` 深链、详情加载时唯一使用的主键
- 推荐规则：
  - 本地视频：`local:${videoId}`
  - `MyTube` 远程视频：`mytube:${remoteSourceId}:${remoteVideoId}`
- `remoteSourceId` 和 `remoteVideoId` 只是适配层辅助字段，不应替代 `id` 成为前端主键
- 现有 `folderId/folderName` 可以继续保留，用于兼容当前 UI
- 对 `MyTube` 远程视频，`folderName` 可映射为：
  - 首个 collection 名称，或
  - 固定值 `MyTube`
- 对 `MyTube` 远程视频，`folderId` 也应该是合成分组键，不应假定它对应 `MikMok` 本地挂载目录
- 作者相关展示则走新增 `author` 字段

### 5.3 作者页

`MikMok` 需要新增作者页路由，例如：

- `/authors/:authorKey`

作者页的数据不必要求 `MyTube` 提供专门 endpoint。第一版可以由 `MikMok backend` 在已拉取的视频列表上按作者聚合。

补充要求：

- `authorKey` 应由 `MikMok backend` 生成，并保持 source-scoped、稳定、URL-safe
- 第一版可以按 `remoteSourceId + normalizedAuthorName` 生成；不要直接把裸作者名当成跨 source 唯一 ID
- `Settings` 中的作者筛选和作者页路由应复用同一套 `authorKey`

作者页至少展示：

- 作者头像
- 作者名
- 视频列表
- 可选的 collection 标签

## 6. MikMok Backend 适配层设计

### 6.1 适配层职责

`MikMok backend` 增加一层 `MyTube adapter`，职责如下：

- 管理远程源配置
- 代表前端请求 `MyTube`
- 处理认证
- 做数据标准化
- 做播放地址解析
- 做作者和 collection 过滤
- 给前端输出 `MikMok` 自己的稳定数据模型

### 6.2 与 MikMok 现有主 Feed 契约对齐

为了最小化前端改动，不建议再新增一条独立的“远程 feed 主链路”。

`MyTube` 接入后，`MikMok` 现有主播放契约应继续保持为：

- `GET /api/videos/feed`
- `GET /api/videos/:id`

也就是说：

- 首页 `Feed` 继续从 `GET /api/videos/feed` 取列表
- 视频详情继续从 `GET /api/videos/:id` 取数据
- 收藏页继续依赖同一批 `FeedVideo.id`
- `/feed?video=...` 深链继续传 canonical clip id

`MikMok backend` 的职责是把“本地视频 + 远程 MyTube 视频”汇总后，一起投影成同一套 `FeedVideo` / `FeedVideoDetails` 契约，而不是让前端再分辨本地接口和远程接口。

### 6.3 建议新增的 MikMok 辅助接口

- `GET /api/integrations/mytube/authors`
- `GET /api/integrations/mytube/authors/:authorKey`
- `GET /api/integrations/mytube/authors/:authorKey/videos`
- `GET /api/integrations/mytube/collections`
- `GET /api/integrations/mytube/assets/avatar/:sourceId/:videoId`
- `GET /api/integrations/mytube/assets/thumbnail/:sourceId/:videoId`
- `GET /api/integrations/mytube/stream/:sourceId/:videoId`

其中：

- `integrations/*` 更适合作为适配层辅助接口或作者/集合视图的数据来源，而不是首页主播放入口
- `assets/*` 和 `stream/*` 是 `MikMok backend` 生成给聚合后 `FeedVideo` 使用的 URL，不应由前端自行拼接
- 前端永远只访问 `MikMok` 自己的 URL，不直接访问 `MyTube`

### 6.4 第一版适配逻辑

第一版可以完全建立在 `MyTube` 现有接口之上：

1. 读取远程源配置
2. 请求 `GET /api/videos`
3. 请求 `GET /api/collections`
4. 在 `MikMok backend` 建立 `videoId -> collections[]` 索引
5. 应用 scope 过滤：
   - `all`
   - 指定 `collectionIds`
   - 指定 `authorKeys`
   - 二者并集
6. 把 `MyTube` 视频对象映射成 `MikMok FeedVideo`，并生成 canonical clip id
7. 把远程视频并入现有 `GET /api/videos/feed` 的聚合结果，而不是新增第二条首页主链路
8. 让 `GET /api/videos/:id` 按 canonical clip id 分派：
   - `local:*` 走现有本地媒体库逻辑
   - `mytube:*` 走 `MyTube adapter`
9. 给每个远程视频生成 `MikMok` 自己的代理地址：
   - `streamUrl`
   - `thumbnailSmUrl`
   - `thumbnailUrl`
   - `author.avatarUrl`

### 6.5 播放地址解析与代理约束

`MyTube` 当前视频可能有三类来源：

- 本地视频：`videoPath` 类似 `/videos/foo.mp4`
- 挂载目录视频：`videoPath` 类似 `mount:/real/path`，应走 `/api/mount-video/:id`
- 云端视频：`videoPath` 类似 `cloud:foo.mp4`，详情接口里可能有 `signedUrl`

因此 `MikMok adapter` 不能简单把 `videoPath` 原样暴露给前端。

推荐规则：

- 如果 `videoPath` 以 `/videos/` 开头
  - `streamUrl` 指向 `MikMok` 代理
  - 代理在请求到达时再请求 `MyTube baseUrl + video.videoPath`
- 如果 `videoPath` 以 `mount:` 开头
  - `streamUrl` 指向 `MikMok` 代理
  - 代理内部转发到 `MyTube /api/mount-video/:id`
- 如果 `videoPath` 以 `cloud:` 开头
  - `streamUrl` 仍然指向 `MikMok` 代理，不能把过期敏感的 signed URL 直接预埋到 feed 响应里
  - 代理在请求到达时再调用 `MyTube /api/videos/:id` 或 `MyTube /api/cloud/signed-url`
  - 再流式代理到最终地址；只有在确认不会破坏同源策略与鉴权边界时，才考虑重定向

头像和缩略图也遵循同样原则：

- `/avatars/*`、`/images/*` 可直接代理
- cloud thumbnail 则需要签名 URL 或代理层转换

这是播放器层面的硬约束，不是可选优化：

- `GET /api/integrations/mytube/stream/:sourceId/:videoId` 必须接受并透传 `Range` 请求
- 流代理必须正确返回 `200` / `206` / `304` / `416` 语义，不能把 range 请求退化成整文件下载
- 响应头需要保留或重建这些语义：
  - `Accept-Ranges`
  - `Content-Length`
  - `Content-Range`
  - `Content-Type`
  - `ETag`
  - `Last-Modified`
  - `Cache-Control`
- cloud signed URL 必须按请求时即时获取或短缓存，并跟踪 TTL；不能在 feed 列表阶段生成后长期复用
- 如果 signed URL 在播放前或播放中失效，下一次 `stream` 请求应能透明续签，而不是要求前端重新发现视频
- 对视频流，优先使用 `MikMok backend` 的服务端流式代理；不要把 `/api/integrations/mytube/stream/*` 简化成无约束的 `302`

## 7. 使用当前 MyTube API 的限制

### 7.1 认证限制

这是当前最大的产品约束：

- `MyTube` 的 API key 目前只支持 `POST /api/download`
- 对 `GET /api/videos`、`GET /api/collections` 之类的只读接口，不能直接拿现有 API key 当凭据

所以如果产品定义坚持：

- 用户在 `MikMok Settings` 中只输入 `MyTube 地址 + API key`

那么 `MyTube` 必须新增只读授权能力。

### 7.2 性能限制

当前 `GET /api/videos` 是全量返回。

这意味着：

- 第一版实现简单
- 但视频很多时，拉取、过滤、缓存和首次进入 feed 的成本都会变高

当前 `GET /api/collections` 也需要全量拉取后再建立索引。

### 7.3 作者模型限制

当前 `MyTube` 没有稳定的独立作者实体 API。

作者页现在本质上依赖：

- `videos[].author`
- `videos[].authorAvatarPath`

这会带来两个现实问题：

- 不同平台上同名作者可能冲突
- 作者唯一标识目前更像“显示名”，不是稳定的实体 ID

## 8. 推荐的 MyTube API 增补

### 8.1 最小必需改动

如果要支持 `MikMok` 设置里的 “地址 + API key” 方案，建议在 `MyTube` 增加：

- `read-only integration token` 或 `integration API key`

建议规则：

- 只允许访问只读集成接口
- 不允许写操作
- 可以单独启用或吊销
- 可选地限制来源 IP 或备注用途

### 8.2 推荐新增的只读集成接口

建议新增专门的集成接口，而不是让 `MikMok` 依赖 `MyTube` 当前前端内部接口。

建议接口：

#### `GET /api/integration/videos`

Query:

- `scope=all|collection|author`
- `collectionId`
- `author`
- `limit`
- `cursor`

建议返回：

```json
{
  "success": true,
  "data": [
    {
      "id": "vid_123",
      "title": "Example",
      "author": {
        "id": "author_1",
        "name": "Alice",
        "avatarUrl": "/avatars/alice.jpg"
      },
      "collections": [
        {
          "id": "col_1",
          "name": "Travel"
        }
      ],
      "streamUrl": "/api/integration/videos/vid_123/stream",
      "thumbnailUrl": "/images/foo.jpg",
      "thumbnailSmUrl": "/images-small/foo.jpg",
      "durationSeconds": 42,
      "mimeType": "video/mp4",
      "sourceSize": 15759651,
      "updatedAt": 1776554909
    }
  ],
  "meta": {
    "nextCursor": null,
    "total": 1
  }
}
```

#### `GET /api/integration/authors`

建议返回：

- `id`
- `name`
- `avatarUrl`
- `videoCount`

#### `GET /api/integration/authors/:id/videos`

建议支持：

- 分页
- 排序
- 只读 token 认证

#### `GET /api/integration/collections`

建议返回：

- `id`
- `name`
- `videoCount`
- `thumbnailUrl`

### 8.3 为什么建议新增集成接口

因为这样可以把以下逻辑稳定下来：

- 认证方式
- 响应 envelope
- 远程消费场景下的 URL 语义
- cloud/mount/local 三类资源的统一播放方式
- 分页与筛选
- 作者实体模型

## 9. 分阶段落地建议

### Phase 1

先补 `MikMok` 本地安全基线。

前提：

- 恢复 `Settings` 与相关写接口的本地登录保护
- 给配置修改、`test`、`discover` 这类接口补齐 CSRF

实现：

- 让 `remote-sources` 的增删改查与测试接口只对管理员开放
- 未恢复鉴权前，不开启远程源配置功能

### Phase 2

只改 `MikMok`，不改 `MyTube` 数据接口。

前提：

- `MikMok backend` 能拿到 `MyTube` 可用的读权限
- 可以接受先用 session cookie 或无鉴权模式

实现：

- Settings 配置远程源
- Backend adapter 拉 `videos + collections`
- 扩展现有 `GET /api/videos/feed` 与 `GET /api/videos/:id`
- 采用 canonical clip id 统一本地和远程视频主键
- Feed 展示远程视频
- 作者头像展示
- 作者页按聚合结果渲染

### Phase 3

改 `MyTube` 认证模型。

实现：

- 新增 read-only integration API key
- `MikMok` 设置里的 “地址 + API key” 真正可用

### Phase 4

改 `MyTube` 集成接口。

实现：

- 新增 `integration/videos`
- 新增 `integration/authors`
- 新增分页与过滤
- 输出稳定的 `streamUrl / thumbnailUrl / avatarUrl`

## 10. 最终判断

基于当前 `MyTube` 文档和实现，结论如下：

- 你想要的“按 collection / author / all 读取，并在 feed 里显示作者头像、点头像进作者页”这套产品能力，**可以主要在 MikMok 侧实现**
- `MyTube` 当前已经具备不少原始数据基础：
  - 视频列表
  - collection 列表
  - 作者名
  - 作者头像路径
  - 播放路径
  - 缩略图路径
- 但对 `MikMok` 来说，第一阶段真正的前置条件不只是 `MyTube` API，还包括 `MikMok` 自己先补齐“凭据配置接口的本地鉴权与 CSRF”
- 但是，如果你坚持 `MikMok Settings` 只让用户填 “地址 + API key”，那 **MyTube 当前还不够**
- 在这种产品定义下，`MyTube` 至少需要补一个“只读集成 token / API key”能力

## 11. 建议决策

建议按下面顺序推进：

1. 先补 `MikMok` 本地安全基线，让远程源配置接口具备管理员鉴权与 CSRF
2. 再在 `MikMok` 做 `MyTube adapter`，并扩展现有 `GET /api/videos/feed` / `GET /api/videos/:id`
3. 把本地和远程视频统一到 canonical clip id，避免收藏、恢复播放和深链串线
4. 同时把 `MikMok` 的远程源配置落到后端存储，不让前端直连 `MyTube`
5. 如果确认产品上必须是 “地址 + API key”，再补 `MyTube` 的只读 token
6. 数据量变大后，再补 `MyTube integration API`

这条路线风险最低，也最容易分阶段上线。
