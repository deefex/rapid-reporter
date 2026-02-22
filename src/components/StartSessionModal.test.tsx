import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StartSessionModal from "./StartSessionModal";

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

function getCharterField(): HTMLElement {
  // Prefer an accessible label if present.
  const byLabel = screen.queryByLabelText(/charter/i);
  if (byLabel) return byLabel;

  // Fall back to the known placeholder used in the UI.
  const byPlaceholder = screen.queryByPlaceholderText(/what are you testing/i);
  if (byPlaceholder) return byPlaceholder;

  // Last resort: pick the first textbox that looks like a multi-line input.
  const textboxes = screen.getAllByRole("textbox");
  const textareaLike = textboxes.find((el) => (el as HTMLTextAreaElement).rows >= 2);
  return textareaLike ?? textboxes[0];
}

async function fillTesterIfPresent(user: ReturnType<typeof userEvent.setup>) {
  // Try the obvious accessible queries first.
  let testerField: HTMLElement | null =
    screen.queryByLabelText(/tester/i) ??
    screen.queryByPlaceholderText(/tester/i) ??
    screen.queryByLabelText(/name/i) ??
    screen.queryByPlaceholderText(/name/i);

  // If still not found, pick a textbox that is NOT the charter field.
  if (!testerField) {
    const charter = getCharterField();
    const textboxes = screen.getAllByRole("textbox");
    testerField = textboxes.find((el) => el !== charter) ?? null;
  }

  if (testerField) {
    // Some builds pre-populate tester name; ensure it's non-empty.
    const currentValue = (testerField as HTMLInputElement | HTMLTextAreaElement).value ?? "";
    if (currentValue.trim().length === 0) {
      await user.type(testerField, "Del");
    }
  }
}

describe("StartSessionModal", () => {
  test("Start is disabled until charter is >= 3 chars", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<StartSessionModal onStart={onStart} />);

    await fillTesterIfPresent(user);

    const startBtn = screen.getByRole("button", { name: /start/i });
    expect(startBtn).toBeDisabled();

    const charterField = getCharterField();

    await user.type(charterField, "ab");
    expect(startBtn).toBeDisabled();

    await user.type(charterField, "c");
    expect(startBtn).toBeEnabled();
  });

  test("Clicking Start calls onStart with trimmed charter", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<StartSessionModal onStart={onStart} />);

    await fillTesterIfPresent(user);

    const charterField = getCharterField();
    await user.type(charterField, "  My charter  ");

    const startBtn = screen.getByRole("button", { name: /start/i });
    expect(startBtn).toBeEnabled();

    await user.click(startBtn);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0][0].charter).toBe("My charter");
  });
});