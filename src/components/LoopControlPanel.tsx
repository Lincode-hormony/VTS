import { useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import type { FrameData, MaterializedFrames } from "../utils/frameProcessor";
import {
  buildFramesZipUrl,
  findBestLoop,
  generateLoopPreviewFromBlobs,
  generateSpriteSheetFromBlobs,
  materializeFinalFrames,
  recommendSpriteColumns,
} from "../utils/frameProcessor";

export interface FinalArtifacts {
  materialized: MaterializedFrames;
  gifUrl: string;
  zipUrl: string;
  spriteUrl: string;
  spriteColumns: number;
  frameCount: number;
  fps: number;
  backgroundColor: string;
}

interface LoopControlPanelProps {
  frames: FrameData[];
  onFramesSelected: (indices: number[]) => void;
  previewFps: number;
  onPreviewFpsChange: (fps: number) => void;
  previewBackground: string;
  onPreviewBackgroundChange: (color: string) => void;
  onArtifactsGenerated?: (result: FinalArtifacts) => void;
}

const DEFAULT_MIN_SPAN = 80;
const FIXED_MAX_SPAN = 97;

export function LoopControlPanel({
  frames,
  onFramesSelected,
  previewFps,
  onPreviewFpsChange,
  previewBackground,
  onPreviewBackgroundChange,
  onArtifactsGenerated,
}: LoopControlPanelProps) {
  const [detecting, setDetecting] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [loopResult, setLoopResult] = useState<string | null>(null);
  const [minSpan, setMinSpan] = useState(DEFAULT_MIN_SPAN);
  const [workProgress, setWorkProgress] = useState(0);
  const [workMessage, setWorkMessage] = useState<string | null>(null);

  const selectedFrames = useMemo(() => frames.filter((frame) => frame.selected), [frames]);
  const normalizedMinSpan = Math.max(2, Math.min(minSpan || DEFAULT_MIN_SPAN, FIXED_MAX_SPAN));
  const isWorking = detecting || generatingPreview;

  const updateWork = (message: string, progress?: number) => {
    setWorkMessage(message);
    if (typeof progress === "number") {
      setWorkProgress(Math.max(0, Math.min(1, progress)));
    }
  };

  const buildArtifactsFromFrames = async (targetFrames: FrameData[]) => {
    updateWork("正在物化最终帧", 0);
    const materialized = await materializeFinalFrames(targetFrames, (msg, p) => {
      updateWork(msg, typeof p === "number" ? p * 0.3 : undefined);
    });

    updateWork("正在生成 GIF 预览", 0.3);
    const gifUrl = await generateLoopPreviewFromBlobs(
      materialized.blobs,
      materialized.width,
      materialized.height,
      previewFps,
      previewBackground,
      (msg, p) => updateWork(msg, typeof p === "number" ? 0.3 + p * 0.4 : undefined),
    );

    const spriteColumns = recommendSpriteColumns(
      materialized.blobs.length,
      materialized.width,
      materialized.height,
    );
    updateWork("正在生成横向精灵图", 0.7);
    const spriteUrl = await generateSpriteSheetFromBlobs(
      materialized.blobs,
      materialized.width,
      materialized.height,
      spriteColumns,
      (msg, p) => updateWork(msg, typeof p === "number" ? 0.7 + p * 0.15 : undefined),
    );

    updateWork("正在打包 PNG 序列帧", 0.85);
    const zipUrl = await buildFramesZipUrl(materialized.blobs, (msg, p) =>
      updateWork(msg, typeof p === "number" ? 0.85 + p * 0.15 : undefined),
    );

    onArtifactsGenerated?.({
      materialized,
      gifUrl,
      zipUrl,
      spriteUrl,
      spriteColumns,
      frameCount: materialized.blobs.length,
      fps: previewFps,
      backgroundColor: previewBackground,
    });
  };

  const handleFindLoop = async (): Promise<void> => {
    setDetecting(true);
    setGeneratingPreview(false);
    setLoopResult("正在查找闭环");
    setWorkProgress(0);
    setWorkMessage("正在准备检测");

    try {
      const indices = await findBestLoop(frames, normalizedMinSpan, FIXED_MAX_SPAN, updateWork);

      if (indices.length === 0) {
        setLoopResult(`未找到 ${normalizedMinSpan}-${FIXED_MAX_SPAN} 帧范围内的闭环`);
        return;
      }

      onFramesSelected(indices);
      const loopFrames = frames.filter((frame) => indices.includes(frame.index));
      await buildArtifactsFromFrames(loopFrames);
      setLoopResult(`已选择闭环：帧 ${indices[0]} 到 ${indices[indices.length - 1]}，共 ${indices.length} 帧`);
    } catch (error) {
      setLoopResult(`查找失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setDetecting(false);
      setWorkProgress(0);
      setWorkMessage(null);
    }
  };

  const handleGeneratePreview = async (): Promise<void> => {
    if (selectedFrames.length < 2) {
      setLoopResult("请至少选择 2 帧后再生成预览");
      return;
    }

    try {
      setGeneratingPreview(true);
      setLoopResult(null);
      setWorkProgress(0);
      await buildArtifactsFromFrames(selectedFrames);
    } catch (error) {
      setLoopResult(`生成失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setGeneratingPreview(false);
      setWorkProgress(0);
      setWorkMessage(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-32 flex-1">
            <label className="block text-xs font-medium text-gray-600">最短帧数</label>
            <input
              type="number"
              value={minSpan}
              onChange={(event) => setMinSpan(Math.max(2, Number.parseInt(event.target.value, 10) || 2))}
              min={2}
              max={FIXED_MAX_SPAN}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="min-w-28 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="block text-xs text-gray-500">最长帧数</span>
            <strong className="text-sm text-gray-900">{FIXED_MAX_SPAN}</strong>
          </div>
          <div className="min-w-28">
            <label className="block text-xs font-medium text-gray-600">预览 FPS</label>
            <input
              type="number"
              value={previewFps}
              min={1}
              max={60}
              onChange={(event) => onPreviewFpsChange(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="min-w-40">
            <label className="block text-xs font-medium text-gray-600">预览背景</label>
            <input
              type="color"
              value={previewBackground}
              onChange={(event) => onPreviewBackgroundChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-1"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={handleFindLoop}
            disabled={isWorking || frames.length < normalizedMinSpan}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {detecting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {detecting ? "查找中..." : "自动找闭环"}
          </button>
          <button
            onClick={handleGeneratePreview}
            disabled={isWorking || selectedFrames.length < 2}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generatingPreview && <Loader2 size={16} className="animate-spin" />}
            {generatingPreview ? "生成中..." : "生成最终产物"}
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          自动闭环只在 {normalizedMinSpan}-{FIXED_MAX_SPAN} 帧之间搜索。GIF / Sprite / ZIP 三种产物都从同一份最终帧字节派生。
        </p>

        {workMessage && (
          <div className="mt-3 rounded-lg bg-gray-50 p-2">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-700">
              <span>{workMessage}</span>
              <span>{Math.round(workProgress * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-200"
                style={{ width: `${Math.max(4, workProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {loopResult && (
          <div
            className={`mt-3 rounded-lg p-2 text-sm ${
              loopResult.includes("失败") || loopResult.includes("未找到")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {loopResult}
          </div>
        )}
      </div>
    </div>
  );
}
