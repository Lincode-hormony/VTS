# Video-to-Sheet 集成方案

目标：把 `video-to-sheet` 的三类能力并入 `Sam2Tool`：

1. 图生视频提示词模板
2. 快速去背景与越界裁切
3. 锚点锁定与 Godot 导出

## 1. 现有项目边界

当前 `Sam2Tool` 负责：

- Seedance 图生视频入口
- SAM2 交互分割
- 传统帧表 / GIF / Sprite Sheet 预览

新增能力应落在一个独立后端层，不直接塞进前端 Canvas 逻辑。

## 2. 推荐整体结构

```text
Sam2Tool
  ├─ Frontend (React/Vite)
  │   ├─ Prompt Studio
  │   ├─ Video Fusion
  │   ├─ SAM2 Workspace
  │   └─ Export Preview
  ├─ Local Processing Backend (Python)
  │   ├─ prompt_engine
  │   ├─ video_ingest
  │   ├─ background_remove
  │   ├─ crop_anchor
  │   ├─ export_manifest
  │   └─ task_manager
  └─ Export Adapters
      ├─ godot
      └─ generic json
```

## 3. 图生视频提示词引擎

### 3.1 目标

把 Seedance 的提示词写成结构化字段，而不是手工拼长句。

### 3.2 字段

```ts
PromptSpec {
  subject: string
  actionType: "idle" | "walk" | "attack" | "hurt" | "death" | "special"
  camera: "side_view" | "fixed" | "full_body"
  style: "2d_handdrawn" | "cg" | "anime" | "pixel"
  background: "green_screen" | "solid_color" | "transparent"
  ratio: "16:9" | "9:16" | "1:1" | "4:3"
  durationSec: number
  loopable: boolean
  negative: string[]
  references: {
    imageUrls?: string[]
    videoUrls?: string[]
  }
}
```

### 3.3 生成规则

- 动作类 prompt 必须包含时间分段
- 固定镜头 / 侧视角 / 全身入镜必须显式出现
- 负面约束必须单独输出
- 循环动作必须标记 `loopable`

### 3.4 产物

- `prompt.json`
- `prompt.txt`
- 可选的 Seedance 请求体

## 4. 去背景流水线

### 4.1 两条路径

#### 快速路径

- 适用：纯绿幕、背景颜色稳定
- 技术：HSV 阈值 / KMeans 聚类 / Alpha 生成
- 优点：快
- 缺点：边缘质量不如模型法

#### 高质量路径

- 适用：复杂背景、半透明边缘、质量优先
- 技术：`rembg + u2net + alpha matting`
- 优点：边缘更稳
- 缺点：慢一些

### 4.2 建议策略

1. 先做背景估计
2. 若背景稳定且偏绿，先走快速路径
3. 若快速路径置信度不足，再走 `rembg`
4. 输出统一 RGBA PNG

### 4.3 建议 API

```text
POST /projects
POST /projects/:id/process/background-remove
GET  /projects/:id/tasks/:taskId
GET  /projects/:id/frames
GET  /projects/:id/export
```

## 5. 越界裁切与画布稳定

### 5.1 问题

人物动作会伸出画布，或在不同帧里偏移明显。

### 5.2 解决方式

不要用“按单帧最小框直接裁”作为最终结果。  
要同时保留：

- `alpha bbox`
- `anchor point`
- `offset`
- `padding`

### 5.3 处理方式

#### 单帧

```text
bbox = alpha > threshold 的最小外接矩形
crop_center = bbox center
anchor = 底部中心 / 脚底点
offset = anchor - crop_center
```

#### 整组

- 先计算全局 bbox
- 再统一裁切
- 再为每帧记录 offset

### 5.4 建议规则

- 裁切时 clamp 到图像边界
- 输出帧尽量保持统一宽高
- 使用底部中心作为默认 anchor
- 角色脚底必须稳定贴点

## 6. `_frame_data.json` 契约

```json
{
  "project_id": "cat_cat",
  "role": "cat_cat",
  "action": "walk",
  "animation_name": "walk",
  "original_size": { "width": 1280, "height": 720 },
  "anchor_point": { "x": 640, "y": 720 },
  "frames": [
    {
      "filename": "frame_000000.png",
      "output_name": "walk_001.png",
      "frame_index": 0,
      "crop_region": { "left": 403, "top": 134, "right": 917, "bottom": 637, "width": 514, "height": 503 },
      "offset": { "x": -20, "y": 334.5 }
    }
  ]
}
```

## 7. Godot 导出

### 7.1 产物

- `Resources/Animations/<prefix>/*.tres`
- `Scenes/Animator/*.tscn`
- `sprite_animator.gd`
- `animation_config.gd`

### 7.2 导出规则

- `.tres` 只存逐帧 offset
- `.tscn` 引用所有帧纹理和 config
- `AnimatedSprite2D` 运行时按帧应用 offset

## 8. 和 Sam2Tool 的融合方式

### 8.1 保留

- 现有 `SAM2 Workspace`
- 现有 `Seedance` 页面
- 现有 `FrameGallery`
- 现有 `GIF / SpriteSheet` 预览

### 8.2 新增

- `Prompt Studio`
- `Frame Meta` 生成
- `Anchor Lock` 预览
- `Godot Export`
- `Background Remove Worker`

### 8.3 替换

- 传统纯前端抠图只保留轻量预览
- 真正导出交给后端

## 9. 推荐实现顺序

1. 定义 `prompt.json` 和 `_frame_data.json`
2. 做后端任务框架
3. 接入快速去背景
4. 接入 `rembg`
5. 接入 anchor / bbox 导出
6. 做 Godot exporter
7. 前端加导出页

## 10. 最小可行版本

先做这三个：

- `PromptSpec`
- `_frame_data.json`
- `godot export`

这三项一旦打通，就能把 `Seedance -> 帧处理 -> Godot 动画` 形成闭环。
