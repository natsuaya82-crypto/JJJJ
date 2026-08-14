// ============================================================================
// **レート戦の10:00。1日1回これが動く。**
//
//   ① 前日ぶんを締めて、グループごとに走らせて、順位とレートを書く
//   ② その日のコースを `rated_rounds` に入れる（提出はここから23:59まで）
//
// ★このファイルは**殻**です。判断は1つも書きません。
//   走らせ方・グループ分け・レートは全部 `engine.js`（＝`src/engine/ratedTick.ts` を
//   1枚にまとめたもの）にあり、**アプリとまったく同じ関数**を呼びます。
//   ここに条件式を書き足すと、点検から見えない2本目の物差しになります。
//
// ■デプロイ
//     npm run build:edge                       # engine.js を作り直す
//     supabase functions deploy rated-tick     # 上げる
//   毎日の起動は Supabase ダッシュボードの Edge Functions → Schedules で
//   `0 1 * * *`（UTC 01:00 ＝ 日本時間 10:00）。詳しくは supabase/README.md。
//
// ■手で流したいとき（締め忘れの取り戻しにも使う）
//     curl -X POST "$URL/functions/v1/rated-tick" -H "Authorization: Bearer $SERVICE_KEY"
//   何度流しても同じ結果になります（締め済みの日は素通り・その日の round は作り直さない）。
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { runRatedRound, ratedMatchCourse, ratedDayOf } from './engine.js'

/** 日本時間の「今日」。SQL 側の `rated_today_jst()` と同じ日付になること */
function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  // service key。**RLS を通らない**ので、順位もレートもここからだけ書ける
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

/** 参加者を組み立てる（プロフィール＝見た目、殿堂入り＝走る選手） */
async function loadEntrants(eventId: string) {
  const { data: entries, error } = await db
    .from('rated_entries').select('user_id, played, wins').eq('event_id', eventId)
  if (error) throw error
  const ids = (entries ?? []).map(e => e.user_id)
  if (ids.length === 0) return []
  const tally = new Map((entries ?? []).map(e => [e.user_id, { played: e.played, wins: e.wins }]))

  const { data: profiles } = await db
    .from('profiles')
    .select('user_id, team_name, short_name, gm_name, logo_id, color_primary, color_secondary')
    .in('user_id', ids)
  const { data: rosters } = await db.from('rosters').select('user_id, hof').in('user_id', ids)
  // ★レートは rated_players（人に1本・大会をまたいで続く）から読む
  const { data: players } = await db.from('rated_players').select('user_id, rating').in('user_id', ids)

  const byProfile = new Map((profiles ?? []).map(p => [p.user_id, p]))
  const byHof = new Map((rosters ?? []).map(r => [r.user_id, r.hof]))
  const byRating = new Map((players ?? []).map(p => [p.user_id, p.rating]))

  return (entries ?? []).map(e => {
    const p = byProfile.get(e.user_id)
    return {
      userId: e.user_id,
      rating: byRating.get(e.user_id) ?? 0,
      team: {
        id: e.user_id,
        name: p?.team_name ?? '',
        shortName: p?.short_name ?? '',
        gmName: p?.gm_name ?? '',
        primary: p?.color_primary ?? '#122440',
        secondary: p?.color_secondary ?? '#f5c842',
        logoId: p?.logo_id ?? 'logo_01',
      },
      hof: Array.isArray(byHof.get(e.user_id)) ? byHof.get(e.user_id) : [],
      /** 走った日数・グループ1位の回数（結果を書くときに1つ進める） */
      tally: tally.get(e.user_id) ?? { played: 0, wins: 0 },
    }
  })
}

/** 前日までの open な回を締める。**締め忘れた日があっても古い順に全部片づける** */
async function closeOverdue(today: string): Promise<string[]> {
  const done: string[] = []
  const { data: rounds, error } = await db
    .from('rated_rounds').select('*').eq('status', 'open').lt('date_iso', today)
    .order('date_iso', { ascending: true })
  if (error) throw error

  for (const r of rounds ?? []) {
    const entrants = await loadEntrants(r.event_id)
    const { data: subs } = await db
      .from('rated_lineups').select('user_id, lineup').eq('round_id', r.id)
    const lineups: Record<string, Record<number, string>> = {}
    for (const s of subs ?? []) {
      const line: Record<number, string> = {}
      for (const [k, v] of Object.entries(s.lineup ?? {})) line[Number(k)] = String(v)
      lineups[s.user_id] = line
    }

    const out = runRatedRound({ dateISO: r.date_iso, day: r.day, entrants, lineups })
    if (out.skipped) {
      // 10人に満たない＝流会。レートは動かさない
      await db.from('rated_rounds').update({ status: 'void', closed_at: new Date().toISOString() }).eq('id', r.id)
      done.push(`${r.date_iso} void`)
      continue
    }

    await db.from('rated_results').upsert(out.rows.map(x => ({
      round_id: r.id, user_id: x.userId, group_no: x.group, place: x.place,
      time_sec: x.timeSec, delta: x.delta, rating_after: x.ratingAfter, forfeit: x.forfeit,
      // 順位表の矢印。**数え直さずそのまま入れる**（画面も engine と同じ並びを見る）
      overall: x.overall, move: x.move,
    })))
    await db.from('rated_races').upsert(out.races.map(g => ({
      round_id: r.id, group_no: g.group, race: g.race,
    })))
    // レートは**サーバーが出した rating_after をそのまま**入れる（足し算を2か所でしない）。
    // ★生きた値は rated_players。rated_entries の rating は「この大会の記録」
    await db.from('rated_players').upsert(out.rows.map(x => ({
      user_id: x.userId, rating: x.ratingAfter, updated_at: new Date().toISOString(),
    })))
    const tally = new Map(entrants.map(e => [e.userId, e.tally]))
    for (const x of out.rows) {
      const t = tally.get(x.userId) ?? { played: 0, wins: 0 }
      await db.from('rated_entries')
        .update({ rating: x.ratingAfter, played: t.played + 1, wins: t.wins + (x.place === 1 ? 1 : 0) })
        .eq('event_id', r.event_id).eq('user_id', x.userId)
    }
    await db.from('rated_rounds')
      .update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', r.id)
    done.push(`${r.date_iso} ${out.groups}グループ / ${out.rows.length}人`)
  }
  return done
}

/** その日ぶんの回を作る（もうあれば何もしない） */
async function openToday(today: string): Promise<string> {
  const { data: events } = await db
    .from('rated_events').select('*').lte('starts_on', today).order('starts_on', { ascending: false })
  const ev = (events ?? []).find(e => ratedDayOf(e.starts_on, today, e.total_days) > 0)
  if (!ev) return '開催中の大会なし'

  const day = ratedDayOf(ev.starts_on, today, ev.total_days)
  const segCount = ratedMatchCourse(today).segments.length
  const { error } = await db.from('rated_rounds')
    .upsert({ event_id: ev.id, day, date_iso: today, seg_count: segCount },
            { onConflict: 'event_id,date_iso', ignoreDuplicates: true })
  if (error) throw error
  return `${today}（${day}/${ev.total_days}日目・${segCount}区間）受付開始`
}

Deno.serve(async () => {
  try {
    const today = todayJst()
    const closed = await closeOverdue(today)
    const opened = await openToday(today)
    return Response.json({ ok: true, today, closed, opened })
  } catch (e) {
    console.error(e)
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
})
