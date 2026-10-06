/** Google Cast (Chromecast) sender — uses the default media receiver. */

declare global {
  interface Window {
    chrome?: {
      cast?: {
        isAvailable?: boolean;
        media?: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: string;
          MediaInfo: new (contentId: string, contentType: string) => {
            metadata: unknown;
            streamType: string;
          };
          GenericMediaMetadata: new () => {
            title?: string;
            subtitle?: string;
            images?: Array<{ url: string }>;
          };
          LoadRequest: new (mediaInfo: unknown) => { autoplay: boolean; currentTime: number };
          StreamType: { BUFFERED: string };
          MetadataType: { GENERIC: number };
        };
        SessionRequest: new (appId: string) => unknown;
        ApiConfig: new (
          sessionRequest: unknown,
          sessionListener: (s: CastSession) => void,
          receiverListener: (a: string) => void,
        ) => unknown;
        initialize: (config: unknown, ok: () => void, err: (e: unknown) => void) => void;
        requestSession: (
          ok: (s: CastSession) => void,
          err: (e: unknown) => void,
        ) => void;
      };
    };
    __onGCastApiAvailable?: (available: boolean) => void;
  }
}

interface CastSession {
  loadMedia: (
    req: unknown,
    ok: () => void,
    err: (e: unknown) => void,
  ) => void;
  addUpdateListener: (fn: (alive: boolean) => void) => void;
}

let _session: CastSession | null = null;
let _ready = false;
let _scriptLoading = false;

export function isCastAvailable(): boolean {
  return Boolean(_ready && window.chrome?.cast);
}

export function hasCastSession(): boolean {
  return _session !== null;
}

export function initCast(): void {
  if (typeof window === "undefined" || _ready || _scriptLoading) return;
  _scriptLoading = true;
  window.__onGCastApiAvailable = (available) => {
    if (!available || !window.chrome?.cast) return;
    const cast = window.chrome.cast;
    try {
      const appId = cast.media!.DEFAULT_MEDIA_RECEIVER_APP_ID;
      const sessionRequest = new cast.SessionRequest!(appId);
      const apiConfig = new cast.ApiConfig!(
        sessionRequest,
        (s) => {
          _session = s;
        },
        () => undefined,
      );
      cast.initialize!(
        apiConfig,
        () => {
          _ready = true;
        },
        () => {
          _ready = false;
        },
      );
    } catch {
      _ready = false;
    }
  };
  if (!document.getElementById("raag-cast-sdk")) {
    const s = document.createElement("script");
    s.id = "raag-cast-sdk";
    s.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=0";
    s.async = true;
    document.head.appendChild(s);
  }
}

export function castMedia(opts: {
  contentUrl: string;
  contentType?: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  currentTime?: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const cast = window.chrome?.cast;
    if (!cast?.media) {
      reject(new Error("Cast unavailable"));
      return;
    }
    const start = (session: CastSession) => {
      _session = session;
      const mediaInfo = new cast.media!.MediaInfo(
        opts.contentUrl,
        opts.contentType || "audio/mpeg",
      );
      const meta = new cast.media!.GenericMediaMetadata();
      meta.title = opts.title;
      meta.subtitle = opts.subtitle;
      if (opts.imageUrl) meta.images = [{ url: opts.imageUrl }];
      mediaInfo.metadata = meta;
      mediaInfo.streamType = cast.media!.StreamType.BUFFERED;
      const req = new cast.media!.LoadRequest(mediaInfo);
      req.autoplay = true;
      req.currentTime = opts.currentTime || 0;
      session.loadMedia(
        req,
        () => resolve(),
        (e) => reject(e),
      );
    };
    if (_session) {
      start(_session);
      return;
    }
    cast.requestSession!(
      (s) => start(s),
      (e) => reject(e),
    );
  });
}

/** Absolute URL helper for Cast (requires reachable HTTPS/LAN URL). */
export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
}
