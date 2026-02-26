import React, { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";

import type { Event } from "@tauri-apps/api/event";

import {
  getMonitorScreenshot,
  getScreenshotableMonitors,
} from "tauri-plugin-screenshots-api";

import InstrumentPanel, { DurationMinutes, Note } from "./components/InstrumentPanel";
import StartSessionModal from "./components/StartSessionModal";

type Session = {
  testerName: string;
  charter: string;
  durationMinutes: DurationMinutes;
  startedAt: number; // epoch ms
  notes: Note[];
};

type RegionSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
};

function App() {
  // Simple “router” for the overlay window
  if (window.location.hash === "#/overlay") {
    return <RegionOverlay />;
  }

  // Session state
  const [session, setSession] = useState<Session | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isRegionCapturing, setIsRegionCapturing] = useState(false);

  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("app_version")
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

  // ✅ Restore window sizing logic (start vs capture; recap collapsed vs expanded)
  useEffect(() => {
    const win = getCurrentWebviewWindow();

    // Size for the Start Session modal (fits comfortably)
    const startSessionSize = new LogicalSize(600, 520);

    // Size for the main capture UI (collapsed vs expanded recap)
    const captureSizeCollapsed = new LogicalSize(1200, 200);
    const captureSizeExpanded = new LogicalSize(1200, 380);

    const captureSize = recapOpen ? captureSizeExpanded : captureSizeCollapsed;

    win.setSize(session ? captureSize : startSessionSize).catch(console.error);
  }, [session, recapOpen]);

  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    // Only the main window should listen/respond
    if (window.location.hash === "#/overlay") return;

    const win = getCurrentWebviewWindow();

    // In dev, React StrictMode mounts/unmounts components twice.
    // Because `win.listen` is async, a mount->unmount can happen before `unlisten` is assigned,
    // leaking a listener and causing duplicate events (double screenshot notes).
    let disposed = false;
    let unlistenFn: null | (() => void) = null;

    (async () => {
      try {
        const fn = await win.listen<RegionSelection>(
          "region-selected",
          async (event: Event<RegionSelection>) => {
            // We received a response from the overlay, so the UI can leave "Please wait" state.
            setIsRegionCapturing(false);

            const s = sessionRef.current;
            if (!s) return;

            try {
              const selection = event.payload;

              const monitors = (await getScreenshotableMonitors()) as any[];
              if (!Array.isArray(monitors) || monitors.length === 0) {
                console.warn("No monitors available for region capture.");
                return;
              }

              const pickMonitor = () => {
                for (const m of monitors) {
                  const mx = m?.position?.x ?? m?.x ?? 0;
                  const my = m?.position?.y ?? m?.y ?? 0;
                  const mw = m?.size?.width ?? m?.width ?? 0;
                  const mh = m?.size?.height ?? m?.height ?? 0;

                  if (
                    typeof mx === "number" &&
                    typeof my === "number" &&
                    typeof mw === "number" &&
                    typeof mh === "number" &&
                    selection.x >= mx &&
                    selection.x < mx + mw &&
                    selection.y >= my &&
                    selection.y < my + mh
                  ) {
                    return { monitor: m, mx, my };
                  }
                }

                const m = monitors[0];
                const mx = m?.position?.x ?? m?.x ?? 0;
                const my = m?.position?.y ?? m?.y ?? 0;
                return { monitor: m, mx, my };
              };

              const { monitor, mx, my } = pickMonitor();

              if (!monitor || typeof monitor.id !== "number") {
                console.warn("No valid monitor id available for region capture.");
                return;
              }

              const fullPath = await getMonitorScreenshot(monitor.id);

              const selectionForCrop: RegionSelection = {
                ...selection,
                x: selection.x - mx,
                y: selection.y - my,
              };

              const croppedPath = await invoke<string>("crop_screenshot", {
                path: fullPath,
                selection: selectionForCrop,
              });

              handleCommit({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                type: "screenshot",
                text: croppedPath,
              });
            } catch (err) {
              console.error("Region capture failed:", err);
              window.alert("Region capture failed. Check console for details.");
            } finally {
              // Ensure we never get stuck in "Please wait" if something throws above.
              setIsRegionCapturing(false);
            }
          }
        );

        const fnClosed = await win.listen(
          "region-overlay-closed",
          () => {
            // Overlay was cancelled (e.g. Esc). Clear "Please wait…" state.
            setIsRegionCapturing(false);
          }
        );

        // If we were unmounted before `listen` resolved, immediately clean up.
        if (disposed) {
          fn();
          return;
        }

        unlistenFn = () => {
          try {
            fn();
          } catch {}
          try {
            fnClosed();
          } catch {}
        };
      } catch (err) {
        console.error("Failed to register region-selected listener:", err);
      }
    })();

    return () => {
      disposed = true;
      try {
        unlistenFn?.();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCommit = (note: Note) => {
    setSession((prev) => {
      if (!prev) {
        return prev;
      }

      const next = {
        ...prev,
        notes: [note, ...prev.notes].slice(0, 200),
      };

      return next;
    });
  };

  const requestEndSession = () => {
    if (!session) return;
    setExportError(null);
    setEndConfirmOpen(true);
  };

  const performEndSession = async () => {
    if (!session) return;

    try {
      await invoke<{ markdownPath: string }>("export_session_markdown", { session });
    } catch (err) {
      console.error("Export failed:", err);
      setExportError(
        "Export failed. Please check the console for details. Your session is still active."
      );
      setEndConfirmOpen(false);
      return;
    }

    // Reset UI back to start
    setEndConfirmOpen(false);
    setRecapOpen(false);
    setIsRegionCapturing(false);
    setSession(null);
  };

  const openRegionCapture = async () => {
    if (isRegionCapturing) return;

    try {
      setIsRegionCapturing(true);

      let platform = "";
      try {
        platform = await invoke<string>("platform_os");
      } catch {
        platform = "";
      }

      if (platform === "windows") {
        const win = getCurrentWebviewWindow();
        try {
          // Snipping UI needs to come to the foreground on Windows.
          // The main app window is configured as always-on-top, which can block it.
          await win.setAlwaysOnTop(false).catch(() => {});
          await new Promise((resolve) => window.setTimeout(resolve, 120));

          const snipPath = await invoke<string | null>("capture_windows_snip_to_file", {
            timeoutMs: 5_000,
          });

          if (snipPath && sessionRef.current) {
            handleCommit({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              type: "screenshot",
              text: snipPath,
            });
          } else if (!snipPath) {
            // Timed out or user cancelled snipping without placing an image on clipboard.
            // Treat as a no-op to match user intent (Esc/cancel is not an error).
            console.info("Windows snip cancelled or timed out.");
          }
        } finally {
          await win.setAlwaysOnTop(true).catch(() => {});
          setIsRegionCapturing(false);
        }

        return;
      }

      await invoke("open_region_overlay");
    } catch (err) {
      console.error("Region capture failed:", err);
      window.alert("Region capture failed. Please try again.");
      setIsRegionCapturing(false);
    }
  };

  return (
    <div className="bg-[#f9d900] w-screen h-screen p-4 flex flex-col overflow-hidden">
      {!session ? (
        <StartSessionModal
          appVersion={appVersion}
          onStart={(cfg) => {
            setRecapOpen(false);
            setSession({ ...cfg, notes: [] });
          }}
        />
      ) : (
        <div className="w-full">
          <div className="mb-1 select-none text-[11px] text-black/70 truncate" title={session.charter}>
            <span className="font-semibold">Tester:</span>{" "}
            {session.testerName}
            {"  ·  "}
            <span className="font-semibold">Charter:</span>{" "}
            {session.charter.replace(/\s+/g, " ").trim()}
          </div>

          {exportError && (
            <div className="mb-2 rounded border border-red-600/30 bg-red-50 px-3 py-2 text-sm text-red-900">
              {exportError}
            </div>
          )}

          <InstrumentPanel
            appVersion={appVersion}
            durationMinutes={session.durationMinutes}
            startedAt={session.startedAt}
            onCommit={handleCommit}
            notes={session.notes}
            recapOpen={recapOpen}
            onToggleRecap={() => setRecapOpen((v) => !v)}
            onEndSession={requestEndSession}
            isRegionCapturing={isRegionCapturing}
            onOpenRegionCapture={openRegionCapture}
          />
        </div>
      )}

      {endConfirmOpen && session && (
        <div className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEndConfirmOpen(false)} />

          <div className="relative z-50 w-[420px] max-w-[88vw] rounded-lg border border-black/20 bg-white/90 backdrop-blur px-3 py-3 shadow overflow-hidden">
            <div className="text-black font-semibold text-base mb-1">End session</div>
            <div className="text-sm text-black/80">
              End this session and export the report? This will return you to the Start screen.
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded border border-black/20 bg-white/60 text-black hover:bg-white/80"
                onClick={() => setEndConfirmOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="px-3 py-2 rounded border border-black/30 bg-black/80 text-white hover:bg-black/90"
                onClick={performEndSession}
              >
                End & Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function RegionOverlay() {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{
    clientX: number;
    clientY: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // Prevent double-submit if pointer events fire twice.
  const submittedRef = useRef(false);

  useEffect(() => {
    document.body.style.cursor = "crosshair";

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        try {
          await invoke("close_region_overlay");
        } finally {
          // extra safety: close from JS too
          getCurrentWebviewWindow().close().catch(() => {});
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.cursor = "default";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const normalize = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x);
    const bottom = Math.max(a.y, b.y);
    return { left, top, width: right - left, height: bottom - top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    // New drag -> allow submit again.
    submittedRef.current = false;

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

    startRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
    };
    setDragging(true);
    setRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !startRef.current) return;
    const start = startRef.current;
    setRect(normalize({ x: start.clientX, y: start.clientY }, { x: e.clientX, y: e.clientY }));
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    // Some environments can fire pointerup twice; ensure we only submit once.
    if (submittedRef.current) return;
    if (!dragging || !startRef.current) return;

    // Mark as submitted immediately (before any awaits) to prevent duplicates.
    submittedRef.current = true;

    const start = startRef.current;
    setDragging(false);

    // Use SCREEN coordinates for submission (desktop-global)
    const x1 = Math.min(start.screenX, e.screenX);
    const y1 = Math.min(start.screenY, e.screenY);
    const x2 = Math.max(start.screenX, e.screenX);
    const y2 = Math.max(start.screenY, e.screenY);

    const width = Math.max(0, x2 - x1);
    const height = Math.max(0, y2 - y1);

    // Ignore tiny drags
    if (width < 5 || height < 5) {
      // Allow another attempt.
      submittedRef.current = false;
      setRect(null);
      startRef.current = null;
      return;
    }

    try {
      await invoke("submit_region_selection", {
        selection: {
          x: Math.round(x1),
          y: Math.round(y1),
          width: Math.round(width),
          height: Math.round(height),
          devicePixelRatio: window.devicePixelRatio,
        },
      });
    } catch (err) {
      console.error("submit_region_selection failed:", err);
      // Allow retry if submission failed.
      submittedRef.current = false;
      await invoke("close_region_overlay").catch(() => {});
    } finally {
      setRect(null);
      startRef.current = null;
    }
  };

  return (
    <div
      className="fixed inset-0 select-none"
      style={{ backgroundColor: "rgba(0,0,0,0.18)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Instruction chip */}
      <div className="pointer-events-none fixed left-0 right-0 top-6 flex justify-center">
        <div className="rounded bg-black/70 px-3 py-2 text-sm text-white shadow">
          Drag to select an area · Release to capture · Esc to cancel
        </div>
      </div>

      {/* Selection rectangle (still drawn using client coords) */}
      {rect && (
        <div
          className="fixed border-2 border-white/90 bg-white/10"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      )}
    </div>
  );
}

export default App;
