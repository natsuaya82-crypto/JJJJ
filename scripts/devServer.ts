/**
 * 点検のために dev サーバ（vite）を立てる。ブラウザで開いて見る点検（check-boot・check-foreign-screens）が
 * 同じここを通す。
 *
 * ポートは空きしだいで変わるので、出力から読み取る（5173 と決め打ちしない）。
 * `BOOT_URL` があればそこを開く（dev サーバを立てない。中身を差し替えて確かめるときと、将来 dist を見る版に使う）。
 */
import { spawn } from 'node:child_process'

export type Dev = { url: string; stop: () => void }

export function startDev(): Promise<Dev> {
  if (process.env.BOOT_URL) return Promise.resolve({ url: process.env.BOOT_URL, stop: () => {} })
  return new Promise((resolve, reject) => {
    // ★プロセスグループごと起こす。`npm run dev` は sh → vite と孫が生えるので、
    //   子だけ kill しても vite が生き残り、その stdio がこちらを終わらせない
    //   （結果を出したあと固まる。落ちるときは process.exit で抜けるので、
    //     **緑になって初めて出る**種類の穴だった）
    const child = spawn('npm', ['run', 'dev'], { cwd: process.cwd(), env: process.env, detached: true })
    let buf = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`dev サーバが立ち上がりませんでした:\n${buf.slice(-500)}`)) }, 60000)
    const onData = (d: Buffer) => {
      buf += d.toString()
      const m = buf.match(/http:\/\/localhost:(\d+)/)
      if (m) {
        clearTimeout(timer)
        child.stdout?.off('data', onData)
        resolve({ url: m[0] + '/', stop: () => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* もう死んでいる */ } } })
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', e => { clearTimeout(timer); reject(e) })
  })
}

/**
 * 合否に使わない console の行（読み込みの失敗・開発用の案内）。
 * 読み込みに失敗した（404・接続断）は描画の失敗ではないので合否から外す——ただし黙って捨てず、参考として出す
 */
export const CONSOLE_NOISE = /Failed to load resource|ERR_CONNECTION_RESET|ERR_TUNNEL_CONNECTION_FAILED|favicon|\[vite\]|Download the React DevTools|getSnapshot should be cached/i
