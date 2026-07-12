/* App Store スクショ生成: 1290x2796 を5枚。
   copy帯 + iPhone実機風モックアップ(チタン枠+ダイナミックアイランド+サイドボタン)にアプリ実画面を合成。 */
const sharp = require('sharp')

const CW = 1290, CH = 2796

// 端末本体
const PB_Y = 360
const PB_H = 2406
const PB_W = Math.round(PB_H * 1179 / 2556) // 1110
const PB_X = Math.round((CW - PB_W) / 2)     // 90
const R_BODY = 130
// 画面(スクショ差し込み口)
const INSET = 22
const SX = PB_X + INSET, SY = PB_Y + INSET
const SW = PB_W - INSET * 2                   // 1066
const SH = PB_H - INSET * 2                   // 2362
const R_SCREEN = R_BODY - INSET               // 108

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
    <radialGradient id="stage" cx="0.5" cy="0.46" r="0.62">
      <stop offset="0" stop-color="#1b3054" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#1b3054" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="1" y2="0.15">
      <stop offset="0"    stop-color="#6b7078"/>
      <stop offset="0.06" stop-color="#3a3e45"/>
      <stop offset="0.5"  stop-color="#23262b"/>
      <stop offset="0.94" stop-color="#3a3e45"/>
      <stop offset="1"    stop-color="#6b7078"/>
    </linearGradient>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="40"/></filter>
  </defs>
  <rect width="${CW}" height="${CH}" fill="url(#bg)"/>
  <rect width="${CW}" height="${CH}" fill="url(#stage)"/>
  <!-- たすき(襷)風の金の斜線 -->
  <g opacity="0.09"><polygon points="${CW - 360},-40 ${CW + 60},-40 ${CW + 60},500 ${CW - 120},500" fill="#f5c842"/></g>

  <!-- 端末の影 -->
  <rect x="${PB_X}" y="${PB_Y + 26}" width="${PB_W}" height="${PB_H}" rx="${R_BODY}" fill="#000" opacity="0.55" filter="url(#sh)"/>
  <!-- サイドボタン -->
  <rect x="${PB_X - 6}" y="${PB_Y + 360}" width="8" height="64"  rx="4" fill="${btn}"/>
  <rect x="${PB_X - 6}" y="${PB_Y + 500}" width="8" height="118" rx="4" fill="${btn}"/>
  <rect x="${PB_X - 6}" y="${PB_Y + 648}" width="8" height="118" rx="4" fill="${btn}"/>
  <rect x="${PB_X + PB_W - 2}" y="${PB_Y + 560}" width="8" height="200" rx="4" fill="${btn}"/>
  <!-- チタン本体 -->
  <rect x="${PB_X}" y="${PB_Y}" width="${PB_W}" height="${PB_H}" rx="${R_BODY}" fill="url(#rail)"/>
  <rect x="${PB_X + 4}" y="${PB_Y + 4}" width="${PB_W - 8}" height="${PB_H - 8}" rx="${R_BODY - 4}" fill="none" stroke="#0c0e11" stroke-width="2" opacity="0.6"/>
  <!-- 黒ベゼル -->
  <rect x="${PB_X + 10}" y="${PB_Y + 10}" width="${PB_W - 20}" height="${PB_H - 20}" rx="${R_BODY - 10}" fill="#050608"/>

  <!-- コピー -->
  <text x="${cx}" y="150" text-anchor="middle" font-family="${GOTHIC}" font-size="30" letter-spacing="10" fill="#f5c842" font-weight="700">${s.eyebrow}</text>
  <line x1="${cx - 34}" y1="182" x2="${cx + 34}" y2="182" stroke="#b8860b" stroke-width="2"/>
  <text x="${cx}" y="252" text-anchor="middle" font-family="${GOTHIC}" font-size="58" fill="#ffffff" font-weight="700">${s.l1}</text>
  <text x="${cx}" y="336" text-anchor="middle" font-family="${MINCHO}" font-size="76" fill="#ffe082" font-weight="700">${s.l2}</text>
</svg>`
}

// 画面より上のレイヤー(ダイナミックアイランド + 画面の縁ハイライト)
function overlaySvg() {
  const iw = 340, ih = 38, ix = (CW - iw) / 2, iy = SY + 22
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}">
    <rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="${R_SCREEN}" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="2"/>
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ih / 2}" fill="#000"/>
  </svg>`
}

function maskSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><rect width="${SW}" height="${SH}" rx="${R_SCREEN}" fill="#fff"/></svg>`
}

async function run() {
  const maskBuf = Buffer.from(maskSvg())
  const overlayBuf = Buffer.from(overlaySvg())
  for (const s of SHOTS) {
    if (s.hero) {
      await sharp(s.raw).resize(CW, CH, { fit: 'cover', position: 'centre' }).png().toFile(s.out)
      console.log('hero ->', s.out)
      continue
    }
    const screen = await sharp(s.raw)
      .resize(SW, SH, { fit: 'cover', position: 'top' })
      .composite([{ input: maskBuf, blend: 'dest-in' }])
      .png().toBuffer()
    await sharp(Buffer.from(bgSvg(s)))
      .composite([
        { input: screen, left: SX, top: SY },
        { input: overlayBuf, left: 0, top: 0 },
      ])
      .png().toFile(s.out)
    console.log('shot ->', s.out)
  }
  console.log('done', CW + 'x' + CH)
}
run().catch(e => { console.error(e); process.exit(1) })
