import { useRef, useState, useEffect } from "react";
import type React from "react";
import { useSam2 } from "../hooks/useSam2";
import { FrameGallery } from "./FrameGallery";
import { LoopControlPanel, type FinalArtifacts } from "./LoopControlPanel";
import type { FrameData } from "../utils/frameProcessor";
import { generateSpriteSheetFromBlobs } from "../utils/frameProcessor";
import type { Point } from "../hooks/useSam2";
import { getActiveTaskIdFromError } from "../services/sam2Api";

const FOREGROUND_LABEL = 1 as const;
const BACKGROUND_LABEL = 0 as const;

const TOOL_INFO = {
  name: '序列帧提取',
  description: 'SAM2 Video Segmentation',
  emoji: '🎬',
} as const;
const DEFAULT_BACKGROUND_COLOR = "#ffffff";

export type FinalFormat = "zip" | "sprite";

export interface SavedArtifact {
  format: FinalFormat;
  artifactUrl: string;
  gifPreviewUrl: string;
  frameCount: number;
  fps: number;
  spriteColumns: number;
  backgroundColor: string;
}

export function ToolWorkspace(props: {
  sharedFile?: File | null;
  sharedVideoUrl?: string | null;
  sharedTaskId?: string | null;
  suppressUploader?: boolean;
  onSharedUploadState?: (taskId: string | null, error: string | null) => void;
  onArtifactSaved?: (result: SavedArtifact) => void;
} = {}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const { sharedFile = null, sharedVideoUrl = null, sharedTaskId = null, suppressUploader = false, onSharedUploadState, onArtifactSaved } = props;
  const lastSharedFileKeyRef = useRef<string | null>(null);
  const lastSharedVideoUrlRef = useRef<string | null>(null);
  const lastSharedTaskIdRef = useRef<string | null>(null);

  const [frames, setFrames] = useState<FrameData[]>([]);
  const [showFrameGallery, setShowFrameGallery] = useState(false);
  const [artifacts, setArtifacts] = useState<FinalArtifacts | null>(null);
  const [format, setFormat] = useState<FinalFormat>("zip");
  const [spriteColumns, setSpriteColumns] = useState(1);
  const [recommendedColumns, setRecommendedColumns] = useState(1);
  const [regenerateColumns, setRegenerateColumns] = useState(false);
  const [previewFps, setPreviewFps] = useState(12);
  const [previewBackground, setPreviewBackground] = useState(DEFAULT_BACKGROUND_COLOR);
  const [pendingPoint, setPendingPoint] = useState<Point | null>(null);
  const [displayMaskUrl, setDisplayMaskUrl] = useState<string | null>(null);
  const [maskLoading, setMaskLoading] = useState(false);

  const {
    status,
    progress,
    points,
    frameCount,
    error,
    videoInfo,
    frames: apiFrames,
    upload,
    importFromUrl,
    click,
    undo,
    reset,
    generate,
    download,
    getFirstFrameUrl,
    getMaskUrl,
    attachTask,
  } = useSam2();

  const firstFrameUrl = getFirstFrameUrl();
  const latestMaskUrl = getMaskUrl();

  // 当后端返回frames数据时，转换为FrameData格式
  useEffect(() => {
    if (apiFrames && apiFrames.length > 0) {
      const frameData: FrameData[] = apiFrames.map((f) => ({
        index: f.index,
        url: f.url,
        selected: false,
      }));
      setFrames(frameData);
    }
  }, [apiFrames]);

  useEffect(() => {
    if (!sharedFile) return;

    const fileKey = `${sharedFile.name}-${sharedFile.size}-${sharedFile.lastModified}`;
    if (lastSharedFileKeyRef.current === fileKey) return;

    lastSharedFileKeyRef.current = fileKey;
    setFrames([]);
    setShowFrameGallery(false);
    setArtifacts(null);
    setPreviewBackground(DEFAULT_BACKGROUND_COLOR);
    void upload(sharedFile)
      .then((result) => {
        onSharedUploadState?.(result.task_id, null);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Upload failed";
        onSharedUploadState?.(getActiveTaskIdFromError(message), message);
      });
  }, [sharedFile, upload]);

  useEffect(() => {
    if (!sharedVideoUrl) return;
    if (lastSharedVideoUrlRef.current !== sharedVideoUrl) {
      lastSharedTaskIdRef.current = null;
    }
    if (sharedTaskId && lastSharedVideoUrlRef.current === sharedVideoUrl) return;
    if (lastSharedVideoUrlRef.current === sharedVideoUrl) return;

    lastSharedVideoUrlRef.current = sharedVideoUrl;
    setFrames([]);
    setShowFrameGallery(false);
    setArtifacts(null);
    setPreviewBackground(DEFAULT_BACKGROUND_COLOR);
    void importFromUrl(sharedVideoUrl)
      .then((result) => {
        onSharedUploadState?.(result.task_id, null);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Import video URL failed";
        onSharedUploadState?.(getActiveTaskIdFromError(message), message);
      });
  }, [sharedVideoUrl, sharedTaskId, importFromUrl, onSharedUploadState]);

  useEffect(() => {
    if (!sharedTaskId) return;
    if (lastSharedTaskIdRef.current === sharedTaskId) return;

    lastSharedTaskIdRef.current = sharedTaskId;
    setFrames([]);
    setShowFrameGallery(false);
    setArtifacts(null);
    setPreviewBackground(DEFAULT_BACKGROUND_COLOR);
    void attachTask(sharedTaskId)
      .then(() => {
        onSharedUploadState?.(sharedTaskId, null);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Attach task failed";
        onSharedUploadState?.(sharedTaskId, message);
      });
  }, [sharedTaskId, attachTask, onSharedUploadState]);

  useEffect(() => {
    if (!latestMaskUrl) {
      setDisplayMaskUrl(null);
      setMaskLoading(false);
      return;
    }

    let cancelled = false;
    setMaskLoading(true);

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setDisplayMaskUrl(latestMaskUrl);
      setMaskLoading(false);
    };
    img.onerror = () => {
      if (cancelled) return;
      setMaskLoading(false);
    };
    img.src = latestMaskUrl;

    return () => {
      cancelled = true;
    };
  }, [latestMaskUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFrames([]);
    setShowFrameGallery(false);
    setArtifacts(null);
    try {
      const result = await upload(file);
      onSharedUploadState?.(result.task_id, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      onSharedUploadState?.(getActiveTaskIdFromError(message), message);
      throw error;
    }
  };

  const calculateImageCoordinates = (
    event: React.MouseEvent<HTMLImageElement>,
    img: HTMLImageElement
  ): { x: number; y: number } => {
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);

    return { x, y };
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>): Promise<void> => {
    if (status !== "ready") return;
    if (pendingPoint) return;

    const img = imageRef.current;
    if (!img) return;

    const { x, y } = calculateImageCoordinates(e, img);
    setPendingPoint({ x, y, label: FOREGROUND_LABEL });
    try {
      await click(x, y, FOREGROUND_LABEL);
    } finally {
      setPendingPoint(null);
    }
  };

  const handleContextMenu = async (e: React.MouseEvent<HTMLImageElement>): Promise<void> => {
    e.preventDefault();
    if (status !== "ready") return;
    if (pendingPoint) return;

    const img = imageRef.current;
    if (!img) return;

    const { x, y } = calculateImageCoordinates(e, img);
    setPendingPoint({ x, y, label: BACKGROUND_LABEL });
    try {
      await click(x, y, BACKGROUND_LABEL);
    } finally {
      setPendingPoint(null);
    }
  };

  const handleGenerate = async (): Promise<void> => {
    await generate();
  };

  const handleShowFrames = (): void => {
    setShowFrameGallery(!showFrameGallery);
  };

  const handleToggleFrame = (index: number): void => {
    setFrames(prev =>
      prev.map(frame => {
        if (frame.index !== index) return frame;
        return { ...frame, selected: !frame.selected };
      })
    );
  };

  const handleSelectFrameRange = (startIndex: number, endIndex: number): void => {
    setFrames(prev =>
      prev.map(frame => {
        const shouldSelect = frame.index >= startIndex && frame.index <= endIndex;
        return frame.selected === shouldSelect ? frame : { ...frame, selected: shouldSelect };
      })
    );
  };

  const handleClearSelection = (): void => {
    setFrames(prev => prev.map(frame => (frame.selected ? { ...frame, selected: false } : frame)));
  };

  const renderPointMarker = (point: Point, index: number, pending = false) => {
    const img = imageRef.current;
    if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return null;

    const left = `${(point.x / img.naturalWidth) * 100}%`;
    const top = `${(point.y / img.naturalHeight) * 100}%`;
    const isForeground = point.label === FOREGROUND_LABEL;

    return (
      <span
        key={`${pending ? "pending" : "point"}-${index}-${point.x}-${point.y}-${point.label}`}
        className="pointer-events-none absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2"
        style={{ left, top }}
      >
        <span
          className={[
            "absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-sm",
            isForeground ? "bg-blue-600" : "bg-red-500",
            pending ? "ring-2 ring-white/70" : "",
          ].join(" ")}
        />
        {isForeground ? (
          <>
            <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-blue-600 shadow-[0_0_0_1px_white]" />
            <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-blue-600 shadow-[0_0_0_1px_white]" />
          </>
        ) : (
          <>
            <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-500 shadow-[0_0_0_1px_white]" />
            <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-500 shadow-[0_0_0_1px_white]" />
          </>
        )}
      </span>
    );
  };

  const handleFramesSelected = (indices: number[]): void => {
    const selectedIndices = new Set(indices);
    setFrames(prev =>
      prev.map(frame => {
        const shouldSelect = selectedIndices.has(frame.index);
        return frame.selected === shouldSelect ? frame : { ...frame, selected: shouldSelect };
      })
    );
  };

  const handleDownload = (): void => {
    download();
  };

  const handleArtifactsGenerated = (result: FinalArtifacts): void => {
    setArtifacts(result);
    setRecommendedColumns(result.spriteColumns);
    setSpriteColumns(result.spriteColumns);
    setFormat("zip");
  };

  useEffect(() => {
    if (!artifacts) return;
    if (spriteColumns === artifacts.spriteColumns) return;

    let cancelled = false;
    setRegenerateColumns(true);
    void (async () => {
      try {
        const nextSpriteUrl = await generateSpriteSheetFromBlobs(
          artifacts.materialized.blobs,
          artifacts.materialized.width,
          artifacts.materialized.height,
          spriteColumns,
        );
        if (cancelled) {
          URL.revokeObjectURL(nextSpriteUrl);
          return;
        }
        const previousSpriteUrl = artifacts.spriteUrl;
        setArtifacts({ ...artifacts, spriteUrl: nextSpriteUrl, spriteColumns });
        URL.revokeObjectURL(previousSpriteUrl);
      } finally {
        if (!cancelled) setRegenerateColumns(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [spriteColumns, artifacts]);

  const handleDownloadArtifact = (): void => {
    if (!artifacts) return;
    const a = document.createElement("a");
    if (format === "zip") {
      a.href = artifacts.zipUrl;
      a.download = "frames.zip";
    } else {
      a.href = artifacts.spriteUrl;
      a.download = "sprite_sheet.png";
    }
    a.click();
  };

  const handleSaveArtifact = (): void => {
    if (!artifacts) return;
    onArtifactSaved?.({
      format,
      artifactUrl: format === "zip" ? artifacts.zipUrl : artifacts.spriteUrl,
      gifPreviewUrl: artifacts.gifUrl,
      frameCount: artifacts.frameCount,
      fps: artifacts.fps,
      spriteColumns: artifacts.spriteColumns,
      backgroundColor: artifacts.backgroundColor,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-2xl flex items-center justify-center shadow-sm">
            <span className="text-2xl">🎬</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">序列帧提取</h1>
            <p className="text-sm text-gray-500">SAM2 Video Segmentation</p>
          </div>
        </div>
        <p className="text-gray-600 ml-15">
          上传视频，通过后端 SAM2 服务交互式选择目标并提取透明序列帧。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：视频标注区域（缩小）+ 帧画廊 */}
        <div className="space-y-4">
          {/* SAM2 操作区域 - 缩小版本 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4 card-elevated">
            {status === "idle" && !suppressUploader && (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-bounce px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                  上传视频
                </button>
                <p className="text-xs text-gray-500 mt-2">支持 MP4、AVI、MOV、WEBM 格式</p>
              </div>
            )}

            {status === "idle" && suppressUploader && (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50">
                <p className="text-sm text-gray-600">请先使用上方共享视频入口上传素材</p>
                <p className="text-xs text-gray-500 mt-2">SAM2 路线会自动接收共享视频</p>
              </div>
            )}

            {status === "uploading" && (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full mx-auto" />
                <p className="mt-3 text-gray-600 text-sm font-medium">正在上传视频...</p>
              </div>
            )}

            {(status === "ready" || status === "processing" || status === "completed") && (
              <div className="space-y-3">
                {videoInfo && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 text-xs border border-blue-100">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                      </svg>
                      <span className="font-medium text-gray-900 text-xs">{videoInfo.filename}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-600 text-xs">
                      <span>{videoInfo.duration_seconds.toFixed(1)}秒</span>
                      <span>FPS: {videoInfo.fps}</span>
                      <span>{videoInfo.total_frames}帧</span>
                    </div>
                  </div>
                )}

                {status === "ready" && (
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                      <p className="text-xs text-gray-600">
                        左键选目标，右键排除区域
                      </p>
                    </div>
                    <div className="relative rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                      <img
                        ref={imageRef}
                        src={firstFrameUrl || undefined}
                        alt="First frame"
                        onClick={handleImageClick}
                        onContextMenu={handleContextMenu}
                        className="block w-full cursor-crosshair select-none"
                      />
                      {displayMaskUrl && (
                        <img
                          src={displayMaskUrl}
                          alt="Mask preview"
                          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain opacity-80 transition-opacity duration-150"
                        />
                      )}
                      {[...points, ...(pendingPoint ? [pendingPoint] : [])].map((point, index) =>
                        renderPointMarker(point, index, point === pendingPoint)
                      )}
                      {(pendingPoint || maskLoading) && (
                        <div className="pointer-events-none absolute right-2 top-2 z-30 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white">
                          {pendingPoint ? "识别中..." : "更新预览..."}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-500">
                        已选 <span className="font-medium text-gray-900">{points.length}</span> 点
                        <span className="text-gray-400 mx-1">•</span>
                        前景: <span className="text-blue-600 font-medium">{points.filter(p => p.label === FOREGROUND_LABEL).length}</span>
                        <span className="text-gray-400 mx-1">•</span>
                        背景: <span className="text-red-500 font-medium">{points.filter(p => p.label === BACKGROUND_LABEL).length}</span>
                      </p>
                    </div>
                  </div>
                )}

                {status === "ready" && (
                  <div className="flex gap-2">
                      <button
                        onClick={undo}
                      disabled={points.length === 0 || !!pendingPoint}
                      className="btn-bounce px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      撤销
                    </button>
                      <button
                        onClick={reset}
                      disabled={points.length === 0 || !!pendingPoint}
                      className="btn-bounce px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      重置
                    </button>
                      <button
                        onClick={handleGenerate}
                      disabled={points.length === 0 || !!pendingPoint || maskLoading}
                      className="btn-bounce flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-200"
                    >
                      开始提取序列帧
                    </button>
                  </div>
                )}

                {status === "processing" && (
                  <div className="space-y-2 py-3">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 ease-out"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-blue-100 border-t-blue-600 rounded-full"></div>
                      <p className="text-center text-gray-600 text-sm font-medium">
                        处理中... {(progress * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                )}

                {status === "completed" && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-green-800 font-bold text-sm">提取完成！</p>
                        <p className="text-green-700 text-xs">共 {frameCount} 帧</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleDownload}
                        className="btn-bounce flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                      >
                        下载 ZIP
                      </button>
                      <button
                        onClick={handleShowFrames}
                        className="btn-bounce px-4 py-2 bg-white border-2 border-green-300 text-green-700 hover:bg-green-50 text-sm font-medium rounded-lg transition-colors"
                      >
                        {showFrameGallery ? '隐藏' : '展示'}帧
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-red-800 font-medium text-xs">处理失败</p>
                    <p className="text-red-700 text-xs mt-0.5">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 帧画廊 */}
          {showFrameGallery && frames.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <FrameGallery
                frames={frames}
                onToggleFrame={handleToggleFrame}
                onSelectRange={handleSelectFrameRange}
                onClearSelection={handleClearSelection}
              />
            </div>
          )}
        </div>

        {/* 右侧：循环控制 + GIF 预览 + 格式选择 + 下载按钮 */}
        {showFrameGallery && frames.length > 0 && (
          <div className="space-y-4">
            {/* 循环控制面板 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <LoopControlPanel
                frames={frames}
                onFramesSelected={handleFramesSelected}
                previewFps={previewFps}
                onPreviewFpsChange={setPreviewFps}
                previewBackground={previewBackground}
                onPreviewBackgroundChange={setPreviewBackground}
                onArtifactsGenerated={handleArtifactsGenerated}
              />
            </div>

            {/* GIF 预览区域 */}
            {artifacts && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-gray-900">循环预览 (GIF)</h4>
                  <div className="text-xs text-gray-500">
                    {artifacts.frameCount} 帧 · {artifacts.fps} FPS
                  </div>
                </div>
                <div
                  className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg border border-gray-200"
                  style={{ backgroundColor: artifacts.backgroundColor }}
                >
                  <img src={artifacts.gifUrl} alt="Loop preview" className="max-h-[300px] w-auto" />
                </div>
                <p className="text-xs text-gray-500">
                  GIF / Sprite / ZIP 共享同一份最终帧字节。修改 FPS 或背景色后请重新生成。
                </p>
              </div>
            )}

            {/* 最终产物格式选择 */}
            {artifacts && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
                <h4 className="font-semibold text-gray-900">最终产物格式</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat("zip")}
                    className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                      format === "zip"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-medium">PNG 序列帧</div>
                    <div className="mt-1 text-xs text-gray-500">每帧独立 PNG，打包 ZIP</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat("sprite")}
                    className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                      format === "sprite"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-medium">横向精灵图</div>
                    <div className="mt-1 text-xs text-gray-500">单张拼接 PNG</div>
                  </button>
                </div>

                {format === "sprite" && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-gray-700">列数</span>
                      <input
                        type="number"
                        value={spriteColumns}
                        min={1}
                        max={artifacts.frameCount}
                        disabled={regenerateColumns}
                        onChange={(event) => {
                          const next = Math.max(
                            1,
                            Math.min(artifacts.frameCount, Number.parseInt(event.target.value, 10) || 1),
                          );
                          setSpriteColumns(next);
                        }}
                        className="h-9 w-24 rounded-md border border-gray-300 px-2 text-sm focus:border-blue-600 focus:outline-none disabled:opacity-50"
                      />
                    </label>
                    <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                      <span>
                        推荐 {recommendedColumns} 列 (约 {Math.ceil(artifacts.frameCount / recommendedColumns)} 行)
                      </span>
                      <button
                        type="button"
                        onClick={() => setSpriteColumns(recommendedColumns)}
                        disabled={regenerateColumns || spriteColumns === recommendedColumns}
                        className="text-blue-600 hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        使用推荐
                      </button>
                    </div>
                    {regenerateColumns && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                        正在按新列数重新生成精灵图...
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={handleDownloadArtifact}
                    disabled={regenerateColumns}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {format === "zip" ? "下载 PNG 序列帧 (ZIP)" : "下载横向精灵图 (PNG)"}
                  </button>
                  <button
                    onClick={handleSaveArtifact}
                    disabled={regenerateColumns}
                    className="w-full px-4 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    保存为动作结果
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
