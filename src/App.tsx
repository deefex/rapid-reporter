import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";

import InstrumentPanel, {
  DurationMinutes,
  Note,
} from "./components/InstrumentPanel";

type Session = {
  charter: string;
  durationMinutes: DurationMinutes;
  startedAt: number; // epoch ms
  notes: Note[];
};

function App() {
  // Session state
  const [session, setSession] = useState<Session | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();

    // Size for the Start Session modal (fits comfortably)
    const startSessionSize = new LogicalSize(520, 420);

    // Size for the main capture UI (collapsed vs expanded recap)
    const captureSizeCollapsed = new LogicalSize(1200, 200);
    const captureSizeExpanded = new LogicalSize(1200, 360);

    const captureSize = recapOpen ? captureSizeExpanded : captureSizeCollapsed;

    win.setSize(session ? captureSize : startSessionSize).catch(console.error);
  }, [session, recapOpen]);

  const handleCommit = (note: Note) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        notes: [note, ...prev.notes].slice(0, 200),
      };

      // For now, just log. Next step: export/persist via Rust.
      console.log("Note committed:", { ...note, session: { ...next, notes: undefined } });

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
      const result = await invoke<{ markdownPath: string }>(
        "export_session_markdown",
        { session }
      );
      console.log("Export complete:", result);
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
    setSession(null);
  };

  return (
    <div className="bg-[#f9d900] w-screen h-screen p-4 flex flex-col overflow-hidden">
      {!session ? (
        <StartSessionModal
          onStart={(cfg) => {
            setRecapOpen(false);
            setSession({ ...cfg, notes: [] });
          }}
        />
      ) : (
        <div className="w-full">
          <div
            className="mb-1 select-none text-[11px] text-black/70 truncate"
            title={session.charter}
          >
            <span className="font-semibold">Charter:</span>{" "}
            {session.charter.replace(/\s+/g, " ").trim()}
          </div>

          {exportError && (
            <div className="mb-2 rounded border border-red-600/30 bg-red-50 px-3 py-2 text-sm text-red-900">
              {exportError}
            </div>
          )}

          <InstrumentPanel
            durationMinutes={session.durationMinutes}
            startedAt={session.startedAt}
            onCommit={handleCommit}
            notes={session.notes}
            recapOpen={recapOpen}
            onToggleRecap={() => setRecapOpen((v) => !v)}
            onEndSession={requestEndSession}
          />
        </div>
      )}

      {endConfirmOpen && session && (
        <div className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setEndConfirmOpen(false)}
          />

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

export default App;

// ----------------------------
// Start Session Modal
// ----------------------------

function StartSessionModal({
  onStart,
}: {
  onStart: (cfg: Omit<Session, "notes">) => void;
}) {
  const [charter, setCharter] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(60);

  const canStart = useMemo(() => charter.trim().length >= 3, [charter]);

  const durationOptions: Array<{ label: string; value: DurationMinutes }> = [
    { label: "30", value: 30 },
    { label: "60", value: 60 },
    { label: "90", value: 90 },
    { label: "120", value: 120 },
    { label: "∞", value: null },
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Modal */}
      <div className="relative w-[520px] max-w-[92vw] rounded-lg border border-black/20 bg-white/70 backdrop-blur px-4 py-4 shadow">
        <div className="text-black font-semibold text-lg mb-2">Start Session</div>

        <label className="block text-sm text-black/70 mb-1">Charter</label>
        <textarea
          value={charter}
          onChange={(e) => setCharter(e.target.value)}
          placeholder="What are you testing in this session?"
          className="w-full h-20 resize-none rounded border border-black/20 bg-white/80 px-3 py-2 outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10"
          autoFocus
        />

        <div className="mt-3">
          <div className="text-sm text-black/70 mb-1">Duration (minutes)</div>

          <div className="flex gap-2">
            {durationOptions.map((opt) => {
              const selected = opt.value === durationMinutes;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setDurationMinutes(opt.value)}
                  className={[
                    "px-3 py-1.5 rounded border text-sm",
                    selected
                      ? "bg-black/80 text-white border-black/80"
                      : "bg-white/60 text-black border-black/20 hover:bg-white/80",
                  ].join(" ")}
                  aria-pressed={selected}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="mt-1 text-xs text-black/60">
            Choose ∞ for no time limit.
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded border border-black/20 bg-white/60 text-black hover:bg-white/80"
            onClick={() => {
              getCurrentWindow().close().catch(console.error);
            }}
          >
            Exit
          </button>

          <button
            type="button"
            className="px-3 py-2 rounded border border-black/20 bg-white/60 text-black hover:bg-white/80"
            onClick={() => {
              setCharter("");
              setDurationMinutes(60);
            }}
          >
            Clear
          </button>

          <button
            type="button"
            disabled={!canStart}
            className={[
              "px-3 py-2 rounded border text-black",
              canStart
                ? "bg-[#f9d900] border-black/30 hover:brightness-95"
                : "bg-black/10 border-black/10 text-black/40 cursor-not-allowed",
            ].join(" ")}
            onClick={() => {
              onStart({
                charter: charter.trim(),
                durationMinutes,
                startedAt: Date.now(),
              });
            }}
          >
            Start
          </button>
        </div>

        {!canStart && (
          <div className="mt-2 text-xs text-black/50">
            Charter must be at least 3 characters.
          </div>
        )}
      </div>
    </div>
  );
}