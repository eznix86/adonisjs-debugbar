import { readFileSync, statSync } from "node:fs";
import { isDebugBarEnabled } from "./manager.js";

let debugBarShell: string | null = null;
let debugBarShellMtimeMs: number | null = null;
const debugBarShellPath = new URL("./src/debugbar.html", import.meta.url);
const debugBarAssetCache = new Map<string, string>();
const debugBarAssetMtimes = new Map<string, number>();

export function getDebugBarScript() {
  return getDebugBarAsset("debugbar.js");
}

export function getDebugBarAsset(assetPath: string) {
  const debugMode = isDebugBarEnabled();
  const assetUrl = new URL(`./src/${assetPath}`, import.meta.url);

  if (debugMode) {
    const currentMtimeMs = statSync(assetUrl).mtimeMs;

    if (
      !debugBarAssetCache.has(assetPath) ||
      debugBarAssetMtimes.get(assetPath) !== currentMtimeMs
    ) {
      debugBarAssetCache.set(assetPath, readFileSync(assetUrl, "utf8"));
      debugBarAssetMtimes.set(assetPath, currentMtimeMs);
    }

    return debugBarAssetCache.get(assetPath) ?? "";
  }

  if (!debugBarAssetCache.has(assetPath)) {
    debugBarAssetCache.set(assetPath, readFileSync(assetUrl, "utf8"));
  }

  return debugBarAssetCache.get(assetPath) ?? "";
}

export function renderDebugBarShell(
  debugBarId: string,
  previousDebugBarId?: string | null,
) {
  const debugMode = isDebugBarEnabled();

  if (!debugMode && !debugBarShell) {
    debugBarShell = readFileSync(debugBarShellPath, "utf8");
  } else if (debugMode) {
    const currentMtimeMs = statSync(debugBarShellPath).mtimeMs;

    if (!debugBarShell || debugBarShellMtimeMs !== currentMtimeMs) {
      debugBarShell = readFileSync(debugBarShellPath, "utf8");
      debugBarShellMtimeMs = currentMtimeMs;
    }
  }

  const shell = debugBarShell ?? "";

  return shell
    .replaceAll("__DEBUG_BAR_ID__", escapeDebugId(debugBarId))
    .replaceAll(
      "__DEBUG_BAR_PREV_ID__",
      escapeDebugId(previousDebugBarId ?? ""),
    );
}

function escapeDebugId(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}
