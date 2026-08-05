#!/usr/bin/env python3
"""生成AIが1枚にまとめて出した「ロゴ一覧シート」を、1個ずつの透過PNGに切り出す。

    python3 scripts/sheet-to-logos.py <シート画像> <出力フォルダ> [--cols 4] [--rows 4] [--names a,b,c...]

なぜ要るか:
  ロゴを16個まとめて頼むと、生成AIは1枚の4x4シートで返してくることがある。
  しかも背景が透過されず白で塗られてくる。この2つをまとめて片付ける。

背景の抜き方（ここが肝）:
  「白い画素を全部消す」ではなく【外周から繋がっている領域だけ】を消す。
  ロゴの中にも白はある（三日月・風車・雪の結晶・鶴・城の白壁など）。
  色で一括指定すると、そこに穴が空く。
  外周から塗りつぶし（flood fill）で外側だけを辿れば、中の白は残る。
  トンボの羽の隙間のように「外と繋がっている空白」はちゃんと透明になる。

輪郭のギザギザ対策:
  生成画像の輪郭は白と混ざってぼけている。完全に消す／残すの2択だと白い縁が残る。
  背景に接している画素は、白にどれだけ近いかで半透明にして境目をなじませる。

出力:
  280x280 / RGBA / ロゴ本体の長辺129px（既存20チームの実測中央値）で中央配置。
  scripts/fit-logo.py と同じ体裁になる。
"""
import sys
import os
from collections import deque
from PIL import Image

CANVAS = 280
TARGET_LONG_SIDE = 129
# 外周からの塗りつぶしで「背景と同じ」と見なす色の許容差（0-255）。
# 大きくすると輪郭の白いフチは消えるが、ロゴの中の「ほぼ白」の塗り
# （灯台の光条 #F5F5F0、麦の葉の淡色など）まで背景と誤認して食われる。
# 小さめにして、境目は下の FEATHER でなじませる。
FILL_TOLERANCE = 12
# 背景に接する画素をなじませる幅（px）
FEATHER = 2


def strip_background(im: Image.Image) -> Image.Image:
    """外周から繋がっている背景だけを透明にする。中の白は残す。"""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()

    # 背景色は四隅の平均（真っ白でないシートもあるため）
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def near_bg(p) -> int:
        """背景色との差（0=同じ）"""
        return max(abs(p[0] - bg[0]), abs(p[1] - bg[1]), abs(p[2] - bg[2]))

    outside = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near_bg(px[x, y]) <= FILL_TOLERANCE and not outside[y * w + x]:
                outside[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near_bg(px[x, y]) <= FILL_TOLERANCE and not outside[y * w + x]:
                outside[y * w + x] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not outside[ny * w + nx]:
                if near_bg(px[nx, ny]) <= FILL_TOLERANCE:
                    outside[ny * w + nx] = 1
                    q.append((nx, ny))

    # 背景を透明に。背景に接している画素は白との近さで半透明にしてなじませる
    for y in range(h):
        row = y * w
        for x in range(w):
            if outside[row + x]:
                px[x, y] = (0, 0, 0, 0)
                continue
            touching = any(
                0 <= x + dx < w and 0 <= y + dy < h and outside[(y + dy) * w + (x + dx)]
                for dx in range(-FEATHER, FEATHER + 1)
                for dy in range(-FEATHER, FEATHER + 1)
            )
            if touching:
                d = near_bg(px[x, y])
                a = min(255, int(d * 255 / max(1, FILL_TOLERANCE)))
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, a)
    return im


def drop_edge_fragments(im: Image.Image) -> Image.Image:
    """セルの端に触れている「小さな」塊を捨てる。

    一覧シートを等分で切ると、隣のロゴのはみ出しが端に写り込む。
    ただし「端に触れている＝かけら」で消すと、セルより大きく描かれた
    ロゴ本体まで丸ごと消える（実際に盾型の2つが消えた）。
    塊の大きさを比べて、一番大きい塊に対して十分小さいものだけを捨てる。
    """
    w, h = im.size
    px = im.load()
    label = [0] * (w * h)
    blobs: list[tuple[int, bool]] = []   # (画素数, 端に触れているか)

    for sy in range(h):
        for sx in range(w):
            if px[sx, sy][3] == 0 or label[sy * w + sx]:
                continue
            idx = len(blobs) + 1
            size = 0
            touches = False
            q = deque([(sx, sy)])
            label[sy * w + sx] = idx
            while q:
                x, y = q.popleft()
                size += 1
                if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                    touches = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not label[ny * w + nx] and px[nx, ny][3] > 0:
                        label[ny * w + nx] = idx
                        q.append((nx, ny))
            blobs.append((size, touches))

    if not blobs:
        return im
    biggest = max(size for size, _ in blobs)
    # 一番大きい塊の20%未満で、かつ端に触れているものだけ捨てる
    drop = {i + 1 for i, (size, touches) in enumerate(blobs) if touches and size < biggest * 0.2}
    if drop:
        for y in range(h):
            row = y * w
            for x in range(w):
                if label[row + x] in drop:
                    px[x, y] = (0, 0, 0, 0)
    return im


def fit(im: Image.Image) -> Image.Image:
    """切り出して 280x280 の中央に置く（fit-logo.py と同じ体裁）"""
    bbox = im.split()[3].getbbox()
    if bbox is None:
        raise ValueError('中身が空')
    body = im.crop(bbox)
    scale = TARGET_LONG_SIDE / max(body.size)
    body = body.resize((max(1, round(body.width * scale)), max(1, round(body.height * scale))), Image.LANCZOS)
    out = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(body, ((CANVAS - body.width) // 2, (CANVAS - body.height) // 2), body)
    return out


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 1
    sheet_path, dst_dir = args[0], args[1]
    cols = rows = 4
    names: list[str] = []
    for i, a in enumerate(args):
        if a == '--cols':
            cols = int(args[i + 1])
        elif a == '--rows':
            rows = int(args[i + 1])
        elif a == '--names':
            names = [n.strip() for n in args[i + 1].split(',') if n.strip()]

    os.makedirs(dst_dir, exist_ok=True)
    sheet = Image.open(sheet_path).convert('RGBA')
    cw, ch = sheet.width // cols, sheet.height // rows

    n = 0
    for r in range(rows):
        for c in range(cols):
            cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            try:
                out = fit(drop_edge_fragments(strip_background(cell)))
            except ValueError as e:
                print(f'{r * cols + c + 1:2d} NG {e}')
                continue
            name = names[n] if n < len(names) else f'{n + 1:02d}'
            out.save(os.path.join(dst_dir, f'{name}.png'))
            print(f'{name:20s} OK')
            n += 1
    print(f'\n{n} 件を {dst_dir} に書き出しました')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
