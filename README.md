# Gel Reader

Browser-based tool for estimating band sizes on DNA, RNA and protein gels from a photo.
See [docs/PLAN.md](docs/PLAN.md) for the roadmap.

## Run

```bash
npm install
npm run dev     # open the printed localhost URL
npm test        # run unit tests
npm run build   # type-check and build
```

## Hosting

The app is a static site: all image processing happens in the browser, so
gel photos never leave the user's computer. Every push to `main` runs the
tests, builds the app and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup on GitHub: Settings →
Pages → Source: "GitHub Actions".

## Testing on real gel photos

The photos in `sample-gels/` stay out of git (study data), and so does
`sample-gels/cases.json`, which records for each photo the crop, wells per
row, which wells hold ladders, and where the ladders really are.

```bash
python3 scripts/samples/prepare.py   # decode the photos (needs Pillow)
npm run samples                      # run the automatic pipeline on each case
python3 scripts/samples/overlay.py   # draw lanes, bands and sizes on each gel
```

Results, overlays and `summary.txt` go to `sample-gels/.out/`.

## Layout

- `src/data/` — data model (`types.ts`) and preinstalled ladders (`ladders.ts`)
- `src/lib/` — image processing and calibration math
- `src/components/` — UI
- `sample-gels/` — test photos with notes
- `scripts/samples/` — runs the pipeline on the test photos
- `docs/` — plan and design notes
