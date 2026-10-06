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

## Layout

- `src/data/` — data model (`types.ts`) and preinstalled ladders (`ladders.ts`)
- `src/lib/` — image processing and calibration math
- `src/components/` — UI
- `sample-gels/` — test photos with notes
- `docs/` — plan and design notes
