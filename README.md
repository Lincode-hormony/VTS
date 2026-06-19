# Sam2Tool

独立版 SAM2 序列帧提取工具。

这个仓库只保留 SAM2 一个功能，不包含 OgSpirit 平台首页、工具列表、登录、用户系统和历史记录。

## 功能

- 上传视频
- 显示第一帧
- 左键标注前景点
- 右键标注背景点
- 撤销/重置标注点
- 调用 SAM2 后端生成透明序列帧
- 展示生成进度
- 展示提取帧
- 下载 ZIP
- 自动寻找循环帧段
- 生成循环预览
- 导出精灵图

## 启动

```powershell
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

## SAM2 后端地址

默认后端地址：

```text
http://localhost:6006/sam2/api/v1
```

如需修改，创建 `.env.local`：

```text
VITE_SAM2_API_URL=http://localhost:6006/sam2/api/v1
```

## 后端接口要求

前端期望 SAM2 后端提供：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/upload` | 上传视频并创建任务 |
| `POST` | `/tasks/:taskId/click` | 添加前景/背景点 |
| `POST` | `/tasks/:taskId/undo` | 撤销上一个点 |
| `POST` | `/tasks/:taskId/reset` | 清空点 |
| `POST` | `/tasks/:taskId/generate` | 开始生成序列帧 |
| `GET` | `/tasks/:taskId` | 查询任务状态 |
| `GET` | `/tasks/:taskId/frame/0` | 第一帧 |
| `GET` | `/tasks/:taskId/mask` | 当前 mask 预览 |
| `GET` | `/tasks/:taskId/frames/:index` | 指定结果帧 |
| `GET` | `/tasks/:taskId/download` | 下载 ZIP |

## 代码结构

```text
src/
├── main.tsx
├── styles.css
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

## 构建

```powershell
npm run build
```
