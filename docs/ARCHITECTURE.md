# Sam2Tool 项目架构说明

本文档给接手同事使用，说明当前 GitHub 仓库里有什么、历史 AutoDL 机器上原本有什么、前后端如何对接，以及为什么只启动前端时上传视频会失败。

## 一句话说明

Sam2Tool 是一个独立前端仓库，负责 SAM2 视频分割工具的页面、交互和结果展示；真正的视频解码、SAM2 模型推理、mask 生成、序列帧导出、ZIP 打包等工作，历史上由 AutoDL 数据盘里的 Python API 服务完成。

## 当前仓库包含什么

当前仓库只包含前端。

```text
Sam2Tool/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── postcss.config.js
├── .env.example
├── README.md
├── docs/
│   └── ARCHITECTURE.md
└── src/
    ├── main.tsx
    ├── styles.css
    ├── vite-env.d.ts
    ├── components/
    │   ├── ToolWorkspace.tsx
    │   ├── FrameGallery.tsx
    │   └── LoopControlPanel.tsx
    ├── hooks/
    │   └── useSam2.ts
    ├── services/
    │   └── sam2Api.ts
    └── utils/
        └── frameProcessor.ts
```

### 主要文件职责

| 文件 | 职责 |
| --- | --- |
| `src/main.tsx` | React 入口，渲染单工具页面 |
| `src/styles.css` | 全局样式和 Tailwind 引入 |
| `src/components/ToolWorkspace.tsx` | SAM2 主工作区，包含上传、首帧标注、生成、下载等交互 |
| `src/components/FrameGallery.tsx` | 展示生成后的序列帧 |
| `src/components/LoopControlPanel.tsx` | 循环帧段选择、预览、精灵图导出控制 |
| `src/hooks/useSam2.ts` | 前端业务状态管理，串联上传、点选、生成、轮询、结果展示 |
| `src/services/sam2Api.ts` | 和后端 API 通信的封装 |
| `src/utils/frameProcessor.ts` | 前端侧帧处理辅助逻辑，例如循环段分析和精灵图导出 |

## 当前仓库不包含什么

当前仓库不包含以下内容：

- Python FastAPI 后端源码
- SAM2 官方源码
- SAM2 模型 checkpoint
- AutoDL 运行环境
- 视频解码和模型推理逻辑
- 生成结果的服务端存储目录

因此，只克隆本仓库并执行 `npm run dev`，只能启动前端页面。上传视频时，前端会请求后端 API；如果后端没有启动或地址不对，就会显示失败。

## 前端工作流程

完整流程如下：

1. 用户上传视频。
2. `ToolWorkspace.tsx` 调用 `useSam2.upload(file)`。
3. `useSam2.ts` 调用 `sam2Api.uploadVideo(file)`。
4. 后端创建任务并返回 `task_id`、第一帧地址、视频信息。
5. 前端显示第一帧。
6. 用户左键点前景、右键点背景。
7. 前端调用 `/tasks/:taskId/click`，后端返回 mask 预览。
8. 用户点击生成。
9. 前端调用 `/tasks/:taskId/generate`。
10. 前端轮询 `/tasks/:taskId` 获取进度。
11. 后端完成后返回帧数量、帧 URL、下载地址。
12. 前端展示帧列表、循环预览，并提供 ZIP 下载。

## 前端请求的后端地址

核心配置在 `src/services/sam2Api.ts`：

```ts
const API_BASE_URL =
  import.meta.env.VITE_SAM2_API_URL || "http://localhost:6006/sam2/api/v1";
```

默认情况下，前端会请求：

```text
http://localhost:6006/sam2/api/v1
```

如果后端部署在远程服务器，需要在 `.env.local` 里配置：

```text
VITE_SAM2_API_URL=http://你的后端地址/sam2/api/v1
```

## 后端接口契约

后端需要实现以下接口。路径均相对于 `VITE_SAM2_API_URL`。

### 上传视频

```text
POST /upload
Content-Type: multipart/form-data
字段名: file
```

期望返回：

```json
{
  "task_id": "任务 ID",
  "status": "ready",
  "message": "上传成功",
  "first_frame": {
    "url": "/tasks/任务ID/frame/0",
    "width": 1920,
    "height": 1080
  },
  "video_info": {
    "filename": "demo.mp4",
    "duration_seconds": 3.2,
    "fps": 30,
    "total_frames": 96
  }
}
```

### 添加标注点

```text
POST /tasks/:taskId/click
Content-Type: application/json
```

请求体：

```json
{
  "x": 120,
  "y": 240,
  "label": 1
}
```

说明：

- `label = 1` 表示前景点。
- `label = 0` 表示背景点。

期望返回：

```json
{
  "task_id": "任务 ID",
  "status": "ready",
  "message": "已更新 mask",
  "mask_preview_url": "/tasks/任务ID/mask",
  "points": [
    { "x": 120, "y": 240, "label": 1 }
  ],
  "points_count": 1
}
```

### 撤销标注点

```text
POST /tasks/:taskId/undo
```

返回结构和添加标注点一致。

### 重置标注点

```text
POST /tasks/:taskId/reset
```

返回结构和添加标注点一致。

### 开始生成

```text
POST /tasks/:taskId/generate
```

期望返回任务状态：

```json
{
  "task_id": "任务 ID",
  "status": "processing",
  "message": "正在生成",
  "progress": 0
}
```

### 查询任务状态

```text
GET /tasks/:taskId
```

处理中返回：

```json
{
  "task_id": "任务 ID",
  "status": "processing",
  "message": "正在生成",
  "progress": 45
}
```

完成后返回：

```json
{
  "task_id": "任务 ID",
  "status": "completed",
  "message": "生成完成",
  "progress": 100,
  "result": {
    "frame_count": 96,
    "frames": [
      { "index": 0, "url": "/tasks/任务ID/frames/0" }
    ],
    "download_url": "/tasks/任务ID/download"
  }
}
```

失败时返回：

```json
{
  "task_id": "任务 ID",
  "status": "failed",
  "message": "生成失败",
  "error": "错误原因"
}
```

### 静态资源接口

```text
GET /tasks/:taskId/frame/0
GET /tasks/:taskId/mask
GET /tasks/:taskId/frames/:index
GET /tasks/:taskId/download
```

这些接口分别用于：

- 获取首帧图片。
- 获取当前 mask 预览图。
- 获取指定透明序列帧。
- 下载 ZIP 结果包。

## 历史 AutoDL 后端封装

原 OgSpirit 仓库的历史复盘文档记录了 AutoDL 上的后端部署方式。那台机器的登录信息曾经是：

```text
root@connect.westb.seetacloud.com
SSH port: 41969
```

用户已确认这台 AutoDL 机器现在已经不工作。

历史数据盘目录结构如下：

```text
/root/autodl-tmp/
├── tmp/                   # 临时文件目录
├── pip_cache/             # pip 缓存目录
├── conda_envs/            # conda 环境目录
├── segment-anything-2/    # SAM2 官方源码
└── sam2-api/              # Python API 服务代码
```

历史启动命令如下：

```bash
cd /root/autodl-tmp/sam2-api
source /root/autodl-tmp/miniforge3/etc/profile.d/conda.sh
conda activate sam2_project
unset http_proxy https_proxy all_proxy
uvicorn api_server:app --host 0.0.0.0 --port 6006
```

这说明当时的封装方式大概率是：

1. `segment-anything-2/` 保存 SAM2 官方源码，并安装到 Python 环境里。
2. `sam2-api/` 保存 FastAPI 服务，例如 `api_server.py`。
3. FastAPI 服务暴露 `/sam2/api/v1` 下的接口。
4. 前端通过 `VITE_SAM2_API_URL` 请求该服务。
5. 服务端负责视频拆帧、SAM2 点选推理、生成透明帧、打包 ZIP、返回静态资源 URL。

## 为什么上传视频会失败

如果当前只执行：

```powershell
npm run dev
```

浏览器可以打开前端页面，但上传视频会失败。原因是：

```text
前端页面存在
SAM2 Python 后端不存在或未启动
前端请求 http://localhost:6006/sam2/api/v1/upload 失败
```

这不是前端单独能解决的问题。必须恢复后端 API 或重新实现后端 API。

## 接手同事启动方式

### 只启动前端

```powershell
git clone <本仓库地址>
cd Sam2Tool
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

此模式只能验证前端页面。

### 跑完整功能

需要先准备后端：

1. 准备 GPU 服务器或本地 GPU 环境。
2. 安装 Python、PyTorch、SAM2、OpenCV、ffmpeg 等依赖。
3. 恢复或重写 `sam2-api`。
4. 启动后端服务，监听 `6006` 或其他端口。
5. 在前端 `.env.local` 设置：

```text
VITE_SAM2_API_URL=http://后端地址/sam2/api/v1
```

6. 重启前端：

```powershell
npm run dev
```

## 后续建议

为了让同事真正做到一键拉取后跑完整功能，建议下一步把后端也补进仓库，例如：

```text
Sam2Tool/
├── frontend current files
└── backend/
    ├── api_server.py
    ├── requirements.txt
    ├── README.md
    └── scripts/
```

如果模型 checkpoint 太大，不建议直接提交到 GitHub。可以在 `backend/README.md` 里写清楚下载地址和放置路径，或者用 Hugging Face、对象存储、网盘作为模型来源。

