# Builds the TrueType fonts used in PDF downloads (src/lib/exports/pdf-fonts/).
# pdf-lib can't embed WOFF2, and embeds CFF (OpenType) fonts in a way some PDF
# readers reject, so both fonts are converted to plain TrueType here.
# Run with: python3 scripts/make-pdf-fonts.py   (needs fontTools)
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

OUT = "src/lib/exports/pdf-fonts"

# JetBrains Mono: unpack the WOFF (zlib) build to TTF.
mono = TTFont("src/app/fonts/jetbrains-mono-regular.woff")
mono.flavor = None
mono.save(f"{OUT}/jetbrains-mono-regular.ttf")

# Minecraft font: convert CFF outlines to TrueType quadratic outlines.
# The glyphs are made of straight lines, so the conversion is exact.
font = TTFont("src/app/fonts/minecraft-regular.otf")
glyph_set = font.getGlyphSet()
glyf = newTable("glyf")
glyf.glyphOrder = font.getGlyphOrder()
glyf.glyphs = {}
for name in font.getGlyphOrder():
    pen = TTGlyphPen(glyph_set)
    glyph_set[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
    glyf.glyphs[name] = pen.glyph()
font["glyf"] = glyf
font["loca"] = newTable("loca")
maxp = font["maxp"]
maxp.tableVersion = 0x00010000
for attr in ("maxZones", "maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs", "maxStackElements", "maxSizeOfInstructions", "maxComponentElements"):
    setattr(maxp, attr, 0)
maxp.maxZones = 1
font["head"].glyphDataFormat = 0
font["post"].formatType = 2.0
font["post"].extraNames = []
font["post"].mapping = {}
font["post"].glyphOrder = font.getGlyphOrder()
del font["CFF "]
if "VORG" in font:
    del font["VORG"]
font.sfntVersion = "\x00\x01\x00\x00"
font.save(f"{OUT}/minecraft-regular.ttf")
print("wrote", OUT)
