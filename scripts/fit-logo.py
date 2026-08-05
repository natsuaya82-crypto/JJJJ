#!/usr/bin/env python3
"""生成したチームロゴを、既存20チームと同じ体裁に機械的に揃える。

    python3 scripts/fit-logo.py <入力フォルダ> <出力フォルダ>

なぜ要るか:
  画像生成AIは「余白を45%空けて中央に」を必ず外す。そのまま public/logos/ に
  置くと、チーム一覧に並べたときに大きさがバラバラになる。
  既存20個を実測した値（下の定数）に合わせて、切り出し→拡縮→中央配置をやり直す。

実測値（public/logos/*.png 20個）:
  キャンバス 280x280 / RGBA / 四隅は完全透過
  ロゴ本体の長辺 118〜169px、中央値 129px（キャンバスの46%）

やること:
  1. 透過部分を除いた実体（アルファのbbox）を切り出す
  2. 長辺が TARGET_LONG_SIDE になるように拡縮（縦横比は保つ）
  3. 280x280 の透過キャンバスの中央に置く
  4. <入力ファイル名>.png として書き出す（チームIDの名前を付けておくこと）

注意:
  ・入力は背景が透過であること。白背景のまま渡すと「白い四角」が実体として
    切り出され、盛大に縮む。その場合はエラーで止める。
  ・入力の拡張子は png / webp を想定。
"""
import sys
import os
from PIL import Image

CANVAS = 280
TARGET_LONG_SIDE = 129   # 既存20個の中央値
# 四隅がこれ以上不透明なら「背景が透過されていない」と見なす（0-255）
OPAQUE_CORNER_ALPHA = 8


def fit(src_path: str, dst_path: str) -> str:
    im = Image.open(src_path).convert('RGBA')
    w, h = im.size

    corners = [im.getpixel(p)[3] for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]]
    if min(corners) > OPAQUE_CORNER_ALPHA:
        return f'NG 背景が透過されていない（四隅のα={corners}）'

    bbox = im.split()[3].getbbox()
    if bbox is None:
        return 'NG 中身が空（全部透明）'

    body = im.crop(bbox)
    bw, bh = body.size
    scale = TARGET_LONG_SIDE / max(bw, bh)
    body = body.resize((max(1, round(bw * scale)), max(1, round(bh * scale))), Image.LANCZOS)

    out = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(body, ((CANVAS - body.width) // 2, (CANVAS - body.height) // 2), body)
    out.save(dst_path)
    return f'OK {bw}x{bh} -> {body.width}x{body.height}'


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    src_dir, dst_dir = sys.argv[1], sys.argv[2]
    os.makedirs(dst_dir, exist_ok=True)

    names = sorted(f for f in os.listdir(src_dir) if f.lower().endswith(('.png', '.webp')))
    if not names:
        print(f'{src_dir} に png / webp がありません')
        return 1

    ng = 0
    for name in names:
        stem = os.path.splitext(name)[0]
        result = fit(os.path.join(src_dir, name), os.path.join(dst_dir, f'{stem}.png'))
        if result.startswith('NG'):
            ng += 1
        print(f'{stem:20s} {result}')

    print(f'\n{len(names) - ng}/{len(names)} 件を {dst_dir} に書き出しました')
    if ng:
        print(f'{ng} 件が失敗しています。上の NG を見て入力を直してください')
    return 1 if ng else 0


if __name__ == '__main__':
    raise SystemExit(main())
