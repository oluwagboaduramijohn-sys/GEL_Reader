"""Score automatic well counting against the cases' known layouts.

Spacing is right when within 5% of the true lane spacing (from the comb's
well count and the ladder positions); well 1 is right when the first
counted lane is within half a lane of the first ladder.

Usage: python3 scripts/samples/score_wells.py [auto|given]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "sample-gels" / ".out"
mode = sys.argv[1] if len(sys.argv) > 1 else "given"
cases = {c["id"]: c for c in json.loads((ROOT / "sample-gels" / "cases.json").read_text())}
# true lane spacing as a fraction of the rotated photo's width, per comb size and camera
SPACING = {("biorad", 20): 0.0205, ("biorad", 15): 0.0278, ("B", 20): 0.0149, ("B3", 20): 0.0179, ("DC", 20): 0.0161, ("DC", 15): 0.0217}

def camera(cid):
    return "biorad" if cid in ("MDR1", "KELH", "DHPS", "CRT") else "B3" if cid == "B3" else "DC" if cid.startswith("DC") else "B"

ok_sp = ok_first = rows = 0
for cid, c in cases.items():
    f = OUT / f"{cid}.{mode}.json"
    if not f.exists():
        continue
    r = json.loads(f.read_text())
    marks = []
    for i, k in enumerate(r["counted"]):
        true_sp = SPACING[(camera(cid), c["rowWells"][i])] * r["rotatedWidth"]
        sp_ok = k["spacing"] and abs(k["spacing"] / true_sp - 1) < 0.05
        first_ok = abs(k["first"] + r["crop"]["x"] - c["ladderX"][i] * r["rotatedWidth"]) < true_sp / 2
        rows += 1
        ok_sp += bool(sp_ok)
        ok_first += bool(first_ok)
        marks.append(f"{'S' if sp_ok else 's'}{'1' if first_ok else '.'} n{k['count']}/{c['rowWells'][i]}")
    print(f"{cid:6} {'  '.join(marks)}")
print(f"spacing right {ok_sp}/{rows}, well 1 right {ok_first}/{rows}")
