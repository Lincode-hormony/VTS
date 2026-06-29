# SAM2 AutoDL 后端启动与维护说明

本文档记录当前 `Sam2Tool` 前端对应的 AutoDL 后端位置、启动方式、长期后台挂载方式，以及常用命令的作用。

## 当前后端信息

AutoDL SSH：

```bash
ssh -p 24433 root@connect.westb.seetacloud.com
```

后端目录：

```bash
/root/autodl-tmp/sam2-api
```

Conda 环境：

```bash
/root/autodl-tmp/conda_envs/sam2_project
```

公网 API 地址：

```text
https://u184490-8409-90945147.westb.seetacloud.com:8443/sam2/api/v1
```

本地前端 `.env.local` 应配置为：

```text
VITE_SAM2_API_URL=https://u184490-8409-90945147.westb.seetacloud.com:8443/sam2/api/v1
```

## 一键管理脚本

AutoDL 后端目录里已经放置管理脚本：

```bash
/root/autodl-tmp/sam2-api/sam2_service.sh
```

它只负责启动、停止、查看状态和健康检查，不会安装依赖，不会修改 conda 配置，不会改动 Python 环境。

进入后端目录：

```bash
cd /root/autodl-tmp/sam2-api
```

作用：切换到 SAM2 后端所在目录。后续脚本和后端服务都在这个目录下运行。

## 启动后端

```bash
./sam2_service.sh start
```

作用：

- 检查 `/root/autodl-tmp/conda_envs/sam2_project` 环境是否存在。
- 检查 `api_server.py` 是否存在。
- 检查 `6006` 服务是否已经响应。
- 如果没有运行，则创建一个名为 `sam2` 的 `tmux` 会话。
- 在 `tmux` 里启动：

```bash
uvicorn api_server:app --host 0.0.0.0 --port 6006
```

注意：如果服务已经在运行，脚本不会重复启动另一个后端。

## 查看状态

```bash
./sam2_service.sh status
```

作用：

- 查看 `tmux` 会话 `sam2` 是否存在。
- 请求本机健康接口，判断 `6006` 后端是否响应。

正常输出类似：

```text
tmux session 'sam2': running
port 6006: responding
```

## 健康检查

```bash
./sam2_service.sh health
```

作用：请求 AutoDL 本机后端健康接口：

```text
http://127.0.0.1:6006/sam2/api/v1/health
```

正常输出：

```json
{"status":"ok"}
```

也可以在本地 Windows PowerShell 检查公网地址：

```powershell
Invoke-RestMethod "https://u184490-8409-90945147.westb.seetacloud.com:8443/sam2/api/v1/health"
```

作用：确认 AutoDL 控制台的自定义服务公网映射可用。

## 查看后端运行现场

```bash
./sam2_service.sh attach
```

作用：进入 `tmux` 会话，查看正在运行的 `uvicorn` 输出和请求日志。

进入后，如果只是想退出查看窗口并保持服务继续运行，按：

```text
Ctrl+B
D
```

注意：不要按 `Ctrl+C`，除非你想停止后端服务。

## 停止后端

```bash
./sam2_service.sh stop
```

作用：向 `tmux` 会话里的后端进程发送 `Ctrl+C`，让 `uvicorn` 正常停止。

停止后可以再检查：

```bash
./sam2_service.sh status
```

如果输出：

```text
port 6006: not responding
```

说明后端已经不响应。

## 手动启动方式

一般使用脚本即可。如果需要手动排查，可以使用以下命令：

```bash
cd /root/autodl-tmp/sam2-api
source /root/autodl-tmp/miniforge3/etc/profile.d/conda.sh
conda activate /root/autodl-tmp/conda_envs/sam2_project
unset http_proxy https_proxy all_proxy
uvicorn api_server:app --host 0.0.0.0 --port 6006
```

各命令作用：

- `cd /root/autodl-tmp/sam2-api`：进入后端代码目录。
- `source /root/autodl-tmp/miniforge3/etc/profile.d/conda.sh`：加载 conda 命令。
- `conda activate /root/autodl-tmp/conda_envs/sam2_project`：用完整路径激活 SAM2 环境，避免依赖环境名注册。
- `unset http_proxy https_proxy all_proxy`：清理当前 shell 的代理变量，避免模型或接口请求受代理影响。
- `uvicorn api_server:app --host 0.0.0.0 --port 6006`：启动 FastAPI 后端，并监听 AutoDL 的 `6006` 端口。

这种方式是前台运行，关闭终端或断开连接后可能停止。长期运行请使用 `./sam2_service.sh start`。

## 本地前端启动

在 Windows 本地仓库：

```powershell
cd "D:\下载缓存\桌面\Sam2Tool"
npm run dev
```

作用：

- 启动 Vite 前端开发服务。
- 默认访问地址是：

```text
http://127.0.0.1:3000
```

前端通过 `.env.local` 访问 AutoDL 后端公网地址。

## 安全和环境注意事项

为了避免扰乱 AutoDL 其他环境，日常不要执行这些操作，除非明确知道影响范围：

```bash
conda config --add envs_dirs ...
conda install ...
pip install ...
rm -rf ...
修改 /root/autodl-tmp/conda_envs/sam2_project
修改 /root/autodl-tmp/segment-anything-2
```

当前推荐方式是使用完整环境路径：

```bash
conda activate /root/autodl-tmp/conda_envs/sam2_project
```

这样不会修改 conda 配置，也不会影响其他项目环境。

