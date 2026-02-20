import { useLayoutEffect, useMemo, useRef, useState } from "react";

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

export default function InstrumentPanel({
  durationMinutes,
  startedAt,
  onCommit,
}: InstrumentPanelProps) {
  const [noteType, setNoteType] = useState<NoteType>("test");
  const [text, setText] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const idx = NOTE_TYPE_ORDER.indexOf(noteType);
  const prevType =
    NOTE_TYPE_ORDER[(idx - 1 + NOTE_TYPE_ORDER.length) % NOTE_TYPE_ORDER.length];
  const nextType = NOTE_TYPE_ORDER[(idx + 1) % NOTE_TYPE_ORDER.length];

  const durationLabel = useMemo(() => {
    if (durationMinutes === null) return "∞";
    return `${durationMinutes} min`;
  }, [durationMinutes]);

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
        {/* Top-left hint */}
        <div className="pointer-events-none absolute left-3 top-2 text-[11px] text-black/60">
          <span className="font-semibold">↑</span> {NOTE_TYPE_LABEL[prevType]}
        </div>

        {/* Bottom-left hint */}
        <div className="pointer-events-none absolute left-3 bottom-2 text-[11px] text-black/60">
          <span className="font-semibold">↓</span> {NOTE_TYPE_LABEL[nextType]}
        </div>

        {/* Duration indicator */}
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-black/60">
          {durationLabel}
        </div>

        {/* Main entry row */}
        <div className="flex items-center gap-2 px-3 py-6 pr-20">
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

      {/* Tiny debug line for now; remove later */}
      <div className="mt-2 text-xs text-black/50">
        Started: {new Date(startedAt).toLocaleTimeString()} • Type:{" "}
        {NOTE_TYPE_LABEL[noteType]}
      </div>
    </div>
  );
}