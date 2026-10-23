"""Losslessly package the existing fonts as WOFF2; keep all glyphs and tables.

Requires fonttools==4.67.0 and brotli==1.2.1 (pip install --target is supported).
Run from the repository root with PYTHONPATH pointing at that install if needed.
"""
from io import BytesIO
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData


def font_tables(font):
    # WOFF2 omits the sfnt digital signature, which only signs the old container.
    return {tag: font.getTableData(tag) for tag in font.keys() if tag not in ("GlyphOrder", "head", "DSIG")}


root = Path(__file__).resolve().parent.parent / "src" / "fonts"
before = after = 0
for source in sorted([*root.glob("*.otf"), *root.glob("*.ttf")]):
    font = TTFont(source, recalcTimestamp=False)
    font.flavor = "woff2"
    # Disable the optional glyf transform so table bytes are preserved exactly.
    font.flavorData = WOFF2FlavorData(transformedTables=set())
    buffer = BytesIO()
    font.save(buffer)
    encoded = buffer.getvalue()
    restored = TTFont(BytesIO(encoded), recalcTimestamp=False)
    original = TTFont(source, recalcTimestamp=False)
    assert original.getBestCmap() == restored.getBestCmap(), source
    assert original.getGlyphOrder() == restored.getGlyphOrder(), source
    assert font_tables(original) == font_tables(restored), source
    assert original["head"].flags & ~(1 << 11) == restored["head"].flags & ~(1 << 11), source
    for field in original["head"].__dict__:
        if field not in ("checkSumAdjustment", "flags"):
            assert getattr(original["head"], field) == getattr(restored["head"], field), (source, field)
    source.with_suffix(".woff2").write_bytes(encoded)
    before += source.stat().st_size
    after += len(encoded)
print(f"Verified all font tables and glyphs: {before:,} -> {after:,} bytes ({1 - after / before:.1%} smaller)")
