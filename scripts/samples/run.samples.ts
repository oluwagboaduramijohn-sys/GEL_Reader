// Runs the app's automatic pipeline on the real sample gels and saves what it
// found, so detection can be tuned against photos rather than synthetic gels.
//
//   python3 scripts/samples/prepare.py   # decode photos (once, or after editing cases.json)
//   npm run samples                      # run the pipeline, write sample-gels/.out/*.json
//   python3 scripts/samples/overlay.py   # draw what was found on each gel
//
// Cases live in sample-gels/cases.json (kept out of git with the photos).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import type { Well } from '../../src/data/types';
import { autoLanes, detectBands } from '../../src/lib/detect';
import { applyTone, bestChannel, looksLightBackground, toGray } from '../../src/lib/image';
import { analyse, laneKey, newProject, type Project } from '../../src/lib/project';

interface Case {
  id: string;
  file: string;
  rotation?: number;
  crop: [number, number, number, number]; // x0, y0, x1, y1 as fractions of the rotated photo
  rowWells: number[];
  wellLines?: number[]; // y of each row's wells, fraction of the rotated photo (what a person would set)
  wellsUsed?: number[]; // per row: wells after this one are empty
  ladderWells: number[][]; // per row, 1-based wells holding a ladder
  ladderId: string;
  expected?: number[]; // sizes the sample bands should be
  ladderX?: number[]; // per row, x of the first ladder lane's centre, fraction of the rotated photo
}

const GELS = join(import.meta.dirname, '../../sample-gels');
const OUT = join(GELS, '.out');

function readRGBA(path: string) {
  const buf = readFileSync(path);
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  return { width, height, data: new Uint8ClampedArray(buf.buffer, buf.byteOffset + 8, width * height * 4) };
}

function cropRGBA(img: ReturnType<typeof readRGBA>, x: number, y: number, w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * img.width + x) * 4;
    data.set(img.data.subarray(from, from + w * 4), row * w * 4);
  }
  return { width: w, height: h, data };
}

function run(c: Case, wellLines: 'auto' | 'given') {
  const full = readRGBA(join(OUT, `${c.id}.full.rgba`));
  const rotated = readRGBA(join(OUT, `${c.id}.rotated.rgba`));
  const channel = bestChannel(full);
  const invert = looksLightBackground(toGray(full, channel));

  const x = Math.round(c.crop[0] * rotated.width);
  const y = Math.round(c.crop[1] * rotated.height);
  const w = Math.round((c.crop[2] - c.crop[0]) * rotated.width);
  const h = Math.round((c.crop[3] - c.crop[1]) * rotated.height);
  const img = applyTone(toGray(cropRGBA(rotated, x, y, w, h), channel), { invert, contrast: 0.2 });

  const wells: Well[] = [];
  c.rowWells.forEach((count, r) => {
    for (let index = 1; index <= count; index++) {
      const row = r + 1;
      if (index > (c.wellsUsed?.[r] ?? count)) wells.push({ row, index, role: 'empty' });
      else if (c.ladderWells[r]?.includes(index)) wells.push({ row, index, role: 'ladder', ladderId: c.ladderId });
      else wells.push({ row, index, role: 'sample', expected: c.expected });
    }
  });
  let project: Project = { ...newProject('dna'), rowWells: c.rowWells, wells };
  if (wellLines === 'given' && c.wellLines) {
    project.rowTops = c.wellLines.map((f) => Math.round(f * rotated.height - y));
  }
  project = { ...project, ...autoLanes(project, img) };
  project = { ...project, bands: detectBands(project, img, 0.5) };
  const results = analyse(project);

  return {
    id: c.id,
    file: c.file,
    wellLines,
    channel,
    invert,
    crop: { x, y, w, h },
    rotatedWidth: rotated.width,
    rowTops: project.rowTops,
    laneHalfWidth: project.laneHalfWidth,
    lanes: results.map((r) => ({
      key: r.key,
      role: r.well.role,
      x: project.laneX[laneKey(r.well)],
      error: r.error,
      ladderKey: r.ladderKey,
      bands: r.bands.map((b) => ({
        y: b.band.y,
        intensity: b.band.intensity,
        ladderSize: b.band.ladderSize,
        size: b.estimate?.size,
        errPct: b.estimate?.errPct,
        extrapolated: b.estimate?.extrapolated,
        matchesExpected: b.matchesExpected,
      })),
    })),
  };
}

it('runs the pipeline on every sample gel', () => {
  const casesFile = join(GELS, 'cases.json');
  if (!existsSync(casesFile)) {
    console.log('No sample-gels/cases.json: nothing to run.');
    return;
  }
  const cases: Case[] = JSON.parse(readFileSync(casesFile, 'utf8'));
  const summary: string[] = [];
  for (const c of cases) {
    for (const mode of ['auto', 'given'] as const) {
      if (mode === 'given' && !c.wellLines) continue;
      const out = run(c, mode);
      writeFileSync(join(OUT, `${c.id}.${mode}.json`), JSON.stringify(out, null, 1));
      const ladders = out.lanes.filter((l) => l.role === 'ladder');
      // how far the first ladder lane in each row is from where it really is, in lane widths
      const laneErr = (c.ladderX ?? []).map((fx, r) => {
        const lane = ladders.find((l) => l.key.startsWith(`${r + 1}-`));
        return lane ? ((lane.x + out.crop.x - fx * out.rotatedWidth) / (out.laneHalfWidth / 0.35)).toFixed(2) : '?';
      });
      const labelled = ladders.map((l) => `${l.key}:${l.bands.filter((b) => b.ladderSize).length}/${l.bands.length}`);
      const samples = out.lanes.filter((l) => l.role === 'sample' && l.bands.length);
      const matched = samples.filter((l) => l.bands.some((b) => b.matchesExpected)).length;
      summary.push(
        `${c.id.padEnd(10)} ${mode.padEnd(5)} ladder lane off by ${laneErr.join(' ')} | ladder bands labelled ${labelled.join(' ')} | ` +
          `samples with bands ${samples.length}, matching expected ${c.expected ? matched : '-'}`,
      );
    }
  }
  writeFileSync(join(OUT, 'summary.txt'), summary.join('\n') + '\n');
});
