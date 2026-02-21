# Rapid Reporter

Rapid Reporter is a lightweight desktop tool for capturing notes and screenshots during session‑based exploratory testing (SBTM). It is designed to be fast, unobtrusive, and keyboard‑centric so testers can focus on exploration rather than documentation.

Built with:
- Tauri v2
- React + TypeScript
- Tailwind CSS
- Rust backend

---

## Current Features (MVP)

### Session management
- Start a session with:
  - Charter
  - Duration (30, 60, 90, 120 minutes, or unlimited)
- Visual session progress indicator
- Always‑on‑top instrument panel

### Fast note capture
- Keyboard‑first note entry
- Categorised notes:
  - Test
  - Bug
  - Warning
  - Observation
  - Question
  - (Test) Idea
- Prefix indicator for note type
- Instant commit

### Recap panel
- Shows the last 6 notes
- Prevents context loss during sessions (coffee/toilet break)
- Stable layout (no scrolling or UI shift)

### Screenshot capture
- One‑click screenshot capture
- Automatically saved to $HOME directory
- Unique timestamped folders and filenames (no overwriting) e.g RapidReporter-2026-02-20-1823
- Screenshots attached as notes

---

## Architecture

Frontend:
- React
- TypeScript
- Tailwind CSS

Backend:
- Rust (Tauri)
- Screenshot capture via Tauri plugin
- File management via Rust commands

Storage:
- Local filesystem (AppData directory)

---

## Development

### Requirements

- Node.js 18+
- Rust
- macOS, Windows, or Linux

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run desktop
```

### Build release version

```bash
npm run tauri build
```

---

## Project Structure

```text
src/
  components/
    InstrumentPanel.tsx
    StartSessionModal.tsx

src-tauri/
  src/
    lib.rs

README.md
```

---

## Backlog / TODO

### Screenshot capture improvements (future)

- [ ] Option 1: Cross‑platform in‑app region selector
  - Build a Rapid Reporter overlay allowing drag‑selection of capture region
  - Single implementation across macOS, Windows, Linux

- [ ] Option 2: Native OS interactive region capture
  - macOS: screencapture -i
  - Windows: Snipping Tool
  - Linux: grim/slurp or desktop native tools
  - Use fallback when unavailable

### Multi‑monitor improvements

- [ ] Capture monitor containing Rapid Reporter window

### Export features

- [ ] Export session to Markdown
- [ ] Export session from Markdown to PDF

### UI improvements

- [ ] Click screenshot in recap to open file
- [ ] Keyboard shortcut for screenshot capture

---

## Goals

Rapid Reporter aims to:

- Minimise friction during exploratory testing
- Preserve tester flow state
- Capture evidence quickly
- Produce useful session artefacts

---

## License

TBD