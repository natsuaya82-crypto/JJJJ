import html2canvas from 'html2canvas'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'

// 指定のDOM要素を画像化して共有する。
// iOS(Capacitor)ではネイティブ共有シート、ブラウザではWeb Share（対応時）or ダウンロードにフォールバック。
export async function shareElementAsImage(
  el: HTMLElement,
  opts: { filename: string; text?: string; title?: string },
): Promise<void> {
  const canvas = await html2canvas(el, { backgroundColor: '#0A0912', scale: 2, useCORS: true, logging: false })
  const dataUrl = canvas.toDataURL('image/png')

  if (Capacitor.isNativePlatform()) {
    const base64 = dataUrl.split(',')[1]
    const written = await Filesystem.writeFile({ path: opts.filename, data: base64, directory: Directory.Cache })
    await Share.share({ title: opts.title, text: opts.text, files: [written.uri] })
    return
  }

  // ── ブラウザ ──
  const blob = await (await fetch(dataUrl)).blob()
  const file = new File([blob], opts.filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ title: opts.title, text: opts.text, files: [file] })
    return
  }
  // 共有APIが無ければダウンロード
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = opts.filename
  a.click()
}
