import { useState } from "react";
import { Platform } from "react-native";
import { cacheDirectory, createDownloadResumable, deleteAsync, getContentUriAsync } from "expo-file-system/legacy";
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
    const dest = `${cacheDirectory}raag.apk`;
    try {
      await deleteAsync(dest, { idempotent: true }).catch(() => {});
      const dl = createDownloadResumable(
        apkUrl,
        dest,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(totalBytesWritten / totalBytesExpectedToWrite);
          }
        }
      );
      const result = await dl.downloadAsync();
      if (!result?.uri) throw new Error("Download failed");

      setProgress(1);
      setState("installing");

      if (Platform.OS === "android" && IntentLauncher) {
        const contentUri = await getContentUriAsync(result.uri);
        await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
          data: contentUri,
          flags: 1,
          type: "application/vnd.android.package-archive",
        });
      }
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      setState("error");
    }
  }

  return { state, progress, serverVersion, error, checkForUpdate, downloadAndInstall };
}
