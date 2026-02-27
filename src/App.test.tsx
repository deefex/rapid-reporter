// src/App.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

// ---- Mocks: Tauri window + core invoke + dpi LogicalSize ----

const listenMock = vi.fn(async () => {
  // Tauri returns an "unlisten" function
  return () => {};
});

const setSizeMock = vi.fn(async () => {});
const closeMock = vi.fn(async () => {});
const setFocusMock = vi.fn(async () => {});

vi.mock("@tauri-apps/api/webviewWindow", () => {
  return {
    getCurrentWebviewWindow: () => ({
      listen: listenMock,
      setSize: setSizeMock,
      close: closeMock,
      setFocus: setFocusMock,
    }),
  };
});

// LogicalSize is only constructed and passed into setSize().
// We can use a tiny mock class.
vi.mock("@tauri-apps/api/dpi", () => {
  return {
    LogicalSize: class LogicalSize {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
    },
  };
});

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => {
  return {
    invoke: (cmd: string, args?: any) => invokeMock(cmd, args),
  };
});

const openerOpenMock = vi.fn(async (_path: string) => {});
vi.mock("@tauri-apps/plugin-opener", () => {
  return {
    revealItemInDir: (path: string) => openerOpenMock(path),
  };
});

// Screenshots API is only used when a region capture event fires.
// Stub it so the module can be imported safely in tests.
vi.mock("tauri-plugin-screenshots-api", () => {
  return {
    getMonitorScreenshot: vi.fn(async () => "/tmp/fake-screenshot.png"),
    getScreenshotableMonitors: vi.fn(async () => [{ id: 1 }]),
  };
});

// The App imports Event type only; no runtime import needed.

// ---- Helper ----
function renderApp() {
  // ensure main route (not overlay)
  window.location.hash = "";
  return render(<App />);
}

async function startSession(user: ReturnType<typeof userEvent.setup>, opts?: { testerName?: string; charter?: string }) {
  const testerName = opts?.testerName ?? "Del";
  const charter = opts?.charter ?? "My charter";

  const testerInput = screen.getByPlaceholderText(/Your name/i);
  const charterInput = screen.getByPlaceholderText(/What are you testing/i);

  await user.clear(testerInput);
  await user.type(testerInput, testerName);

  await user.clear(charterInput);
  await user.type(charterInput, charter);

  const startBtn = screen.getByRole("button", { name: /^Start$/i });
  await waitFor(() => expect(startBtn).toBeEnabled());
  await user.click(startBtn);
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockReset();

    // Default: export succeeds
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "export_session_markdown") {
        return { markdownPath: "/tmp/fake.md" };
      }
      return undefined;
    });

    // If your StartSessionModal pre-populates tester name from localStorage:
    localStorage.clear();
  });

  it("renders Start Session screen initially", () => {
    renderApp();

    expect(
      screen.getByPlaceholderText(/What are you testing in this session\?/i)
    ).toBeInTheDocument();

    expect(screen.getByPlaceholderText(/Your name/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^Start$/i })).toBeDisabled();
  });

  it("starting a session shows the main capture UI", async () => {
    const user = userEvent.setup();
    renderApp();

    await startSession(user, { testerName: "Del", charter: "  My charter  " });

    // Now the instrument panel should exist
    expect(
      screen.getByPlaceholderText(/Type note/i)
    ).toBeInTheDocument();

    // And the charter line is displayed (App shows Charter: ...)
    expect(screen.getByText(/Charter:/i)).toBeInTheDocument();

    // Optional sanity check: window sizing got called at least once
    await waitFor(() => {
      expect(setSizeMock).toHaveBeenCalled();
    });
  });

  it("End session -> End & Export calls the export command and returns to start screen", async () => {
    const user = userEvent.setup();
    renderApp();

    await startSession(user, { testerName: "Del", charter: "My charter" });

    // Open end session confirm
    await user.click(screen.getByRole("button", { name: /End session/i }));

    // Confirm dialog should appear.
    // `dialogText` is the message body <div> inside the modal; its parent is the modal container
    // that also contains the title + buttons.
    const dialogText = screen.getByText(/End this session and export/i);
    const dialogRoot = (dialogText.closest("div") as HTMLElement).parentElement as HTMLElement;
    expect(dialogRoot).toBeTruthy();

    // Title + body should be present inside the modal
    expect(within(dialogRoot).getByText(/^End session$/i)).toBeInTheDocument();
    expect(within(dialogRoot).getByText(/End this session and export/i)).toBeInTheDocument();

    // Confirm export
    await user.click(within(dialogRoot).getByRole("button", { name: /End & Export/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "export_session_markdown",
        expect.any(Object)
      );
    });

    // After successful export, it should return to Start screen
    await waitFor(() => {
      expect(screen.getByText(/Start Session/i)).toBeInTheDocument();
    });
  });

  it("Cancel on End session dialog does not export", async () => {
    const user = userEvent.setup();
    renderApp();

    await startSession(user, { testerName: "Del", charter: "My charter" });

    await user.click(screen.getByRole("button", { name: /End session/i }));

    const dialogText = screen.getByText(/End this session and export/i);
    const dialogRoot = (dialogText.closest("div") as HTMLElement).parentElement as HTMLElement;
    await user.click(within(dialogRoot).getByRole("button", { name: /Cancel/i }));

    expect(invokeMock).not.toHaveBeenCalledWith(
      "export_session_markdown",
      expect.anything()
    );

    // Still in main capture UI
    expect(screen.getByPlaceholderText(/Type note/i)).toBeInTheDocument();
  });
});
