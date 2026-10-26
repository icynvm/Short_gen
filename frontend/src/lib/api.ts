export type Cue = { start: number; end: number; text: string };
export type Scene = {
  id: string;
  order: number;
  title: string;
  narration: string;
  prompt: string;
  voice: string;
  style: string;
  seed: number;
  motion: "still" | "zoom_in" | "zoom_out" | "pan";
  image: string | null;
  image_origin: string | null;
  audio: string | null;
  audio_duration: number;
  duration: number;
  cues: Cue[];
  timing_method: string | null;
  revision: number;
};
export type Project = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  source_text: string;
  source_url: string;
  summary: string;
  target_duration: number;
  image_count: number;
  image_style: string;
  transition: "cut" | "fade";
  music: string | null;
  music_volume: number;
  headline: string;
  burn_subtitles: boolean;
  scenes: Scene[];
  render: string | null;
  cover: string | null;
  srt: string | null;
  export_path: string | null;
  revision: number;
};
export type Status = {
  gemini: boolean;
  tts_model: string;
  voices: string[];
  ffmpeg: boolean;
  llama: boolean;
  sd: boolean;
  whisper: boolean;
  windows: boolean;
  data_dir: string;
};
export type Settings = {
  llama_bin: string;
  llama_model: string;
  sd_bin: string;
  sd_model: string;
  whisper_bin: string;
  whisper_model: string;
  export_dir: string;
  font_name: string;
};
export type Job = {
  id: string;
  action: string;
  scene_id: string | null;
  status: "queued" | "running" | "completed" | "failed" | "interrupted";
  progress: number;
  message: string;
  error: string | null;
  created_at: string;
};
export type Bootstrap = {
  token: string;
  status: Status;
  settings: Settings;
  projects: Project[];
};
let token = "";
export function setToken(value: string) {
  token = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const isForm = data instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(method !== "GET" ? { "x-studio-token": token } : {}),
      ...(!isForm && data !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: data === undefined ? undefined : isForm ? data : JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "เชื่อมต่อบริการไม่ได้" }));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องกรอกอีกครั้ง",
    );
  }
  return response.json();
}
export const asset = (path: string, download = false) =>
  `/api/assets/${path.split("/").map(encodeURIComponent).join("/")}${download ? "?download=true" : ""}`;
export const seconds = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
