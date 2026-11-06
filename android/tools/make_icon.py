"""Render the launcher icon (合 on the docs accent colour) into res/mipmap-*.

One-off helper: the PNGs are committed, so the APK build does not need Pillow.
Run from the repo root: ``python android/tools/make_icon.py``.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"
ACCENT = (214, 72, 47)  # --accent in docs/style.css
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
RES = Path(__file__).resolve().parent.parent / "res"


def render(px: int) -> Image.Image:
    scale = 4  # supersample for smooth edges
    s = px * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=ACCENT)
    font = ImageFont.truetype(FONT, int(s * 0.62))
    draw.text((s / 2, s / 2), "合", font=font, fill="white", anchor="mm")
    return img.resize((px, px), Image.LANCZOS)


if __name__ == "__main__":
    for density, px in SIZES.items():
        out = RES / f"mipmap-{density}" / "ic_launcher.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        render(px).save(out, optimize=True)
        print(out)
