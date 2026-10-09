import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/ui";
import { IconDownload } from "../components/icons";

interface DownloadsManifest {
  android: { available: boolean; url: string | null; size_mb: number | null; size_bytes?: number | null; version?: string };
}

function QrCode({ url }: { url: string }) {
  const encoded = encodeURIComponent(url);
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encoded}&color=14241c&bgcolor=eaf1ec`}
      alt="QR code"
      width={140}
      height={140}
      className="rounded-xl"
    />
  );
}

export function DownloadPage() {
  const appBaseUrl = window.location.origin;
  const [manifest, setManifest] = useState<DownloadsManifest | null>(null);

  useEffect(() => {
    api.downloadsManifest().then(setManifest).catch(() => setManifest(null));
  }, []);

  const apk = manifest?.android;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <PageHeader
        title="Get the App"
        subtitle="Install Raag on your phone for offline playback and background audio"
      />

      <div className="mt-8 flex flex-col gap-5">
        {/* Android */}
        <div className="rounded-2xl border border-border bg-panel/70 p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <AndroidIcon />
                <h2 className="text-base font-semibold text-ink">Android</h2>
                {apk?.version && (
                  <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    v{apk.version}
                  </span>
                )}
              </div>

              {apk?.available ? (
                <>
                  <p className="mb-4 text-sm text-muted">
                    Download and install the APK directly on your Android device.
                    You may need to allow installation from unknown sources in Settings.
                  </p>
                  <a
                    href={apk.url!}
                    download={`raag-v${apk.version || '1.0.15'}.apk`}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                  >
                    <IconDownload size={16} />
                    Download APK{apk.size_mb ? ` · ${apk.size_mb.toFixed(2)} MB` : ""}
                  </a>
                  {apk.size_bytes && (
                    <p className="mt-2 text-xs font-mono text-muted/80">
                      Exact Size: {apk.size_mb?.toFixed(2)} MB ({apk.size_bytes.toLocaleString()} bytes)
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted/70">
                    Settings → Apps → Install unknown apps → allow your browser
                  </p>
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted">
                    The Android APK hasn't been built yet. Build it with:
                  </p>
                  <div className="rounded-xl bg-ink/5 px-4 py-3 font-mono text-xs text-ink">
                    <p className="mb-1 text-muted"># in the mobile/ directory</p>
                    <p>npx eas build -p android --profile preview --local</p>
                    <p className="mt-2 text-muted"># then copy the .apk to the server:</p>
                    <p>scp raag-*.apk teja@192.168.4.43:~/apps/raag/downloads/raag.apk</p>
                    <p className="mt-2 text-muted"># copy into the Docker volume:</p>
                    <p>ssh teja@192.168.4.43 "docker cp ~/apps/raag/downloads/raag.apk music-server:/data/downloads/raag.apk"</p>
                  </div>
                  <p className="mt-3 text-sm text-muted/70">
                    Once uploaded, refresh this page — the download button will appear.
                  </p>
                </>
              )}
            </div>

            {apk?.available && (
              <div className="hidden shrink-0 sm:block">
                <QrCode url={`${appBaseUrl}${apk.url || '/downloads/raag.apk'}`} />
                <p className="mt-2 text-center text-[11px] text-muted">Scan to download</p>
              </div>
            )}
          </div>
        </div>

        {/* iOS */}
        <div className="rounded-2xl border border-border bg-panel/70 p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <AppleIcon />
                <h2 className="text-base font-semibold text-ink">iOS</h2>
              </div>
              <p className="mb-4 text-sm text-muted">
                Add Raag to your iPhone home screen as a web app — no App Store needed.
                Open this page in Safari, tap the Share button, then{" "}
                <strong>Add to Home Screen</strong>.
              </p>
              <a
                href={appBaseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-surface"
              >
                Open in Safari
              </a>
              <p className="mt-3 text-xs text-muted/70">Share → Add to Home Screen → Add</p>
            </div>
            <div className="hidden shrink-0 sm:block">
              <QrCode url={appBaseUrl} />
              <p className="mt-2 text-center text-[11px] text-muted">Scan to open</p>
            </div>
          </div>
        </div>

        {/* Connection tip */}
        <div className="rounded-xl border border-border-subtle bg-surface/50 px-5 py-4 text-sm text-muted">
          <span className="font-medium text-ink">Tip:</span> Make sure your phone is on the same
          Wi-Fi network as your Raag server, then enter{" "}
          <code className="rounded bg-ink/8 px-1 font-mono text-xs text-ink">{appBaseUrl}</code> as
          the server URL in the Android app.
        </div>
      </div>
    </div>
  );
}

function AndroidIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#3ddc84]">
      <path d="M6.18 15.64a2.18 2.18 0 0 1-2.18 2.18C2.98 17.82 2 16.84 2 15.64V9.77a2.18 2.18 0 0 1 4.36 0v5.87zm.81-9.49L5.86 4.6a.29.29 0 0 1 .5-.29l1.15 1.58A7.42 7.42 0 0 1 12 5.07c1.71 0 3.28.57 4.49 1.52l1.15-1.58a.29.29 0 0 1 .5.29L17 7.15A7.38 7.38 0 0 1 19.43 12H4.57A7.38 7.38 0 0 1 6.99 6.15zM9.5 10a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm5 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zM17.82 15.64a2.18 2.18 0 0 0 4.36 0V9.77a2.18 2.18 0 0 0-4.36 0v5.87zm-1.26 2.4A2 2 0 0 1 14.6 20H9.4a2 2 0 0 1-1.96-1.96V12.8h9.12v5.24z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}
