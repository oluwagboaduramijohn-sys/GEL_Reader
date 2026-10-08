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
| 1 | Foundation | Upload; crop and rotate; contrast and invert; gel type; well map (wells, rows, roles, labels); ladder picker; **manual ruler** (click bands); calibration curve (log size vs migration distance; protein uses the same per-gel curve, Rf only needed to compare across gels); band sizes with ranges; CSV export; gel % input with resolving-range warnings; ladder labels and read-across line (guided layer); expected-size check per sample; automatic band detection (pulled forward from Stage 2) | ✅ |
| 2 | Auto-detection | Basic lane fitting and band detection already in Stage 1. Done: imaging setup (system + stain, remembered per computer), TIFF incl. 16-bit gel doc exports, automatic best colour channel, overexposure warning; multi-comb gels (1–4 rows, own well count per row, ladder borrowed from the nearest row when a row has none, run-into-next-row warning, bulk setup: ladders per row, pasted names, shared expected sizes); ladder labelling that copes with merged/missing bands anywhere, anchored on the reference band; contrast no longer clips bright bands. Lane placement tuned on 5 real gels (rows from the same comb fitted together; empty wells and ladder band patterns used to place the grid). Automatic band detection leaves out bands below the ladder's smallest fragment and doesn't label stray spots below the ladder. Remaining: tune band detection on real photos (lab uses EtBr on a tabletop UV transilluminator, Bio-Rad and Analytik Jena gel docs), multi-ladder smile correction, smarter well-line finding | ⏳ in progress |
| 3 | Expected-band panels | Multiplex and allele panels; ±% matching; genotype calls; internal-control check; unexpected bands flagged; splitting close or overlapping peaks | |
| 4 | Bad photos | Perspective (4-corner) correction; curved/smiling lanes; blur and quality score; overexposure warnings; background subtraction | |
| 5 | Polish | Custom ladder upload; annotated image and PDF report; band quantification (ng); saved projects and well-map templates | |
| 6 | Mobile | Installable web app (PWA), then a native app with the camera | |

## Open items

- [x] Add the lab's ladders: TransGen 100bp Plus II (BM321) and NEB Quick-Load Purple 50 bp (N0556); the 50 bp ladder is NEB's, not TransGen's.
- [ ] Check NEB Quick-Load Purple 50 bp (N0556) against its own datasheet; currently from N3236.
- [x] Verify the preinstalled ladders (`src/data/ladders.ts`) against manufacturer datasheets and add ng per band (6 Oct 2026). Fixed NEB ssRNA Ladder sizes; added reference bands.
- [ ] Check NEB Quick-Load 1 kb (N0468) and 100 bp (N0467) against their own datasheets (neb.com blocks automated fetching); currently copied from N3232/N3231.
- [ ] Collect test photos in `sample-gels/`, each with a note on gel type, ladder and well contents.
- [ ] Decide the calibration model: semi-log linear vs. cubic spline vs. point-to-point. Compare them on real gels.

## Tech

React + TypeScript (Vite), Vitest for tests. Image processing in the browser
(canvas, plus OpenCV.js when needed). Layout is phone-friendly from the start.
