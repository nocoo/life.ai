#!/usr/bin/env python3
"""
Logo asset generator - Basalt B-3 compliant
Generates all derived logo assets from the root logo.png

Usage:
    uv run scripts/resize-logos.py
    # or
    python scripts/resize-logos.py
"""

from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not installed. Run: uv pip install pillow")
    raise SystemExit(1)

# === Project-specific config ===
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "logo.png"
PUBLIC = ROOT / "dashboard" / "public"
APP = ROOT / "dashboard" / "src" / "app"
OG_BG = (15, 15, 15)  # Dark background for OG image


def resize(img: Image.Image, size: int) -> Image.Image:
    """Resize image to square with LANCZOS resampling."""
    return img.resize((size, size), Image.Resampling.LANCZOS)


def generate_og_image(img: Image.Image, output: Path) -> None:
    """Generate 1200x630 OG image with logo centered on brand background."""
    canvas = Image.new("RGB", (1200, 630), OG_BG)
    # Logo at 40% of canvas height
    logo_size = int(630 * 0.4)
    logo = resize(img, logo_size)
    # Center position
    x = (1200 - logo_size) // 2
    y = (630 - logo_size) // 2
    # Paste with alpha mask
    canvas.paste(logo, (x, y), logo if img.mode == "RGBA" else None)
    canvas.save(output, "PNG", optimize=True)
    print(f"  ✓ {output.relative_to(ROOT)}")


def generate_ico(img: Image.Image, output: Path) -> None:
    """Generate multi-resolution ICO file (16x16 + 32x32)."""
    ico_16 = resize(img, 16)
    ico_32 = resize(img, 32)
    ico_16.save(output, format="ICO", sizes=[(16, 16), (32, 32)], append_images=[ico_32])
    print(f"  ✓ {output.relative_to(ROOT)}")


def main() -> None:
    if not SOURCE.exists():
        print(f"Error: Source logo not found at {SOURCE}")
        raise SystemExit(1)

    img = Image.open(SOURCE).convert("RGBA")
    print(f"Source: {SOURCE} ({img.width}x{img.height})")

    # Ensure directories exist
    PUBLIC.mkdir(parents=True, exist_ok=True)
    APP.mkdir(parents=True, exist_ok=True)

    # === public/ assets (for <img src> references) ===
    print("\npublic/ assets:")
    for size in [24, 80]:
        out = PUBLIC / f"logo-{size}.png"
        resize(img, size).save(out, "PNG", optimize=True)
        print(f"  ✓ {out.relative_to(ROOT)}")

    # === src/app/ assets (Next.js file conventions) ===
    print("\nsrc/app/ assets (Next.js metadata):")

    # favicon: 32x32 PNG
    icon_out = APP / "icon.png"
    resize(img, 32).save(icon_out, "PNG", optimize=True)
    print(f"  ✓ {icon_out.relative_to(ROOT)}")

    # Apple touch icon: 180x180
    apple_out = APP / "apple-icon.png"
    resize(img, 180).save(apple_out, "PNG", optimize=True)
    print(f"  ✓ {apple_out.relative_to(ROOT)}")

    # favicon.ico: multi-resolution
    generate_ico(img, APP / "favicon.ico")

    # OG image: 1200x630
    generate_og_image(img, APP / "opengraph-image.png")

    print("\n✅ All logo assets generated successfully!")


if __name__ == "__main__":
    main()
