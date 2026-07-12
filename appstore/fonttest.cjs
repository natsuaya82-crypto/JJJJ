const sharp = require('sharp')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360">
<rect width="900" height="360" fill="#0a1729"/>
<text x="40" y="90" font-family="Yu Mincho, 'Yu Mincho', YuMincho, 'Hiragino Mincho ProN', serif" font-size="64" fill="#ffe082">最強のチームを、編成せよ。</text>
<text x="40" y="180" font-family="Yu Gothic, 'Yu Gothic', Meiryo, sans-serif" font-size="48" fill="#ffffff">才能を、見抜け。</text>
<text x="40" y="260" font-family="Arial, sans-serif" font-size="40" fill="#f5c842" letter-spacing="6">STANDINGS</text>
</svg>`
sharp(Buffer.from(svg)).png().toFile('fonttest.png').then(()=>console.log('ok')).catch(e=>console.error(e.message))
