// =========================================================================
// 提示词模板库 - 内置模板数据
// =========================================================================
// 编辑指引：
//   - 想新增风格：在 PROMPT_TEMPLATE_STYLES 里加一个名字，再到下面的数组里
//     添加对应 style 的条目。
//   - 想新增动作：在下面的数组里加一条 { id, style, action, content }。
//   - 想改提示词文案：直接修改对应条目的 content 字段。
//   - id 必须唯一，建议保留 "builtin:" 前缀，方便和用户自定义模板区分。
// =========================================================================

export interface BuiltinPromptTemplate {
  id: string;
  style: string;
  action: string;
  content: string;
}

export const PROMPT_TEMPLATE_STYLES: string[] = ["2d平面风"];

export const BUILTIN_PROMPT_TEMPLATES: BuiltinPromptTemplate[] = [
  {
    id: "builtin:2d:idle-breath",
    style: "2d平面风",
    action: "跳跃",
    content:
      "2d横版游戏人物，做跳跃动作，顶部不要超出画面，始终保持角色完整，腾空时间不要太长，纯正侧面视角，正交投影，无透视效果，镜头保持不动，不要特效，背景保持纯色不变",
  },
  {
    id: "builtin:2d:idle-look",
    style: "2d平面风",
    action: "出拳攻击",
    content:
      "2d横版游戏人物，出拳攻击，纯正侧面视角，正交投影，攻击方向完全朝向右侧，无透视效果，镜头保持不动，不要特效，背景保持纯色不变",
  },
];

export interface CustomPromptTemplate {
  id: string;
  title: string;
  content: string;
}
