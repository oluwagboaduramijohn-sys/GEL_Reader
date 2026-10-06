import { describe, expect, it } from 'vitest';
import { analyse, makeWells, newProject, type Band, type Project } from './project';

// ideal semi-log gel: y = 400 - 100 * log10(size)
const yOf = (size: number) => 400 - 100 * Math.log10(size);
let id = 0;
const band = (laneKey: string, size: number, ladderSize?: number): Band => ({
  id: `t${id++}`,
  laneKey,
  y: yOf(size),
  source: 'auto',
  intensity: 1,
  ladderSize,
});

function project(expected: number[], sampleBands: number[]): Project {
  const p = newProject('dna');
  const wells = makeWells([2], [], 'transgen-100bp-plus');
  wells[1].expected = expected;
  const ladder = [1500, 1000, 700, 500, 300, 200, 100];
  return {
    ...p,
    gelPercent: '2.0',
    rowWells: [2],
    wells,
    laneX: { '1-1': 50, '1-2': 150 },
    bands: [...ladder.map((s) => band('1-1', s, s)), ...sampleBands.map((s) => band('1-2', s))],
  };
}

describe('analyse', () => {
  it('sizes sample bands from the ladder in the same row', () => {
    const lane = analyse(project([], [420]))[1];
    expect(lane.ladderKey).toBe('1-1');
    expect(lane.bands[0].estimate!.size).toBeCloseTo(420, 0);
  });

  it('ticks off expected bands and flags extras', () => {
    const lane = analyse(project([320, 210], [318, 650]))[1];
    expect(lane.expected[0].found?.estimate?.size).toBeCloseTo(318, 0);
    expect(lane.expected[1].found).toBeUndefined();
    expect(lane.unexpected.map((b) => Math.round(b.estimate!.size))).toEqual([650]);
  });

  it('matches each band to at most one expected size', () => {
    const lane = analyse(project([300, 310], [305]))[1];
    expect(lane.expected.filter((e) => e.found)).toHaveLength(1);
  });

  it('explains when there is no ladder to size against', () => {
    const p = project([], [420]);
    p.bands = p.bands.filter((b) => b.laneKey !== '1-1');
    const lane = analyse(p)[1];
    expect(lane.bands[0].estimate).toBeUndefined();
    expect(lane.error).toMatch(/ladder/i);
  });
});
