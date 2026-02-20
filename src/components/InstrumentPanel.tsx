import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  getMonitorScreenshot,
  getScreenshotableMonitors,
} from "tauri-plugin-screenshots-api";
import {
  checkScreenRecordingPermission,
  requestScreenRecordingPermission,
} from "tauri-plugin-macos-permissions-api";

export type NoteType =
  | "test"
  | "bug"
  | "idea"
  | "observation"
  | "warning"
  | "question";

export type DurationMinutes = 30 | 60 | 90 | 120 | null; // null = no limit

export type Note = {
  id: string;
  timestamp: number; // epoch ms
  type: NoteType;
  text: string;
};

export type InstrumentPanelProps = {
  durationMinutes: DurationMinutes;
  startedAt: number; // epoch ms
  onCommit: (note: Note) => void;

  notes: Note[];
  recapOpen: boolean;
  onToggleRecap: () => void;
  onEndSession: () => void;
};

const NOTE_TYPE_ORDER: NoteType[] = [
  "test",
  "bug",
  "idea",
  "observation",
  "warning",
  "question",
];

const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  test: "Test",
  bug: "Bug",
  idea: "Idea",
  observation: "Observation",
  warning: "Warning",
  question: "Question",
};

// Progress fill gradient (easy to tweak colour and opacity in one place)
const PROGRESS_GRADIENT =
  "linear-gradient(to bottom, rgba(0,122,255,0.35) 0%, rgba(0,122,255,0.22) 40%, rgba(0,122,255,0.10) 100%)";

export default function InstrumentPanel({
  durationMinutes,
  startedAt,
  onCommit,
  notes,
  recapOpen,
  onToggleRecap,
  onEndSession,
}: InstrumentPanelProps) {
  const [noteType, setNoteType] = useState<NoteType>("test");
  const [text, setText] = useState("");

  const [isCapturing, setIsCapturing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const idx = NOTE_TYPE_ORDER.indexOf(noteType);
  const prevType =
    NOTE_TYPE_ORDER[(idx - 1 + NOTE_TYPE_ORDER.length) % NOTE_TYPE_ORDER.length];
  const nextType = NOTE_TYPE_ORDER[(idx + 1) % NOTE_TYPE_ORDER.length];

  const durationLabel = useMemo(() => {
    if (durationMinutes === null) return "∞";
    return `${durationMinutes} min`;
  }, [durationMinutes]);

  const [progress, setProgress] = useState(0); // 0..1

  useEffect(() => {
    if (durationMinutes === null) {
      setProgress(0);
      return;
    }

    const totalMs = durationMinutes * 60 * 1000;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const p = Math.min(Math.max(elapsed / totalMs, 0), 1);
      setProgress(p);
    };

    tick();
    const id = window.setInterval(tick, 150);
    return () => window.clearInterval(id);
  }, [durationMinutes, startedAt]);

  // Auto-grow textarea up to a sensible max height, then allow scrolling.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    // Stable baseline height for 1 line so the placeholder aligns immediately.
    // When text is empty, scrollHeight can be slightly larger and makes the first render look “off”.
    const BASELINE_PX = 34;

    if (text.length === 0) {
      el.style.height = `${BASELINE_PX}px`;
      return;
    }

    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 140);
    el.style.height = `${Math.max(next, BASELINE_PX)}px`;
  }, [text]);

  const cycle = (delta: number) => {
    const i = NOTE_TYPE_ORDER.indexOf(noteType);
    const n = (i + delta + NOTE_TYPE_ORDER.length) % NOTE_TYPE_ORDER.length;
    setNoteType(NOTE_TYPE_ORDER[n]);
  };

  const captureScreenshot = async () => {
    if (isCapturing) return;

    try {
      setIsCapturing(true);

      // On macOS this requires Screen Recording permission.
      // On other OSes these calls may no-op or throw, so we guard with try/catch.
      try {
        const authorized = await checkScreenRecordingPermission();
        if (!authorized) {
          await requestScreenRecordingPermission();
        }
      } catch {
        // Ignore permission helper errors on non-macOS.
      }

      // Re-check (macOS) and fail fast with a helpful message.
      try {
        const authorized = await checkScreenRecordingPermission();
        if (!authorized) {
          window.alert(
            "Rapid Reporter needs Screen Recording permission to capture screenshots.\n\nGo to System Settings → Privacy & Security → Screen Recording, enable Rapid Reporter, then restart the app."
          );
          return;
        }
      } catch {
        // Non-macOS: carry on.
      }

      const monitors = await getScreenshotableMonitors();
      const first = (monitors as any[])?.[0];
      if (!first || typeof first.id !== "number") {
        window.alert("No monitors available for screenshot capture.");
        return;
      }

      const path = await getMonitorScreenshot(first.id);

      let finalPath = path;
      try {
        finalPath = await invoke<string>("unique_screenshot_copy", { path });
      } catch (e) {
        console.warn(
          "Could not create unique screenshot copy; using original path",
          e
        );
        finalPath = path;
      }

      onCommit({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: noteType,
        text: `Screenshot: ${finalPath}`,
      });
    } catch (err) {
      console.error("Screenshot capture failed:", err);
      window.alert("Screenshot capture failed. Check permissions and try again.");
    } finally {
      setIsCapturing(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    onCommit({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: noteType,
      text: trimmed,
    });

    setText("");

    // Keep focus for rapid capture
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <div className="w-full">
      {/* Instrument panel container */}
      <div className="relative rounded-md border border-black/30 bg-[#cdcdcd] shadow-sm">
        {/* Progress fill (subtle gradient) */}
        {durationMinutes !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-0 overflow-hidden rounded-md"
            style={{ width: `${Math.round(progress * 1000) / 10}%` }}
            aria-hidden="true"
          >
            <div
              className="h-full"
              style={{
                background: PROGRESS_GRADIENT,
              }}
            />
          </div>
        )}

        {/* Top-left hint */}
        <div className="pointer-events-none absolute left-3 top-2 z-10 text-[11px] text-black/60">
          <span className="font-semibold">↑</span> {NOTE_TYPE_LABEL[prevType]}
        </div>

        {/* Bottom-left hint */}
        <div className="pointer-events-none absolute left-3 bottom-2 z-10 text-[11px] text-black/60">
          <span className="font-semibold">↓</span> {NOTE_TYPE_LABEL[nextType]}
        </div>

        {/* Duration indicator */}
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-10 text-sm font-semibold text-black/60">
          {durationLabel}
        </div>

        {/* Main entry row */}
        <div className="relative z-10 flex items-center gap-2 px-3 py-6 pr-20">
          <button
            type="button"
            onClick={captureScreenshot}
            disabled={isCapturing}
            className={[
              "shrink-0 rounded border border-black/20 bg-white/40 px-2 py-1 text-black/70 hover:bg-white/60",
              isCapturing ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
            title={isCapturing ? "Capturing…" : "Capture screenshot"}
            aria-label="Capture screenshot"
          >
            {isCapturing ? "…" : "📷"}
          </button>
          {/* Prefix label (not part of typed text) */}
          <div className="select-none text-xl font-extrabold text-black leading-[1.1]">
            {NOTE_TYPE_LABEL[noteType]}
          </div>

          {/* Text area */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type note… (Enter to commit, Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none bg-transparent text-xl text-black placeholder:text-black/40 outline-none leading-[1.1] overflow-y-auto p-0 pt-[6px]"
            onKeyDown={(e) => {
              // Don’t clobber OS shortcuts
              if (e.metaKey || e.ctrlKey || e.altKey) return;

              // Enter commits (Shift+Enter inserts newline)
              if (e.key === "Enter") {
                if (e.shiftKey) return;
                e.preventDefault();
                commit();
                return;
              }

              // Up/down cycles types
              if (e.key === "ArrowUp") {
                e.preventDefault();
                cycle(-1);
                return;
              }

              if (e.key === "ArrowDown") {
                e.preventDefault();
                cycle(1);
                return;
              }

              // Optional quick picks (1-6)
              if (e.key === "1") setNoteType("test");
              if (e.key === "2") setNoteType("bug");
              if (e.key === "3") setNoteType("idea");
              if (e.key === "4") setNoteType("observation");
              if (e.key === "5") setNoteType("warning");
              if (e.key === "6") setNoteType("question");
            }}
            autoFocus
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-black/50">
        <div>
          Started:{" "}
          {new Date(startedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          })}{" "}
          • Type: {NOTE_TYPE_LABEL[noteType]}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleRecap}
            className="rounded border border-black/20 bg-white/40 px-2 py-1 text-black/70 hover:bg-white/60"
            aria-expanded={recapOpen}
          >
            {recapOpen ? "Hide recap" : "Show recap"}
          </button>

          <button
            type="button"
            onClick={onEndSession}
            className="rounded border border-black/20 bg-white/40 px-2 py-1 font-semibold text-black/80 hover:bg-white/60"
            title="End session and export report"
          >
            End session
          </button>
        </div>
      </div>

      {recapOpen && (
        <div className="mt-2 rounded-md border border-black/20 bg-white/30 p-2">
          <div className="mb-1 text-[11px] font-semibold text-black/60">Recent notes  · showing last 6</div>

          {notes.length === 0 ? (
            <div className="text-xs text-black/50">No notes yet.</div>
          ) : (
            <div className="pr-1 overflow-hidden">
              {notes.slice(0, 6).map((n) => (
                <div key={n.id} className="mb-1 flex gap-2 text-xs text-black/70 min-w-0">
                  <div className="w-[72px] shrink-0 text-black/50">
                    {new Date(n.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>

                  <div className="w-[92px] shrink-0 font-semibold text-black/60">
                    {NOTE_TYPE_LABEL[n.type]}
                  </div>

                  <div className="min-w-0 truncate">{n.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}