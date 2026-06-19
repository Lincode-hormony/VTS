import { Check } from 'lucide-react';
import type { FrameData } from '../utils/frameProcessor';

interface FrameGalleryProps {
  frames: FrameData[];
  onToggleFrame: (index: number) => void;
  onClearSelection: () => void;
}

export function FrameGallery({ frames, onToggleFrame, onClearSelection }: FrameGalleryProps) {
  const selectedCount = frames.filter(f => f.selected).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">帧选择</h3>
          <p className="text-sm text-gray-500">
            已选择 <span className="font-medium text-blue-600">{selectedCount}</span> / {frames.length} 帧
          </p>
        </div>
        {selectedCount > 0 && (
          <button
            onClick={onClearSelection}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            清空选择
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-96 overflow-y-auto">
        {frames.map((frame) => (
          <div
            key={frame.index}
            onClick={() => onToggleFrame(frame.index)}
            className={`
              relative aspect-square rounded-lg overflow-hidden cursor-pointer
              border-2 transition-all hover:scale-105
              ${frame.selected
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300'
              }
            `}
          >
            <img
              src={frame.url}
              alt={`Frame ${frame.index}`}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />

            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/50 text-white text-xs rounded">
              #{frame.index}
            </div>

            {frame.selected && (
              <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <Check size={12} className="text-white" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
