from PIL import Image, ImageDraw
import random
from pathlib import Path

random.seed(23)
im = Image.new('RGB', (960, 640), '#8cb979')
d = ImageDraw.Draw(im)

# Meadow and walking paths are deliberately drawn on a low-resolution pixel grid.
for _ in range(14000):
    x, y = random.randrange(960), random.randrange(640)
    col = random.choice(['#86ae70', '#94bf80', '#9ac485', '#82ad6d'])
    d.rectangle((x, y, x + random.choice([1, 2, 3]), y + 1), fill=col)
for box in [(0, 335, 960, 402), (200, 238, 253, 370), (455, 238, 508, 370), (711, 246, 760, 370), (453, 388, 506, 640)]:
    d.rectangle(box, fill='#d3bb88')
    d.line((box[0], box[1], box[2], box[1]), fill='#e9d5a1', width=3)
for _ in range(1900):
    x,y=random.randrange(960), random.randrange(640)
    if im.getpixel((x,y)) in [(211,187,136),(233,213,161)]:
        d.rectangle((x,y,x+2,y+1),fill=random.choice(['#e0c999','#c2a875','#d9c295']))

def tree(x,y):
    d.ellipse((x-16,y+7,x+18,y+18),fill='#729868')
    d.rectangle((x-4,y-6,x+4,y+13),fill='#76513c')
    d.rectangle((x-2,y-2,x,y+11),fill='#a27649')
    d.ellipse((x-19,y-34,x+18,y+2),fill='#45785a')
    d.ellipse((x-16,y-38,x+14,y-8),fill='#568b61')
    d.ellipse((x-13,y-35,x+7,y-18),fill='#70a86c')
    for _ in range(12):
        dx,dy=random.randrange(-13,12),random.randrange(-31,-8)
        d.rectangle((x+dx,y+dy,x+dx+2,y+dy+1),fill='#86b97a')

def building(x,y,w,h,roof,front,kind):
    d.rectangle((x-5,y+h-8,x+w+5,y+h+6),fill='#72956a')
    d.rectangle((x,y+36,x+w,y+h),fill='#664b43')
    d.rectangle((x+4,y+39,x+w-4,y+h-4),fill=front)
    for yy in range(y+46,y+h-8,12): d.line((x+5,yy,x+w-5,yy), fill='#dfcba3')
    d.polygon([(x-9,y+39),(x+12,y+5),(x+w-12,y+5),(x+w+9,y+39)],fill='#664b43')
    d.polygon([(x-4,y+36),(x+15,y+9),(x+w-15,y+9),(x+w+4,y+36)],fill=roof)
    for row in range(3):
        yy=y+15+row*7
        d.line((x+11-row*4,yy,x+w-11+row*4,yy),fill='#e3a080',width=2)
        for xx in range(x+20-row*4,x+w-15+row*4,17): d.line((xx,yy,xx-3,yy+5),fill='#a85e50')
    d.rectangle((x+w//2-13,y+h-43,x+w//2+13,y+h),fill='#704a3b')
    d.rectangle((x+w//2-10,y+h-39,x+w//2+10,y+h-2),fill='#a77451')
    d.rectangle((x+w//2+5,y+h-22,x+w//2+7,y+h-20),fill='#f5d17e')
    for wx in (x+19,x+w-43):
        d.rectangle((wx,y+57,wx+25,y+80),fill='#765346')
        d.rectangle((wx+3,y+60,wx+22,y+77),fill='#85bfc1')
        d.line((wx+12,y+60,wx+12,y+77),fill='#d6e5c4',width=2)
        d.line((wx+3,y+68,wx+22,y+68),fill='#d6e5c4',width=2)
    d.rectangle((x+w//2-29,y+39,x+w//2+29,y+53),fill='#765244')
    d.text((x+w//2-23,y+41),kind,fill='#fff0be')

building(140,91,170,135,'#bd7666','#f2e0b9','MISSION')
building(395,96,170,135,'#75929b','#e5dfbd','WORKSHOP')
# A tiled launch platform and gantry. The rocket itself is a sprite (assets/sprites/rocket_spritesheet.png)
# placed by world.gd, so it can lift off.
d.ellipse((646,119,838,231),fill='#6e946c')
d.ellipse((652,112,832,220),fill='#8b99a0')
d.ellipse((660,119,824,211),fill='#bcc6bd')
d.ellipse((679,130,807,203),fill='#87959b')
d.rectangle((752,107,758,191),fill='#7a6660'); d.rectangle((779,111,785,195),fill='#7a6660')
for yy in range(117,192,15): d.line((752,yy,784,yy+12),fill='#d9baa1',width=3)
d.rectangle((690,207,796,218),fill='#6b797b'); d.rectangle((721,205,767,211),fill='#e6c68e')
# Trees and flowers provide a readable border without obstructing the paths.
for x,y in [(42,65),(88,105),(340,72),(593,75),(888,82),(915,188),(52,215),(100,294),(325,292),(610,295),(872,282),(74,475),(148,540),(248,504),(333,574),(585,527),(650,570),(824,513),(908,565)]: tree(x,y)
for _ in range(300):
    x,y=random.randrange(15,945),random.randrange(430,620)
    if im.getpixel((x,y)) in [(140,185,121),(134,174,112),(148,191,128),(154,196,133),(130,173,109)]:
        d.rectangle((x,y,x+1,y+2),fill=random.choice(['#f0d38c','#e6a59b','#f4e1b6']))
Path('assets').mkdir(exist_ok=True)
im.save('assets/space_center.png')
