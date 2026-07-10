// 音声マネージャ：BGM（ループ）とSE（単発）を一元管理する。
// BGMは iOS実機ではネイティブ音声(@capacitor-community/native-audio)で再生し、
// WKWebViewのHTML5音声が音楽セッション(.playback)を奪う問題を回避する（＝BGMが「音楽」扱いされない）。
// Web/ブラウザではHTML5音声にフォールバック。SEは単発なので従来通りHTML5。
// 音量は MorePage と同じ localStorage キー（jpel-volume-music / jpel-volume-se）を参照。

import { Capacitor } from '@capacitor/core'

const MUSIC_KEY = 'jpel-volume-music'
const SE_KEY = 'jpel-volume-se'

export type BgmName = 'home' | 'race'
export type SeName = 'tap' | 'transition' | 'back' | 'title' | 'event' | 'great_success' | 'levelup' | 'reward'

const isNative = Capacitor.isNativePlatform()

function readVol(key: string): number {
  const raw = localStorage.getItem(key)
  const v = raw == null ? 0.5 : parseFloat(raw)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5
}

type NativeAudioModule = typeof import('@capacitor-community/native-audio')['NativeAudio']

class AudioManager {
  private bgmEl: HTMLAudioElement | null = null
  private current: BgmName | null = null
  private desired: BgmName = 'home'
  private unlocked = false
  private musicVol = readVol(MUSIC_KEY)
  private seVol = readVol(SE_KEY)
  private backFlag = false

  // ネイティブ音声
  private na: NativeAudioModule | null = null
  private naPromise: Promise<NativeAudioModule | null> | null = null

  markBack() { this.backFlag = true }
  consumeBack() { const f = this.backFlag; this.backFlag = false; return f }

  // 並行呼び出しでも単一のロード処理を共有する（初回SEが無音になる問題を回避）
  private ensureNative(): Promise<NativeAudioModule | null> {
    if (!isNative) return Promise.resolve(null)
    if (this.naPromise) return this.naPromise
    this.naPromise = (async () => {
      try {
        const mod = await import('@capacitor-community/native-audio')
        const na = mod.NativeAudio
        const bgms: BgmName[] = ['home', 'race']
        for (const name of bgms) {
          try { await na.preload({ assetId: `bgm_${name}`, assetPath: `audio/bgm/${name}.mp3`, audioChannelNum: 1, isUrl: false, volume: this.musicVol }) } catch { /* 未配置等は無視 */ }
        }
        const ses: SeName[] = ['tap', 'transition', 'back', 'title', 'event', 'great_success', 'levelup', 'reward']
        for (const name of ses) {
          try { await na.preload({ assetId: `se_${name}`, assetPath: `audio/se/${name}.mp3`, audioChannelNum: 3, isUrl: false, volume: this.seVol }) } catch { /* 未配置等は無視 */ }
        }
        this.na = na
        return na
      } catch { this.na = null; return null }
    })()
    return this.naPromise
  }

  unlock = () => {
    if (this.unlocked) return
    this.unlocked = true
    if (isNative) { this.ensureNative().then(() => this.startBgm(this.desired)) }
    else this.startBgm(this.desired)
  }

  playBgm(name: BgmName) {
    this.desired = name
    if (!this.unlocked) return
    this.startBgm(name)
  }

  private startBgm(name: BgmName) {
    if (isNative) { this.startBgmNative(name); return }
    // Web: HTML5
    if (!this.bgmEl) { this.bgmEl = new Audio(); this.bgmEl.loop = true }
    this.bgmEl.volume = this.musicVol
    if (this.current !== name) { this.bgmEl.src = `/audio/bgm/${name}.mp3`; this.current = name }
    this.bgmEl.play().catch(() => {})
  }

  private async startBgmNative(name: BgmName) {
    const na = await this.ensureNative()
    if (!na) return
    if (this.current === name) return
    const prev = this.current
    this.current = name
    try {
      if (prev) await na.stop({ assetId: `bgm_${prev}` })
      if (this.desired !== name) return  // await中に別BGMへ切り替わったら中断（二重再生防止）
      await na.setVolume({ assetId: `bgm_${name}`, volume: this.musicVol })
      if (this.desired !== name) { await na.stop({ assetId: `bgm_${name}` }).catch(() => {}); return }
      await na.loop({ assetId: `bgm_${name}` })
    } catch { /* noop */ }
  }

  stopBgm() {
    if (isNative) {
      const cur = this.current
      this.current = null
      if (cur && this.na) { this.na.stop({ assetId: `bgm_${cur}` }).catch(() => {}) }
      return
    }
    if (this.bgmEl) this.bgmEl.pause()
    this.current = null
  }

  playSe(name: SeName) {
    if (!this.unlocked || this.seVol <= 0) return
    if (isNative) {
      if (this.na) {
        this.na.setVolume({ assetId: `se_${name}`, volume: this.seVol }).catch(() => {})
        this.na.play({ assetId: `se_${name}` }).catch(() => {})
      }
      return
    }
    const el = new Audio(`/audio/se/${name}.mp3`)
    el.volume = this.seVol
    el.play().catch(() => {})
  }

  setMusicVolume(v: number) {
    this.musicVol = Math.min(1, Math.max(0, v))
    if (isNative) {
      if (this.na && this.current) { this.na.setVolume({ assetId: `bgm_${this.current}`, volume: this.musicVol }).catch(() => {}) }
      return
    }
    if (this.bgmEl) this.bgmEl.volume = this.musicVol
  }

  setSeVolume(v: number) {
    this.seVol = Math.min(1, Math.max(0, v))
  }
}

// HMRでモジュールが再評価されても単一インスタンスを保つ。
const g = globalThis as unknown as { __jpelAudio?: AudioManager }
export const audio = g.__jpelAudio ?? (g.__jpelAudio = new AudioManager())
