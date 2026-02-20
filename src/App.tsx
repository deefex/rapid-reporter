import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

import InstrumentPanel, {
  DurationMinutes,
  Note,
} from "./components/InstrumentPanel";

type SessionConfig = {
  charter: string;
  durationMinutes: DurationMinutes;
  startedAt: number; // epoch ms
};

function App() {
  // Session state
  const [session, setSession] = useState<SessionConfig | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();

    // Size for the Start Session modal (fits comfortably)
    const startSessionSize = new LogicalSize(520, 420);

    // Size for the main capture UI (your preferred slim bar)
    const captureSize = new LogicalSize(1200, 200);

    win.setSize(session ? captureSize : startSessionSize).catch(console.error);
  }, [session]);

  const handleCommit = (note: Note) => {
    if (!session) return;
    // For now, just log. Next step: store in state + persist to CSV via Rust.
    console.log("Note committed:", { ...note, session });
  };

  return (
    <div className="bg-[#f9d900] w-screen h-screen p-4 flex flex-col">
      {!session ? (
        <StartSessionModal onStart={(cfg) => setSession(cfg)} />
      ) : (
        <div className="w-full">
          <div
            className="mb-1 select-none text-[11px] text-black/70 truncate"
            title={session.charter}
          >
            <span className="font-semibold">Charter:</span>{" "}
            {session.charter.replace(/\s+/g, " ").trim()}
          </div>

          <InstrumentPanel
            durationMinutes={session.durationMinutes}
            startedAt={session.startedAt}
            onCommit={handleCommit}
          />
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
  onStart: (cfg: SessionConfig) => void;
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