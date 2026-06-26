// 音声マネージャ：BGM（ループ）とSE（単発）を一元管理する。
// 音量は MorePage と同じ localStorage キー（jpel-volume-music / jpel-volume-se）を参照。
// 未配置の音声ファイルは再生時の reject を握りつぶすため、無音でスルーされる。

const MUSIC_KEY = 'jpel-volume-music'
const SE_KEY = 'jpel-volume-se'

export type BgmName = 'home' | 'race'
export type SeName = 'tap' | 'transition' | 'back' | 'title' | 'event' | 'great_success' | 'levelup' | 'reward'

function readVol(key: string): number {
  const raw = localStorage.getItem(key)
  const v = raw == null ? 0.5 : parseFloat(raw)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5
}

class AudioManager {
  private bgmEl: HTMLAudioElement | null = null
  private current: BgmName | null = null
  private desired: BgmName = 'home'
  private unlocked = false
  private musicVol = readVol(MUSIC_KEY)
  private seVol = readVol(SE_KEY)
  private backFlag = false

  // 戻る操作の直後の遷移SEを抑制する（back音と二重に鳴らないように）
  markBack() { this.backFlag = true }
  consumeBack() { const f = this.backFlag; this.backFlag = false; return f }

  // 最初のユーザー操作（タイトルのスタート等）で呼ぶ。ブラウザの自動再生制限を解除する。
  unlock = () => {
    if (this.unlocked) return
    this.unlocked = true
    this.startBgm(this.desired)
  }

  playBgm(name: BgmName) {
    this.desired = name
    if (!this.unlocked) return
    this.startBgm(name)
  }

  // 常に単一の Audio 要素を使い、トラック切替は src 差し替えで行う（要素が増えて重なって鳴るのを防ぐ）
  private startBgm(name: BgmName) {
    if (!this.bgmEl) {
      this.bgmEl = new Audio()
      this.bgmEl.loop = true
    }
    this.bgmEl.volume = this.musicVol
    if (this.current !== name) {
      this.bgmEl.src = `/audio/bgm/${name}.mp3`
      this.current = name
    }
    this.bgmEl.play().catch(() => {})
  }

  stopBgm() {
    if (this.bgmEl) this.bgmEl.pause()
    this.current = null
  }

  playSe(name: SeName) {
    if (!this.unlocked || this.seVol <= 0) return
    const el = new Audio(`/audio/se/${name}.mp3`)
    el.volume = this.seVol
    el.play().catch(() => {})
  }

  setMusicVolume(v: number) {
    this.musicVol = Math.min(1, Math.max(0, v))
    if (this.bgmEl) this.bgmEl.volume = this.musicVol
  }

  setSeVolume(v: number) {
    this.seVol = Math.min(1, Math.max(0, v))
  }
}

// HMR（開発中のホットリロード）でモジュールが再評価されても単一インスタンスを保つ。
// これをしないと古いインスタンスのBGMが鳴り続ける。
const g = globalThis as unknown as { __jpelAudio?: AudioManager }
export const audio = g.__jpelAudio ?? (g.__jpelAudio = new AudioManager())
