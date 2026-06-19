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

export async function computeFrameFeature(imageUrl: string, size = 64): Promise<Float32Array> {
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
  maxSpan: number = 48
): Promise<number[]> {
  if (frames.length < Math.max(2, minSpan)) {
    return [];
  }

  const framesWithFeatures = await Promise.all(
    frames.map(async (frame) => ({
      ...frame,
      feature: await computeFrameFeature(frame.url),
    }))
  );

  let bestScore = Infinity;
  let bestPair: [number, number] | null = null;

  for (let start = 0; start < framesWithFeatures.length - minSpan + 1; start++) {
    const startFeature = framesWithFeatures[start].feature;
    if (!startFeature) continue;

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

export async function generateLoopPreview(
  frames: FrameData[],
  fps: number = 12,
  pingpong: boolean = false
): Promise<string> {
  if (frames.length === 0) return '';

  let loopFrames = frames;
  if (pingpong && frames.length > 1) {
    loopFrames = [...frames, ...frames.slice(0, -1).reverse()];
  }

  const firstImg = await loadImage(loopFrames[0].url);
  const width = firstImg.width;
  const height = firstImg.height;

  const gifencModule = await import('gifenc');
  const GIFEncoder = (gifencModule as any).GIFEncoder || gifencModule.default;
  const quantize = (gifencModule as any).quantize;
  const applyPalette = (gifencModule as any).applyPalette;

  const gif = GIFEncoder({
    width,
    height,
    loops: 0,
  });

  const images = await Promise.all(loopFrames.map(f => loadImage(f.url)));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(images[0], 0, 0);
  const firstImageData = ctx.getImageData(0, 0, width, height);
  const globalPalette = quantize(firstImageData.data, 256);
  const firstIndexedFrame = applyPalette(firstImageData.data, globalPalette);

  const delay = Math.round(1000 / fps);
  const disposal = 2;

  gif.writeFrame(firstIndexedFrame, width, height, {
    palette: globalPalette,
    delay,
    disposal
  });

  for (let i = 1; i < images.length; i++) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(images[i], 0, 0);
    const frameData = ctx.getImageData(0, 0, width, height);
    const indexedFrame = applyPalette(frameData.data, globalPalette);
    gif.writeFrame(indexedFrame, width, height, { delay, disposal });
  }

  gif.finish();

  const blob = new Blob([gif.bytes()], { type: 'image/gif' });
  return URL.createObjectURL(blob);
}

export async function generateSpriteSheet(
  frames: FrameData[],
  columns: number = 4
): Promise<string> {
  if (frames.length === 0) return '';

  const firstBlob = await fetchImage(frames[0].url);
  const firstImg = await createImageFromBlob(firstBlob);
  const frameWidth = firstImg.width;
  const frameHeight = firstImg.height;

  const rows = Math.ceil(frames.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * frameWidth;
  canvas.height = rows * frameHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  for (let i = 0; i < frames.length; i++) {
    const blob = await fetchImage(frames[i].url);
    const img = await createImageFromBlob(blob);
    const row = Math.floor(i / columns);
    const col = i % columns;
    ctx.drawImage(img, col * frameWidth, row * frameHeight);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        resolve(url);
      } else {
        reject(new Error('Failed to generate sprite sheet blob'));
      }
    }, 'image/png');
  });
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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export function revokeFrameUrls(frames: FrameData[]): void {
  frames.forEach(frame => URL.revokeObjectURL(frame.url));
}
