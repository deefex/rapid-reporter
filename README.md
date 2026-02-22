# Rapid Reporter

Rapid Reporter is a lightweight desktop tool for capturing categorised notes, screenshots and code/data snippets during session-based exploratory testing (SBTM).

## Origin and Lineage

Rapid Reporter was originally conceived and implemented by Shmuel Gershon. The original Windows executable is still available [here](https://testing.gershon.info/reporter/).

Mac users like myself were unable to use the original tool, so I created an early Mac-specific port without access to the original source code. That attempt can still be found [here](https://github.com/deefex/Rapid_Reporter_BETA). However, due to the rapid evolution of Xcode and Swift at the time, maintaining it became impractical.

## This Modern Re-Implementation

This project is a complete rewrite using modern, cross-platform technologies so Rapid Reporter can run on Windows, macOS, and at stretch, Linux.

It is built with:
- Tauri v2
- React + TypeScript
- Tailwind CSS
- Rust backend

The goal has been to preserve the original ethos — minimalistic, fast, and unobtrusive — while modernising the implementation and addressing usability limitations discovered through my years of real-world use.

## Credits and Inspiration

Rapid Reporter was originally conceived and implemented by Shmuel Gershon, whose work introduced a generation of testers to fast, session-centric note taking aligned with Session-Based Test Management (SBTM) principles.

This project is an independent modern re-implementation inspired by the original tool. All source code in this repository has been written from scratch.

## Artwork and Icons

All category icons used by Rapid Reporter were designed from scratch by Mary, from [MD Creations](https://md-creations.co.uk/) and are used with permission. The icon artwork is original and forms part of the Rapid Reporter project.

---

## Current Features

### Session management
- Start a session with:
  - Tester Name (persisted between sessions)
  - Charter (multi‑line supported)
  - Duration (30, 60, 90, 120 minutes, or unlimited)
- Always‑on‑top instrument panel
- Visual session progress indicator
- Confirmation prompt before ending session
- Clean exit option from start screen

### Fast note capture
- Keyboard‑first note entry
- Categorised notes:
  - Test
  - Bug
  - Warning
  - Observation
  - Question
  - Idea
  - Snippet (for structured/code content)
- Prefix indicator for note type
- Instant commit with Enter
- Multi‑line entry supported
- Snippet notes exported as fenced Markdown code blocks

### Screenshot capture
- One‑click full screen screenshot capture
- Region (area) capture via drag‑selection overlay (multi‑monitor aware)
- Screenshots recorded as first‑class note type
- Stored with unique timestamped filenames
- Automatically copied into export folder
- Exported as embedded images in Markdown report
- Overlay supports multi‑monitor setups
- Cancel region capture with Esc

### Recap panel
- Shows the last 6 notes
- Prevents context loss during sessions
- Stable layout (no scrolling or UI shift)
- Supports screenshots and snippet preview

### Markdown export
- Export session to structured Markdown report
- Export includes:
  - Metadata header formatted as bold bullet list (Tester, Charter, Started, Duration)
  - Icon‑based Summary section (Bug, Idea, Observation, Question, Warning — only shown when present)
  - Notes in chronological order
  - Icons for Bug, Warning, Observation, Question, Idea (to draw the reader's attention)
  - Embedded screenshots
  - Snippet code blocks
- Fully portable export folder structure:

```text
RapidReporter-YYYY-MM-DD-HHMM/
  RapidReporter-YYYY-MM-DD-HHMM.md
  assets/
    icons/
    screenshots/
```
- Rust unit tests validate summary generation and pluralisation logic

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
- Session data held in memory during session
- Exported reports written to user's home directory
- Assets (icons, screenshots) embedded into export folder

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

### Run Rust unit tests

Rapid Reporter includes Rust unit tests covering core Markdown export logic (e.g. summary generation and pluralisation).

From the `src-tauri` directory, run:

```bash
cargo test
```

All tests must pass before merging changes that affect backend export behaviour.

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

src-tauri/
  src/
    lib.rs

README.md
```

---

## Backlog / TODO

### Export improvements

- [ ] Export session to PDF (from markdown)?

### Usability improvements

- [ ] Click screenshot in recap to open file
- [ ] Keyboard shortcut for screenshot capture
- [ ] Autosave session recovery

### Future enhancements

- [ ] Session import / resume
- [ ] Rich HTML export

---

## Goals

Rapid Reporter aims to:

- Minimise friction during exploratory testing
- Preserve tester flow state
- Capture evidence quickly
- Produce useful session artefacts

---

## License

MIT License © 2026 Del Dewar
See LICENSE file for details.