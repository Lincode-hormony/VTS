import { useCallback, useState } from "react";
import * as sam2Api from "../services/sam2Api";

export type Sam2Status = "idle" | "uploading" | "ready" | "processing" | "completed" | "failed";

export interface Point {
  x: number;
  y: number;
  label: 0 | 1;
}

export function useSam2() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<Sam2Status>("idle");
  const [progress, setProgress] = useState(0);
  const [points, setPoints] = useState<Point[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<sam2Api.UploadResponse["video_info"] | null>(null);
  const [frames, setFrames] = useState<Array<{ index: number; url: string }> | null>(null);

  const upload = useCallback(async (file: File) => {
    setStatus("uploading");
    setError(null);
    setPoints([]);

    try {
      const result = await sam2Api.uploadVideo(file);
      setTaskId(result.task_id);
      setVideoInfo(result.video_info);
      setStatus("ready");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setStatus("failed");
      throw err;
    }
  }, []);

  const click = useCallback(
    async (x: number, y: number, label: 0 | 1 = 1) => {
      if (!taskId) throw new Error("No task ID");

      try {
        const result = await sam2Api.sendClick(taskId, x, y, label);
        setPoints(result.points as Point[]);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Click failed";
        setError(message);
        throw err;
      }
    },
    [taskId]
  );

  const undo = useCallback(async () => {
    if (!taskId) throw new Error("No task ID");

    try {
      const result = await sam2Api.undoClick(taskId);
      setPoints(result.points as Point[]);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Undo failed";
      setError(message);
      throw err;
    }
  }, [taskId]);

  const reset = useCallback(async () => {
    if (!taskId) throw new Error("No task ID");

    try {
      const result = await sam2Api.resetClicks(taskId);
      setPoints([]);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reset failed";
      setError(message);
      throw err;
    }
  }, [taskId]);

  const generate = useCallback(async () => {
    if (!taskId) throw new Error("No task ID");

    setStatus("processing");
    setProgress(0);
    setError(null);

    try {
      await sam2Api.startGenerate(taskId);

      const result = await sam2Api.pollUntilComplete(taskId, {
        interval: 2000,
        onProgress: (s) => {
          setProgress(s.progress || 0);
        },
      });

      setFrameCount(result.result?.frame_count || 0);

      const apiBaseUrl = import.meta.env.VITE_SAM2_API_URL || "http://localhost:6006/sam2/api/v1";
      const framesWithFullUrl = result.result?.frames?.map(f => ({
        ...f,
        url: f.url.startsWith('http') ? f.url : `${apiBaseUrl}${f.url}`
      })) || null;
      setFrames(framesWithFullUrl);
      setStatus("completed");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generate failed";
      setError(message);
      setStatus("failed");
      throw err;
    }
  }, [taskId]);

  const download = useCallback(
    async (filename?: string) => {
      if (!taskId) throw new Error("No task ID");
      await sam2Api.downloadZip(taskId, filename);
    },
    [taskId]
  );

  const getZipBlob = useCallback(
    async (): Promise<Blob> => {
      if (!taskId) throw new Error("No task ID");
      const url = sam2Api.getDownloadUrl(taskId);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ZIP: ${response.statusText}`);
      }
      return await response.blob();
    },
    [taskId]
  );

  const getFirstFrameUrl = useCallback(() => {
    if (!taskId) return null;
    return sam2Api.getFirstFrameUrl(taskId);
  }, [taskId]);

  const getMaskUrl = useCallback(() => {
    if (!taskId) return null;
    const url = sam2Api.getMaskPreviewUrl(taskId);
    return `${url}?t=${Date.now()}`;
  }, [taskId, points]);

  const getFrameUrl = useCallback(
    (index: number) => {
      if (!taskId) return null;
      return sam2Api.getFrameUrl(taskId, index);
    },
    [taskId]
  );

  return {
    taskId,
    status,
    progress,
    points,
    frameCount,
    error,
    videoInfo,
    frames,
    upload,
    click,
    undo,
    reset,
    generate,
    download,
    getZipBlob,
    getFirstFrameUrl,
    getMaskUrl,
    getFrameUrl,
  };
}


