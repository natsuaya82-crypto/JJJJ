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

const BGM_NAMES: BgmName[] = ['home', 'race']
const SE_NAMES: SeName[] = ['tap', 'transition', 'back', 'title', 'event', 'great_success', 'levelup', 'reward']

/**
 * 実機で音声ファイルを探すときの置き場所。
 *
 * ブラウザでは dist の直下から配信されるので `/audio/bgm/home.mp3` で届く。
 * ところが実機では dist の中身が「public」というフォルダにまるごと入った状態で
 * アプリに焼かれるので、`public/` を付けないとファイルが見つからない。
 * ここを間違えると、読み込み失敗が全部だまって捨てられるので「ただの無音」になる。
 */
const nativePath = (rel: string) => `public/${rel}`

/**
 * 失敗した理由の控え。
 *
 * 実機ではログが見られないので、これまでは読み込みも再生も全部だまって捨てていた。
 * その結果「鳴らない」しか分からず、直したつもりのまま出してしまった。
 * ここに理由を残して、設定→サウンドから読めるようにする。
 */
const diagLog: string[] = []
function note(what: string, e?: unknown): void {
  const reason = e === undefined ? '' : ' / ' + (e instanceof Error ? e.message : String(e))
  diagLog.push((what + reason).slice(0, 160))
  if (diagLog.length > 24) diagLog.shift()
}

/** 音声まわりで失敗した内容。うまくいっていれば空。 */
export function audioDiag(): string[] {
  return diagLog.slice()
}

/**
 * いまBGMがどうなっているかの控え。
 *
 * 「鳴らない」とだけ言われても、音量が0なのか、ファイルが見つからないのか、
 * 鳴らす指示は通ったのに音が出ていないのかが分からなかった。
 * 設定→サウンドにそのまま出して、実機で読めるようにする。
 */
let bgmStatus = 'まだ鳴らしていません'

/** BGMのいまの様子。設定→サウンドに出す。 */
export function audioStatus(): string {
  return bgmStatus
}

function readVol(key: string): number {
  const raw = localStorage.getItem(key)
  const v = raw == null ? 0.5 : parseFloat(raw)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5
}

type NativeAudioModule = typeof import('@capacitor-community/native-audio')['NativeAudio']

class AudioManager {
  private bgmEl: HTMLAudioElement | null = null
  private htmlName: BgmName | null = null
  private nativeBgmBroken = false
  private current: BgmName | null = null
  private desired: BgmName = 'home'
  private starting: BgmName | null = null
  private unlocked = false
  private musicVol = readVol(MUSIC_KEY)
  private seVol = readVol(SE_KEY)
  private backFlag = false

  // ネイティブ音声
  private na: NativeAudioModule | null = null
  private naPromise: Promise<NativeAudioModule | null> | null = null

  markBack() { this.backFlag = true }
  consumeBack() { const f = this.backFlag; this.backFlag = false; return f }

  /**
   * preload に渡す設定。
   *
   * iOS側のプラグインは `audioChannelNum` ではなく `channels` という名前で
   * 同時再生数を読んでいる（TypeScriptの型だけが audioChannelNum になっている）。
   * 片方しか渡していなかったので、指定した同時再生数は今まで一度も効いていない。
   * 名前が食い違っているだけなので、同じ値を両方に入れておく。
   */
  private preloadOpts(kind: 'bgm' | 'se', name: string, volume: number, ch: number) {
    return {
      assetId: `${kind}_${name}`,
      assetPath: nativePath(`audio/${kind}/${name}.mp3`),
      isUrl: false,
      volume,
      audioChannelNum: ch,
      channels: ch,
    }
  }

  // 並行呼び出しでも単一のロード処理を共有する（初回SEが無音になる問題を回避）
  private ensureNative(): Promise<NativeAudioModule | null> {
    if (!isNative) return Promise.resolve(null)
    if (this.naPromise) return this.naPromise
    this.naPromise = (async () => {
      try {
        const mod = await import('@capacitor-community/native-audio')
        const na = mod.NativeAudio
        // ゲーム音として鳴らす宣言。focus:false で他アプリの音と混ぜる設定になる。
        // これを呼ばないと、プラグインが勝手に「音楽アプリ」扱いの設定に書き換えてしまい、
        // ユーザーが聴いている音楽が止まり、コントロールセンターの再生中にこのアプリが出てしまう。
        // 音楽と重なって鳴るのは想定どおり（BGM音量は設定画面で下げられる）。
        try { await na.configure({ focus: false, fade: false }) } catch (e) { note('configure 失敗', e) }
        for (const name of BGM_NAMES) {
          try { await na.preload(this.preloadOpts('bgm', name, this.musicVol, 1)) } catch (e) { note(`BGM ${name} 読み込み失敗`, e) }
        }
        for (const name of SE_NAMES) {
          try { await na.preload(this.preloadOpts('se', name, this.seVol, 3)) } catch (e) { note(`SE ${name} 読み込み失敗`, e) }
        }
        this.na = na
        return na
      } catch (e) { note('ネイティブ音声の読み込み失敗', e); this.na = null; return null }
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
    if (isNative) { void this.startBgmNative(name); return }
    this.startBgmHtml(name)
  }

  /**
   * ブラウザ側の音声で鳴らす。
   *
   * ふだんはWeb用だが、実機でネイティブ音声が鳴らせなかったときの逃げ道にも使う。
   * 無音のまま出すより、音楽セッションを取ってでも鳴るほうがましなので。
   */
  private startBgmHtml(name: BgmName) {
    if (!this.bgmEl) { this.bgmEl = new Audio(); this.bgmEl.loop = true }
    if (this.htmlName === name && !this.bgmEl.paused) return
    this.bgmEl.volume = this.musicVol
    if (this.htmlName !== name) { this.bgmEl.src = `/audio/bgm/${name}.mp3`; this.htmlName = name }
    this.bgmEl.play()
      .then(() => { bgmStatus = `${name} / ブラウザ音声で再生中 / 音量 ${this.musicVol.toFixed(2)}` })
      .catch(e => { note(`BGM ${name} ブラウザ再生も失敗`, e) })
  }

  private stopBgmHtml() {
    if (this.bgmEl) this.bgmEl.pause()
    this.htmlName = null
  }

  /**
   * ネイティブ音声でBGMを鳴らす。
   *
   * 前は「鳴らす前に current を書き換えて、失敗しても黙って抜ける」作りだった。
   * そのため一度でも失敗すると current だけが残り、以降どこから呼んでも
   * 「もう鳴っている」と判断されて、アプリを立ち上げ直すまでBGMが二度と鳴らなかった。
   * 成功したときだけ current を立てるように直し、失敗したら読み直して一度やり直す。
   */
  private async startBgmNative(name: BgmName) {
    const na = await this.ensureNative()
    if (!na) { this.startBgmHtml(name); return }
    // 一度ネイティブで鳴らせないと分かったら、以降は素直にブラウザ音声で鳴らす。
    if (this.nativeBgmBroken) { this.startBgmHtml(name); return }
    if (this.current === name || this.starting === name) return
    this.starting = name
    const prev = this.current
    this.current = null
    try {
      if (prev) { try { await na.stop({ assetId: `bgm_${prev}` }) } catch (e) { note(`BGM ${prev} 停止失敗`, e) } }
      if (this.desired !== name) return  // await中に別BGMへ切り替わったら中断（二重再生防止）
      const ok = await this.loopBgm(na, name)
      if (!ok) { this.nativeBgmBroken = true; this.startBgmHtml(name); return }
      if (this.desired !== name) { na.stop({ assetId: `bgm_${name}` }).catch(() => {}); return }
      this.stopBgmHtml()
      this.current = name
    } finally {
      if (this.starting === name) this.starting = null
    }
  }

  /** loop を投げて、ダメなら読み直して一度だけやり直す。鳴らせたら true。 */
  private async loopBgm(na: NativeAudioModule, name: BgmName): Promise<boolean> {
    const id = `bgm_${name}`
    if (await this.tryLoop(na, id, name, '1回目')) return true
    // 読み込みが落ちていた場合と、読み込めたのに中身が空だった場合の両方を拾うため、
    // 一度捨ててから読み直す（読み直しは既にある時だけエラーになるので、先に unload する）。
    try { await na.unload({ assetId: id }) } catch { /* 元から無ければそれでよい */ }
    try {
      await na.preload(this.preloadOpts('bgm', name, this.musicVol, 1))
    } catch (e) {
      note(`BGM ${name} 読み直し失敗`, e)
      return false
    }
    return this.tryLoop(na, id, name, '読み直し後')
  }

  /**
   * 鳴らす指示を出して、そのあと本当に鳴っているかまで聞き直す。
   *
   * これまでは「指示が通った＝鳴っている」とみなしていた。
   * ところがiOS側は再生できなくても黙って成功として返してくるので、
   * 無音なのに成功扱いになり、原因が何も残らなかった。
   */
  private async tryLoop(na: NativeAudioModule, id: string, name: BgmName, tag: string): Promise<boolean> {
    try {
      await na.setVolume({ assetId: id, volume: this.musicVol })
      await na.loop({ assetId: id })
    } catch (e) {
      note(`BGM ${name} 再生失敗(${tag})`, e)
      return false
    }
    try {
      await new Promise(r => setTimeout(r, 300))
      const playing = (await na.isPlaying({ assetId: id })).isPlaying
      const sec = Math.round((await na.getDuration({ assetId: id })).duration)
      bgmStatus = `${name} / ${playing ? '再生中' : '止まったまま'} / 長さ ${sec}秒 / 音量 ${this.musicVol.toFixed(2)}`
      if (!playing) {
        note(`BGM ${name} 指示は通ったが鳴っていない(${tag})`)
        return false
      }
    } catch (e) {
      // 確認できないだけなら、鳴っている前提で進める（確認手段が無い古い環境向け）。
      note(`BGM ${name} 状態を確認できず(${tag})`, e)
      bgmStatus = `${name} / 状態不明 / 音量 ${this.musicVol.toFixed(2)}`
    }
    return true
  }

  stopBgm() {
    if (isNative) {
      const cur = this.current
      this.current = null
      if (cur && this.na) { this.na.stop({ assetId: `bgm_${cur}` }).catch(() => {}) }
      this.stopBgmHtml()
      return
    }
    this.stopBgmHtml()
    this.current = null
  }

  playSe(name: SeName) {
    if (!this.unlocked || this.seVol <= 0) return
    if (isNative) {
      if (this.na) {
        this.na.setVolume({ assetId: `se_${name}`, volume: this.seVol }).catch(() => {})
        this.na.play({ assetId: `se_${name}` }).catch(e => note(`SE ${name} 再生失敗`, e))
      }
      return
    }
    const el = new Audio(`/audio/se/${name}.mp3`)
    el.volume = this.seVol
    el.play().catch(() => {})
  }

  setMusicVolume(v: number) {
    this.musicVol = Math.min(1, Math.max(0, v))
    if (this.bgmEl) this.bgmEl.volume = this.musicVol
    if (isNative) {
      if (this.na && this.current) { this.na.setVolume({ assetId: `bgm_${this.current}`, volume: this.musicVol }).catch(() => {}) }
      // 鳴っていない状態でつまみを動かしたら、そこでもう一度かけ直す。
      // 起動時にたまたま失敗しても、音量を触れば鳴り出せるようにしておく。
      else if (this.unlocked && this.musicVol > 0 && !this.htmlName) { void this.startBgmNative(this.desired) }
    }
  }

  setSeVolume(v: number) {
    this.seVol = Math.min(1, Math.max(0, v))
  }
}

// HMRでモジュールが再評価されても単一インスタンスを保つ。
const g = globalThis as unknown as { __jpelAudio?: AudioManager }
export const audio = g.__jpelAudio ?? (g.__jpelAudio = new AudioManager())
