const API_BASE_URL = import.meta.env.VITE_SAM2_API_URL || "http://localhost:6006/sam2/api/v1";

export interface UploadResponse {
  task_id: string;
  status: "ready";
  message: string;
  first_frame: {
    url: string;
    width: number;
    height: number;
  };
  video_info: {
    filename: string;
    duration_seconds: number;
    fps: number;
    total_frames: number;
  };
}

export interface ClickResponse {
  task_id: string;
  status: string;
  message: string;
  mask_preview_url: string;
  points: Array<{ x: number; y: number; label: number }>;
  points_count: number;
}

export interface TaskStatus {
  task_id: string;
  status: "ready" | "processing" | "completed" | "failed";
  message: string;
  progress?: number;
  result?: {
    frame_count: number;
    frames: Array<{ index: number; url: string }>;
    download_url: string;
  };
  error?: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
}

export async function uploadVideo(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Upload failed" }));
    throw new Error(error.message || "Upload failed");
  }

  return response.json();
}

export async function sendClick(
  taskId: string,
  x: number,
  y: number,
  label: 0 | 1 = 1
): Promise<ClickResponse> {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, label }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Click failed" }));
    throw new Error(error.message || "Click failed");
  }

  return response.json();
}

export async function undoClick(taskId: string): Promise<ClickResponse> {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/undo`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Undo failed" }));
    throw new Error(error.message || "Undo failed");
  }

  return response.json();
}

export async function resetClicks(taskId: string): Promise<ClickResponse> {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/reset`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Reset failed" }));
    throw new Error(error.message || "Reset failed");
  }

  return response.json();
}

export async function startGenerate(taskId: string): Promise<TaskStatus> {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/generate`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Generate failed" }));
    throw new Error(error.message || "Generate failed");
  }

  return response.json();
}

export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Get status failed" }));
    throw new Error(error.message || "Get status failed");
  }

  return response.json();
}

export async function pollUntilComplete(
  taskId: string,
  options: {
    interval?: number;
    maxAttempts?: number;
    onProgress?: (status: TaskStatus) => void;
  } = {}
): Promise<TaskStatus> {
  const { interval = 2000, maxAttempts = 300, onProgress } = options;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    const status = await getTaskStatus(taskId);

    if (onProgress) {
      onProgress(status);
    }

    if (status.status === "completed") {
      return status;
    }

    if (status.status === "failed") {
      throw new Error(status.error || status.message || "Task failed");
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error("Polling timeout");
}

export function getImageUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function getFirstFrameUrl(taskId: string): string {
  return `${API_BASE_URL}/tasks/${taskId}/frame/0`;
}

export function getMaskPreviewUrl(taskId: string): string {
  return `${API_BASE_URL}/tasks/${taskId}/mask`;
}

export function getFrameUrl(taskId: string, index: number): string {
  return `${API_BASE_URL}/tasks/${taskId}/frames/${index}`;
}

export function getDownloadUrl(taskId: string): string {
  return `${API_BASE_URL}/tasks/${taskId}/download`;
}

export async function downloadZip(taskId: string, filename = "frames.zip"): Promise<void> {
  // 直接链接下载方式（支持大文件）
  const url = getDownloadUrl(taskId);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

