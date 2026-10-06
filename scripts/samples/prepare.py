"""Decode the sample gel photos the way the browser would, for run.samples.ts.

Node has no JPEG decoder, so this step does the part the browser normally
does: shrink to 1600 px on the long side, then rotate as the user would. It
writes raw RGBA plus a small header to sample-gels/.out/<id>.rgba.

Usage: python3 scripts/samples/prepare.py
"""

import json
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GELS = ROOT / "sample-gels"
OUT = GELS / ".out"
MAX_SIDE = 1600  # same as transform.ts


def main():
    cases = json.loads((GELS / "cases.json").read_text())
    OUT.mkdir(exist_ok=True)
    for case in cases:
        im = Image.open(GELS / case["file"]).convert("RGB")
        scale = min(1, MAX_SIDE / max(im.size))
        if scale < 1:
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        full = im  # channel choice uses the whole photo, as in App.tsx
        angle = case.get("rotation", 0)
        if angle:
            # canvas rotation is clockwise for positive angles; PIL's is anticlockwise
            im = im.rotate(-angle, resample=Image.BICUBIC, expand=True, fillcolor=im.getpixel((0, 0)))
        for name, img in (("full", full), ("rotated", im)):
            rgba = img.convert("RGBA").tobytes()
            (OUT / f"{case['id']}.{name}.rgba").write_bytes(struct.pack("<II", img.width, img.height) + rgba)
        print(f"{case['id']}: {full.width}x{full.height}" + (f", rotated {angle}°" if angle else ""))


if __name__ == "__main__":
    main()
