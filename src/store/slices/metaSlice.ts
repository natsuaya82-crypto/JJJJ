// meta ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import { type Gift } from '../../types'
import { ADS_PER_DAY, getAdDay } from '../../utils/ads'
import { findClub } from '../../utils/clubs'
import { canRegisterHof, isHofEligible, registerHof, removeHof } from '../../utils/hofRoster'
import { MY_PLAYER_POINTS_GRANT, myPlayerBlockReason, myPlayerCaps } from '../../utils/myPlayer'
import { movePlayer } from '../../utils/movePlayer'
import { faMarketSalary } from '../../utils/playerUtils'
import { setDeviceAdsRemoved, setDeviceTwitterIntroSeen } from '../deviceFlags'

type Slice = Pick<GameStore,
  'claimGift' | 'claimLoginBonus' | 'watchAd' | 'setAdsRemoved' | 'claimDailyGreatSuccess' | 'setRaceEventsEnabled' | 'markTwitterIntroSeen' | 'grantUpdateGifts' | 'dismissJewelGains' | 'dismissJoinNotice' | 'dismissInjuryNotice' | 'dismissExpiredNegotiation' | 'dismissFreeTransferNotice' | 'markFreeContactSeen' | 'markChatSeen' | 'dismissDepartureNotice' | 'registerHofPlayer' | 'removeHofPlayer' | 'setDisplayBadge' | 'renamePlayer' | 'updateMyTeam' | 'createMyPlayer'>

export const createMetaSlice = (set: SetGame, get: () => GameStore): Slice => ({

  // ロスターの名前横に表示する記録パッチを選ぶ（null で非表示）
  setDisplayBadge: (playerId, badgeKey) => {
    set(state => ({
      players: state.players.map(p => p.id === playerId ? { ...p, displayBadge: badgeKey ?? undefined } : p) }))
  },


  // 自チーム選手の名前を変更する。名前は選手データそのものに書くので、
  // 移籍しても引退してもそのまま残る（過去の記録に残っている名前は当時のまま）。
  renamePlayer: (playerId, name) => {
    const trimmed = name.trim().slice(0, 12)
    if (!trimmed) return
    set(state => ({
      players: state.players.map(p => p.id === playerId ? { ...p, name: trimmed } : p) }))
  },


  dismissJewelGains: () => set({ jewelGains: [] }),


  // 監督オファーを受ける。指揮するチームがここで入れ替わる。
  //
  // 受け継ぐのは移籍先が持っているもの（選手・予算・施設・ドラフト権）。
  // 前のチームからは何も持って行かない。予算とスカウトポイントは
  // シーズン終了時に控えておいた移籍先の数字へ差し替える（utils/gmOffer.ts）。
  // 在任履歴には前のチームを前年で閉じてから新しいチームを足す（utils/gmTenure.ts）。
  // 殿堂入りチーム。判定は utils/hofRoster.ts の1本
  registerHofPlayer: (playerId) => {
    const state = get()
    const p = state.players.find(x => x.id === playerId)
    if (!p) return false
    // 登録していい相手かは hofRoster の1本（レンタルで借りている選手は入れない）
    if (!isHofEligible(p, state.playerTeamId)) return false
    if (!canRegisterHof(state.hofRoster, playerId)) return false
    const teamName = state.teams.find(t => t.id === p.teamId)?.name
      ?? findClub(state.teams, state.foreignLeagues ?? [], p.teamId)?.name
      ?? '—'
    set({ hofRoster: registerHof(state.hofRoster, p, state.currentSeason.year, teamName) })
    return true
  },

  removeHofPlayer: (playerId) => {
    set(state => ({ hofRoster: removeHof(state.hofRoster, playerId) }))
  },


  // 確認済みキーは増える一方なので直近100件で打ち切る（負傷通知と同じ扱い）
  dismissJoinNotice: (key) => set(s => ({ seenJoinIds: s.seenJoinIds.includes(key) ? s.seenJoinIds : [...s.seenJoinIds, key].slice(-100) })),


  // 負傷通知をOKで確認済みにする（復帰で自動的に対象からも消える。キーは playerId-injuredUntilRace）
  dismissInjuryNotice: (key) => set(s => ({ seenInjuryIds: (s.seenInjuryIds ?? []).includes(key) ? s.seenInjuryIds : [...(s.seenInjuryIds ?? []), key].slice(-100) })),


  // ギフト配布＋期限切れギフトの掃除（毎回起動時に呼ばれる・冪等）。
  // **配るのは常に1件だけ。** 新しいギフトを出すときは GIFT_VERSION を変え、
  // 前のギフトを未受け取りの人からは取り下げる（古いお知らせが残り続けないように）。
  //
  // ★**中身を差し替えると、前のギフトを受け取っていない人には二度と届かない。**
  //   差し替えるときは、前のが役目を終えているかを必ず確かめること
  //   （中身は `cards` / `jewels` / `trophies` を組み合わせられる）。
  grantUpdateGifts: () => {
    set(state => {
      // 期限切れ（expiresAt を過ぎた）ギフトは毎回掃除する
      const nowISO = new Date().toISOString()
      const pruned = (state.pendingGifts ?? []).filter(g => !g.expiresAt || g.expiresAt >= nowISO)
      const prunedChanged = pruned.length !== (state.pendingGifts ?? []).length

      // ★**中身を変えたら版も変えること。** ギフトはセーブに実体で載るので、
      //   コードだけ直しても**既に配られたぶんは古い中身のまま**です。
      //   `-2` は 8/20 に選手作成を足したぶん（初版はトロフィー5個だけだった）。
      const GIFT_VERSION = '2.0.5-1000dl-2'
      if ((state.giftGivenVersions ?? []).includes(GIFT_VERSION)) {
        return prunedChanged ? { pendingGifts: pruned } : state
      }
      // ★**前の版の未受け取りを取り下げる。** 上のコメントにそう書いてあるのに
      //   実際には**何もしていませんでした**（期限切れの掃除だけ）。取り下げないと、
      //   中身を差し替えた版と古い版が2件並んで両方受け取れます。
      //   取り下げるのは**この仕組みが配ったぶんだけ**（`giftGivenVersions` に載っている版）。
      //   `gift_` で始まる、のような形で見ると、他から入れたギフトまで消えます。
      const mine = new Set((state.giftGivenVersions ?? []).map(v => `gift_${v}`))
      const withdrawn = pruned.filter(g => !mine.has(g.id))
      // 受け取りの期限（オーナー・2026-08-21「プレゼントの受け取りは8/31まで」）。
      // 日本時間の 8/31 いっぱい＝UTC で 8/31 14:59:59。**配布からの日数にしないこと**
      // （いつ入れたかで期限が変わり、告知の日付と合わなくなる）
      const expiresAt = '2026-08-31T14:59:59.999Z'
      const gift: Gift = {
        id: `gift_${GIFT_VERSION}`,
        title: '1000ダウンロード突破記念',
        // ★**説明文を書かないこと**（オーナー・2026-08-20「キモい説明文書くなって
        //   言ってるだろ。今後一切禁止で」）。中身は giftContents が名札として出す
        message: '',
        cards: [],
        trophies: 5,
        playerCreates: 1,
        expiresAt }
      return {
        pendingGifts: [...withdrawn, gift],
        giftGivenVersions: [...(state.giftGivenVersions ?? []), GIFT_VERSION] }
    })
  },


  claimGift: (id) => {
    set(state => {
      const gift = (state.pendingGifts ?? []).find(g => g.id === id)
      if (!gift) return state
      // 期限切れは受け取らせず削除だけする
      if (gift.expiresAt && gift.expiresAt < new Date().toISOString()) {
        return { pendingGifts: (state.pendingGifts ?? []).filter(g => g.id !== id) }
      }
      return {
        trainingCards: [...(state.trainingCards ?? []), ...gift.cards],
        jewels: (state.jewels ?? 0) + (gift.jewels ?? 0),
        trophies: (state.trophies ?? 0) + (gift.trophies ?? 0),
        // 配布ぶんは記念の額（`MY_PLAYER_POINTS_GRANT`）。新規作成記念の500とは別
        playerCreateGrants: [...(state.playerCreateGrants ?? []),
          ...Array.from({ length: gift.playerCreates ?? 0 }, () => MY_PLAYER_POINTS_GRANT)],
        pendingGifts: (state.pendingGifts ?? []).filter(g => g.id !== id) }
    })
  },



  claimLoginBonus: () => {
    const state = get()
    // 10:00 AM reset: before 10AM counts as previous day。日付はローカル基準で統一（UTCと混ぜない）。
    const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const now = new Date()
    const base = new Date(now)
    if (base.getHours() < 10) base.setDate(base.getDate() - 1)
    const today = localDate(base)
    if (state.lastLoginDate === today) return null

    const prev = new Date(base)
    prev.setDate(prev.getDate() - 1)
    const yesterday = localDate(prev)
    const continued = state.lastLoginDate === yesterday
    const prevStreak = continued ? (state.loginStreak ?? 0) : 0
    const newStreak = prevStreak + 1
    // 買い切り版はログインボーナス常時2倍
    const mult = state.adsRemoved ? 2 : 1
    const daily = 100 * mult
    const weeklyBonus = (newStreak === 7 ? 1000 : 0) * mult
    const gained = daily + weeklyBonus
    set({
      jewels: state.jewels + gained,
      lastLoginDate: today,
      loginStreak: newStreak === 7 ? 0 : newStreak,
      totalLoginDays: (state.totalLoginDays ?? 0) + 1 })
    return { daily, weeklyBonus, streak: newStreak }
  },


  watchAd: () => {
    const state = get()
    const today = getAdDay()
    const sameDay = state.lastAdDate === today
    const watched = sameDay ? (state.adsWatchedToday ?? 0) : 0
    if (watched >= ADS_PER_DAY) return null
    set({ jewels: state.jewels + 100, lastAdDate: today, adsWatchedToday: watched + 1 })
    return 100
  },


  setAdsRemoved: (v) => {
    // 権利は端末の持ち物。ここへ書いておかないと、別スロットを開いたときに
    // また「未購入」からやり直しになり、購入確認が返るまで広告が出てしまう
    setDeviceAdsRemoved(v)
    set({ adsRemoved: v })
  },


  // 買い切り版の特典：カード合成の大成功(×1.5)を1日1回だけ無料で確約。
  // 区切りは動画広告と同じ getAdDay()＝朝10時。未購入・当日消費済みなら false。
  claimDailyGreatSuccess: () => {
    const state = get()
    if (!state.adsRemoved) return false
    const today = getAdDay()
    if (state.premiumGreatDate === today) return false
    set({ premiumGreatDate: today })
    return true
  },


  setRaceEventsEnabled: (v) => set({ raceEventsEnabled: v }),

  markTwitterIntroSeen: () => {
    setDeviceTwitterIntroSeen(true)
    set({ twitterIntroSeen: true })
  },

  dismissExpiredNegotiation: (id) => set(s => ({ currentSeason: { ...s.currentSeason, expiredNegotiations: (s.currentSeason.expiredNegotiations ?? []).filter(n => n.id !== id) } })),

  dismissFreeTransferNotice: (id) => set(s => ({ currentSeason: { ...s.currentSeason, freeTransferNotices: (s.currentSeason.freeTransferNotices ?? []).filter(n => n.id !== id) } })),

  markFreeContactSeen: (id) => set(s => ({ currentSeason: { ...s.currentSeason, seenFreeContactIds: [...new Set([...(s.currentSeason.seenFreeContactIds ?? []), id])] } })),

  // チャットを開いたら、いま出ている用件を「見た」ことにする。
  // ★どの用件があるかは utils/notifItems の chatTopicIds 1本（ここで数えないこと）。
  //   ホームに出す数字と、チャットに並ぶ用件が同じものを指すため
  markChatSeen: (ids) => set(s => ({
    currentSeason: { ...s.currentSeason, seenChatTopicIds: [...new Set(ids)] } })),

  dismissDepartureNotice: (id) => set(s => ({ currentSeason: { ...s.currentSeason, departureNotices: (s.currentSeason.departureNotices ?? []).filter(n => n.id !== id) } })),


  updateMyTeam: (patch) => {
    set(s => ({
      teams: s.teams.map(t => t.id === s.playerTeamId ? {
        ...t,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.shortName !== undefined ? { shortName: patch.shortName } : {}),
        ...(patch.gmName !== undefined ? { gmName: patch.gmName } : {}),
        ...(patch.logoId !== undefined ? { logoId: patch.logoId } : {}),
        ...(patch.region !== undefined ? { region: patch.region } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}) } : t) }))
  },


  // アップデート記念：好きな選手を1人自作してロスターに加える（1回きり）。
  // ratings=振り分けた560、customCaps=育て切ると合計644(平均92)になる能力別上限（低い能力から水割り）
  createMyPlayer: (params: {
    name: string; age: number; specialty: import('../../types').Specialty
    nationality: import('../../types').Nationality
    ratings: import('../../types').Ratings
    customFace: NonNullable<import('../../types').Player['customFace']>
  }) => {
    const state = get()
    const grants = state.playerCreateGrants ?? []
    if (grants.length === 0) return false
    // ★**振り分けの決まりは `utils/myPlayer` 1本**（画面と同じ関門を通す）。
    //   ここを素通しにすると、画面の下限を外しただけで極端な選手が作れます
    if (myPlayerBlockReason(params.ratings, grants[0], params.name, true) !== null) return false
    const myTeam = state.teams.find(t => t.id === state.playerTeamId)
    if (!myTeam) return false
    // 成長上限は**タイプごと**（`utils/myPlayer` の `myPlayerCaps` 1本）。
    // 平均は92のまま、得意な能力は99・不得意はその下になる。
    //
    // ★**「低い能力から水で埋めて合計644」をやめました**（オーナー・2026-08-22
    //   「タイプがあるんだからタイプごとに上限数値決めて平均92にすればいいじゃん」）。
    //   あの形は**7能力とも92で揃った**のっぺりした選手にしかならなかった。
    // ★**上限の式を2つ持たないこと**——同じ計算が画面（`CreateMyPlayerPage`）にも
    //   写してあり、片方だけ直すと「画面の試算と実際の伸びしろが違う」になります。
    //   いまは画面も store も `myPlayerCaps` を呼びます。
    const caps = myPlayerCaps(params.specialty)
    // ★**同じ年に2人つくれる**ようになったので、年だけの ID だと衝突します
    //   （2人目が1人目を上書きして消える）。既にいるぶんを数えて連番にする
    const seq = state.players.filter(pl => pl.id.startsWith('myplayer-inaugural-')).length + 1
    const id = `myplayer-inaugural-${state.currentSeason.year}-${seq}`
    const newPlayer: import('../../types').Player = {
      id, name: params.name, nameKana: '', age: params.age,
      nationality: params.nationality, origin: 'マイプレイヤー',
      ratings: { ...params.ratings },
      specialty: params.specialty,
      // 成長上限を見るのは customCaps（上）。ここは加齢の衰えなど別の場所が見る数
      potential: 92,
      growthCurve: 'normal',
      // 所属はこのあと movePlayer で入れる（名簿への追加をまとめて任せるため）
      teamId: '',
      status: 'active',
      contract: { yearsLeft: 4, annualSalary: faMarketSalary({ ratings: params.ratings, age: params.age } as import('../../types').Player), totalYears: 4, contractType: 'standard', faEligibleYear: state.currentSeason.year + 4, rookieDeal: false },
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      fatigue: 0, form: 0, morale: 90,
      joinedYear: state.currentSeason.year,
      customCaps: caps,
      customFace: params.customFace,
      isMyPlayer: true,
      yearsPro: 0 } as unknown as import('../../types').Player
    const moved = movePlayer(
      { players: [...state.players, newPlayer], teams: state.teams },
      id, state.playerTeamId,
      { year: state.currentSeason.year, history: false },
    )
    if (!moved.ok) return false
    set({
      players: moved.players,
      teams: moved.teams,
      playerCreateGrants: grants.slice(1) })
    return true
  },
})
