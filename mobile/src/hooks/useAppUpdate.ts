import { useState } from "react";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { File, Paths } from "expo-file-system/next";
import { APP_VERSION, getBaseUrl } from "../api";

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
      const file = new File(Paths.cache, "raag.apk");
      if (file.exists) file.delete();

      // New expo-file-system/next API — native download, no deprecated resumable
      await file.downloadAsync(apkUrl);
      setProgress(1);

      setState("installing");
      const contentUri = await FileSystem.getContentUriAsync(file.uri);
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
