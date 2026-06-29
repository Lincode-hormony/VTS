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
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [activeTaskHint, setActiveTaskHint] = useState<string | null>(null);

  const attachTask = useCallback(async (existingTaskId: string) => {
    const result = await sam2Api.getTaskStatus(existingTaskId);
    setTaskId(existingTaskId);
    setVideoInfo(null);
    setError(null);
    setProgress(result.progress || 0);
    setFrameCount(result.result?.frame_count || 0);

    if (result.result?.frames) {
      const apiBaseUrl = import.meta.env.VITE_SAM2_API_URL || "http://localhost:6006/sam2/api/v1";
      const framesWithFullUrl = result.result.frames.map((frame) => ({
        ...frame,
        url: frame.url.startsWith("http") ? frame.url : `${apiBaseUrl}${frame.url}`,
      }));
      setFrames(framesWithFullUrl);
    }

    setStatus(result.status === "processing" ? "processing" : result.status === "completed" ? "completed" : "ready");
    return result;
  }, []);

  const upload = useCallback(async (file: File) => {
    setStatus("uploading");
    setError(null);
    setPoints([]);
    setMaskUrl(null);
    setActiveTaskHint(null);

    try {
      const result = await sam2Api.uploadVideo(file);
      setTaskId(result.task_id);
      setVideoInfo(result.video_info);
      setStatus("ready");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      const activeTaskId = sam2Api.getActiveTaskIdFromError(message);
      if (activeTaskId) {
        const result = await attachTask(activeTaskId);
        setActiveTaskHint(`已接管任务 ${activeTaskId}`);
        return {
          task_id: activeTaskId,
          status: "ready",
          message: "Attached to existing active task",
          first_frame: {
            url: sam2Api.getFirstFrameUrl(activeTaskId),
            width: 0,
            height: 0,
          },
          video_info: {
            filename: file.name,
            duration_seconds: 0,
            fps: 0,
            total_frames: 0,
          },
          ...result,
        };
      }
      setError(message);
      setActiveTaskHint(null);
      setStatus("failed");
      throw err;
    }
  }, [attachTask]);

  const importFromUrl = useCallback(async (videoUrl: string) => {
    setStatus("uploading");
    setError(null);
    setPoints([]);
    setMaskUrl(null);
    setActiveTaskHint(null);

    try {
      const result = await sam2Api.importVideoUrl(videoUrl);
      setTaskId(result.task_id);
      setVideoInfo(result.video_info);
      setStatus("ready");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import video URL failed";
      const activeTaskId = sam2Api.getActiveTaskIdFromError(message);
      if (activeTaskId) {
        const result = await attachTask(activeTaskId);
        setActiveTaskHint(`已接管任务 ${activeTaskId}`);
        return {
          task_id: activeTaskId,
          status: "ready",
          message: "Attached to existing active task",
          first_frame: {
            url: sam2Api.getFirstFrameUrl(activeTaskId),
            width: 0,
            height: 0,
          },
          video_info: {
            filename: "imported-video-url.mp4",
            duration_seconds: 0,
            fps: 0,
            total_frames: 0,
          },
          ...result,
        };
      }
      setError(message);
      setActiveTaskHint(null);
      setStatus("failed");
      throw err;
    }
  }, [attachTask]);

  const click = useCallback(
    async (x: number, y: number, label: 0 | 1 = 1) => {
      if (!taskId) throw new Error("No task ID");

      try {
        const result = await sam2Api.sendClick(taskId, x, y, label);
        setPoints(result.points as Point[]);
        if (result.mask_preview_url) {
          setMaskUrl(`${sam2Api.getImageUrl(result.mask_preview_url)}?t=${Date.now()}`);
        }
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
      if (result.mask_preview_url) {
        setMaskUrl(`${sam2Api.getImageUrl(result.mask_preview_url)}?t=${Date.now()}`);
      } else if (result.points_count === 0) {
        setMaskUrl(null);
      }
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
      setMaskUrl(null);
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
    return maskUrl;
  }, [maskUrl]);

  const getFrameUrl = useCallback(
    (index: number) => {
      if (!taskId) return null;
      return sam2Api.getFrameUrl(taskId, index);
    },
    [taskId]
  );

  const getActiveTaskHint = useCallback(() => activeTaskHint, [activeTaskHint]);
  const setActiveTaskFromError = useCallback((message: string | null) => {
    setActiveTaskHint(message);
  }, []);

  return {
    taskId,
    status,
    progress,
    points,
    frameCount,
    error,
    videoInfo,
    frames,
    maskUrl,
    upload,
    importFromUrl,
    click,
    undo,
    reset,
    generate,
    download,
    getZipBlob,
    getFirstFrameUrl,
    getMaskUrl,
    getFrameUrl,
    attachTask,
    getActiveTaskHint,
    setActiveTaskFromError,
  };
}


