import html2canvas from 'html2canvas'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'

// ファイル名に使えない文字を無害な物に置き換える。
//
// 選手名をそのままファイル名にしているので、名前に「/」が入っていると
// 保存の時点で失敗し、共有シートが出ないまま黙って終わってしまう。
// 呼ぶ側それぞれで気をつけるのは漏れるので、ここで必ず通す。
function safeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, '_')   // ファイル名に使えない文字
    .replace(/^\.+/, '')               // 先頭のドット（隠しファイル扱いになる）
    .trim()
  return cleaned || 'jpel.png'
}

// 指定のDOM要素を画像化して共有する。
// iOS(Capacitor)ではネイティブ共有シート、ブラウザではWeb Share（対応時）or ダウンロードにフォールバック。
export async function shareElementAsImage(
  el: HTMLElement,
  opts: { filename: string; text?: string; title?: string },
): Promise<void> {
  const filename = safeFilename(opts.filename)
  const canvas = await html2canvas(el, { backgroundColor: '#0A0912', scale: 2, useCORS: true, logging: false })
  const dataUrl = canvas.toDataURL('image/png')

  if (Capacitor.isNativePlatform()) {
    const base64 = dataUrl.split(',')[1]
    const written = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
    await Share.share({ title: opts.title, text: opts.text, files: [written.uri] })
    return
  }

  // ── ブラウザ ──
  const blob = await (await fetch(dataUrl)).blob()
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ title: opts.title, text: opts.text, files: [file] })
    return
  }
  // 共有APIが無ければダウンロード
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
