/** Client stream quality preference — original or ffmpeg MP3 bitrate. */

export type StreamQuality = "original" | "128" | "192" | "256" | "320";

const KEY = "raag-stream-quality";

export function getStreamQuality(): StreamQuality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "128" || v === "192" || v === "256" || v === "320" || v === "original") return v;
  } catch {
    /* ignore */
  }
  return "original";
}

export function setStreamQuality(q: StreamQuality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* ignore */
  }
}

export function qualityLabel(q: StreamQuality): string {
  if (q === "original") return "Original";
  return `${q} kbps MP3`;
}
