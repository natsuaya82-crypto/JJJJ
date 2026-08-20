// セーブのバージョン移行（zustand persist の migrate）。gameStore から移設。
// 段の増やし方・欠番の扱いは docs/REFACTORING_DESIGN.md §4 を参照。
// ★ここは「保存された形を今の形へ直す」専用。毎回走る冪等補正は store/bootRepair.ts へ。

import { ECL_COURSES } from '../../data/eclCourses'
import { FOREIGN_CLUB_CITY } from '../../data/foreignClubCities'
import { FOREIGN_LEAGUES } from '../../data/foreignLeagues'
import { NAT_LABEL } from '../../data/nationalities'
import { initForeignStandings } from '../../engine/foreignLeague'
import { generateForeignLeaguePlayers, nationalityToForeignCategory } from '../../engine/playerGenerator'
import { type Nationality, type Player } from '../../types'
import { toArchivedShape } from '../../utils/archiveSeason'
import { normalizeForeignStandings } from '../../utils/clubStanding'
import { tierBudget } from '../../utils/clubTier'
import { dropLegacyClubRosters, restoreTeamIdsFromLegacyClubs } from '../../utils/legacyClubRoster'
import { backfillRetiredTeamIds } from '../../utils/retiredTeamBackfill'
import { markDataUpdateNeeded } from '../dataUpdate'
import { EPHEMERAL_KEYS } from '../ephemeralState'
import { SAVE_VERSION } from './saveVersion'
import { setSaveHealth } from '../saveHealth'

export const migrateSave = (persistedState: unknown, version: number) => {
  try {
    const s = persistedState as Record<string, unknown>
    // v1→v2: undrafted pool players that were never converted to FA
    if (version < 2 && s.isInitialized && Array.isArray(s.players)) {
      s.players = (s.players as Record<string, unknown>[]).map(p => {
        if (p.status === 'draft_eligible' && (p.teamId === '__pool__' || p.teamId === '')) {
          return { ...p, status: 'active', teamId: '' }
        }
        return p
      })
    }
    // v3→v4: reset ALL pre-populated career stats (wipes fake initial values for base/ai/fp players)
    if (version < 4 && Array.isArray(s.players)) {
      s.players = (s.players as Record<string, unknown>[]).map(p => ({
        ...p,
        career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 } }))
    }
    // v4→v5: reset career for not-yet-started saves (base players had fake career values hardcoded)
    if (version < 5 && !s.isInitialized && Array.isArray(s.players)) {
      s.players = (s.players as Record<string, unknown>[]).map(p => ({
        ...p,
        career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 } }))
    }
    // v5→v6: initialRank を追加、budget をクラブ予算に更新
    if (version < 6 && Array.isArray(s.teams)) {
      const RANK_MAP: Record<string, number> = {
        sapporo: 9, morioka: 16, aomori: 18, sendai: 10,
        tokyo: 1, yokohama: 4, chiba: 8, saitama: 7,
        nagano: 14, niigata: 20, shizuoka: 11, nagoya: 3,
        kyoto: 13, osaka: 2, kobe: 6,
        hiroshima: 12, okayama: 19,
        fukuoka: 5, kagoshima: 15, okinawa: 17 }
      s.teams = (s.teams as Record<string, unknown>[]).map(t => {
        const id = t.id as string
        const isPlayer = t.isPlayerControlled as boolean
        const initialRank = RANK_MAP[id] ?? 10
        // 旧グラント表(RANK_BUDGET)は廃止。いまは格の年間予算1本
        const newBudget = isPlayer ? 400_000_000 : tierBudget({ id, initialRank })
        return {
          ...t,
          initialRank,
          finance: { ...(t.finance as Record<string, unknown>), budget: newBudget } }
      })
    }
    // v7: ロスターをフラット化（1軍/2軍・契約種別を廃止し、単一ロスター(main)へ統合）
    if (version < 7) {
      if (Array.isArray(s.players)) {
        s.players = (s.players as Record<string, unknown>[]).map(p => {
          const contract = (p.contract ?? {}) as Record<string, unknown>
          return { ...p, contract: { ...contract, contractType: 'standard' } }
        })
      }
    }
    // v8: 既存セーブの予算を格の年間予算に合わせる
    if (version < 8 && Array.isArray(s.teams)) {
      s.teams = (s.teams as Record<string, unknown>[]).map(t => {
        // 旧グラント表は廃止。自チーム・CPUの区別なく格の年間予算に揃える
        const budget = tierBudget({ id: t.id as string, initialRank: (t.initialRank as number) ?? 10 })
        return { ...t, finance: { ...(t.finance as Record<string, unknown>), budget } }
      })
    }
    // v9: currentSeason.initialBudget が無い旧セーブは、現在のプレイヤー予算を初期予算とみなす（3.5億で埋めないため）
    if (version < 9 && s.currentSeason && (s.currentSeason as Record<string, unknown>).initialBudget == null) {
      const pid = s.playerTeamId as string | undefined
      const myTeam = Array.isArray(s.teams) ? (s.teams as Record<string, unknown>[]).find(t => t.id === pid) : undefined
      const curBudget = myTeam ? ((myTeam.finance as Record<string, unknown>)?.budget as number) : undefined
      s.currentSeason = { ...(s.currentSeason as Record<string, unknown>), initialBudget: curBudget ?? tierBudget(undefined) }
    }
    // v10: セーブ肥大化の掃除（既に膨らんだセーブの救済）。
    //  - 過去シーズンから一度も読まれない重いデータ（記録会全結果・ニュース・チャットログ等）を空にする
    //  - チーム歴代記録に選手名を焼き込む（今後の選手データ整理で名前が消えないように）
    //  ※レース結果・順位・世界選手権・自己ベスト・歴代記録は全て残る
    if (version < 10) {
      if (Array.isArray(s.pastSeasons)) {
        s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(ps => ({
          ...ps,
          individualEvents: [], newsFeed: [], chatLogs: {}, scoutProspects: [], draftPool: [],
          transferListings: [], incomingOffers: [], transferBids: [], contractRequests: [],
          acquisitionOffers: [], retirementRequests: [], transferRequests: [],
          scoutMissions: [], faVisits: [], pendingTradeOffers: [], scoutedOpponents: [] }))
      }
      if (Array.isArray(s.teams) && Array.isArray(s.players)) {
        const nameById = new Map((s.players as Record<string, unknown>[]).map(p => [p.id as string, { name: p.name as string, nationality: p.nationality }]))
        s.teams = (s.teams as Record<string, unknown>[]).map(t => {
          const er = t.eventRecords as Record<string, { playerId: string; playerName?: string; nationality?: unknown; timeSec: number; year: number }[]> | undefined
          if (!er) return t
          const filled = Object.fromEntries(Object.entries(er).map(([k, recs]) => [k, (recs ?? []).map(r => {
            if (r.playerName) return r
            const info = nameById.get(r.playerId)
            return info ? { ...r, playerName: info.name, nationality: info.nationality } : r
          })]))
          return { ...t, eventRecords: filled }
        })
      }
    }
    // v11:
    //  - 区間記録の重複掃除（同一選手は最速の1本だけ残す。以後は保存時に集約される）
    //  - 旧セーブに現行定義のリーグ/クラブが欠けている場合の補完（クラブごと消えて見える問題の救済）
    if (version < 11) {
      if (s.segmentRecords && typeof s.segmentRecords === 'object') {
        type SegRec = { playerId?: string; playerName?: string; timeSec: number }
        s.segmentRecords = Object.fromEntries(Object.entries(s.segmentRecords as Record<string, SegRec[]>).map(([k, recs]) => {
          const best = new Map<string, SegRec>()
          for (const r of recs ?? []) {
            const pkey = r.playerId ?? r.playerName ?? '?'
            const cur = best.get(pkey)
            if (!cur || r.timeSec < cur.timeSec) best.set(pkey, r)
          }
          return [k, [...best.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, 10)]
        }))
      }
      if (s.isInitialized && Array.isArray(s.foreignLeagues) && Array.isArray(s.players)) {
        const saved = s.foreignLeagues as { id: string; clubs: { id: string }[] }[]
        // 定義にあるのにセーブに無いリーグ/クラブを洗い出す
        const toGenerate = FOREIGN_LEAGUES.flatMap(def => {
          const sl = saved.find(l => l.id === def.id)
          const missingClubs = sl ? def.clubs.filter(c => !sl.clubs.some(sc => sc.id === c.id)) : def.clubs
          return missingClubs.length > 0 ? [{ ...def, clubs: missingClubs }] : []
        })
        if (toGenerate.length > 0) {
          const year = ((s.currentSeason as Record<string, unknown>)?.year as number) ?? 2027
          const gen = generateForeignLeaguePlayers(toGenerate, year)
          s.players = [...(s.players as unknown[]), ...gen.players]
          // 生成済みクラブを既存リーグへ合流（リーグごと無ければ丸ごと追加）
          const genByLeague = new Map(gen.updatedLeagues.map(l => [l.id, l]))
          const merged = saved.map(sl => {
            const gl = genByLeague.get(sl.id)
            return gl ? { ...sl, clubs: [...sl.clubs, ...gl.clubs] } : sl
          })
          for (const gl of gen.updatedLeagues) {
            if (!merged.some(l => l.id === gl.id)) merged.push(gl as unknown as (typeof merged)[0])
          }
          s.foreignLeagues = merged
          // 補完したリーグの順位表が currentSeason に無いと表示が壊れるので、欠けている分だけ初期化して足す
          const cs = (s.currentSeason ?? {}) as Record<string, unknown>
          const standings = { ...((cs.foreignStandings as Record<string, unknown>) ?? {}) }
          const initAll = initForeignStandings(merged as Parameters<typeof initForeignStandings>[0])
          for (const [lid, st] of Object.entries(initAll)) {
            if (!standings[lid]) standings[lid] = st
          }
          s.currentSeason = { ...cs, foreignStandings: standings }
        }
      }
    }
    // v13: ECL戦名を「ECL 第X戦」→「ECL コース名」へ（生成側の命名変更に既存セーブを合わせる）。
    // 選手詳細の出走履歴は過去シーズンのECL戦名も読むので、currentSeasonだけでなくpastSeasonsも全部直す
    if (version < 13) {
      const renameRaces = (races: { name: string; location: string }[]) =>
        races.map(r => {
          if (!/^ECL 第\d+戦$/.test(r.name)) return r
          const course = ECL_COURSES.find(c => c.location === r.location)
          return course ? { ...r, name: `ECL ${course.name}` } : r
        })
      const renameSeason = (season: Record<string, unknown>) => {
        const series = season.eclSeries as { races?: { name: string; location: string }[] } | undefined
        if (!series?.races) return season
        return { ...season, eclSeries: { ...series, races: renameRaces(series.races) } }
      }
      if (s.currentSeason) s.currentSeason = renameSeason(s.currentSeason as Record<string, unknown>)
      if (Array.isArray(s.pastSeasons)) s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(renameSeason)
    }
    // v16: 海外リーグ大再編（9リーグ×20クラブ）。リーグIDが全面刷新されたため、旧セーブは現シーズンは
    // 旧リーグのまま走らせ、次の年度更新で新9リーグへ丸ごと置換する（pendingForeignRestructure→rolloverで処理）。
    // ※現シーズンの順位を壊さないための「次年度反映」。新規ゲームは最初から新リーグ。
    if (version < 16) {
      if (s.isInitialized && Array.isArray(s.foreignLeagues)) {
        const hasNew = (s.foreignLeagues as { id: string }[]).some(l => l.id === 'asia_league')
        if (!hasNew) {
          const cs = (s.currentSeason ?? {}) as Record<string, unknown>
          s.currentSeason = { ...cs, pendingForeignRestructure: true }
        }
      }
    }
    // v17: DraftState.contractsDone を追加。既に契約まで済んでいる旧セーブに旗を立てておかないと、
    // 起動時にドラフト完了画面へ戻ってしまうため、開始済み（isInitialized）のセーブは done 扱いにする。
    if (version < 17) {
      const ds = s.draftState as Record<string, unknown> | undefined
      if (ds && ds.isComplete && s.isInitialized) s.draftState = { ...ds, contractsDone: true }
    }
    // v18: 国籍の「バケツ」廃止。旧セーブの nationality 'FOREIGN'（国不明）/'EUR'（欧州選抜）を
    // 実在の国コードへ直す。外国人選手は origin に出身国名が入っているので、そこから逆引きする。
    // （旗の画像もラベルも実在国コードしか持たないため、直さないと旗が出ず国名も空になる）
    if (version < 18) {
      const natByLabel = new Map<string, string>(
        (Object.entries(NAT_LABEL) as [string, string][]).map(([code, label]) => [label, code]),
      )
      const isBucket = (n: unknown) => n === 'FOREIGN' || n === 'EUR'
      // 選手（players）：origin＝出身国名から逆引き。分からなければケニア扱い（外国人であることは保つ）
      if (Array.isArray(s.players)) {
        s.players = (s.players as Record<string, unknown>[]).map(p => {
          if (!isBucket(p.nationality)) return p
          const nat = natByLabel.get(String(p.origin ?? '')) ?? 'KEN'
          return { ...p, nationality: nat, foreignCategory: nationalityToForeignCategory(nat as Nationality) }
        })
      }
      // 育成選手：日本名・日本の出身地なので日本国籍に寄せる
      const fixProspects = (season: Record<string, unknown>) => {
        const dp = season.devProspects
        if (!Array.isArray(dp)) return season
        return { ...season, devProspects: (dp as Record<string, unknown>[]).map(d =>
          isBucket(d.nationality) ? { ...d, nationality: natByLabel.get(String(d.origin ?? '')) ?? 'JPN' } : d) }
      }
      if (s.currentSeason) s.currentSeason = fixProspects(s.currentSeason as Record<string, unknown>)
      // 世界駅伝は廃止したので旧セーブの残骸を落とす（残っていても使われないが容量の無駄）
      delete s.nationalTeam
      if (s.currentSeason) delete (s.currentSeason as Record<string, unknown>).worldEkidenResult
    }
    // v19: 過去シーズンを「許可リスト方式」に揃える。
    // 旧セーブは Season を丸ごと積んでいたため、一度も読まれない項目（財務・目標・練習設定・
    // 交渉/オファー/通知の類・ECL最終結果など）が全部残っている。ここで ArchivedSeason と
    // 同じ形まで削り落とす。残す項目は archiveSeason() と1対1で対応させること。
    // ※ここで消えるのは「読む箇所がゼロの項目」だけ。記録室・在籍履歴・歴代優勝の元データ
    //   （races / standings / foreignApps / zeroAppearances / ECL）はすべて残す。
    if (version < 19 && Array.isArray(s.pastSeasons)) {
      s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(toArchivedShape)
    }
    // v20: 既存セーブに残っている「一時的な状態」を消す。
    // 今後は保存時に除外される（persist の partialize）が、すでに書かれてしまった分は
    // ここで落とさないと、更新後の初回起動で1度だけ選手シートが勝手に開いてしまう。
    // 加入通知の確認済みキーも増える一方だったので直近100件に切り詰める。
    if (version < 20) {
      for (const k of EPHEMERAL_KEYS) delete s[k]
      if (Array.isArray(s.seenJoinIds) && s.seenJoinIds.length > 100) {
        s.seenJoinIds = (s.seenJoinIds as string[]).slice(-100)
      }
      // 廃止した「1軍に昇格させますか？」の通知が未回答のまま残っているセーブがあるので取り除く
      const cs = s.currentSeason as { events?: { id?: string }[] } | undefined
      if (cs && Array.isArray(cs.events)) {
        cs.events = cs.events.filter(ev => !(typeof ev?.id === 'string' && ev.id.startsWith('promo-')))
      }
    }
    // v21: 引退選手の「引退時の所属」を過去シーズンから推定して入れる。
    // これが無いと、海外クラブで現役を終えた選手が記録室の国内ランキング
    // （通算区間賞・通算MVP・記録会の歴代）に混ざったままになる。
    // 判断が付かない選手には何も書かないので、既存の順位が急に変わることはない
    if (version < 21) {
      s.players = backfillRetiredTeamIds(s.players, s.pastSeasons)
    }
    // v22: 海外クラブが持っていた選手名簿(playerIds)を廃止。
    // 所属は選手側の teamId だけで持つ（国内チームと同じ扱い）。
    // 捨てる前に1回だけ、名簿にしか載っていない選手の所属を teamId へ戻す
    // （旧バージョンで契約満了のFA化が海外選手にも効いてしまったセーブの救済）。
    if (version < 22) {
      s.players = restoreTeamIdsFromLegacyClubs(s.players as Player[], s.foreignLeagues)
      dropLegacyClubRosters(s.foreignLeagues)
    }
    // v23: 2軍の枠を廃止。選手の rosterTier / dualRegistered と
    // チームの roster.second を捨てる（second に居た選手は main へ寄せる）。
    // 実際の所属は player.teamId が正なので、これで消える選手はいない。
    // セーブの容量も減る。
    if (version < 23) {
      if (Array.isArray(s.players)) {
        s.players = (s.players as Record<string, unknown>[]).map(p => {
          const next = { ...p }
          delete next.rosterTier
          delete next.dualRegistered
          return next
        })
      }
      if (Array.isArray(s.pastSeasons)) {
        s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(ps => {
          const za = ps.zeroAppearances
          if (!Array.isArray(za)) return ps
          return { ...ps, zeroAppearances: (za as Record<string, unknown>[]).map(z => ({ playerId: z.playerId, teamId: z.teamId })) }
        })
      }
    }
    // v24: チームから、書くだけで誰も読んでいなかった持ち物を捨てる。
    //  - logoUrl ... いつも空文字。ロゴの表示は logoId とチームIDで決めていた
    //  - finance.salaryTotal ... 保存していたが参照する場所が無い。年俸の合計は要る時に選手から数える
    //  - history.cupWins ... 増やす処理も出す画面も無かった
    //  - history.legends ... 引退した名選手を貯めていたが出す画面が無かった。
    //    記録室の「名選手」は選手データから作り直すので、貯めたぶんは要らない
    // 所属・成績・記録には触らないので消える情報は無い。セーブの容量だけ減る。
    if (version < 24 && Array.isArray(s.teams)) {
      s.teams = (s.teams as Record<string, unknown>[]).map(t => {
        const next = { ...t }
        delete next.logoUrl
        const fin = { ...((next.finance ?? {}) as Record<string, unknown>) }
        delete fin.salaryTotal
        next.finance = fin
        const his = { ...((next.history ?? {}) as Record<string, unknown>) }
        delete his.cupWins
        delete his.legends
        next.history = his
        return next
      })
    }
    // v25: 区間記録（segmentRecords）を保存するのをやめる。
    // 元になるレース結果は過去シーズンに全部残っていて消えないので、記録は表示のたびに数え直す。
    // 貯めていたのはトップ10だけだったが、数え直すほうが取りこぼしが無く、セーブも軽くなる。
    if (version < 25) {
      delete s.segmentRecords
    }
    // v26: チームの成績（history）を保存するのをやめる。
    // 順位・勝ち点・優勝回数・連続上位は、過去シーズンの順位表から数え直せる。
    // 順位表は消えないので、これまでの成績がそのまま出る。
    if (version < 26 && Array.isArray(s.teams)) {
      s.teams = (s.teams as Record<string, unknown>[]).map(t => {
        const next = { ...t }
        delete next.history
        return next
      })
    }

    // v27: 年度MVP・新人王（seasonAwards）を保存するのをやめる。
    // 受賞者は過去シーズンのレース結果から選び直せる（utils/awards.ts）。
    // 選び方は作った時から変えていないので、これまでの受賞者がそのまま出る。
    if (version < 27) {
      delete s.seasonAwards
    }

    // v28: ECLの歴代優勝（eclHistory）を保存するのをやめる。
    // 優勝チーム・大会MVP・優勝メンバーは、過去シーズンのECLのレース結果から数え直せる。
    // 決め方は当時のまま変えていないので、これまでの記録がそのまま出る。
    if (version < 28) {
      delete s.eclHistory
    }

    // v29: 選手の通算成績（通算出走数・通算区間賞・MVP回数）を保存するのをやめる。
    // 数字は保存してあるレース結果から数え直す（utils/careerStats.ts）。
    // ここで消す必要はない（読み込みのたびに merge で入れ直し、保存時に落とす）。
    //
    // ここまでの v25〜v29 が「セーブに持たず数え直す」への切り替え。
    // 変換自体は自動で終わっているが、古いセーブの初回起動だけは
    // 数え直しを先に済ませて新しい形で書き直したいので、更新画面を出す合図を立てる。
    // ★版が上がったときは**必ず**更新画面を出す。
    //   以前は「v29より古いとき」だけで、次に版を上げても出なかった。
    //   この画面が出ているあいだは先へ進めないので、読み込みと書き直しが
    //   終わる前にプレイして壊す、という事故が起きない。
    if (version < SAVE_VERSION && s.isInitialized) markDataUpdateNeeded()

    // v30: リザーブ（2軍リーグ）を廃止。
    // 今シーズンの進行中データだけを落とす。過去シーズン（pastSeasons）の
    // secondTeamRaces / secondTeamStandings は残す。消すと記録室から
    // 「あったはずのリザーブの記録」が消えて見えるため。
    if (version < 30) {
      const cs = s.currentSeason as Record<string, unknown> | undefined
      if (cs) {
        delete cs.secondTeamRaces
        delete cs.secondTeamRaceIndex
        delete cs.secondTeamStandings
        delete cs.reserveLeagueJoined
      }
    }

    // v31: 部（ディビジョン）を足した。build 88 までのセーブのチームは全員1部。
    // divisionOf() が未設定を1部として扱うので入れなくても動くが、
    // 入れておかないとセーブを覗いたときに「所属が無いチーム」に見えて紛らわしい。
    if (version < 31) {
      const teams = s.teams as { division?: number }[] | undefined
      if (Array.isArray(teams)) for (const t of teams) if (t && t.division == null) t.division = 1
    }
    // v32: 予算をクラブの格1本にした（順位グラント・レース賞金・観客収入・
    //      連続赤字/育成義務ペナルティ・施設維持費を廃止）。
    //      旧セーブの残高は順位グラント(3.5〜5.7億)基準なので、新しい年俸水準に対して
    //      いきなり赤字になる。格の年間予算(4.2〜16.8億)で入れ直し、連続赤字も0に戻す。
    //      Team.tier は書かない。未設定なら data/clubTiers.ts の初期値が読まれ、
    //      次のシーズン終了時に前年順位から正しい格が入る。
    if (version < 32) {
      const teams32 = s.teams as Record<string, unknown>[] | undefined
      if (Array.isArray(teams32)) {
        for (const t of teams32) {
          const budget = tierBudget({ id: t.id as string, initialRank: t.initialRank as number | undefined })
          t.finance = { ...(t.finance as Record<string, unknown>), budget, deficitStreak: 0 }
        }
      }
      const cs32 = s.currentSeason as Record<string, unknown> | undefined
      if (cs32) {
        const me = Array.isArray(teams32) ? teams32.find(t => t.id === s.playerTeamId) : undefined
        const myBudget = (me?.finance as Record<string, unknown> | undefined)?.budget as number | undefined
        if (myBudget != null) { cs32.initialBudget = myBudget; cs32.seasonGrant = myBudget }
        // 旧内訳（順位グラント・賞金観客収入）は項目の意味が変わったので捨てる
        delete cs32.budgetBreakdown
        cs32.seasonRaceIncome = 0
      }
    }
    // v33: 初年度のマイ選手作成（配分500）を足した。既存セーブは初年度をとっくに
    //      過ぎているので「作成済み」にしておく。ここを false のままにすると、
    //      アップデート記念のぶん（配分560）が初年度枠として500で開いてしまう。
    if (version < 33 && s.isInitialized) s.inauguralPlayerCreated = true

    // v34: 海外クラブの表示名が5文字で切られていた（「ストックホルム」が「ストックホ」）。
    //      正しい都市名は FOREIGN_CLUB_CITY にそろっているのに、shortName に別途
    //      切り詰めた値を持っていたのが原因。都市名1本に直す。
    if (version < 34 && Array.isArray(s.foreignLeagues)) {
      s.foreignLeagues = (s.foreignLeagues as { clubs?: Record<string, unknown>[] }[]).map(l => ({
        ...l,
        clubs: (l.clubs ?? []).map(c => {
          const city = FOREIGN_CLUB_CITY[c.id as string]
          return city ? { ...c, shortName: city } : c
        }) }))
    }

    // v35: 期限・回復の数え方を「リーグ戦の何番目か」から「何本走ったか」へ変えた
    //      （ECLと記録会も1本と数える）。基準がずれるぶんだけ、保存してある期限を
    //      同じだけ後ろへずらす。やらないと、読み込んだ瞬間に全部が期限切れになる。
    if (version < 35 && s.currentSeason) {
      const cs = s.currentSeason as Record<string, unknown>
      const ecl = (((cs.eclSeries as { races?: { results?: unknown }[] } | undefined)?.races) ?? []).filter(r => r.results).length
      const iev = ((cs.individualEvents as { results?: unknown }[] | undefined) ?? []).filter(e => e.results).length
      const shift = ecl + iev
      if (shift > 0) {
        const bump = <T extends { expiresAtRace?: number }>(list: T[] | undefined) =>
          (list ?? []).map(o => o.expiresAtRace != null ? { ...o, expiresAtRace: o.expiresAtRace + shift } : o)
        cs.incomingOffers = bump(cs.incomingOffers as { expiresAtRace?: number }[] | undefined)
        cs.incomingLoanOffers = bump(cs.incomingLoanOffers as { expiresAtRace?: number }[] | undefined)
        cs.transferListings = bump(cs.transferListings as { expiresAtRace?: number }[] | undefined)
        cs.pendingTradeOffers = bump(cs.pendingTradeOffers as { expiresAtRace?: number }[] | undefined)
        cs.contractRequests = bump(cs.contractRequests as { expiresAtRace?: number }[] | undefined)
        cs.acquisitionOffers = bump(cs.acquisitionOffers as { expiresAtRace?: number }[] | undefined)
        if (Array.isArray(s.players)) {
          s.players = (s.players as Record<string, unknown>[]).map(p =>
            typeof p.injuredUntilRace === 'number' ? { ...p, injuredUntilRace: p.injuredUntilRace + shift } : p)
        }
      }
    }

    // v35→v36: 順位表を部ごとに分ける。
    //
    // それまでは全52チームを1本の配列で持ち「表示するときに部で絞る」形だった。
    // 絞り忘れができる形そのものが原因で、ホーム・チーム画面・レース結果・記録室・
    // ドラフト順・契約更新が全部混ざったまま動いていた。海外リーグ（foreignStandings）と
    // 同じく、部をキーにした入れ物にする。
    //
    // どの部に入れるか
    //   今季  … いまの Team.division がそのままその年の事実
    //   過去  … その年の駅伝（races）に一緒に出ていた面々＝自分の部。
    //           それで決まらないチームはいまの Team.division で代用する
    //           （昇降格していればずれるが、混ぜたままにするよりはるかにまし）
    if (version < 36) {
      const divById = new Map(
        (Array.isArray(s.teams) ? s.teams as Record<string, unknown>[] : [])
          .map(t => [t.id as string, ((t.division as number | undefined) ?? 1)]),
      )
      const split = (season: Record<string, unknown> | undefined, useRaces: boolean) => {
        if (!season || !Array.isArray(season.standings)) return
        const rows = season.standings as Record<string, unknown>[]
        // その年の駅伝に出ていた面々＝そのシーズンの自分の部
        const inMyDiv = new Set<string>()
        if (useRaces && Array.isArray(season.races)) {
          for (const r of season.races as Record<string, unknown>[]) {
            const res = r.results as { teamRankings?: { teamId: string }[] } | undefined
            for (const tr of res?.teamRankings ?? []) inMyDiv.add(tr.teamId)
          }
        }
        // 自分の部が何部だったかは、そこにいるチームのいまの部の最頻値で決める
        const myDiv = (() => {
          if (inMyDiv.size === 0) return null
          const count = new Map<number, number>()
          for (const id of inMyDiv) {
            const d = divById.get(id) ?? 1
            count.set(d, (count.get(d) ?? 0) + 1)
          }
          return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
        })()
        const out: Record<number, Record<string, unknown>[]> = { 1: [], 2: [], 3: [] }
        for (const row of rows) {
          const id = row.teamId as string
          const d = (myDiv != null && inMyDiv.has(id)) ? myDiv : (divById.get(id) ?? 1)
          ;(out[d] ?? out[1]).push(row)
        }
        season.standings = out
      }
      split(s.currentSeason as Record<string, unknown> | undefined, true)
      for (const ps of (Array.isArray(s.pastSeasons) ? s.pastSeasons as Record<string, unknown>[] : [])) {
        split(ps, true)
      }
    }
    // v36→v37: 世界大会の走行記録を worldAthleticsResults からシーズン側（waRaces）へ移す。
    //
    // worldAthleticsResults は普段のセーブに入りっぱなしで、状態が変わるたびに丸ごと
    // 書き直される。ここに走行記録を置くと、大会のたびに数十KBずつ増え続ける
    // （100シーズンで数MBが毎回の書き込みに乗る。過去シーズンを別置きにしたのと同じ問題）。
    // シーズン側に移せば、他のレースと同じく1年に1回だけ別ファイルへ出る。
    //
    // その年のシーズンが見つからないぶん（＝今季の大会）は動かさない。
    // 読む側（utils/waRaces）が古い置き場所も見るので、移らなくても記録は消えない。
    if (version < 37 && Array.isArray(s.worldAthleticsResults)) {
      const seasons = [
        ...(Array.isArray(s.pastSeasons) ? s.pastSeasons as Record<string, unknown>[] : []),
        ...(s.currentSeason ? [s.currentSeason as Record<string, unknown>] : []),
      ]
      const byYear = new Map(seasons.map(x => [x.year as number, x]))
      s.worldAthleticsResults = (s.worldAthleticsResults as Record<string, unknown>[]).map(res => {
        const races = res.races as { results?: unknown }[] | undefined
        if (!Array.isArray(races) || races.length === 0) return res
        const season = byYear.get(res.year as number)
        if (!season) return res
        const code = res.kind === 'main' ? 'main' : 'asia'
        const wa = (season.waRaces as Record<string, unknown> | undefined) ?? {}
        if (wa[code]) return res              // すでに移してある
        season.waRaces = { ...wa, [code]: races.filter(r => r.results) }
        const { races: _races, ...rest } = res
        return rest
      })
    }

    // v37→v38: 監督オファーの入れ物を「1件」から「一覧」へ。
    // 自分から退任すると行き先が複数届くので、1件と複数で入れ物を分けない
    // （分けると受ける・断るの処理が2本になり、片方だけ直し漏れる）。
    if (version < 38) {
      const old = (s as { gmOffer?: unknown }).gmOffer
      if (old) s.gmOffers = [old]
      delete (s as { gmOffer?: unknown }).gmOffer
    }

    // v38→v39: 順位表の行を国内・海外で1つの型にした（キーは teamId）。
    // 海外だけ clubId で書かれていたので、今シーズンぶんと過去シーズンぶんを均す。
    // ここを飛ばすと海外リーグの順位表が全部「順位0・優勝回数0」になる。
    // 均し方は utils/clubStanding の normalizeForeignStandings 1本
    // （別ファイルに出してある過去シーズンの読み戻しも同じ関数を通る）。
    if (version < 39) {
      const cs = s.currentSeason as Record<string, unknown> | undefined
      if (cs?.foreignStandings) {
        cs.foreignStandings = normalizeForeignStandings(cs.foreignStandings as Record<string, unknown[]>)
      }
      if (Array.isArray(s.pastSeasons)) {
        s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(ps =>
          ps?.foreignStandings
            ? { ...ps, foreignStandings: normalizeForeignStandings(ps.foreignStandings as Record<string, unknown[]>) }
            : ps)
      }
    }

    // v39→v40: クラブ側の名簿（team.roster）を廃止した。
    // 在籍は player.teamId が唯一の持ち場で、team.roster はそこから毎回組み直す
    // “控え”でしかなかった。組み直す関数が要ること自体が二重に持っている証拠で、
    // 片方だけ更新して食い違う事故（片落ちトレード）が実際に起きていた。
    // 古いセーブには残っているので、読み込んだときに落としてセーブを軽くする。
    if (version < 40 && Array.isArray(s.teams)) {
      s.teams = (s.teams as Record<string, unknown>[]).map(t => {
        if (!t || !('roster' in t)) return t
        const { roster: _roster, ...rest } = t
        return rest
      })
    }
    // v40: すでにチャットに並んでしまった重複を掃除する。
    // 発言の突き合わせ（utils/chatLog の mergeChatMessages）は「保存済みに無いものを足す」
    // 側なので、**すでに2行並んでいるものは自分では消せない**。
    // 二重に書かれていた文面（承諾の礼・逆提示・合意・断りの受け）を1本にしたので
    // これから増えることは無いが、いま入っているぶんはここで1つにする。
    // 消すのは「同じ人の同じ文が続けて並んでいる」ときだけ（離れた場所にある同じ発言は残す）。
    if (version < 40) {
      const cs = s.currentSeason as { chatLogs?: Record<string, { from?: string; text?: string }[]> } | undefined
      if (cs?.chatLogs) {
        const cleaned: Record<string, unknown[]> = {}
        for (const [pid, log] of Object.entries(cs.chatLogs)) {
          cleaned[pid] = (log ?? []).filter((m, i, arr) =>
            i === 0 || m?.from !== arr[i - 1]?.from || m?.text !== arr[i - 1]?.text)
        }
        cs.chatLogs = cleaned as never
      }
    }
    // v42: 海外クラブの格を初期値へ戻す。
    // 毎年のリーグ順位で書き換えていたのをやめた（オーナー・2026-08-18
    // 「格はもう動かさない。国内だけ動かす」）。保存済みの `tier` を消せば
    // `tierOf` が data/clubTiers.ts の初期値を読むので、遊んでいるセーブも
    // オーナー指定の並び（格1の5クラブを含む）へ戻る。**国内は触らない。**
    if (version < 42 && Array.isArray(s.foreignLeagues)) {
      s.foreignLeagues = (s.foreignLeagues as Record<string, unknown>[]).map(lg => {
        if (!lg || !Array.isArray(lg.clubs)) return lg
        return { ...lg, clubs: (lg.clubs as Record<string, unknown>[]).map(c => {
          if (!c || !('tier' in c)) return c
          const { tier: _tier, ...rest } = c
          return rest
        }) }
      })
    }
    // v43: 移籍のロックを「加入から2年」から「加入したときの契約が続いている間」へ。
    //   これまでロックされていた選手（加入から2年未満）に印を立てて、挙動を引き継ぐ。
    //   印が無い選手は止まらないので、ここで立てないと**旧セーブの世界が一斉に解錠**される。
    if (version < 43 && Array.isArray(s.players)) {
      const year = (s.currentSeason as { year?: number } | undefined)?.year ?? 0
      s.players = (s.players as Record<string, unknown>[]).map(p => {
        if (!p || typeof p !== 'object') return p
        const jy = p.joinedYear as number | undefined
        const c = p.contract as Record<string, unknown> | undefined
        if (!c || !jy || !year || year - jy >= 2) return p
        return { ...p, contract: { ...c, signedOnJoin: true } }
      })
    }
    return s
  } catch (e) {
    // 旧セーブの変換中に例外が出ても読み込み自体は失敗させず、変換前のデータをそのまま渡す。
    // ここで throw すると persist の内部の .catch に吸われ、セーブが無かったことになる。
    console.error('[save] migrate failed; using the persisted state as-is', e)
    // ただし変換が途中で止まったまま遊ばせると危ない：persist はこのあと version を最新に
    // 刻むため、届かなかった段は二度と走らず、次の保存で「未変換の形＋最新の版数」が確定する。
    // 実データのあるセーブならセーフモードにする（saveStorage が書き込みを拒否して元の
    // セーブを守り、App の復旧画面が案内する）。
    const s0 = persistedState as Record<string, unknown> | null
    const looksReal = !!s0 && (s0.isInitialized === true || (Array.isArray(s0.players) && s0.players.length > 0))
    if (looksReal) setSaveHealth('failed', 'セーブの変換に失敗しました（元のセーブは保護されています）')
    return persistedState as Record<string, unknown>
  }
}
