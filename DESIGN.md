# Gym Log — Design

## Direction: the clipboard training sheet

A gym logbook you'd find on a clipboard next to the rack: ruled lines, stamped
labels, big numbers. Dense and calm, led by typography. Every screen reads top to
bottom like a printed sheet, and the one thing you do next is the loudest thing on
the page. There are no cards floating on gradients. Structure comes from hairline
rules, a strong left edge, and type weight.

Principles

1. **Today first.** The app opens to the current step. Everything else is secondary.
2. **Numbers are the interface.** kg, reps and timers use a monospaced face with
   tabular figures at large sizes. Labels are small caps-style condensed text.
3. **One accent, used for action and "now".** The current step, the primary button
   and the running timer use it. Nothing else does.
4. **Status is never color alone.** Every status has a glyph and a word
   (done ✓-mark icon + "Done", missed slash + "Missed", and so on).
5. **Quiet when nothing is happening.** No load animations. Motion only confirms an
   action (a set ticks over, a timer ends).

## Type

Two families, both self-hosted (latin subset, woff2, `font-display: swap`):

| Role | Family | Settings |
|---|---|---|
| Headings, labels, tabs | **Archivo** (variable, `wght` 100–900, `wdth` 62–125) | Condensed: `font-stretch: 72%`, weight 700–800, uppercase for labels with `letter-spacing: .06em` |
| Body text | Archivo | `font-stretch: 100%`, weight 400/500 |
| kg, reps, timers, dates in tables | **JetBrains Mono** (variable) | `font-variant-numeric: tabular-nums slashed-zero`, weight 500–700 |

Archivo's width axis lets one family serve both the condensed "stamped" headings
and the normal-width body text, which keeps us to two families.

Fluid scale (`clamp`, 360px → 1440px):

| Token | Size |
|---|---|
| `--step--1` | 0.78rem → 0.83rem |
| `--step-0` | 0.94rem → 1rem |
| `--step-1` | 1.13rem → 1.25rem |
| `--step-2` | 1.35rem → 1.6rem |
| `--step-3` | 1.62rem → 2.1rem |
| `--step-4` | 2.2rem → 3.2rem (focus title, timer) |

## Color

The tokens live in `src/styles/tokens.css`. Light is the "paper" sheet; dark is
"graphite". The single accent is **signal orange**, which reads as safety marking
rather than as a brand gradient.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F4F1EA` paper | `#121211` graphite | page |
| `--surface` | `#FBF9F4` | `#1B1B19` | raised rows, inputs |
| `--surface-2` | `#ECE8DE` | `#252522` | tab bar, table stripes |
| `--ink` | `#161513` | `#ECE9E1` | primary text (≥ 15:1) |
| `--ink-2` | `#4A4740` | `#B5B1A7` | secondary text (≥ 7:1) |
| `--ink-3` | `#66625A` | `#959186` | tertiary / meta (≥ 4.5:1 on every surface) |
| `--rule` | `#D6D1C4` | `#34332F` | hairlines |
| `--rule-strong` | `#161513` | `#ECE9E1` | section rules |
| `--accent` | `#B23E0B` | `#FF8F52` | primary action, current step |
| `--accent-ink` | `#9C3509` | `#FFA877` | accent-colored text (current step number, today) |
| `--on-accent` | `#FFFFFF` | `#1A0D05` | text on accent (≥ 4.5:1) |
| `--accent-soft` | `#F6DFD1` | `#3A2316` | current-step background |
| `--ok` | `#2F6B3A` | `#7FC48C` | done |
| `--warn` | `#7A5A00` | `#E2C060` | partial / deload |
| `--missed` | `#4F5675` | `#A9AECB` | Rest (missed): its own slate hue, distinct from rest and skip |
| `--muted-status` | `#66625A` | `#959186` | skipped, paused |
| `--danger` | `#8F2A1D` | `#FF9B8A` | destructive actions and save errors only |
| `--focus` | `#1F55C7` | `#8FB3FF` | focus ring |

Status colors are all dark enough to carry text on `--bg`. `npm run check:contrast`
computes every text/background pair in both themes and fails below 4.5:1. Hints and missed-day
banners use `--surface-2` with `--ink`, never red and never the accent.

## Space and layout

- 4px base unit: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48.
- Mobile first from 360px. Content column max 44rem; side gutter 16px plus
  `env(safe-area-inset-*)`.
- **< 900px**: bottom tab bar (5 tabs, 56px tall plus the safe-area inset). The
  primary action dock sits directly above it, within thumb reach.
- **≥ 900px**: an 88px left side rail replaces the tab bar. Content stays one
  centered 44rem column (a training sheet reads top to bottom), and the dock pins
  to the bottom of the column.
- Touch targets are at least 44×44px; the set button is 64px tall.
- Radius: 2px for inputs and buttons, 0 for rows. The look is printed, not bubbly.

## Components

- **Sheet header**: the date in mono (`11/10/2026`), then the focus title in
  condensed 800, then a meta line (`Day 3 of 112 · Phase A · Week 1`), then stamped
  tags (`WFO`, `DELOAD`).
- **Stamp tag**: uppercase condensed text in a 1px border box. Never filled, except
  the current-step tag, which uses the accent.
- **Step row**: number column (01, 02…), name, status glyph and word. The current
  step gets a 4px accent bar on the left and `--accent-soft` behind it.
- **Set counter**: four square cells. A completed cell is filled with ink and shows
  the kg×reps. Tapping the big button fills the next cell; undo empties the last.
- **Timer dock**: big mono countdown, label ("Rest · next set 3 of 4"), and the
  controls −30s / Skip / +30s. It is a live region that only announces when the
  timer ends.
- **Ruled table**: hairline rows, mono numerals right-aligned, sticky first column
  when it scrolls horizontally inside its own container (the page never scrolls
  sideways).
- **Line chart**: SVG with a 2px ink line, 8px, square markers with a 2px surface ring, the latest point
  labelled, and gridlines in `--rule`. Each chart has a matching data table
  (toggle) for screen readers and for exact values.
- **Banner**: full-width ruled block with a label, a sentence, and text-buttons.
  Used for missed days, backup reminders, storage persistence, updates and gap
  hints. No auto-dismiss.
- **Icons**: a custom 24px grid set, 1.75px stroke, square caps and miter joins, in
  `src/ui/icons.tsx`.

## Motion

- Set completion: the cell fills with a 160ms scale from 0.9. The counter number
  rolls (opacity + 4px translate).
- Timer end: a single 600ms accent pulse on the timer block, plus vibration and a
  tone when allowed.
- With `prefers-reduced-motion: reduce`, all transitions drop to an instant change.

## States

- **First run**: a short sheet that states the program dates and the storage
  model, with "Start" and "Import a backup".
- **Before the program starts**: "Starts in N days" with the first session previewed.
- **After the program ends**: a summary sheet with sessions, completion and best lifts.
- **Empty progress/body**: a ruled placeholder that says what will appear and how
  to add it. It never uses an illustration.
- **Loading**: a skeleton of the sheet header (fixed heights, so there is no layout
  shift).
- **Storage error**: a plain-language explanation with "Try again" and
  "Download what we can".
