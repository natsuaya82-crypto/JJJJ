/* App Store スクショ生成: 1290x2796 を5枚。
   特大copy + iPhone実機風(上部だけ見せて下端はキャンバス外にカット)。
   画面上部: ステータスバー(時刻/バッテリー)+ダイナミックアイランド、その下からアプリ実画面。 */
const sharp = require('sharp')

// 内部の作図キャンバス(基準)
const CW = 1290, CH = 2796
// 最終出力サイズ = 元スクショと同じ 1242x2688 (App Store 6.5")
const OUT_W = 1242, OUT_H = 2688

// 端末本体(上部だけ見せる。下端はキャンバス外)
const PB_W = 1100
const PB_X = Math.round((CW - PB_W) / 2)
const PB_Y = 920
const PB_H = Math.round(PB_W * 2556 / 1179) // 2645 (下は画面外)
const R_BODY = 150
const INSET = 20
// 画面
const SX = PB_X + INSET, SY = PB_Y + INSET
const SW = PB_W - INSET * 2                   // 1180
const R_SCREEN = R_BODY - INSET               // 130
const SH_VIS = CH - SY                          // 画面の見える高さ
// ステータス帯(この下からアプリ画面)
const STATUS_H = 118
const APP_Y = SY + STATUS_H
const APP_VIS = CH - APP_Y

const MINCHO = "Yu Mincho, 'Yu Mincho', YuMincho, 'Hiragino Mincho ProN', serif"
const GOTHIC = "Yu Gothic, 'Yu Gothic', Meiryo, sans-serif"

const SHOTS = [
  { raw: 'raw0.png', out: 'JPEL_01_title.png', hero: true },
  { raw: 'raw2.png', out: 'JPEL_02_squad.png',  eyebrow: 'SQUAD',     l1: '最強のチームを、',     l2: '編成せよ。' },
  { raw: 'raw3.png', out: 'JPEL_03_player.png', eyebrow: 'PLAYER',    l1: '一人ひとりの才能を、', l2: '見抜け。' },
  { raw: 'raw1.png', out: 'JPEL_04_draft.png',  eyebrow: 'DRAFT',     l1: '未来のエースと、',     l2: '契約せよ。' },
  { raw: 'raw4.png', out: 'JPEL_05_standings.png', eyebrow: 'STANDINGS', l1: '全国の頂点を、',   l2: '争え。' },
]

// 背景 + 端末本体(画面より下のレイヤー)
function bgSvg(s) {
  const cx = CW / 2
  const btn = '#15171b'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1e39"/>
      <stop offset="0.5" stop-color="#0a1729"/>
      <stop offset="1" stop-color="#060d1a"/>
    </linearGradient>
    <radialGradient id="stage" cx="0.5" cy="0.7" r="0.7">
      <stop offset="0" stop-color="#1b3054" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#1b3054" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="1" y2="0.1">
      <stop offset="0"    stop-color="#6b7078"/>
      <stop offset="0.06" stop-color="#3a3e45"/>
      <stop offset="0.5"  stop-color="#23262b"/>
      <stop offset="0.94" stop-color="#3a3e45"/>
      <stop offset="1"    stop-color="#6b7078"/>
    </linearGradient>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="46"/></filter>
  </defs>
  <rect width="${CW}" height="${CH}" fill="url(#bg)"/>
  <rect width="${CW}" height="${CH}" fill="url(#stage)"/>
  <!-- たすき(襷)風の金の斜線 -->
  <g opacity="0.08"><polygon points="${CW - 420},-40 ${CW + 60},-40 ${CW + 60},640 ${CW - 150},640" fill="#f5c842"/></g>

  <!-- 端末の影 -->
  <rect x="${PB_X}" y="${PB_Y + 22}" width="${PB_W}" height="${PB_H}" rx="${R_BODY}" fill="#000" opacity="0.5" filter="url(#sh)"/>
  <!-- サイドボタン -->
  <rect x="${PB_X - 6}" y="${PB_Y + 360}" width="8" height="66"  rx="4" fill="${btn}"/>
  <rect x="${PB_X - 6}" y="${PB_Y + 500}" width="8" height="120" rx="4" fill="${btn}"/>
  <rect x="${PB_X - 6}" y="${PB_Y + 648}" width="8" height="120" rx="4" fill="${btn}"/>
  <rect x="${PB_X + PB_W - 2}" y="${PB_Y + 560}" width="8" height="206" rx="4" fill="${btn}"/>
  <!-- チタン本体 -->
  <rect x="${PB_X}" y="${PB_Y}" width="${PB_W}" height="${PB_H}" rx="${R_BODY}" fill="url(#rail)"/>
  <rect x="${PB_X + 4}" y="${PB_Y + 4}" width="${PB_W - 8}" height="${PB_H - 8}" rx="${R_BODY - 4}" fill="none" stroke="#0c0e11" stroke-width="2" opacity="0.6"/>
  <!-- 黒ベゼル -->
  <rect x="${PB_X + 10}" y="${PB_Y + 10}" width="${PB_W - 20}" height="${PB_H - 20}" rx="${R_BODY - 10}" fill="#050608"/>

  <!-- コピー(特大) -->
  <text x="${cx}" y="300" text-anchor="middle" font-family="${GOTHIC}" font-size="48" letter-spacing="16" fill="#f5c842" font-weight="700">${s.eyebrow}</text>
  <line x1="${cx - 48}" y1="348" x2="${cx + 48}" y2="348" stroke="#b8860b" stroke-width="3"/>
  <text x="${cx}" y="500" text-anchor="middle" font-family="${GOTHIC}" font-size="94" fill="#ffffff" font-weight="700">${s.l1}</text>
  <text x="${cx}" y="680" text-anchor="middle" font-family="${MINCHO}" font-size="140" fill="#ffe082" font-weight="700">${s.l2}</text>
</svg>`
}

// 画面内オーバーレイ(SW x SH_VIS): ステータスバー + ダイナミックアイランド (ホームインジケーターは無し=下はカット)
function screenOverlaySvg() {
  const cy = STATUS_H / 2
  const iw = 360, ih = 42, ix = (SW - iw) / 2, iy = cy - ih / 2 - 4
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH_VIS}">
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ih / 2}" fill="#000"/>
  </svg>`
}

// 上端は角丸、下端は直線カット(rxを持つ矩形をSVG外まで伸ばして下角の丸めを画面外へ)
function screenMaskSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH_VIS}"><rect x="0" y="0" width="${SW}" height="${SH_VIS + 400}" rx="${R_SCREEN}" fill="#fff"/></svg>`
}

async function run() {
  const overlayBuf = Buffer.from(screenOverlaySvg())
  const maskBuf = Buffer.from(screenMaskSvg())
  for (const s of SHOTS) {
    if (s.hero) {
      await sharp(s.raw).resize(OUT_W, OUT_H, { fit: 'cover', position: 'centre' }).png().toFile(s.out)
      console.log('hero ->', s.out)
      continue
    }
    const appMeta = await sharp(s.raw).resize({ width: SW }).metadata()
    const appH = Math.min(appMeta.height, SH_VIS - STATUS_H)
    const app = await sharp(s.raw).resize({ width: SW })
      .extract({ left: 0, top: 0, width: SW, height: appH }).png().toBuffer()
    const screen = await sharp({ create: { width: SW, height: SH_VIS, channels: 4, background: '#0a1729' } })
      .composite([
        { input: app, left: 0, top: STATUS_H },
        { input: overlayBuf, left: 0, top: 0 },
        { input: maskBuf, blend: 'dest-in' },
      ]).png().toBuffer()
    // sharpは resize を composite より先に適用するため、合成を完了させてから
    // 別工程でリサイズする(でないと縮小後の枠の上に等倍のscreenが乗ってズレる)。
    const composed = await sharp(Buffer.from(bgSvg(s)))
      .composite([{ input: screen, left: SX, top: SY }])
      .png().toBuffer()
    await sharp(composed).resize(OUT_W, OUT_H, { fit: 'fill' }).png().toFile(s.out)
    console.log('shot ->', s.out)
  }
  console.log('done', CW + 'x' + CH)
}
run().catch(e => { console.error(e); process.exit(1) })
