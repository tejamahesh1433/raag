import { useState } from "react";
import { getContentUriAsync } from "expo-file-system/legacy";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { APP_VERSION, getBaseUrl } from "../api";

let IntentLauncher: any = null;
if (Platform.OS === "android") {
  try {
    IntentLauncher = require("expo-intent-launcher");
  } catch {}
}

export type UpdateState = "idle" | "checking" | "available" | "downloading" | "installing" | "uptodate" | "error";

function semverGt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>("idle");
  const [progress, setProgress] = useState(0);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkForUpdate() {
    setState("checking");
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/api/health`);
      const data = await res.json();
      const sv: string = data.apk_version ?? data.version ?? "0.0.0";
      setServerVersion(sv);
      setState(semverGt(sv, APP_VERSION) ? "available" : "uptodate");
    } catch {
      setError("Could not reach server");
      setState("error");
    }
  }

  async function downloadAndInstall() {
    setState("downloading");
    setProgress(0);
    setError(null);
    const apkUrl = `${getBaseUrl()}/downloads/raag.apk`;
    try {
      // Use static File.downloadFileAsync with idempotent + progress
      const dest = new File(Paths.cache, "raag.apk");
      if (dest.exists) {
        dest.delete();
      }
      const downloaded = await File.downloadFileAsync(apkUrl, dest, {
        idempotent: false,
        onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => {
          if (totalBytes > 0) setProgress(bytesWritten / totalBytes);
        },
      });

      setProgress(1);
      setState("installing");

      const contentUri = await getContentUriAsync(downloaded.uri);
      await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
        data: contentUri,
        flags: 1,
        type: "application/vnd.android.package-archive",
      });
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      setState("error");
    }
  }

  return { state, progress, serverVersion, error, checkForUpdate, downloadAndInstall };
}
