import { useEffect, useMemo, useRef, useState } from "react";
import { BookText, Check, Plus, Trash2, X } from "lucide-react";
import {
  BUILTIN_PROMPT_TEMPLATES,
  PROMPT_TEMPLATE_STYLES,
  type CustomPromptTemplate,
} from "../data/promptTemplates";

const CUSTOM_TEMPLATE_KEY = "vts.promptTemplates";

interface PromptTemplatePickerProps {
  onSelect: (content: string) => void;
}

type TabKey = "builtin" | "custom";

function readCustomTemplates(): CustomPromptTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomPromptTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeCustomTemplates(list: CustomPromptTemplate[]): void {
  localStorage.setItem(CUSTOM_TEMPLATE_KEY, JSON.stringify(list));
}

export function PromptTemplatePicker({ onSelect }: PromptTemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("builtin");
  const [activeStyle, setActiveStyle] = useState<string>(PROMPT_TEMPLATE_STYLES[0] || "");
  const [customTemplates, setCustomTemplates] = useState<CustomPromptTemplate[]>(() => readCustomTemplates());
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    writeCustomTemplates(customTemplates);
  }, [customTemplates]);

  useEffect(() => {
    if (!open) return;
    const handleClickAway = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const builtinByStyle = useMemo(
    () => BUILTIN_PROMPT_TEMPLATES.filter((item) => item.style === activeStyle),
    [activeStyle]
  );

  const togglePanel = () => {
    setOpen((value) => !value);
    setCreating(false);
  };

  const handleSelectContent = (content: string) => {
    if (!content.trim()) return;
    onSelect(content);
    setOpen(false);
    setCreating(false);
  };

  const handleSaveDraft = () => {
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title || !content) return;
    const next: CustomPromptTemplate = {
      id: `custom:${Date.now()}`,
      title,
      content,
    };
    setCustomTemplates((current) => [next, ...current]);
    setDraftTitle("");
    setDraftContent("");
    setCreating(false);
  };

  const handleDelete = (id: string) => {
    setCustomTemplates((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={togglePanel}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
          open ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        <BookText size={14} />
        模板库
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[440px] max-w-[92vw] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">提示词模板库</div>
              <div className="text-xs text-gray-500">点一条模板即可覆盖当前提示词</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex border-b border-gray-100 bg-gray-50 px-2">
            {(
              [
                { key: "builtin" as const, label: "内置模板" },
                { key: "custom" as const, label: `我的模板${customTemplates.length ? ` (${customTemplates.length})` : ""}` },
              ]
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`relative px-3 py-2 text-xs font-medium transition ${
                  tab === item.key ? "text-blue-700" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {item.label}
                {tab === item.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-600" />}
              </button>
            ))}
          </div>

          {tab === "builtin" ? (
            <>
              <div className="space-y-2 border-b border-gray-100 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">风格</div>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_TEMPLATE_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setActiveStyle(style)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        activeStyle === style
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-gray-500">动作</div>
              <div className="max-h-[300px] overflow-y-auto px-2 pb-3">
                {builtinByStyle.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-500">这个风格还没有内置动作</div>
                ) : (
                  <ul className="space-y-1.5">
                    {builtinByStyle.map((template) => {
                      const empty = !template.content.trim();
                      return (
                        <li key={template.id}>
                          <button
                            type="button"
                            disabled={empty}
                            onClick={() => handleSelectContent(template.content)}
                            className={`group flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition ${
                              empty
                                ? "cursor-not-allowed border-dashed border-gray-200 bg-gray-50"
                                : "border-gray-100 hover:border-blue-300 hover:bg-blue-50/40"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${empty ? "text-gray-400" : "text-gray-900"}`}>
                                  {template.action}
                                </span>
                                {empty && (
                                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                                    未填写
                                  </span>
                                )}
                              </div>
                              {!empty && (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">{template.content}</p>
                              )}
                            </div>
                            {!empty && (
                              <Check size={14} className="mt-0.5 shrink-0 text-blue-600 opacity-0 transition group-hover:opacity-100" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="max-h-[340px] overflow-y-auto px-2 py-2">
                {customTemplates.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-gray-500">
                    还没有自定义模板，点击下方"新建"添加。
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {customTemplates.map((template) => (
                      <li key={template.id}>
                        <div className="group flex items-start gap-2 rounded-lg border border-gray-100 p-2.5 transition hover:border-blue-300 hover:bg-blue-50/40">
                          <button
                            type="button"
                            onClick={() => handleSelectContent(template.content)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="text-sm font-medium text-gray-900">{template.title}</div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">{template.content}</p>
                          </button>
                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleSelectContent(template.content)}
                              className="grid h-7 w-7 place-items-center rounded-md text-blue-600 hover:bg-blue-100"
                              title="使用这个模板"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(template.id)}
                              className="grid h-7 w-7 place-items-center rounded-md text-red-500 hover:bg-red-50"
                              title="删除模板"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                {creating ? (
                  <div className="space-y-2">
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      placeholder="模板标题"
                      className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      placeholder="模板内容，可粘贴一段完整的提示词"
                      className="min-h-20 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs leading-5"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setDraftTitle("");
                          setDraftContent("");
                        }}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={!draftTitle.trim() || !draftContent.trim()}
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Plus size={14} />
                    新建自定义模板
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
