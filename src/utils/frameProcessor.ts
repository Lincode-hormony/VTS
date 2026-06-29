import JSZip from 'jszip';

export interface FrameData {
  index: number;
  url: string;
  selected: boolean;
  feature?: Float32Array;
  name?: string;
  blob?: Blob;
}

export interface LoopResult {
  frames: FrameData[];
  startIndex: number;
  endIndex: number;
  previewUrl?: string;
}

export interface SegmentFrameOptions {
  startTime: number;
  endTime: number;
  fps?: number;
}

export type ProgressCallback = (message: string, progress?: number) => void;

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function unzipFrames(zipBlob: Blob): Promise<FrameData[]> {
  const zip = await JSZip.loadAsync(zipBlob);
  const frames: FrameData[] = [];

  const files = Object.keys(zip.files)
    .filter(name => name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg'))
    .sort();

  for (const filename of files) {
    const blob = await zip.files[filename].async('blob');
    const url = URL.createObjectURL(blob);

    const match = filename.match(/frame_(\d+)/);
    const index = match ? parseInt(match[1]) : frames.length;

    frames.push({
      index,
      name: filename,
      url,
      blob,
      selected: false,
    });
  }

  return frames.sort((a, b) => a.index - b.index);
}

export async function computeFrameFeature(imageUrl: string, size = 48): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);

      const feature = new Float32Array(size * size * 4);
      let pixelCount = 0;

      for (let i = 0; i < imageData.data.length; i += 4) {
        const alpha = imageData.data[i + 3];
        if (alpha > 128) {
          const pixelIndex = pixelCount * 4;
          feature[pixelIndex] = imageData.data[i] / 255;
          feature[pixelIndex + 1] = imageData.data[i + 1] / 255;
          feature[pixelIndex + 2] = imageData.data[i + 2] / 255;
          feature[pixelIndex + 3] = alpha / 255;
          pixelCount++;
        }
      }

      if (pixelCount < 10) {
        for (let i = 0; i < imageData.data.length; i += 4) {
          const pixelIndex = (i / 4) * 4;
          feature[pixelIndex] = imageData.data[i] / 255;
          feature[pixelIndex + 1] = imageData.data[i + 1] / 255;
          feature[pixelIndex + 2] = imageData.data[i + 2] / 255;
          feature[pixelIndex + 3] = imageData.data[i + 3] / 255;
        }
        resolve(feature);
      } else {
        resolve(feature.subarray(0, pixelCount * 4));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

function featureDifference(feature1: Float32Array, feature2: Float32Array): number {
  const minLen = Math.min(feature1.length, feature2.length);
  let sum = 0;
  for (let i = 0; i < minLen; i++) {
    const diff = feature1[i] - feature2[i];
    sum += diff * diff;
  }
  return sum / minLen;
}

export async function findBestLoop(
  frames: FrameData[],
  minSpan: number = 8,
  maxSpan: number = 48,
  onProgress?: ProgressCallback
): Promise<number[]> {
  if (frames.length < Math.max(2, minSpan)) {
    return [];
  }

  const framesWithFeatures: FrameData[] = [];

  for (let i = 0; i < frames.length; i++) {
    onProgress?.(`正在提取帧特征 ${i + 1}/${frames.length}`, (i + 1) / frames.length * 0.65);
    framesWithFeatures.push({
      ...frames[i],
      feature: await computeFrameFeature(frames[i].url),
    });

    if (i % 2 === 0) {
      await yieldToBrowser();
    }
  }

  let bestScore = Infinity;
  let bestPair: [number, number] | null = null;
  const totalStarts = framesWithFeatures.length - minSpan + 1;

  for (let start = 0; start < framesWithFeatures.length - minSpan + 1; start++) {
    const startFeature = framesWithFeatures[start].feature;
    if (!startFeature) continue;

    if (start % 2 === 0) {
      onProgress?.(`正在比较候选闭环 ${start + 1}/${totalStarts}`, 0.65 + (start / totalStarts) * 0.35);
      await yieldToBrowser();
    }

    for (let end = start + minSpan - 1; end < framesWithFeatures.length; end++) {
      const span = end - start + 1;
      if (span > maxSpan) break;

      const endFeature = framesWithFeatures[end].feature;
      if (!endFeature) continue;

      const score = featureDifference(startFeature, endFeature);
      const penalty = 1.0 + 5e-4 * (span - minSpan);
      const adjustedScore = score * penalty;

      if (adjustedScore < bestScore) {
        bestScore = adjustedScore;
        bestPair = [start, end];
      }
    }
  }

  if (!bestPair) {
    return [];
  }

  const [startPos, endPos] = bestPair;
  return Array.from(
    { length: endPos - startPos + 1 },
    (_, i) => framesWithFeatures[startPos + i].index
  );
}

export interface MaterializedFrames {
  blobs: Blob[];
  width: number;
  height: number;
}

export async function materializeFinalFrames(
  frames: FrameData[],
  onProgress?: ProgressCallback
): Promise<MaterializedFrames> {
  if (frames.length === 0) {
    return { blobs: [], width: 0, height: 0 };
  }

  onProgress?.("正在拉取最终帧字节", 0.02);
  const blobs: Blob[] = [];
  for (let i = 0; i < frames.length; i++) {
    const blob = frames[i].blob ?? (await fetchImage(frames[i].url));
    blobs.push(blob);
    onProgress?.(`正在拉取最终帧字节 ${i + 1}/${frames.length}`, ((i + 1) / frames.length) * 0.95);
    if (i % 4 === 0) {
      await yieldToBrowser();
    }
  }

  const firstImg = await createImageFromBlob(blobs[0]);
  onProgress?.("最终帧准备完毕", 1);
  return { blobs, width: firstImg.width, height: firstImg.height };
}

export function recommendSpriteColumns(
  frameCount: number,
  frameWidth: number,
  frameHeight: number
): number {
  if (frameCount <= 1) return 1;
  if (frameWidth <= 0 || frameHeight <= 0) return Math.min(frameCount, 8);

  const targetCols = Math.sqrt((frameCount * frameHeight) / frameWidth);
  const rounded = Math.max(1, Math.round(targetCols));
  return Math.min(rounded, frameCount);
}

export async function generateLoopPreviewFromBlobs(
  blobs: Blob[],
  width: number,
  height: number,
  fps: number = 12,
  backgroundColor: string = "#ffffff",
  onProgress?: ProgressCallback
): Promise<string> {
  if (blobs.length === 0) return '';

  onProgress?.('正在加载 GIF 编码器', 0.05);
  const gifencModule = await import('gifenc');
  const GIFEncoder = (gifencModule as any).GIFEncoder || gifencModule.default;
  const quantize = (gifencModule as any).quantize;
  const applyPalette = (gifencModule as any).applyPalette;

  const gif = GIFEncoder({ width, height, loops: 0 });

  const images: HTMLImageElement[] = [];
  for (let i = 0; i < blobs.length; i++) {
    images.push(await createImageFromBlob(blobs[i]));
    onProgress?.(`正在加载预览帧 ${i + 1}/${blobs.length}`, 0.05 + ((i + 1) / blobs.length) * 0.4);
    if (i % 4 === 0) {
      await yieldToBrowser();
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(images[0], 0, 0);
  const firstImageData = ctx.getImageData(0, 0, width, height);
  onProgress?.('正在生成调色板', 0.5);
  const globalPalette = quantize(firstImageData.data, 256);
  const firstIndexedFrame = applyPalette(firstImageData.data, globalPalette);

  const delay = Math.round(1000 / fps);
  const disposal = 2;

  gif.writeFrame(firstIndexedFrame, width, height, { palette: globalPalette, delay, disposal });

  for (let i = 1; i < images.length; i++) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(images[i], 0, 0);
    const frameData = ctx.getImageData(0, 0, width, height);
    const indexedFrame = applyPalette(frameData.data, globalPalette);
    gif.writeFrame(indexedFrame, width, height, { delay, disposal });

    onProgress?.(`正在编码 GIF ${i + 1}/${images.length}`, 0.5 + ((i + 1) / images.length) * 0.45);
    if (i % 3 === 0) {
      await yieldToBrowser();
    }
  }

  gif.finish();

  const blob = new Blob([gif.bytes()], { type: 'image/gif' });
  onProgress?.('预览已生成', 1);
  return URL.createObjectURL(blob);
}

export async function generateSpriteSheetFromBlobs(
  blobs: Blob[],
  frameWidth: number,
  frameHeight: number,
  columns: number,
  onProgress?: ProgressCallback
): Promise<string> {
  if (blobs.length === 0) return '';

  const safeColumns = Math.max(1, Math.min(columns, blobs.length));
  const rows = Math.ceil(blobs.length / safeColumns);

  onProgress?.('正在准备精灵图', 0.05);
  const canvas = document.createElement('canvas');
  canvas.width = safeColumns * frameWidth;
  canvas.height = rows * frameHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  for (let i = 0; i < blobs.length; i++) {
    const img = await createImageFromBlob(blobs[i]);
    const row = Math.floor(i / safeColumns);
    const col = i % safeColumns;
    ctx.drawImage(img, col * frameWidth, row * frameHeight);

    onProgress?.(`正在绘制精灵图 ${i + 1}/${blobs.length}`, 0.05 + ((i + 1) / blobs.length) * 0.9);
    if (i % 4 === 0) {
      await yieldToBrowser();
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        onProgress?.('精灵图已生成', 1);
        resolve(url);
      } else {
        reject(new Error('Failed to generate sprite sheet blob'));
      }
    }, 'image/png');
  });
}

export async function buildFramesZipUrl(
  blobs: Blob[],
  onProgress?: ProgressCallback
): Promise<string> {
  if (blobs.length === 0) return '';

  onProgress?.('正在打包 PNG 序列帧', 0.05);
  const zip = new JSZip();

  const pad = Math.max(3, String(blobs.length).length);
  for (let i = 0; i < blobs.length; i++) {
    zip.file(`frame_${String(i + 1).padStart(pad, '0')}.png`, blobs[i]);
    onProgress?.(`正在打包 ${i + 1}/${blobs.length}`, 0.05 + ((i + 1) / blobs.length) * 0.85);
    if (i % 8 === 0) {
      await yieldToBrowser();
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  onProgress?.('ZIP 已生成', 1);
  return URL.createObjectURL(zipBlob);
}

async function fetchImage(url: string): Promise<Blob> {
  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  return response.blob();
}

function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image from blob'));
    };
    img.src = url;
  });
}

export function revokeFrameUrls(frames: FrameData[]): void {
  frames.forEach(frame => URL.revokeObjectURL(frame.url));
}

export async function extractVideoFrames(
  videoFile: File,
  options: SegmentFrameOptions,
  onProgress?: ProgressCallback
): Promise<FrameData[]> {
  const { startTime, endTime, fps = 30 } = options;
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(videoFile);

  try {
    await waitForEvent(video, "loadedmetadata");
    const safeStart = Math.max(0, Math.min(startTime, endTime));
    const safeEnd = Math.max(safeStart, Math.max(startTime, endTime));
    const totalDuration = Math.max(0.01, safeEnd - safeStart);
    const targetFrames = Math.max(1, Math.round(totalDuration * fps));
    const frameTimes = Array.from({ length: targetFrames }, (_, i) => safeStart + (i / targetFrames) * totalDuration);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas 上下文");

    const results: FrameData[] = [];
    for (let i = 0; i < frameTimes.length; i++) {
      const time = frameTimes[i];
      onProgress?.(`正在提取片段帧 ${i + 1}/${frameTimes.length}`, (i / frameTimes.length) * 0.7);
      await seekVideo(video, time);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((output) => {
          if (output) resolve(output);
          else reject(new Error("无法生成视频帧图片"));
        }, "image/png");
      });

      results.push({
        index: i,
        url: URL.createObjectURL(blob),
        selected: false,
        blob,
      });

      if (i % 3 === 0) {
        await yieldToBrowser();
      }
    }

    onProgress?.("片段帧提取完成", 1);
    return results;
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

export async function applyChromaKeyToFrames(
  frames: FrameData[],
  options: {
    backgroundColor: string;
    tolerance?: number;
  },
  onProgress?: ProgressCallback
): Promise<FrameData[]> {
  const tolerance = options.tolerance ?? 24;
  const target = parseHexColor(options.backgroundColor);
  const processed: FrameData[] = [];

  for (let i = 0; i < frames.length; i++) {
    onProgress?.(`正在抠图 ${i + 1}/${frames.length}`, (i / frames.length) * 0.9);
    const blob = await fetch(frames[i].url).then((r) => r.blob());
    const img = await createImageFromBlob(blob);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas 上下文");

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let p = 0; p < data.length; p += 4) {
      const distance = colorDistance(
        data[p]!,
        data[p + 1]!,
        data[p + 2]!,
        target.r,
        target.g,
        target.b
      );

      if (distance < tolerance) {
        data[p + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const processedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => {
        if (output) resolve(output);
        else reject(new Error("无法生成抠图结果"));
      }, "image/png");
    });

    processed.push({
      ...frames[i],
      url: URL.createObjectURL(processedBlob),
      blob: processedBlob,
    });

    if (i % 3 === 0) {
      await yieldToBrowser();
    }
  }

  onProgress?.("抠图完成", 1);
  return processed;
}

function waitForEvent(target: EventTarget, eventName: string): Promise<void> {
  return new Promise((resolve) => {
    target.addEventListener(eventName, () => resolve(), { once: true });
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("视频跳转失败"));
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = time;
  });
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((ch) => ch + ch).join("")
    : normalized;
  const int = Number.parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
