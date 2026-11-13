"use client";

import type { QuickJSWASMModule } from "@packetman/runtime";

let loading: Promise<QuickJSWASMModule> | undefined;

/** Lazily load the QuickJS sandbox (WASM embedded in the bundle, no network fetch). */
export function loadQuickJS(): Promise<QuickJSWASMModule> {
  loading ??= (async () => {
    const [{ newQuickJSWASMModuleFromVariant }, variant] = await Promise.all([
      import("@packetman/runtime"),
      import("@jitl/quickjs-singlefile-browser-release-sync").then((m) => m.default),
    ]);
    return newQuickJSWASMModuleFromVariant(variant);
  })();
  return loading;
}
