#!/usr/bin/env python3
"""إعادة توليد أوراق اللعب الـ52 بالتصميم النهائي (v3):
- الأرقام/الرموز بضعف الحجم السابق (سميك وواضح)
- توزيع الرموز هندسي متماثل تماماً
- لوغو المنصة الرئيسي (card-logo.png — بدون خلفية) بالمنتصف بشكل واضح
"""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = '/root/casino-work/dmc-branch'
CARDS_DIR = os.path.join(BASE, 'assets/cards')
W, H = 864, 1216
FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
LOGO = Image.open(os.path.join(BASE, 'assets/logo/card-logo.png')).convert('RGBA')

RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
SUITS = {
    'hearts':   {'glyph': '♥', 'color': (220, 30, 40)},
    'diamonds': {'glyph': '♦', 'color': (220, 30, 40)},
    'spades':   {'glyph': '♠', 'color': (20, 22, 28)},
    'clubs':    {'glyph': '♣', 'color': (20, 22, 28)},
}

# ── تخطيطات هندسية متماثلة تماماً (نسب داخل منطقة الرموز المركزية) ──
PIP_LAYOUTS = {
    'A':  [],
    '2':  [(0.5, 0.10), (0.5, 0.90)],
    '3':  [(0.5, 0.10), (0.5, 0.90), (0.5, 0.5)],
    '4':  [(0.24, 0.14), (0.76, 0.14), (0.24, 0.86), (0.76, 0.86)],
    '5':  [(0.24, 0.14), (0.76, 0.14), (0.5, 0.5), (0.24, 0.86), (0.76, 0.86)],
    '6':  [(0.24, 0.14), (0.76, 0.14), (0.24, 0.5), (0.76, 0.5), (0.24, 0.86), (0.76, 0.86)],
    '7':  [(0.24, 0.12), (0.76, 0.12), (0.5, 0.30), (0.24, 0.5), (0.76, 0.5), (0.24, 0.88), (0.76, 0.88)],
    '8':  [(0.24, 0.12), (0.76, 0.12), (0.5, 0.30), (0.24, 0.5), (0.76, 0.5), (0.5, 0.70), (0.24, 0.88), (0.76, 0.88)],
    '9':  [(0.24, 0.10), (0.76, 0.10), (0.24, 0.33), (0.76, 0.33), (0.5, 0.5), (0.24, 0.67), (0.76, 0.67), (0.24, 0.90), (0.76, 0.90)],
    '10': [(0.24, 0.08), (0.76, 0.08), (0.5, 0.22), (0.24, 0.36), (0.76, 0.36), (0.5, 0.5), (0.24, 0.64), (0.76, 0.64), (0.24, 0.92), (0.76, 0.92)],
    'J': [], 'Q': [], 'K': [],
}

def make_card(rank, suit_key):
    suit = SUITS[suit_key]
    color = suit['color']
    glyph = suit['glyph']
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # خلفية بيضاء بحواف دائرية وإطار ذهبي خفيف
    margin = 10
    d.rounded_rectangle((margin, margin, W - margin, H - margin), radius=36,
                        fill=(252, 250, 244, 255), outline=(200, 190, 170, 255), width=4)
    inner = margin + 14
    d.rounded_rectangle((inner, inner, W - inner, H - inner), radius=26,
                        outline=(210, 180, 110, 90), width=2)

    # ── الأركان: أرقام وحروف بضعف الحجم (300px) ──
    f_rank = ImageFont.truetype(FONT_PATH, 300)
    f_suit_c = ImageFont.truetype(FONT_PATH, 190)
    f_center = ImageFont.truetype(FONT_PATH, 800)
    f_face = ImageFont.truetype(FONT_PATH, 560)

    def corner(x, y, flip=False):
        bbox = d.textbbox((0, 0), rank, font=f_rank)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        bbox_s = d.textbbox((0, 0), glyph, font=f_suit_c)
        sw, sh = bbox_s[2] - bbox_s[0], bbox_s[3] - bbox_s[1]
        if flip:
            sub = Image.new('RGBA', (tw + 10, th + sh + 40), (0, 0, 0, 0))
            sd = ImageDraw.Draw(sub)
            sd.text((sub.width // 2, 0), rank, font=f_rank, fill=color, anchor='ma')
            sd.text((sub.width // 2, th + 24), glyph, font=f_suit_c, fill=color, anchor='ma')
            sub = sub.rotate(180)
            img.paste(sub, (x - sub.width, y - sub.height), sub)
        else:
            d.text((x, y), rank, font=f_rank, fill=color, anchor='la')
            d.text((x + (tw - sw) // 2 + bbox_s[0], y + th + 20), glyph, font=f_suit_c, fill=color)

    pad = 42
    corner(pad, pad, flip=False)
    corner(W - pad, H - pad, flip=True)

    # ── اللوغو الرئيسي بالمنتصف — يُرسم أخيراً (فوق الرموز) كي يبقى واضحاً ──
    is_face = rank in ('J', 'Q', 'K')
    is_ace = rank == 'A'
    logo_w = 430 if is_ace else 340
    logo = LOGO.copy()
    logo = logo.resize((logo_w, int(logo_w * LOGO.height / LOGO.width)))
    lx = W // 2 - logo.width // 2
    ly = H // 2 - logo.height // 2

    if is_ace or is_face:
        overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        if is_ace:
            od.text((W // 2, H // 2), glyph, font=f_center, fill=color + (165,), anchor='mm')
        else:
            od.text((W // 2, H // 2 - 60), rank, font=f_face, fill=(185, 135, 35, 205), anchor='mm',
                    stroke_width=10, stroke_fill=(255, 240, 200, 205))
            od.text((W // 2, H // 2 + 230), glyph, font=ImageFont.truetype(FONT_PATH, 380),
                    fill=color + (200,), anchor='mm')
        img = Image.alpha_composite(img, overlay)
        d = ImageDraw.Draw(img)
        img.paste(logo, (lx, ly), logo)
    else:
        # ── الرموز بضعف الحجم (400/360px) هندسية متماثلة ──
        pip_size = 400 if int(rank) <= 6 else 360
        f_pip = ImageFont.truetype(FONT_PATH, pip_size)
        area_x0, area_y0 = pad + 160, pad + 280
        area_x1, area_y1 = W - pad - 160, H - pad - 280
        for (fx, fy) in PIP_LAYOUTS[rank]:
            cx = area_x0 + fx * (area_x1 - area_x0)
            cy = area_y0 + fy * (area_y1 - area_y0)
            d.text((cx, cy), glyph, font=f_pip, fill=color, anchor='mm',
                   stroke_width=6, stroke_fill=color)
        # اللوغو فوق الرموز — واضح تماماً بمركز الورقة
        img.paste(logo, (lx, ly), logo)

    bg = Image.new('RGBA', (W, H), (252, 250, 244, 255))
    bg.paste(img, (0, 0), img)
    return bg.convert('RGB')

for suit_key in SUITS:
    for rank in RANKS:
        card = make_card(rank, suit_key)
        card.save(os.path.join(CARDS_DIR, f'{rank}-{suit_key}.webp'), 'WEBP', quality=92)
print('DONE v3: 52 cards — doubled sizes, geometric layouts, main logo center')
