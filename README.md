# VTS (Video-To-Sheet)

把"参考图 → 动作视频 → 透明序列帧 → 精灵图/ZIP"做成一条闭环的网页工具。

四步流程：

1. **创建角色** — 上传参考图，在统一画布里调位置和缩放
2. **图生视频** — 调用火山引擎 Seedance，把角色图当首尾帧生成动作视频
3. **SAM2 抽帧** — 视频送到 AutoDL 上的 SAM2 服务，交互式点选目标，拿到透明背景序列帧
4. **最终产物** — 任选其一下载：
   - **GIF 循环预览**（背景色可选）
   - **横向精灵图 PNG**（列数可调，带智能推荐）
   - **PNG 序列帧 ZIP**

三种产物从同一份帧字节派生，像素严格一致。

## 快速开始

环境：Node.js 18+ / npm

```bash
git clone https://github.com/Lincode-hormony/VTS.git
cd VTS
npm install
cp .env.example .env.local
# 编辑 .env.local，填入 ARK_API_KEY (火山引擎 ARK 平台获取)
npm run dev
```

打开 http://127.0.0.1:3000（被占自动用 3001/3002...）。

## 环境变量

| 变量 | 含义 | dev 配置位置 | prod 配置位置 |
|---|---|---|---|
| `VITE_SAM2_API_URL` | SAM2 服务公网地址 | `.env.local` | `wrangler.toml` `[vars]` |
| `ARK_API_KEY` | 火山引擎 API Key | `.env.local` | `wrangler pages secret put` |
| `SEEDANCE_ENDPOINT` | 火山 Seedance API（可选，有默认值） | `.env.local` | `wrangler.toml` `[vars]` |
| `VITE_SEEDANCE_PROXY_URL` | 前端调的相对路径，默认 `/api/seedance/tasks` | `.env.local` | — |

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 生产构建（包含 _worker.js 拷贝）
npm run preview      # 本地预览构建结果
npm run typecheck    # TypeScript 类型检查
```

## 部署到 Cloudflare Pages

```bash
# 首次：配置 production secret
echo 'ark-xxx' | npx wrangler pages secret put ARK_API_KEY --project-name sam2-tool

# 每次发布
npm run build
npx wrangler pages deploy dist --project-name sam2-tool --branch main --commit-dirty=true

# 健康检查
curl https://sam2-tool.pages.dev/api/seedance/tasks/health
# 期望: ok=true / hasArkKey=true
```

生产域名：[sam2-tool.pages.dev](https://sam2-tool.pages.dev)

## 架构（一图速览）

```
浏览器
  │
  ├─ /api/seedance/tasks → [dev: vite middleware] / [prod: pages-worker.mjs]
  │                         加 ARK_API_KEY 后转发火山 Seedance
  │
  └─ VITE_SAM2_API_URL   → AutoDL 上的 SAM2 服务（dev/prod 同一个）
```

参考图直接以 base64 data URL 形式塞进火山请求体，**无中间对象存储**。

## 外部依赖

- **火山引擎 Seedance**（[控制台](https://console.volcengine.com)）— 图生视频
- **AutoDL SAM2 实例** — 视频抽帧。启停方式见 [`AUTODL_BACKEND_GUIDE.md`](./AUTODL_BACKEND_GUIDE.md)
- **Cloudflare Pages** — 生产托管

## 进一步阅读

- [`仓库文档说明.md`](./仓库文档说明.md) — 给后续 agent 的详细上手地图（目录结构、数据流、不变式、坑点）
- [`AUTODL_BACKEND_GUIDE.md`](./AUTODL_BACKEND_GUIDE.md) — SAM2 后端 AutoDL 启停
- [`docs/`](./docs) — Godot 导出 / `_frame_data.json` / PromptSpec 等未来方向规划（目前未实现）

## 技术栈

React 19 · TypeScript · Vite 6 · Tailwind 4 · gifenc · jszip · Cloudflare Pages
