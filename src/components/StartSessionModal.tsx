import React, { useEffect, useMemo, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DurationMinutes } from "./InstrumentPanel";

export type StartSessionConfig = {
  testerName: string;
  charter: string;
  durationMinutes: DurationMinutes;
  startedAt: number;
};

export default function StartSessionModal({
  onStart,
  appVersion,
}: {
  onStart: (cfg: StartSessionConfig) => void;
  appVersion?: string | null;
}) {
  const [testerName, setTesterName] = useState("");

  // Persist tester name between sessions for convenience
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rapidReporter.testerName");
      if (saved && saved.trim().length > 0) {
        setTesterName(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const [charter, setCharter] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(60);

  const canStart = useMemo(
    () => testerName.trim().length >= 2 && charter.trim().length >= 3,
    [testerName, charter]
  );

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
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-black font-semibold text-lg">Start Session</div>
          {appVersion && (
            <div
              className="text-xs text-black/50 select-none"
              title={`Rapid Reporter v${appVersion}`}
            >
              Rapid Reporter v{appVersion}
            </div>
          )}
        </div>

        <label className="block text-sm text-black/70 mb-1">Tester Name</label>
        <input
          value={testerName}
          onChange={(e) => {
            const v = e.target.value;
            setTesterName(v);
            try {
              window.localStorage.setItem("rapidReporter.testerName", v);
            } catch {
              // ignore
            }
          }}
          placeholder="Your name"
          className="w-full mb-3 rounded border border-black/20 bg-white/80 px-3 py-2 outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10"
          autoFocus={testerName.trim().length === 0}
        />

        <label className="block text-sm text-black/70 mb-1">Charter</label>
        <textarea
          value={charter}
          onChange={(e) => setCharter(e.target.value)}
          placeholder="What are you testing in this session?"
          className="w-full h-20 resize-none rounded border border-black/20 bg-white/80 px-3 py-2 outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10"
          autoFocus={testerName.trim().length > 0}
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

          <div className="mt-1 text-xs text-black/60">Choose ∞ for no time limit.</div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded border border-black/20 bg-white/60 text-black hover:bg-white/80"
            onClick={() => {
              getCurrentWebviewWindow().close().catch(console.error);
            }}
          >
            Exit
          </button>

          <button
            type="button"
            className="px-3 py-2 rounded border border-black/20 bg-white/60 text-black hover:bg-white/80"
            onClick={() => {
              setTesterName("");
              setCharter("");
              setDurationMinutes(60);
              try {
                window.localStorage.removeItem("rapidReporter.testerName");
              } catch {
                // ignore
              }
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
                testerName: testerName.trim(),
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
            Tester Name must be at least 2 characters, and Charter at least 3.
          </div>
        )}
      </div>
    </div>
  );
}