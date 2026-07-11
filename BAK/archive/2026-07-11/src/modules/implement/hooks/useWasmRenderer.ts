import { MapState } from '@CONTRACT/types';

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Extension of init to include RendererState if it's there
// @ts-ignore
import * as renderer_mod from "design_renderer";
const RendererStateClass = (renderer_mod as Record<string, unknown>).RendererState as (new () => unknown) | undefined;

type WebGpuSupport = { supported: boolean; reason: string };

interface NavigatorWithGpu extends Navigator {
  gpu?: {
    requestAdapter: () => Promise<{ constructor?: { name: string } } | null>;
  };
}

async function getWebGpuSupport(): Promise<WebGpuSupport> {
  const nav = navigator as NavigatorWithGpu;
  if (!nav.gpu) {
    return { supported: false, reason: "WebGPU not supported in this browser" };
  }
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, reason: "No GPU adapter found" };
    }
    const name = adapter.constructor?.name ?? "UnknownAdapter";
    return { supported: true, reason: `Adapter: ${name}` };
  } catch (e) {
    return { supported: false, reason: `Error checking GPU: ${e}` };
  }
}

export function useWasmRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  designMapState: MapState | null
) {
  const rendererRef = useRef<{
    free: () => void;
    load_map_data: (data: Uint8Array) => void;
    render: () => void;
    resize: (width: number, height: number) => void;
  } | null>(null);
  const animationFrameRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [nonFatalMessage, setNonFatalMessage] = useState<string | null>(null);
  const [rendererStatus, setRendererStatus] = useState<"idle" | "loading" | "ready" | "disabled" | "error">("idle");
  const initAttemptRef = useRef(0);

  const isMounted = useRef(true);
  const [remountKey, setRemountKey] = useState(0);
  const [useWebglFallback, setUseWebglFallback] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Sync MapState to WASM Renderer when it changes
  useEffect(() => {
    if (!rendererRef.current || !designMapState) return;
    // Note: We might want to pass the state to the renderer directly if possible
    // For now, let's keep the logic or update it to use rendererRef.current
  }, [designMapState]);

  // Khởi tạo WASM WGPU Renderer
  useEffect(() => {
    let isWasmInitializing = false;

    const initRenderer = async () => {
      if (isWasmInitializing) return;

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      try {
        setRendererStatus("loading");
        // WASM module is auto-initialized when imported via Vite
        // await init();


        if (!isMounted.current) return;
        const currentCanvas = canvasRef.current;
        if (!currentCanvas) throw new Error("Canvas disappears during loading");

        const rect = currentCanvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          initAttemptRef.current += 1;
          if (initAttemptRef.current <= 10) {
            isWasmInitializing = false;
            requestAnimationFrame(initRenderer);
            return;
          }
          throw new Error("Canvas has zero size after multiple attempts");
        }
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Check WebGPU early to prevent WGPU fallback crash
        const gpuSupport = await getWebGpuSupport();
        const forceWebgl = !gpuSupport.supported || useWebglFallback;
        if (forceWebgl) {
          console.warn(`[WGPU] Forcing WebGL2 fallback. Reason: ${!gpuSupport.supported ? gpuSupport.reason : "WebGPU WGPU Init Failed"}`);
          setNonFatalMessage(`Using WebGL2 Fallback (${!gpuSupport.supported ? gpuSupport.reason : "WGPU Error"})`);
        }

        if (!RendererStateClass) {
          throw new Error("RendererState not found in WASM module");
        }

        const renderer = await RendererStateClass.create(canvas, forceWebgl);
        if (!isMounted.current) {
          renderer.free();
          return;
        }
        rendererRef.current = renderer;
        setRendererStatus("ready");

        /*
        // Seed test data for verification
        try {
          await invoke("seed_test_data");
        } catch (e) {
          console.warn("Failed to seed test data:", e);
        }
        */

        const buffer = await invoke<number[]>("fetch_map_data");
        if (!isMounted.current || !rendererRef.current) return;

        const uint8Array = new Uint8Array(buffer);
        rendererRef.current.load_map_data(uint8Array);

        const renderLoop = () => {
          if (!isMounted.current) return;
          if (rendererRef.current) {
            rendererRef.current.render();
          }
          animationFrameRef.current = requestAnimationFrame(renderLoop);
        };
        renderLoop();
      } catch (err: unknown) {
        if (isMounted.current) {
          console.error("Lỗi khởi tạo WASM/WGPU:", err);
          const errStr = err instanceof Error ? err.toString() : String(err);

          if (!useWebglFallback && errStr.includes("WGPU Failed to initialize on WebGPU backend")) {
            console.warn("[WGPU] Caught WebGPU init error. Triggering WebGL2 fallback...");
            setUseWebglFallback(true);
            setRemountKey(prev => prev + 1);
            return;
          }

          setRendererStatus("error");
          setError(errStr);
          invoke("debug_log", { msg: "Renderer Error: " + errStr }).catch(() => console.log("no debug_log"));
        }
      } finally {
        isWasmInitializing = false;
      }
    };
    initRenderer();

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current) {
        try {
          rendererRef.current.free();
        } catch (e) {
          console.warn("WASM free error:", e);
        }
        rendererRef.current = null;
      }
    };
  }, [useWebglFallback, canvasRef, remountKey]);

  const reseedAndRender = async () => {
    try {
      await invoke("seed_test_data");
      const buffer = await invoke<number[]>("fetch_map_data");
      if (rendererRef.current) {
        rendererRef.current.load_map_data(new Uint8Array(buffer));
        rendererRef.current.render();
      }
    } catch (e) {
      console.error("Manual seed failed:", e);
    }
  };

  const handleResize = (width: number, height: number) => {
    if (rendererRef.current && canvasRef.current) {
      canvasRef.current.width = width;
      canvasRef.current.height = height;
      rendererRef.current.resize(width, height);
    }
  };

  return {
    error,
    nonFatalMessage,
    rendererStatus,
    remountKey,
    reseedAndRender,
    handleResize
  };
}

