// 保存された状態を現在の初期状態へ合流させる（zustand persist の merge）。gameStore から移設。
// ★新しい「読み込んだら直すもの」は migrate ではなく store/bootRepair.ts へ足すこと。

import type { GameStore } from '../gameStore'
import { normalizeLoadedSave } from './normalizeSave'
import { withCareerCounts } from '../../utils/careerStats'
import { dropLegacyClubRosters, restoreTeamIdsFromLegacyClubs } from '../../utils/legacyClubRoster'
import { repairLoadedSave } from '../bootRepair'
import { setSaveHealth } from '../saveHealth'

// 古いセーブで currentSeason に欠けているフィールドを初期値で補完する。
// （新バージョンで追加された配列フィールド等が undefined のままだと、参照時に
//   クラッシュ→ボタン無反応・進行不可になるため、ロード時に一括で埋める）
export const mergeSave = (persistedState: unknown, currentState: GameStore): GameStore => {
  try {
    const p = (persistedState ?? {}) as Partial<typeof currentState>
    // 旧セーブの海外クラブ名簿(playerIds)の取り込み。通常は migrate v22 で済むが、
    // migrate が途中の年代変換で例外を出すと v22 まで届かないまま version だけ22になる。
    // ここは毎回通るので、取りこぼしたセーブもここで拾える（新しいセーブでは何もしない）
    if (Array.isArray(p.players)) p.players = restoreTeamIdsFromLegacyClubs(p.players, p.foreignLeagues)
    // ── 起動時のつじつま合わせ（store/bootRepair.ts 1本）──
    // 版でゲートせず毎回通す。冪等かつ導出なので、いつどこで壊れても開き直せば直る。
    // 新しい「読み込んだら直すもの」は migrate ではなく bootRepair へ足すこと。
    {
      const r = repairLoadedSave(p)
      p.teams = r.teams
      p.players = r.players
      p.currentSeason = r.currentSeason
      p.pastSeasons = r.pastSeasons
      p.foreignLeagues = r.foreignLeagues
      if (r.repairs.length > 0) console.warn('[save] 起動時に直したもの:', r.repairs.join(' / '))
    }
    dropLegacyClubRosters(p.foreignLeagues)
    // 読み込んだセーブへの冪等・一回きりの補正はすべて normalizeSave.ts に並べてある
    normalizeLoadedSave(p)
    // ── チーム名簿の自動修復（毎回・冪等）──
    // ※ ここで team.roster を player.teamId から組み直していたが、
    //   クラブ側の名簿そのものを廃止したので不要になった（在籍は teamId 1本）。
    // ── 通算成績の組み立て（毎回・冪等）──
    // 通算出走数・通算区間賞・MVP回数はセーブに持たず、保存してあるレース結果から
    // 数え直す（utils/careerStats.ts）。優勝回数はシーズン終了時点の在籍で決まり
    // レース結果からは正しく戻せないので、選手が持っている数字をそのまま使う。
    if (Array.isArray(p.players)) {
      p.players = withCareerCounts(
        p.players,
        (p.pastSeasons ?? []) as never,
        (p.currentSeason ?? undefined) as never,
        p.removedPlayers,
      )
    }
    return {
      ...currentState,
      ...p,
      currentSeason: { ...currentState.currentSeason, ...(p.currentSeason ?? {}) } }
  } catch (e) {
    // 互換処理のどれかが例外を投げても、読み込み自体は失敗させない（変換なしのデータで続行する）。
    // ここで throw すると persist の内部の .catch に吸われ、hasHydrated も onFinishHydration も
    // 更新されないまま「セーブが無い」のと同じ状態になり、新規ゲーム画面が出てしまう。
    console.error('[save] merge failed; falling back to a plain merge', e)
    const fb = (persistedState && typeof persistedState === 'object' ? persistedState : {}) as Partial<typeof currentState>
    const merged = {
      ...currentState,
      ...fb,
      currentSeason: { ...currentState.currentSeason, ...(fb.currentSeason ?? {}) } }
    // セーブの中身はあるのに isInitialized を取り出せなかった場合、そのまま返すと
    // 新規ゲーム画面が出る。しかもセーブ破壊ガードで書き込みは拒否されるため、
    // 「チームを作り直したのに何も保存されない」状態になっていた。復旧画面へ回す。
    if (!merged.isInitialized && (Array.isArray(fb.players) ? fb.players.length > 0 : fb.playerTeamId != null)) {
      setSaveHealth('failed', 'セーブの変換に失敗しました')
    }
    return merged
  }
}
