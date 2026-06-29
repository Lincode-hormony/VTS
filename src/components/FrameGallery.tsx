import { memo, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { FrameData } from "../utils/frameProcessor";

interface FrameGalleryProps {
  frames: FrameData[];
  onToggleFrame: (index: number) => void;
  onSelectRange: (startIndex: number, endIndex: number) => void;
  onClearSelection: () => void;
}

const INITIAL_VISIBLE_COUNT = 120;
const VISIBLE_STEP = 120;

export function FrameGallery({ frames, onToggleFrame, onSelectRange, onClearSelection }: FrameGalleryProps) {
  const [rangeStart, setRangeStart] = useState(() => frames[0]?.index ?? 0);
  const [rangeEnd, setRangeEnd] = useState(() => frames[Math.min(frames.length - 1, 96)]?.index ?? frames[0]?.index ?? 0);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  const selectedCount = useMemo(() => frames.reduce((count, frame) => count + (frame.selected ? 1 : 0), 0), [frames]);
  const visibleFrames = useMemo(() => frames.slice(0, visibleCount), [frames, visibleCount]);
  const minFrameIndex = frames[0]?.index ?? 0;
  const maxFrameIndex = frames[frames.length - 1]?.index ?? 0;

  const applyRange = () => {
    const start = Math.max(minFrameIndex, Math.min(rangeStart, rangeEnd));
    const end = Math.min(maxFrameIndex, Math.max(rangeStart, rangeEnd));
    onSelectRange(start, end);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">帧选择</h3>
          <p className="text-sm text-gray-500">
            已选择 <span className="font-medium text-blue-600">{selectedCount}</span> / {frames.length} 帧
          </p>
        </div>
        {selectedCount > 0 && (
          <button
            onClick={onClearSelection}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200"
          >
            清空选择
          </button>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="text-xs font-medium text-blue-800">起始帧</span>
            <input
              type="number"
              value={rangeStart}
              min={minFrameIndex}
              max={maxFrameIndex}
              onChange={(event) => setRangeStart(Number.parseInt(event.target.value, 10) || minFrameIndex)}
              className="mt-1 h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm focus:border-blue-600 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-blue-800">结束帧</span>
            <input
              type="number"
              value={rangeEnd}
              min={minFrameIndex}
              max={maxFrameIndex}
              onChange={(event) => setRangeEnd(Number.parseInt(event.target.value, 10) || minFrameIndex)}
              className="mt-1 h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm focus:border-blue-600 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={applyRange}
            className="h-10 self-end rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            选择范围
          </button>
        </div>
        <p className="mt-2 text-xs text-blue-700">输入两个数字即可选中连续片段，不需要逐帧点击。</p>
      </div>

      <div className="grid max-h-96 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 md:grid-cols-8">
        {visibleFrames.map((frame) => (
          <FrameTile key={frame.index} frame={frame} onToggle={onToggleFrame} />
        ))}
      </div>

      {visibleCount < frames.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => Math.min(frames.length, count + VISIBLE_STEP))}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          显示更多帧（{visibleCount}/{frames.length}）
        </button>
      )}
    </div>
  );
}

const FrameTile = memo(function FrameTile(props: { frame: FrameData; onToggle: (index: number) => void }) {
  const { frame, onToggle } = props;

  return (
    <button
      type="button"
      onClick={() => onToggle(frame.index)}
      className={`
        relative aspect-square overflow-hidden rounded-lg border-2 text-left transition-colors
        ${frame.selected ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-300"}
      `}
    >
      <img
        src={frame.url}
        alt={`Frame ${frame.index}`}
        className="h-full w-full object-cover"
        crossOrigin="anonymous"
        loading="lazy"
        decoding="async"
      />

      <div className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
        #{frame.index}
      </div>

      {frame.selected && (
        <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
          <Check size={12} className="text-white" />
        </div>
      )}
    </button>
  );
});
