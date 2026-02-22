import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InstrumentPanel from "./InstrumentPanel";
import type { Note } from "./InstrumentPanel";

function renderPanel(overrides?: Partial<React.ComponentProps<typeof InstrumentPanel>>) {
  const onCommit = vi.fn<(note: Note) => void>();
  const onToggleRecap = vi.fn();
  const onEndSession = vi.fn();

  const startedAt = 1_700_000_000_000; // stable timestamp

  const view = render(
    <InstrumentPanel
      durationMinutes={60}
      startedAt={startedAt}
      onCommit={onCommit}
      notes={[]}
      recapOpen={false}
      onToggleRecap={onToggleRecap}
      onEndSession={onEndSession}
      {...overrides}
    />
  );

  return { ...view, onCommit, onToggleRecap, onEndSession, startedAt };
}

describe("InstrumentPanel", () => {
  beforeEach(() => {
    // Some environments expose `globalThis.crypto` as a read-only getter.
    // Prefer spying on `randomUUID` if it exists; otherwise stub a minimal crypto.
    const c = (globalThis as any).crypto;

    if (c && typeof c.randomUUID === "function") {
      vi.spyOn(c, "randomUUID").mockReturnValue("test-uuid");
    } else {
      vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders default type label and duration indicator", () => {
    renderPanel({ durationMinutes: 60 });

    // Default note type is Test
    expect(screen.getByText("Test")).toBeInTheDocument();

    // Duration label should appear on the panel
    expect(screen.getByText("60 min")).toBeInTheDocument();
  });

  test("recap button reflects recapOpen and calls onToggleRecap", async () => {
    const user = userEvent.setup();

    const { onToggleRecap, rerender, startedAt } = renderPanel({ recapOpen: false });

    const recapBtn = screen.getByRole("button", { name: /show recap/i });
    await user.click(recapBtn);
    expect(onToggleRecap).toHaveBeenCalledTimes(1);

    // Re-render as if parent toggled state
    rerender(
      <InstrumentPanel
        durationMinutes={60}
        startedAt={startedAt}
        onCommit={vi.fn()}
        notes={[]}
        recapOpen={true}
        onToggleRecap={onToggleRecap}
        onEndSession={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /hide recap/i })).toBeInTheDocument();
  });

  test("typing a note and pressing Enter commits via onCommit", async () => {
    const user = userEvent.setup();

    // Stabilise time so we can assert the timestamp.
    vi.spyOn(Date, "now").mockReturnValue(1234567890);

    const { onCommit } = renderPanel();

    const input = screen.getByPlaceholderText(/type note/i);
    await user.type(input, "  hello world  ");

    // Enter should commit (Shift+Enter is newline, but we use plain Enter)
    await user.keyboard("{Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);

    const committed = onCommit.mock.calls[0][0];
    expect(committed).toMatchObject({
      id: "test-uuid",
      timestamp: 1234567890,
      type: "test",
      text: "hello world",
    });
  });

  test("ArrowDown cycles note type (Test -> Bug)", async () => {
    const user = userEvent.setup();

    renderPanel();

    // Focus the textarea and press ArrowDown once
    const input = screen.getByPlaceholderText(/type note/i);
    input.focus();
    await user.keyboard("{ArrowDown}");

    // Label should now be Bug
    expect(screen.getByText("Bug")).toBeInTheDocument();
  });

  test("End session button calls onEndSession", async () => {
    const user = userEvent.setup();

    const { onEndSession } = renderPanel();

    await user.click(screen.getByRole("button", { name: /end session/i }));
    expect(onEndSession).toHaveBeenCalledTimes(1);
  });

  test("duration label shows ∞ when durationMinutes is null", () => {
    renderPanel({ durationMinutes: null });
    expect(screen.getByText("∞")).toBeInTheDocument();
  });
});