"""Draw what run.samples.ts found on each gel: well lines, lanes, bands and sizes.

Ladder bands are labelled with their suggested ladder size (yellow); sample
bands with their estimated size (green when it matches an expected size,
white otherwise). Writes sample-gels/.out/<id>.<mode>.png.

Usage: python3 scripts/samples/overlay.py [id ...]
"""

import json
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "sample-gels" / ".out"
SCALE = 2  # analysis images are small; enlarge so labels are readable


def load_rgba(path):
    buf = path.read_bytes()
    w, h = struct.unpack("<II", buf[:8])
    return Image.frombytes("RGBA", (w, h), buf[8:])


def draw(result_path):
    r = json.loads(result_path.read_text())
    c = r["crop"]
    img = load_rgba(OUT / f"{r['id']}.rotated.rgba").crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))
    img = ImageOps.autocontrast(img.convert("L"), cutoff=0.3)
    if r["invert"]:
        img = ImageOps.invert(img)
    img = img.resize((img.width * SCALE, img.height * SCALE)).convert("RGB")
    d = ImageDraw.Draw(img)
    s = SCALE
    for top in r["rowTops"]:
        d.line([(0, top * s), (img.width, top * s)], fill=(255, 80, 80), width=1)
    hw = r["laneHalfWidth"]
    for lane in r["lanes"]:
        x = lane["x"]
        colour = (255, 200, 0) if lane["role"] == "ladder" else (80, 160, 255)
        row = int(lane["key"].split("-")[0])
        top = r["rowTops"][row - 1] if row - 1 < len(r["rowTops"]) else 0
        d.rectangle([(x - hw) * s, top * s, (x + hw) * s, top * s + 4], outline=colour)
        for b in lane["bands"]:
            y = b["y"] * s
            d.line([(x - hw) * s, y, (x + hw) * s, y], fill=colour, width=1)
            if lane["role"] == "ladder":
                label = str(b["ladderSize"]) if b.get("ladderSize") else "?"
                d.text(((x - hw) * s - 2, y - 6), label, fill=(255, 230, 0), anchor="rm")
            elif b.get("size"):
                fill = (80, 255, 80) if b.get("matchesExpected") else (255, 255, 255)
                d.text(((x + hw) * s + 2, y - 6), f"{b['size']:.0f}", fill=fill)
    out = result_path.with_suffix(".png")
    img.save(out)
    print(out.name)


def main():
    ids = set(sys.argv[1:])
    for p in sorted(OUT.glob("*.json")):
        if not ids or p.name.split(".")[0] in ids:
            draw(p)


if __name__ == "__main__":
    main()
