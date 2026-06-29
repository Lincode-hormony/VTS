import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Download, Film, Loader2, Play, Plus, ScanSearch, Sparkles, Upload } from "lucide-react";
import { ToolWorkspace as Sam2Workspace, type FinalFormat, type SavedArtifact } from "./Sam2Workspace";
import { PromptTemplatePicker } from "./PromptTemplatePicker";

type ViewName = "role-list" | "role-create" | "action-list" | "action-create" | "seedance" | "sam2" | "sprite-result";
type FlowViewName = Extract<ViewName, "seedance" | "sam2" | "sprite-result">;
type FlowStage = "action" | "video" | "background" | "done";
type WorkflowState = "draft" | "generated" | "backgrounded" | "completed";
type SeedanceStatus = "idle" | "submitting" | "polling" | "succeeded" | "failed" | "timeout";
type SeedanceRatio = "adaptive" | "16:9" | "21:9" | "9:16" | "1:1" | "4:3" | "3:4";

const DEFAULT_SEEDANCE_MODEL = "doubao-seedance-2-0-260128";
const SEEDANCE_DURATIONS = [4, 6, 8] as const;
const ROLE_KEY = "vts.roles";
const ACTION_KEY = "vts.actions";
const ACTIVE_ROLE_KEY = "vts.activeRole";
const ACTIVE_ACTION_KEY = "vts.activeAction";
const ROLE_CANVAS_PRESETS = [
  { id: "sq-1024", label: "1024 x 1024", width: 1024, height: 1024 },
  { id: "sq-768", label: "768 x 768", width: 768, height: 768 },
  { id: "sq-512", label: "512 x 512", width: 512, height: 512 },
  { id: "vert-1024x1536", label: "1024 x 1536", width: 1024, height: 1536 },
  { id: "hori-1536x1024", label: "1536 x 1024", width: 1536, height: 1024 },
] as const;

interface RoleItem { id: string; name: string; referenceImageUrl: string; createdAt: number; }
interface ActionItem {
  id: string; roleId: string; name: string; prompt: string; firstFrameUrl: string; ratio: SeedanceRatio; seedanceModel: string; seedanceDuration: number;
  seedanceStartedAt?: number; workflowState: WorkflowState; seedanceStatus: SeedanceStatus; seedanceTaskId?: string; seedanceVideoUrl?: string; seedanceError?: string;
  sam2TaskId?: string; lastNodeView?: FlowViewName;
  finalFormat?: FinalFormat; finalArtifactUrl?: string; finalGifPreviewUrl?: string;
  finalFrameCount?: number; finalFps?: number; finalSpriteColumns?: number; finalBackgroundColor?: string; finalSavedAt?: number;
  createdAt: number; updatedAt: number;
}
interface FlowStep { id: FlowStage; label: string; icon: React.ReactNode; }

const FLOW_STEPS: FlowStep[] = [
  { id: "action", label: "创建动作", icon: <Film size={16} /> },
  { id: "video", label: "图生视频", icon: <Sparkles size={16} /> },
  { id: "background", label: "SAM2 抽帧", icon: <ScanSearch size={16} /> },
  { id: "done", label: "精灵图", icon: <Check size={16} /> },
];

const SEEDANCE_CONFIG = { endpoint: import.meta.env.VITE_SEEDANCE_PROXY_URL || "/api/seedance/tasks", model: DEFAULT_SEEDANCE_MODEL, resolution: "480p" };
const SEEDANCE_RATIOS: Array<{ value: SeedanceRatio; label: string }> = [
  { value: "adaptive", label: "自适应" }, { value: "16:9", label: "16:9" }, { value: "21:9", label: "21:9" },
  { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" },
];

function readJson<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } }
function writeJson<T>(key: string, value: T): void { localStorage.setItem(key, JSON.stringify(value)); }
function migrateActions(raw: ActionItem[]): ActionItem[] {
  return raw.map((item) => {
    const legacy = item as ActionItem & { spriteSheetUrl?: string; spritePreviewUrl?: string; spriteFrameCount?: number; spriteFps?: number; spriteSavedAt?: number };
    if (legacy.spriteSheetUrl || legacy.spritePreviewUrl || legacy.spriteFrameCount || legacy.spriteFps || legacy.spriteSavedAt) {
      const { spriteSheetUrl, spritePreviewUrl, spriteFrameCount, spriteFps, spriteSavedAt, ...rest } = legacy;
      const nextWorkflow: WorkflowState = rest.sam2TaskId ? "backgrounded" : rest.seedanceVideoUrl ? "generated" : "draft";
      const nextNode: FlowViewName = rest.sam2TaskId ? "sam2" : "seedance";
      return { ...rest, workflowState: nextWorkflow, lastNodeView: nextNode };
    }
    return item;
  });
}
function usePersistentState<T>(key: string, fallback: T) { const [value, setValue] = useState<T>(() => readJson<T>(key, fallback)); useEffect(() => writeJson(key, value), [key, value]); return [value, setValue] as const; }
function readFileAsDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("读取文件失败")); reader.readAsDataURL(file); }); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function loadImageElement(url: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => resolve(img); img.onerror = () => reject(new Error("加载参考图失败")); img.src = url; }); }
async function requestJson(url: string, options: RequestInit) { const response = await fetch(url, options); const text = await response.text(); let data: Record<string, unknown> = {}; try { data = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { data = { message: text }; } if (!response.ok) { const message = (typeof data.message === "string" && data.message) || (typeof data.error === "string" && data.error) || `HTTP ${response.status}`; throw new Error(message); } return data; }
function getVideoUrlFromSeedanceResponse(data: Record<string, unknown>): string { const content = data.content as { video_url?: string } | undefined; const output = data.output as { video_url?: string } | undefined; return content?.video_url || output?.video_url || (typeof data.video_url === "string" ? data.video_url : "") || ""; }
function getSeedanceStatusLabel(status: SeedanceStatus): string { return ({ idle: "等待生成", submitting: "提交中", polling: "生成中", succeeded: "已生成", failed: "生成失败", timeout: "生成超时" } as const)[status]; }
function getActionResumeView(action: ActionItem): ViewName { return action.finalArtifactUrl ? "sprite-result" : action.lastNodeView || "seedance"; }

export function VideoFusionWorkspace() {
  const roleImageInputRef = useRef<HTMLInputElement | null>(null);
  const roleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [roles, setRoles] = usePersistentState<RoleItem[]>(ROLE_KEY, []);
  const [actions, setActions] = usePersistentState<ActionItem[]>(ACTION_KEY, []);
  const [view, setView] = useState<ViewName>("role-list");
  const [activeRoleId, setActiveRoleId] = usePersistentState<string | null>(ACTIVE_ROLE_KEY, null);
  const [activeActionId, setActiveActionId] = usePersistentState<string | null>(ACTIVE_ACTION_KEY, null);
  const [roleName, setRoleName] = useState(""); const [roleImageUrl, setRoleImageUrl] = useState(""); const [actionName, setActionName] = useState("");
  const [roleCanvasPreset, setRoleCanvasPreset] = useState<(typeof ROLE_CANVAS_PRESETS)[number]>(ROLE_CANVAS_PRESETS[0]);
  const [roleCanvasUrl, setRoleCanvasUrl] = useState("");
  const [roleCanvasScale, setRoleCanvasScale] = useState(1);
  const [roleCanvasOffsetX, setRoleCanvasOffsetX] = useState(0);
  const [roleCanvasOffsetY, setRoleCanvasOffsetY] = useState(0);
  const [roleCanvasReady, setRoleCanvasReady] = useState(false);
  const [roleCreateBusy, setRoleCreateBusy] = useState(false);
  const [roleCreateError, setRoleCreateError] = useState<string | null>(null);
  const [sam2Error, setSam2Error] = useState<string | null>(null);
  const [seedanceBusyActionId, setSeedanceBusyActionId] = useState<string | null>(null);
  const [seedanceStatusLabel, setSeedanceStatusLabel] = useState("未提交");
  const [seedanceElapsedSeconds, setSeedanceElapsedSeconds] = useState(0);

  useEffect(() => { if (!activeRoleId && roles[0]) setActiveRoleId(roles[0].id); }, [roles, activeRoleId, setActiveRoleId]);
  useEffect(() => {
    const migrated = migrateActions(actions);
    if (migrated !== actions && migrated.some((item, idx) => item !== actions[idx])) {
      setActions(migrated);
    }
  }, []);
  const activeRole = useMemo(() => roles.find((item) => item.id === activeRoleId) ?? null, [roles, activeRoleId]);
  const activeAction = useMemo(() => actions.find((item) => item.id === activeActionId) ?? null, [actions, activeActionId]);
  const roleActions = useMemo(() => actions.filter((item) => item.roleId === activeRoleId), [actions, activeRoleId]);
  const currentStage = useMemo<FlowStage>(() => { if (view === "seedance") return "video"; if (view === "sam2") return "background"; if (view === "sprite-result") return "done"; if (!activeAction) return "action"; if (activeAction.finalArtifactUrl) return "done"; if (activeAction.lastNodeView === "seedance") return "video"; if (activeAction.lastNodeView === "sam2") return "background"; return "action"; }, [activeAction, view]);
  const currentIndex = FLOW_STEPS.findIndex((step) => step.id === currentStage);

  useEffect(() => { if (!activeAction?.seedanceStartedAt) { setSeedanceElapsedSeconds(0); return; } const tick = () => setSeedanceElapsedSeconds(Math.max(0, Math.round((Date.now() - (activeAction.seedanceStartedAt || 0)) / 1000))); tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, [activeAction?.seedanceStartedAt]);
  useEffect(() => { if (!activeAction) return setSeedanceStatusLabel("未提交"); if (activeAction.seedanceVideoUrl) return setSeedanceStatusLabel("已生成"); setSeedanceStatusLabel(getSeedanceStatusLabel(activeAction.seedanceStatus)); }, [activeAction]);
  useEffect(() => {
    if (!roleImageUrl) {
      setRoleCanvasUrl("");
      setRoleCanvasReady(false);
      setRoleCreateError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const img = await loadImageElement(roleImageUrl);
        if (cancelled) return;
        const canvas = roleCanvasRef.current;
        if (!canvas) {
          setRoleCreateError("画布未挂载，请稍候或刷新页面重试");
          return;
        }
        canvas.width = roleCanvasPreset.width;
        canvas.height = roleCanvasPreset.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setRoleCreateError("无法获取画布上下文");
          return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const drawW = img.naturalWidth * roleCanvasScale;
        const drawH = img.naturalHeight * roleCanvasScale;
        const x = (canvas.width - drawW) / 2 + roleCanvasOffsetX;
        const y = (canvas.height - drawH) / 2 + roleCanvasOffsetY;
        ctx.drawImage(img, x, y, drawW, drawH);
        try {
          setRoleCanvasUrl(canvas.toDataURL("image/png"));
          setRoleCanvasReady(true);
          setRoleCreateError(null);
        } catch (err) {
          setRoleCanvasUrl("");
          setRoleCanvasReady(false);
          setRoleCreateError(
            err instanceof Error
              ? `画布导出失败 (可能是图片跨域)：${err.message}`
              : "画布导出失败 (可能是图片跨域)",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setRoleCanvasUrl("");
          setRoleCanvasReady(false);
          setRoleCreateError(
            err instanceof Error
              ? `加载参考图失败：${err.message}`
              : "加载参考图失败",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleImageUrl, roleCanvasPreset, roleCanvasScale, roleCanvasOffsetX, roleCanvasOffsetY]);

  const updateAction = (id: string, patch: Partial<ActionItem>) => setActions((current) => current.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item)));
  const createRole = async () => { if (!roleName.trim() || !roleCanvasUrl.trim() || roleCreateBusy) return; setRoleCreateBusy(true); setRoleCreateError(null); try { const referenceImageUrl = roleCanvasUrl.trim(); const next: RoleItem = { id: `role:${Date.now()}`, name: roleName.trim(), referenceImageUrl, createdAt: Date.now() }; setRoles((current) => [next, ...current]); setActiveRoleId(next.id); setActiveActionId(null); setRoleName(""); setRoleImageUrl(""); setRoleCanvasUrl(""); setRoleCanvasReady(false); setRoleCanvasScale(1); setRoleCanvasOffsetX(0); setRoleCanvasOffsetY(0); setView("role-list"); } catch (error) { setRoleCreateError(error instanceof Error ? error.message : "创建角色失败"); } finally { setRoleCreateBusy(false); } };
  const createAction = () => { if (!activeRoleId || !actionName.trim()) return; const next: ActionItem = { id: `action:${Date.now()}`, roleId: activeRoleId, name: actionName.trim(), prompt: actionName.trim(), firstFrameUrl: activeRole?.referenceImageUrl || "", ratio: "adaptive", seedanceModel: DEFAULT_SEEDANCE_MODEL, seedanceDuration: 4, workflowState: "draft", seedanceStatus: "idle", lastNodeView: "seedance", createdAt: Date.now(), updatedAt: Date.now() }; setActions((current) => [next, ...current]); setActiveActionId(next.id); setActionName(""); setView("seedance"); };
  const openRole = (roleId: string) => { setActiveRoleId(roleId); setActiveActionId(null); setView("action-list"); };
  const openAction = (action: ActionItem, nextView: ViewName = getActionResumeView(action)) => { setActiveRoleId(action.roleId); setActiveActionId(action.id); setView(nextView); };
  const setLastNodeAndGoList = (nodeView: FlowViewName) => { if (activeAction) updateAction(activeAction.id, { lastNodeView: nodeView }); setView("action-list"); };
  const runSeedance = async () => { if (!activeRole || !activeAction || !activeAction.prompt.trim()) return; const firstFrameUrl = activeRole.referenceImageUrl; setSeedanceBusyActionId(activeAction.id); updateAction(activeAction.id, { seedanceStatus: "submitting", seedanceStartedAt: Date.now(), firstFrameUrl, seedanceError: undefined, seedanceVideoUrl: undefined, seedanceTaskId: undefined, sam2TaskId: undefined, workflowState: "draft", finalFormat: undefined, finalArtifactUrl: undefined, finalGifPreviewUrl: undefined, finalFrameCount: undefined, finalFps: undefined, finalSpriteColumns: undefined, finalBackgroundColor: undefined, finalSavedAt: undefined, lastNodeView: "seedance" }); setSeedanceStatusLabel("提交中"); try { const created = await requestJson(SEEDANCE_CONFIG.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: activeAction.seedanceModel || SEEDANCE_CONFIG.model, content: [{ type: "text", text: activeAction.prompt.trim() }, { type: "image_url", image_url: { url: firstFrameUrl }, role: "first_frame" }, { type: "image_url", image_url: { url: firstFrameUrl }, role: "last_frame" }], resolution: SEEDANCE_CONFIG.resolution, ratio: activeAction.ratio, duration: activeAction.seedanceDuration, generate_audio: false, watermark: false }) }); const taskId = (created.id as string | undefined) || (created.task_id as string | undefined) || ""; if (!taskId) throw new Error("Seedance 响应缺少任务 ID"); updateAction(activeAction.id, { seedanceTaskId: taskId, seedanceStatus: "polling" }); setSeedanceStatusLabel("生成中"); for (let attempts = 0; attempts < 90; attempts += 1) { const statusData = await requestJson(`${SEEDANCE_CONFIG.endpoint}/${taskId}`, { method: "GET" }); const videoUrl = getVideoUrlFromSeedanceResponse(statusData); const status = (statusData.status as string | undefined) || (statusData.task_status as string | undefined) || ""; if (videoUrl) { updateAction(activeAction.id, { seedanceTaskId: taskId, seedanceVideoUrl: videoUrl, seedanceStatus: "succeeded", workflowState: "generated", lastNodeView: "seedance" }); setSeedanceStatusLabel("已生成"); return; } if (["failed", "cancelled", "canceled"].includes(status)) throw new Error(`Seedance 任务失败: ${status}`); await new Promise((resolve) => window.setTimeout(resolve, 5000)); } throw new Error("Seedance 轮询超时"); } catch (error) { const message = error instanceof Error ? error.message : String(error); updateAction(activeAction.id, { seedanceStatus: message.includes("超时") ? "timeout" : "failed", seedanceError: message }); setSeedanceStatusLabel(message.includes("超时") ? "超时" : "失败"); throw error; } finally { setSeedanceBusyActionId(null); } };
  const attachSam2State = (taskId: string | null, error: string | null) => { setSam2Error(error); if (!activeActionId || !taskId) return; updateAction(activeActionId, { sam2TaskId: taskId, workflowState: "backgrounded" }); };
  const saveArtifactResult = (result: SavedArtifact) => { if (!activeAction) return; updateAction(activeAction.id, { workflowState: "completed", finalFormat: result.format, finalArtifactUrl: result.artifactUrl, finalGifPreviewUrl: result.gifPreviewUrl, finalFrameCount: result.frameCount, finalFps: result.fps, finalSpriteColumns: result.spriteColumns, finalBackgroundColor: result.backgroundColor, finalSavedAt: Date.now(), lastNodeView: "sprite-result" }); setView("sprite-result"); };
  const editCompletedAction = () => { if (!activeAction) return; const ok = window.confirm("修改后再次保存会覆盖当前产物，不保留历史版本。确定继续修改吗？"); if (!ok) return; updateAction(activeAction.id, { workflowState: activeAction.sam2TaskId ? "backgrounded" : activeAction.seedanceVideoUrl ? "generated" : "draft", finalFormat: undefined, finalArtifactUrl: undefined, finalGifPreviewUrl: undefined, finalFrameCount: undefined, finalFps: undefined, finalSpriteColumns: undefined, finalBackgroundColor: undefined, finalSavedAt: undefined, lastNodeView: activeAction.sam2TaskId ? "sam2" : "seedance" }); setView(activeAction.sam2TaskId ? "sam2" : "seedance"); };
  const downloadFinalArtifact = () => { if (!activeAction?.finalArtifactUrl) return; const a = document.createElement("a"); a.href = activeAction.finalArtifactUrl; const ext = activeAction.finalFormat === "zip" ? "zip" : "png"; const suffix = activeAction.finalFormat === "zip" ? "frames" : "sprite_sheet"; a.download = `${activeAction.name || "action"}_${suffix}.${ext}`; a.click(); };
  const goFlowStep = (step: FlowStage) => { const targetIndex = FLOW_STEPS.findIndex((item) => item.id === step); if (targetIndex < 0 || targetIndex > currentIndex) return; if (step === "action") return setView("action-list"); if (step === "video") return setView("seedance"); if (step === "background") return setView("sam2"); if (step === "done") return setView(activeAction?.finalArtifactUrl ? "sprite-result" : "sam2"); };
  const createRoleCardCount = (roleId: string) => actions.filter((item) => item.roleId === roleId).length;

  if (view === "role-list") return (<div className="mx-auto max-w-7xl px-6 py-8"><header className="mb-6 flex items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-gray-900">角色管理</h1><p className="mt-2 text-sm text-gray-600">先创建角色，再进入动作、视频和抽帧流程。</p></div><button onClick={() => setView("role-create")} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><Plus size={16} />创建角色</button></header><section><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-gray-900">角色列表</h2><div className="text-sm text-gray-500">{roles.length} 个角色</div></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{roles.map((role) => <RoleCard key={role.id} role={role} actionCount={createRoleCardCount(role.id)} onOpen={() => openRole(role.id)} />)}</div>{roles.length === 0 && <EmptyState text="还没有角色，先创建一个。" />}</section></div>);
  if (view === "role-create") {
    const missingName = !roleName.trim();
    const missingCanvas = !roleCanvasReady;
    const disableHint = missingName && missingCanvas
      ? "请先填写角色名称，并上传参考图等待画布预览生成"
      : missingName
        ? "请填写角色名称"
        : missingCanvas
          ? "请上传参考图，等待右侧画布预览生成"
          : null;
    return (
      <PageShell title="创建角色" subtitle="先上传原图，再把角色放进统一画布后创建。" onBack={() => setView("role-list")}>
        <section className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">角色名称</span>
            <input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="输入角色名称" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">原始参考图</span>
            <div className="mt-1 flex gap-2">
              <input value={roleImageUrl} onChange={(e) => setRoleImageUrl(e.target.value)} placeholder="参考图 URL" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button onClick={() => roleImageInputRef.current?.click()} className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm"><Upload size={16} /></button>
            </div>
          </label>
          <input ref={roleImageInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setRoleImageUrl(await readFileAsDataUrl(file)); e.target.value = ""; }} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">画布规格</div>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_CANVAS_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => setRoleCanvasPreset(preset)} className={`rounded-lg border px-3 py-2 text-left text-sm ${roleCanvasPreset.id === preset.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-700"}`}>{preset.label}</button>
                ))}
              </div>
              <label className="block"><span className="text-xs font-medium text-gray-600">缩放</span><input type="range" min="0.2" max="2.5" step="0.01" value={roleCanvasScale} onChange={(e) => setRoleCanvasScale(Number(e.target.value))} className="mt-1 w-full" /></label>
              <label className="block"><span className="text-xs font-medium text-gray-600">横向位移</span><input type="range" min={-400} max={400} step={1} value={roleCanvasOffsetX} onChange={(e) => setRoleCanvasOffsetX(Number(e.target.value))} className="mt-1 w-full" /></label>
              <label className="block"><span className="text-xs font-medium text-gray-600">纵向位移</span><input type="range" min={-400} max={400} step={1} value={roleCanvasOffsetY} onChange={(e) => setRoleCanvasOffsetY(Number(e.target.value))} className="mt-1 w-full" /></label>
              <div className="text-xs text-gray-500">把角色放到你认为合理的位置，再保存成最终参考图。</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 text-sm font-semibold text-gray-900">最终参考图预览</div>
              <div className="grid place-items-center overflow-hidden rounded-lg border border-gray-200 bg-white" style={{ minHeight: 420 }}>
                <canvas ref={roleCanvasRef} className="max-h-[480px] w-auto" />
              </div>
              {!roleCanvasReady && <div className="mt-3 text-xs text-amber-600">先上传原图，再调整画布和位置。</div>}
            </div>
          </div>
          {roleCreateError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{roleCreateError}</div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={createRole} disabled={!roleName.trim() || !roleCanvasReady || roleCreateBusy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
              {roleCreateBusy ? "创建中..." : "创建角色"}
            </button>
            {disableHint && !roleCreateBusy && (
              <span className="text-xs text-amber-600">{disableHint}</span>
            )}
          </div>
        </section>
      </PageShell>
    );
  }
  if (view === "action-list") return (<PageShell title={activeRole ? activeRole.name : "动作管理"} subtitle="这里管理该角色下的动作。" onBack={() => setView("role-list")}><section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-gray-900">动作列表</h2><p className="text-sm text-gray-500">{roleActions.length} 个动作</p></div><button onClick={() => setView("action-create")} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><Plus size={16} />创建动作</button></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{roleActions.map((action) => (<article key={action.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-gray-900">{action.name}</h3><p className="mt-1 text-xs text-gray-500">当前节点：{action.workflowState}</p></div><button onClick={() => openAction(action)} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white">继续<ChevronRight size={14} /></button></div></article>))}</div>{roleActions.length === 0 && <EmptyState text="当前角色还没有动作。" />}</section></PageShell>);
  if (view === "action-create") return (<PageShell title="创建动作" subtitle="动作只需要一个名称，后面会按节点继续完善。" onBack={setView.bind(null, "action-list")}><section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><label className="block"><span className="text-xs font-medium text-gray-600">动作名称</span><input value={actionName} onChange={(e) => setActionName(e.target.value)} placeholder="例如 walk / attack / idle" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label><div className="mt-4"><button onClick={createAction} disabled={!activeRoleId || !actionName.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">创建并进入流程</button></div></section></PageShell>);
  if (view === "seedance") return (<PageShell title={activeAction?.name || "图生视频"} subtitle="这里只做图生视频。" onBack={() => setLastNodeAndGoList("seedance")} right={<FlowProgress steps={FLOW_STEPS} currentIndex={currentIndex < 0 ? 0 : currentIndex} onStepClick={goFlowStep} />}><section className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]"><div className="h-fit space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="block"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-gray-600">提示词</span>{activeAction && <PromptTemplatePicker onSelect={(content) => updateAction(activeAction.id, { prompt: content })} />}</div><textarea value={activeAction?.prompt || ""} onChange={(e) => activeAction && updateAction(activeAction.id, { prompt: e.target.value })} placeholder="描述动作、镜头和约束" className="mt-1 min-h-32 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-6" /></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block"><span className="text-xs font-medium text-gray-600">画幅</span><select value={activeAction?.ratio || "adaptive"} onChange={(e) => activeAction && updateAction(activeAction.id, { ratio: e.target.value as SeedanceRatio })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">{SEEDANCE_RATIOS.map((ratio) => <option key={ratio.value} value={ratio.value}>{ratio.label}</option>)}</select></label><label className="block"><span className="text-xs font-medium text-gray-600">秒数</span><select value={activeAction?.seedanceDuration || 4} onChange={(e) => activeAction && updateAction(activeAction.id, { seedanceDuration: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">{SEEDANCE_DURATIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}</select></label></div><button onClick={runSeedance} disabled={!activeAction || !activeRole || !activeAction.prompt.trim() || seedanceBusyActionId === activeAction.id} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{seedanceBusyActionId === activeAction?.id ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}生成</button></div><div className="space-y-4"><section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-gray-900">结果预览</h2><div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{activeAction?.seedanceDuration || 4} 秒</div></div><div className="mt-4 aspect-video overflow-hidden rounded-xl border border-gray-200 bg-gray-100">{activeAction?.seedanceVideoUrl ? <video controls src={activeAction.seedanceVideoUrl} className="block h-full w-full bg-black object-contain" /> : <div className="grid h-full place-items-center px-6 text-center text-sm text-gray-500"><div className="max-w-xs"><div className={`mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full ${(activeAction?.seedanceStatus === "failed" || activeAction?.seedanceStatus === "timeout") ? "bg-red-50 text-red-500" : (activeAction?.seedanceStatus === "polling" || activeAction?.seedanceStatus === "submitting") ? "bg-blue-50 text-blue-600" : "bg-white text-gray-400"}`}>{(activeAction?.seedanceStatus === "polling" || activeAction?.seedanceStatus === "submitting") ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}</div><p className="font-medium text-gray-700">{activeAction?.seedanceStatus === "failed" ? "生成失败" : activeAction?.seedanceStatus === "timeout" ? "生成超时" : activeAction?.seedanceStatus === "polling" ? "生成视频可能需要 2~3 分钟，请耐心等待" : "点击生成视频"}</p><p className="mt-1 leading-6 text-gray-500">{activeAction?.seedanceStatus === "polling" ? "上传成功后会在这里显示视频。" : "先完成图生视频，再进入抽帧。"}</p>{activeAction?.seedanceStartedAt && activeAction.seedanceStatus !== "idle" && <p className="mt-3 text-xs text-gray-400">已等待 {seedanceElapsedSeconds} 秒</p>}</div></div>}</div><label className="mt-4 block text-xs font-bold text-gray-700">视频 URL</label><input value={activeAction?.seedanceVideoUrl || ""} readOnly placeholder="生成成功后出现" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />{activeAction?.seedanceVideoUrl && <button onClick={() => setView("sam2")} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white">进入 SAM2 抽帧</button>}</section></div></section></PageShell>);
  if (view === "sam2") return (<PageShell title="SAM2 抽帧" subtitle="选帧并生成精灵图，保存后这个动作即完成。" onBack={() => setLastNodeAndGoList("sam2")} right={<FlowProgress steps={FLOW_STEPS} currentIndex={currentIndex < 0 ? 0 : currentIndex} onStepClick={goFlowStep} />}><section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Sam2Workspace sharedVideoUrl={activeAction?.seedanceVideoUrl || null} sharedTaskId={activeAction?.sam2TaskId || null} suppressUploader onSharedUploadState={attachSam2State} onArtifactSaved={saveArtifactResult} />{sam2Error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{sam2Error}</div>}</section></PageShell>);

  if (view === "sprite-result") return (
    <PageShell title={activeAction?.name || "最终产物"} subtitle="这是当前动作保存后的最终产物。" onBack={() => setView("action-list")} right={<FlowProgress steps={FLOW_STEPS} currentIndex={currentIndex < 0 ? 0 : currentIndex} onStepClick={goFlowStep} />}>
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(420px,1fr)_320px]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">循环预览 (GIF)</h2>
            <div className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">已保存</div>
          </div>
          <div
            className="grid min-h-[360px] place-items-center overflow-hidden rounded-xl border border-gray-200 p-4"
            style={{ backgroundColor: activeAction?.finalBackgroundColor || "#f9fafb" }}
          >
            {activeAction?.finalGifPreviewUrl ? <img src={activeAction.finalGifPreviewUrl} alt="loop preview" className="max-h-[520px] w-auto" /> : <div className="text-sm text-gray-500">还没有保存产物。</div>}
          </div>
        </div>
        <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">资源信息</h3>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                <div className="flex justify-between gap-3"><span>格式</span><strong className="text-gray-900">{activeAction?.finalFormat === "zip" ? "PNG 序列帧 (ZIP)" : activeAction?.finalFormat === "sprite" ? `横向精灵图 (${activeAction?.finalSpriteColumns || "-"} 列)` : "-"}</strong></div>
                <div className="flex justify-between gap-3"><span>帧数</span><strong className="text-gray-900">{activeAction?.finalFrameCount || "-"}</strong></div>
                <div className="flex justify-between gap-3"><span>FPS</span><strong className="text-gray-900">{activeAction?.finalFps || "-"}</strong></div>
                <div className="flex justify-between gap-3"><span>状态</span><strong className="text-gray-900">动作完成</strong></div>
              </div>
            </div>
          <button onClick={downloadFinalArtifact} disabled={!activeAction?.finalArtifactUrl} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"><Download size={16} />下载{activeAction?.finalFormat === "zip" ? "序列帧 ZIP" : "精灵图 PNG"}</button>
          <button onClick={editCompletedAction} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700">修改这个动作</button>
        </aside>
      </section>
    </PageShell>
  );

  return <PageShell title="动作管理" subtitle="返回动作列表继续。" onBack={() => setView("action-list")}><EmptyState text="请选择一个动作继续。" /></PageShell>;
}

function PageShell(props: { title: string; subtitle: string; onBack: () => void; right?: React.ReactNode; children: React.ReactNode }) { const { title, subtitle, onBack, right, children } = props; return (<div className="mx-auto max-w-7xl px-6 py-8"><header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><button onClick={onBack} className="mb-3 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft size={16} />返回</button><h1 className="text-2xl font-bold text-gray-900">{title}</h1><p className="mt-2 text-sm text-gray-600">{subtitle}</p></div>{right ? <div className="w-full max-w-3xl">{right}</div> : null}</header>{children}</div>); }
function FlowProgress(props: { steps: FlowStep[]; currentIndex: number; onStepClick: (step: FlowStage) => void }) { const { steps, currentIndex, onStepClick } = props; return (<div className="rounded-full border border-gray-200 bg-white px-4 py-3"><div className="flex items-center justify-between gap-2">{steps.map((step, index) => { const active = index <= currentIndex; return (<button key={step.id} type="button" onClick={() => onStepClick(step.id)} disabled={!active} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${active ? "border-blue-600 bg-blue-50 text-blue-600 hover:bg-blue-100" : "border-gray-200 bg-gray-100 text-gray-400"}`}>{step.icon}</div><div className="min-w-0"><div className={`text-sm font-medium ${active ? "text-gray-900" : "text-gray-400"}`}>{step.label}</div></div>{index < steps.length - 1 && <div className={`hidden h-px flex-1 bg-gray-200 sm:block ${active ? "bg-blue-200" : ""}`} />}</button>); })}</div></div>); }
function RoleCard(props: { role: RoleItem; actionCount: number; onOpen: () => void; key?: React.Key }) { const { role, actionCount, onOpen } = props; return (<article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="relative aspect-[3/4] bg-gray-100"><img src={role.referenceImageUrl} alt={role.name} className="h-full w-full object-cover" /><button onClick={onOpen} className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur"><ChevronRight size={16} /></button><div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 text-white"><div className="text-xl font-bold">{role.name}</div><div className="mt-1 text-sm text-white/80">{actionCount} 个动作</div></div></div></article>); }
function InfoCard(props: { title: string; text: string }) { return (<div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="text-sm font-semibold text-gray-900">{props.title}</div><div className="mt-2 text-sm leading-6 text-gray-600">{props.text}</div></div>); }
function EmptyState(props: { text: string }) { return <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{props.text}</div>; }
