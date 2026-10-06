# Gel Reader — Project Plan

A browser-based tool that reads gel electrophoresis photos (DNA, RNA, protein)
and estimates band sizes against a molecular-weight ladder. Students come first,
but the tool should work for everyone and stay very user-friendly. Web first,
mobile app later for field researchers.

## Principles

- **Suggest, don't decide.** Every automatic step shows its result and lets the user correct it.
- **Honest numbers.** Show sizes with an uncertainty range or fit quality. Never silently extrapolate beyond the ladder.
- **Private by default.** All image processing runs in the browser, so images never leave the device.
- **Answers first, teaching alongside.** The main job is giving accurate band sizes. A guided "show me how" layer (ladder labels, read-across line, "why?" tips) sits on top for students and can be switched off. An advanced mode unlocks the full controls.
- **Gel % matters.** Ask for it up front. Use it to warn when bands fall outside the gel's resolving range and to widen ± ranges there.

## Workflow

Upload → straighten/crop → choose gel type → fill in the well map → detect or click bands →
calibrate against the ladder → sizes, panel calls and export

## Stages

| # | Stage | Scope | Status |
|---|---|---|---|
| 0 | Setup | Project scaffold, data model, ladder library | ✅ |
| 1 | Foundation | Upload; crop and rotate; contrast and invert; gel type; well map (wells, rows, roles, labels); ladder picker; **manual ruler** (click bands); calibration curve (log size vs migration, Rf for protein); band sizes with ranges; CSV export; gel % input with resolving-range warnings; ladder labels and read-across line (guided layer) | ⏳ next |
| 2 | Auto-detection | Lane and band detection guided by the well map; everything stays editable | |
| 3 | Expected-band panels | Multiplex and allele panels; ±% matching; genotype calls; internal-control check; unexpected bands flagged; splitting close or overlapping peaks | |
| 4 | Bad photos | Perspective (4-corner) correction; curved/smiling lanes; blur and quality score; overexposure warnings; background subtraction | |
| 5 | Polish | Custom ladder upload; annotated image and PDF report; band quantification (ng); saved projects and well-map templates | |
| 6 | Mobile | Installable web app (PWA), then a native app with the camera | |

## Open items

- [ ] Add TransGen 50 bp ladder (band list pending from lab).
- [ ] Verify every preinstalled ladder (`src/data/ladders.ts`) against the current manufacturer datasheet and add ng per band.
- [ ] Collect test photos in `sample-gels/`, each with a note on gel type, ladder and well contents.
- [ ] Decide the calibration model: semi-log linear vs. cubic spline vs. point-to-point. Compare them on real gels.

## Tech

React + TypeScript (Vite), Vitest for tests. Image processing in the browser
(canvas, plus OpenCV.js when needed). Layout is phone-friendly from the start.
