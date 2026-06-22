# Sam2Tool

独立版 SAM2 视频目标分割与序列帧提取工具。

这个仓库只保留 SAM2 一个功能，不包含 OgSpirit 平台首页、工具列表、登录、用户系统和历史记录。前端页面从原 OgSpirit 的 `apps/sam2` 模块拆出，功能和交互尽量保持原样。

## 快速启动前端

环境要求：

- Node.js 18 或更高版本
- npm

```powershell
npm install
npm run dev
```

默认访问：

```text
http://127.0.0.1:3000
```

如果 3000 端口被占用：

```powershell
npm run dev -- --port 3001
```

## 配置 SAM2 后端地址

开发环境默认连接已部署的 AutoDL 后端：

```text
https://u184490-8409-90945147.westb.seetacloud.com:8443/sam2/api/v1
```

如果该后端正在运行，拉取仓库后直接启动前端即可使用完整功能。

代码里的兜底后端地址：

```text
http://localhost:6006/sam2/api/v1
```

如果要临时改用其他后端，复制 `.env.example` 为 `.env.local`，然后修改：

```text
VITE_SAM2_API_URL=http://你的后端地址/sam2/api/v1
```

修改 `.env.local` 后需要重启前端开发服务。

## 后端接口

前端期望 SAM2 后端提供这些接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/upload` | 上传视频并创建任务 |
| `POST` | `/tasks/:taskId/click` | 添加前景/背景点 |
| `POST` | `/tasks/:taskId/undo` | 撤销上一个点 |
| `POST` | `/tasks/:taskId/reset` | 清空点 |
| `POST` | `/tasks/:taskId/generate` | 开始生成序列帧 |
| `GET` | `/tasks/:taskId` | 查询任务状态 |
| `GET` | `/tasks/:taskId/frame/0` | 获取第一帧 |
| `GET` | `/tasks/:taskId/mask` | 获取当前 mask 预览 |
| `GET` | `/tasks/:taskId/frames/:index` | 获取指定结果帧 |
| `GET` | `/tasks/:taskId/download` | 下载 ZIP 结果包 |

注意：表格中的路径是相对于 `VITE_SAM2_API_URL` 的路径。例如默认配置下，上传接口完整地址是：

```text
http://localhost:6006/sam2/api/v1/upload
```

## 常用命令

```powershell
npm run dev        # 启动开发服务
npm run build      # 构建生产包
npm run preview    # 本地预览构建结果
npm run typecheck  # TypeScript 类型检查
```
