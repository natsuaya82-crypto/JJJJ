from PIL import Image, ImageDraw, ImageFont, ImageFilter
B  = 'NotoSansJP-900.ttf'
M  = 'NotoSansJP-700.ttf'
W, H = 1242, 2688      # App Store Connect の 6.5インチ枠
GOLD, CYAN, WHITE, DIM = (245,200,66), (94,212,255), (255,255,255), (162,175,200)

def bg(accent):
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y/H
        d.line([(0,y),(W,y)], fill=(int(6+10*t), int(10+16*t), int(20+30*t)))
    # 見出しの後ろに置く淡い光（画像ごとの色）
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([-358, -770, W+358, 847], fill=72)
    im = Image.composite(Image.new('RGB', (W,H), accent), im,
                         glow.filter(ImageFilter.GaussianBlur(220)))
    return im

def make(shot, eyebrow, l1, l2, sub, accent, out):
    im = bg(accent); d = ImageDraw.Draw(im)
    fe = ImageFont.truetype(M, 40)
    fh = ImageFont.truetype(B, 122)
    fs = ImageFont.truetype(M, 43)
    X = 83
    # 目印（番号＋英字）
    d.rectangle([X, 158, X+8, 201], fill=accent)
    d.text((X+26, 158), eyebrow, font=fe, fill=accent)
    # 見出し2行（強調語だけ色を変える）
    y = 242
    for parts in (l1, l2):
        x = X
        for t, col in parts:
            d.text((x, y), t, font=fh, fill=col)
            x += d.textlength(t, font=fh)
        y += 141
    d.text((X, y+26), sub, font=fs, fill=DIM)

    # スクショ（下は画面外へ流す）
    # ★元のスクショは高さがバラバラ（2171〜2490）。**高さで合わせて幅を切る**こと。
    #   幅で合わせると、短いスクショだけ下に隙間ができて6枚が揃わない
    s = Image.open(shot).convert('RGB')
    sw, sy = 1061, 677
    sh = H - sy                      # ここから下は全部埋める（下端は画面外へ流す）
    # ★**必ず埋まる側の倍率を採る**（cover）。高さだけで合わせると、縦長のスクショが
    #   横に足りなくなって左右に黒い帯が出る（実際に出した）
    k = max(sw/s.width, sh/s.height)
    s = s.resize((max(sw, int(s.width*k+0.5)), max(sh, int(s.height*k+0.5))), Image.LANCZOS)
    left = (s.width - sw)//2         # 横は中央、縦は**上そろえ**（画面の見出しを残す）
    s = s.crop((left, 0, left+sw, sh))
    sx = (W-sw)//2
    halo = Image.new('L', (W,H), 0)
    ImageDraw.Draw(halo).rectangle([sx-14, sy-14, sx+sw+14, H], fill=150)
    im = Image.composite(Image.new('RGB',(W,H),accent), im, halo.filter(ImageFilter.GaussianBlur(40)))
    d = ImageDraw.Draw(im)
    d.rectangle([sx-3, sy-3, sx+sw+3, H], fill=(38,48,68))
    im.paste(s, (sx, sy))
    im.save(out); return out

SET = [
  ('shots/d.jpeg', '01  EKIDEN',   [('勝負を決めるのは、', WHITE)], [('君のオーダーだ。', GOLD)],
   '', (214,150,32), 'out-01.png'),
  ('shots/c.jpeg', '02  LIVE RACE',[('タスキ', GOLD), ('をつないで、', WHITE)], [('頂点を目指せ', WHITE)],
   '', (196,48,48), 'out-02.png'),
  ('shots/f2.png', '03  LEAGUE',   [('目指すは', WHITE)], [('JPEL制覇', GOLD)],
   '', (214,150,32), 'out-03.png'),
  ('shots/b.jpeg', '04  NATIONAL', [('世界と戦う', WHITE)], [('日本の戦士', CYAN)],
   '', (30,118,205), 'out-04.png'),
  ('shots/e.jpeg', '05  RECORDS',  [('世界記録', GOLD)], [('との戦い', WHITE)],
   '', (38,150,110), 'out-05.png'),
  ('shots/g.png',  '06  ONLINE',   [('オンラインで全国の', WHITE)], [('ライバル', CYAN), ('と争え', WHITE)],
   '', (30,150,200), 'out-06.png'),
]
for a in SET: make(*a)
print('done')
