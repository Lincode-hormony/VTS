import { useRef, useState, useEffect } from "react";
import type React from "react";
import { useSam2 } from "../hooks/useSam2";
import { FrameGallery } from "./FrameGallery";
import { LoopControlPanel } from "./LoopControlPanel";
import type { FrameData } from "../utils/frameProcessor";

const FOREGROUND_LABEL = 1 as const;
const BACKGROUND_LABEL = 0 as const;

const TOOL_INFO = {
  name: '序列帧提取',
  description: 'SAM2 Video Segmentation',
  emoji: '🎬',
} as const;

export function ToolWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [frames, setFrames] = useState<FrameData[]>([]);
  const [showFrameGallery, setShowFrameGallery] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);

  const {
    status,
    progress,
    points,
    frameCount,
    error,
    videoInfo,
    frames: apiFrames,
    upload,
    click,
    undo,
    reset,
    generate,
    download,
    getFirstFrameUrl,
    getMaskUrl,
  } = useSam2();

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFrames([]);
    setShowFrameGallery(false);
    await upload(file);
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

    const img = imageRef.current;
    if (!img) return;

    const { x, y } = calculateImageCoordinates(e, img);
    await click(x, y, FOREGROUND_LABEL);
  };

  const handleContextMenu = async (e: React.MouseEvent<HTMLImageElement>): Promise<void> => {
    e.preventDefault();
    if (status !== "ready") return;

    const img = imageRef.current;
    if (!img) return;

    const { x, y } = calculateImageCoordinates(e, img);
    await click(x, y, BACKGROUND_LABEL);
  };

  const handleGenerate = async (): Promise<void> => {
    await generate();
  };

  const handleShowFrames = (): void => {
    setShowFrameGallery(!showFrameGallery);
  };

  const handleToggleFrame = (index: number): void => {
    setFrames(prev =>
      prev.map(frame =>
        frame.index === index ? { ...frame, selected: !frame.selected } : frame
      )
    );
  };

  const handleClearSelection = (): void => {
    setFrames(prev => prev.map(frame => ({ ...frame, selected: false })));
  };

  const handleFramesSelected = (indices: number[]): void => {
    setFrames(prev =>
      prev.map(frame => ({
        ...frame,
        selected: indices.includes(frame.index)
      }))
    );
  };

  const handleDownload = (): void => {
    download();
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
            {status === "idle" && (
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
                        src={points.length > 0 ? getMaskUrl() || undefined : getFirstFrameUrl() || undefined}
                        alt="First frame"
                        onClick={handleImageClick}
                        onContextMenu={handleContextMenu}
                        className="w-full cursor-crosshair"
                      />
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
                      disabled={points.length === 0}
                      className="btn-bounce px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      撤销
                    </button>
                    <button
                      onClick={reset}
                      disabled={points.length === 0}
                      className="btn-bounce px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      重置
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={points.length === 0}
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
                onClearSelection={handleClearSelection}
              />
            </div>
          )}
        </div>

        {/* 右侧：循环控制 + GIF 预览 + 下载按钮 */}
        {showFrameGallery && frames.length > 0 && (
          <div className="space-y-4">
            {/* 循环控制面板 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <LoopControlPanel
                frames={frames}
                onFramesSelected={handleFramesSelected}
                onPreviewGenerated={(previewUrl, spriteUrl) => {
                  setPreviewUrl(previewUrl);
                  setSpriteUrl(spriteUrl);
                }}
              />
            </div>

            {/* GIF 预览区域 */}
            {previewUrl && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <h4 className="font-semibold text-gray-900 mb-3">循环预览</h4>
                <div className="rounded-lg overflow-hidden border border-gray-200 max-h-[300px] flex items-center justify-center bg-gray-50">
                  <img src={previewUrl} alt="Loop preview" className="max-h-[300px] w-auto" />
                </div>
              </div>
            )}

            {/* 下载精灵图按钮 */}
            {spriteUrl && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = spriteUrl;
                    a.download = 'sprite_sheet.png';
                    a.click();
                  }}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  下载精灵图
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
