import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import type { FrameData } from '../utils/frameProcessor';
import { findBestLoop, generateLoopPreview, generateSpriteSheet } from '../utils/frameProcessor';

interface LoopControlPanelProps {
  frames: FrameData[];
  onFramesSelected: (indices: number[]) => void;
  onPreviewGenerated?: (previewUrl: string, spriteUrl: string) => void;
}

const DEFAULT_MIN_SPAN = 8;
const DEFAULT_MAX_SPAN = 48;

export function LoopControlPanel({ frames, onFramesSelected, onPreviewGenerated }: LoopControlPanelProps) {
  const [detecting, setDetecting] = useState(false);
  const [loopResult, setLoopResult] = useState<string | null>(null);
  const [minSpan, setMinSpan] = useState(DEFAULT_MIN_SPAN);
  const [maxSpan, setMaxSpan] = useState(DEFAULT_MAX_SPAN);
  const [pingpong, setPingpong] = useState(true);

  const handleAutoLoop = async (): Promise<void> => {
    setDetecting(true);
    setLoopResult('正在检测最佳闭环...');

    try {
      const indices = await findBestLoop(frames, minSpan, maxSpan);

      if (indices.length === 0) {
        setLoopResult(`未找到 ${minSpan}-${maxSpan} 帧长度的闭环，请尝试调整范围`);
        return;
      }

      onFramesSelected(indices);

      const selectedFrames = frames.filter(f => indices.includes(f.index));
      const preview = await generateLoopPreview(selectedFrames, 12, pingpong);
      const sprite = await generateSpriteSheet(selectedFrames, 4);

      if (onPreviewGenerated) {
        onPreviewGenerated(preview, sprite);
      }

      setLoopResult(`找到闭环：帧 ${indices[0]} → ${indices[indices.length - 1]}，共 ${indices.length} 帧`);
    } catch (error) {
      setLoopResult(`检测失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleGeneratePreview = async (): Promise<void> => {
    const selectedFrames = frames.filter(f => f.selected);

    if (selectedFrames.length < 2) {
      alert('请至少选择 2 帧');
      return;
    }

    try {
      const preview = await generateLoopPreview(selectedFrames, 12, pingpong);
      const sprite = await generateSpriteSheet(selectedFrames, 4);

      if (onPreviewGenerated) {
        onPreviewGenerated(preview, sprite);
      }
    } catch (error) {
      alert(`生成失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* 自动闭环按钮 */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold text-purple-900 flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              自动闭环检测
            </h4>
            <p className="text-xs text-purple-700 mt-1">
              自动找到最相似的起始和结束帧，形成循环动画
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-purple-700 block mb-1">最小长度</label>
            <input
              type="number"
              value={minSpan}
              onChange={(e) => setMinSpan(Math.max(2, parseInt(e.target.value) || 2))}
              className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
              min={2}
            />
          </div>
          <div>
            <label className="text-xs text-purple-700 block mb-1">最大长度</label>
            <input
              type="number"
              value={maxSpan}
              onChange={(e) => setMaxSpan(Math.max(minSpan, parseInt(e.target.value) || minSpan))}
              className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
              min={2}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            id="pingpong"
            checked={pingpong}
            onChange={(e) => setPingpong(e.target.checked)}
            className="w-4 h-4 text-purple-600 rounded"
          />
          <label htmlFor="pingpong" className="text-sm text-purple-700">
            Ping-Pong 往返循环
          </label>
        </div>

        <button
          onClick={handleAutoLoop}
          disabled={detecting || frames.length === 0}
          className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Wand2 className="w-4 h-4" />
          {detecting ? '检测中...' : '一键找闭环'}
        </button>

        {loopResult && (
          <div className={`mt-3 text-sm p-2 rounded-lg ${
            loopResult.includes('未找到') || loopResult.includes('失败')
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
          }`}>
            {loopResult}
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-3">手动生成预览</h4>
        <p className="text-xs text-gray-500 mb-3">
          选择至少 2 帧后生成循环预览和精灵图
        </p>
        <button
          onClick={handleGeneratePreview}
          disabled={frames.filter(f => f.selected).length < 2}
          className="w-full px-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          生成预览和精灵图
        </button>
      </div>
    </div>
  );
}
