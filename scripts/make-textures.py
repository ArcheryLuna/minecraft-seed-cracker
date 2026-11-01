# Generates the site's original 16x16 pixel textures into public/textures/.
# Run with: python3 scripts/make-textures.py   (needs Pillow)
# A fixed random seed keeps the output stable between runs.
import random
from PIL import Image

random.seed(7)
OUT = "public/textures"

def pick(weighted):
    r = random.random()
    acc = 0.0
    for color, w in weighted:
        acc += w
        if r <= acc:
            return color
    return weighted[-1][0]

DIRT = [((121, 85, 58), 0.38), ((134, 96, 67), 0.25), ((104, 72, 48), 0.22), ((150, 108, 74), 0.08), ((88, 60, 40), 0.07)]
GRASS = [((95, 159, 53), 0.4), ((108, 175, 62), 0.25), ((82, 140, 45), 0.25), ((121, 189, 70), 0.1)]

def dirt_tile():
    img = Image.new("RGB", (16, 16))
    for y in range(16):
        for x in range(16):
            img.putpixel((x, y), pick(DIRT))
    return img

# Dirt, used (darkened) for the page background.
dirt_tile().save(f"{OUT}/dirt.png")

# Grass edge: grass on top with uneven drips into dirt, tiled along the top of the page.
img = dirt_tile()
for x in range(16):
    depth = random.choice([3, 3, 4, 4, 4, 5, 6])
    for y in range(depth):
        img.putpixel((x, y), pick(GRASS))
img.save(f"{OUT}/grass-edge.png")
print("wrote", OUT)
