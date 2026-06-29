import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Droplet,
  Eraser,
  Film,
  Grid3X3,
  Image as ImageIcon,
  Loader2,
  Upload,
} from "lucide-react";
import {
  applyChromaKeyToFrames,
  extractVideoFrames,
  revokeFrameUrls,
  type FrameData,
} from "../utils/frameProcessor";

type Stage = "idle" | "extracting" | "keying" | "sheeting" | "done" | "failed";

interface SheetOptions {
  frameSize: number;
  columns: number;
}

const FRAME_SIZE_PRESETS = [64, 128, 256, 512];

export function TraditionalSpriteWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [fps, setFps] = useState(12);
  const [maxFrames, setMaxFrames] = useState(97);
  const [backgroundColor, setBackgroundColor] = useState("#00ff00");
  const [tolerance, setTolerance] = useState(36);
  const [sheetOptions, setSheetOptions] = useState<SheetOptions>({ frameSize: 256, columns: 8 });
  const [rawFrames, setRawFrames] = useState<FrameData[]>([]);
  const [processedFrames, setProcessedFrames] = useState<FrameData[]>([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("等待上传视频");
  const [error, setError] = useState("");

  const frameCountEstimate = useMemo(() => {
    if (!duration) return 0;
    return Math.max(1, Math.min(maxFrames, Math.round(duration * fps)));
  }, [duration, fps, maxFrames]);

  const previewFrames = processedFrames.length > 0 ? processedFrames : rawFrames;
  const canProcess = Boolean(videoFile && duration && stage !== "extracting" && stage !== "keying" && stage !== "sheeting");
  const isBusy = stage === "extracting" || stage === "keying" || stage === "sheeting";

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
      revokeFrameUrls(rawFrames);
      revokeFrameUrls(processedFrames);
    };
  }, [videoUrl, sheetUrl, rawFrames, processedFrames]);

  const resetOutputs = () => {
    if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    revokeFrameUrls(rawFrames);
    revokeFrameUrls(processedFrames);
    setRawFrames([]);
    setProcessedFrames([]);
    setSheetUrl("");
  };

  const handleFile = (file: File) => {
    resetOutputs();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setDuration(0);
    setStage("idle");
    setProgress(0);
    setStatusText("已选择视频，等待读取时长");
    setError("");
  };

  const handleVideoMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
    setDuration(nextDuration);
    setStatusText(nextDuration ? "可以开始生成传统帧表" : "无法读取视频时长");
  };

  const runPipeline = async () => {
    if (!videoFile || !duration) return;

    resetOutputs();
    setError("");
    setStage("extracting");
    setProgress(0.05);

    try {
      const effectiveFps = Math.min(fps, Math.max(1, maxFrames / Math.max(duration, 0.1)));
      const frames = await extractVideoFrames(
        videoFile,
        { startTime: 0, endTime: duration, fps: effectiveFps },
        (message, value) => {
          setStatusText(cleanProgressMessage(message, "正在抽取视频帧"));
          setProgress(0.05 + (value ?? 0) * 0.35);
        }
      );

      const limitedFrames = frames.slice(0, maxFrames).map((frame, index) => ({ ...frame, index }));
      setRawFrames(limitedFrames);

      const autoColor = await detectBackgroundColor(limitedFrames[0]?.url);
      if (autoColor) {
        setBackgroundColor(autoColor);
      }

      setStage("keying");
      const keyedFrames = await applyChromaKeyToFrames(
        limitedFrames,
        { backgroundColor: autoColor || backgroundColor, tolerance },
        (message, value) => {
          setStatusText(cleanProgressMessage(message, "正在去除纯色背景"));
          setProgress(0.4 + (value ?? 0) * 0.35);
        }
      );
      setProcessedFrames(keyedFrames);

      setStage("sheeting");
      setStatusText("正在生成帧表图片");
      const nextSheetUrl = await buildSizedSheetUrl(keyedFrames, sheetOptions, (value) => {
        setProgress(0.75 + value * 0.22);
      });
      setSheetUrl(nextSheetUrl);
      setProgress(1);
      setStatusText("传统帧表已生成");
      setStage("done");
    } catch (nextError) {
      setStage("failed");
      setProgress(0);
      setError(nextError instanceof Error ? nextError.message : "处理失败");
      setStatusText("处理失败");
    }
  };

  const download = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">传统帧表</h1>
          <p className="mt-2 text-sm text-gray-600">
            适合绿幕、蓝幕、纯色背景或稳定背景素材：上传视频后抽帧、去背景、排成透明 PNG 帧表。
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          <Upload size={16} />
          上传视频
        </button>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.target.value = "";
        }}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                onLoadedMetadata={handleVideoMetadata}
                className="block max-h-[360px] w-full bg-black object-contain"
              />
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="grid min-h-[300px] w-full place-items-center bg-gray-50 px-6 text-center text-gray-500"
              >
                <div>
                  <Film size={28} className="mx-auto mb-3 text-gray-400" />
                  <div className="text-sm font-medium text-gray-700">选择一个视频开始</div>
                  <div className="mt-1 text-xs">推荐用于纯色背景、绿幕或蓝幕动画素材</div>
                </div>
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Film size={16} />
              抽帧
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="FPS" value={fps} min={1} max={30} onChange={setFps} />
              <NumberField label="最多帧数" value={maxFrames} min={1} max={240} onChange={setMaxFrames} />
            </div>
            <p className="mt-3 text-xs text-gray-500">
              预计输出 {frameCountEstimate || "-"} 帧，视频时长 {duration ? `${duration.toFixed(2)}s` : "-"}。
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Eraser size={16} />
              去背景
            </div>
            <div className="grid grid-cols-[92px_1fr] gap-3">
              <label className="grid h-20 place-items-center rounded-xl border border-gray-200 bg-gray-50">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(event) => setBackgroundColor(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
              <div>
                <label className="flex items-center justify-between text-xs font-medium text-gray-600">
                  容差
                  <span className="text-gray-900">{tolerance}</span>
                </label>
                <input
                  type="range"
                  min={8}
                  max={120}
                  value={tolerance}
                  onChange={(event) => setTolerance(Number(event.target.value))}
                  className="mt-4 w-full"
                />
                <p className="mt-2 text-xs text-gray-500">会自动用首帧四角估算背景色，也可以手动改。</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Grid3X3 size={16} />
              帧表
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">单帧尺寸</span>
                <select
                  value={sheetOptions.frameSize}
                  onChange={(event) =>
                    setSheetOptions((current) => ({ ...current, frameSize: Number(event.target.value) }))
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                >
                  {FRAME_SIZE_PRESETS.map((size) => (
                    <option key={size} value={size}>
                      {size} px
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="列数"
                value={sheetOptions.columns}
                min={1}
                max={24}
                onChange={(value) => setSheetOptions((current) => ({ ...current, columns: value }))}
              />
            </div>

            <button
              onClick={runPipeline}
              disabled={!canProcess}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Droplet size={16} />}
              生成透明帧表
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">处理状态</h2>
                <p className="mt-1 text-sm text-gray-600">{statusText}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">透明帧预览</h2>
              <span className="text-xs text-gray-500">{previewFrames.length} 帧</span>
            </div>
            {previewFrames.length > 0 ? (
              <div className="grid max-h-[300px] grid-cols-4 gap-2 overflow-auto sm:grid-cols-6 lg:grid-cols-8">
                {previewFrames.slice(0, 48).map((frame) => (
                  <div
                    key={`${frame.index}-${frame.url}`}
                    className="aspect-square overflow-hidden rounded-lg border border-gray-200 bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%),linear-gradient(-45deg,#f3f4f6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f4f6_75%),linear-gradient(-45deg,transparent_75%,#f3f4f6_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]"
                  >
                    <img src={frame.url} alt={`frame ${frame.index + 1}`} className="h-full w-full object-contain" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid min-h-[220px] place-items-center rounded-xl bg-gray-50 text-center text-sm text-gray-500">
                <div>
                  <ImageIcon size={24} className="mx-auto mb-2 text-gray-400" />
                  生成后会显示前 48 帧预览
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">帧表结果</h2>
              <button
                onClick={() => sheetUrl && download(sheetUrl, "sprite-sheet.png")}
                disabled={!sheetUrl}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={15} />
                下载 PNG
              </button>
            </div>
            {sheetUrl ? (
              <div className="max-h-[520px] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
                <img src={sheetUrl} alt="sprite sheet" className="mx-auto max-w-none" />
              </div>
            ) : (
              <div className="grid min-h-[260px] place-items-center rounded-xl bg-gray-50 text-center text-sm text-gray-500">
                暂无帧表结果
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const { label, value, min, max, onChange } = props;
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
        }}
        className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
      />
    </label>
  );
}

async function detectBackgroundColor(frameUrl?: string): Promise<string | null> {
  if (!frameUrl) return null;
  const img = await loadImage(frameUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0);
  const sampleSize = Math.max(4, Math.floor(Math.min(img.width, img.height) * 0.08));
  const regions = [
    [0, 0],
    [img.width - sampleSize, 0],
    [0, img.height - sampleSize],
    [img.width - sampleSize, img.height - sampleSize],
  ] as const;

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (const [x, y] of regions) {
    const imageData = ctx.getImageData(x, y, sampleSize, sampleSize).data;
    for (let i = 0; i < imageData.length; i += 4) {
      r += imageData[i]!;
      g += imageData[i + 1]!;
      b += imageData[i + 2]!;
      count += 1;
    }
  }

  return rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

async function buildSizedSheetUrl(
  frames: FrameData[],
  options: SheetOptions,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (frames.length === 0) throw new Error("没有可用于生成帧表的帧");

  const columns = Math.max(1, options.columns);
  const rows = Math.ceil(frames.length / columns);
  const cellSize = options.frameSize;
  const canvas = document.createElement("canvas");
  canvas.width = columns * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 Canvas 上下文");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let i = 0; i < frames.length; i++) {
    const img = await loadImage(frames[i].url);
    const scale = Math.min(cellSize / img.width, cellSize / img.height);
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = col * cellSize + Math.floor((cellSize - width) / 2);
    const y = row * cellSize + Math.floor((cellSize - height) / 2);

    ctx.clearRect(col * cellSize, row * cellSize, cellSize, cellSize);
    ctx.drawImage(img, x, y, width, height);
    onProgress?.((i + 1) / frames.length);

    if (i % 4 === 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("无法生成帧表图片"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function cleanProgressMessage(message: string, fallback: string): string {
  return /[\u4e00-\u9fa5]/.test(message) ? message : fallback;
}
