// ⚠️ 自動生成。直接編集しないこと。
// もと: src/lib/ratedTick.ts → npm run build:edge（scripts/build-edge.mjs）
// 古くなっていないかは npm run check の edge-bundle が見張ります。

// src/utils/hash.ts
function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i) >>> 0;
  return h >>> 0;
}

// src/engine/ratedCourse.ts
var SEG_MIN = 8;
var SEG_MAX = 15;
var KM_MIN = 5;
var KM_MAX = 25;
function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 16; i++) next();
  return next;
}
var WEATHER = ["sunny", "cloudy", "rainy", "windy"];
function ratedCourse(dateISO) {
  const r = rng(strHash(`rated:${dateISO}`));
  const segCount = SEG_MIN + Math.floor(r() * (SEG_MAX - SEG_MIN + 1));
  const segments = [];
  for (let i = 1; i <= segCount; i++) {
    const distanceKm = Math.round((KM_MIN + r() * (KM_MAX - KM_MIN)) * 10) / 10;
    const shape = r();
    const up = shape < 0.35 ? Math.round(r() * 70) : Math.round(r() * 25);
    const downMax = Math.max(0, 100 - up);
    const down = shape > 0.65 ? Math.round(r() * Math.min(70, downMax)) : Math.round(r() * Math.min(25, downMax));
    segments.push({ index: i, distanceKm, uphillPct: up, downhillPct: down });
  }
  return {
    id: `rated-${dateISO}`,
    name: `\u30E9\u30F3\u30AF\u30DE\u30C3\u30C1 ${dateISO}`,
    date: dateISO,
    location: "\u30AA\u30F3\u30E9\u30A4\u30F3",
    type: "league",
    segments,
    conditions: {
      temperature: Math.round(5 + r() * 25),
      weather: WEATHER[Math.floor(r() * WEATHER.length)],
      elevation: Math.round(r() * 500)
    }
  };
}
function courseDistanceKm(race) {
  return Math.round(race.segments.reduce((s, x) => s + x.distanceKm, 0) * 10) / 10;
}
function ratedMatchCourse(dateISO) {
  const r = ratedCourse(dateISO);
  return {
    id: r.id,
    name: `\u30E9\u30F3\u30AF\u30DE\u30C3\u30C1 ${dateISO}`,
    category: "main",
    location: r.location,
    segments: r.segments,
    conditions: r.conditions,
    distanceKm: courseDistanceKm(r)
  };
}
function ratedDayOf(startsOn, dateISO, totalDays) {
  const d = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const day = Math.round((d(dateISO) - d(startsOn)) / 864e5) + 1;
  return day >= 1 && day <= totalDays ? day : 0;
}
function ratedDateOf(startsOn, day) {
  const d = new Date(Date.UTC(+startsOn.slice(0, 4), +startsOn.slice(5, 7) - 1, +startsOn.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + day - 1);
  return d.toISOString().slice(0, 10);
}

// src/engine/rating.ts
var GROUP_MAX = 20;
var GROUP_MIN = 10;
var RATED_K = 40;
var ELO_SCALE = 4e3;
function applyElo(entries, order) {
  const rating = new Map(entries.map((e) => [e.id, e.rating]));
  const place = new Map(order.map((id, i) => [id, i]));
  const out = {};
  for (const me of entries) {
    const myPlace = place.get(me.id);
    if (myPlace == null) continue;
    let sum = 0;
    for (const you of entries) {
      if (you.id === me.id) continue;
      const yourPlace = place.get(you.id);
      if (yourPlace == null) continue;
      const expected = 1 / (1 + Math.pow(10, ((rating.get(you.id) ?? 0) - (rating.get(me.id) ?? 0)) / ELO_SCALE));
      const actual = myPlace < yourPlace ? 1 : myPlace > yourPlace ? 0 : 0.5;
      sum += actual - expected;
    }
    out[me.id] = Math.round(RATED_K * sum);
  }
  return out;
}
var RATING_FLOOR = 0;
function clampRating(rating) {
  return Math.max(RATING_FLOOR, rating);
}
function splitGroups(entries) {
  if (entries.length < GROUP_MIN) return [];
  const sorted = [...entries].sort((a, b) => b.rating - a.rating);
  const groups = Math.ceil(sorted.length / GROUP_MAX);
  const base = Math.floor(sorted.length / groups);
  const extra = sorted.length % groups;
  const out = [];
  let at = 0;
  for (let g = 0; g < groups; g++) {
    const size = base + (g < extra ? 1 : 0);
    out.push(sorted.slice(at, at + size));
    at += size;
  }
  return out;
}

// src/utils/league.ts
function positionPointsFor(teamCount, rank) {
  return Math.max(1, teamCount + 1 - rank);
}
function segmentAwardPoints(teamCount, rank) {
  if (teamCount >= 15) return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;
  if (teamCount >= 9) return rank === 1 ? 2 : rank === 2 ? 1 : 0;
  return rank === 1 ? 1 : 0;
}

// src/engine/raceEngine.ts
var isNum = (v) => typeof v === "number" && Number.isFinite(v);
function safeRatings(r) {
  if (r && isNum(r.speed) && isNum(r.stamina) && isNum(r.mountainUp) && isNum(r.mountainDown) && isNum(r.pacing) && isNum(r.mental) && isNum(r.recovery)) return r;
  const p = r ?? {};
  return {
    speed: isNum(p.speed) ? p.speed : 0,
    stamina: isNum(p.stamina) ? p.stamina : 0,
    mountainUp: isNum(p.mountainUp) ? p.mountainUp : 0,
    mountainDown: isNum(p.mountainDown) ? p.mountainDown : 0,
    pacing: isNum(p.pacing) ? p.pacing : 0,
    mental: isNum(p.mental) ? p.mental : 0,
    recovery: isNum(p.recovery) ? p.recovery : 0
  };
}
function calcBaseAbility(ratingsIn, uphillPct, downhillPct, distanceKm, statWeights) {
  const ratings = safeRatings(ratingsIn);
  if (statWeights) {
    return Object.keys(statWeights).reduce((sum, key) => {
      return sum + ratings[key] * (statWeights[key] ?? 0);
    }, 0);
  }
  const flatPct = Math.max(0, 100 - uphillPct - downhillPct);
  const longBonus = Math.min(distanceKm / 20, 1);
  const shortBonus = Math.max(0, 1 - distanceKm / 8);
  const flatScore = ratings.speed * (0.62 + shortBonus * 0.12) + ratings.stamina * (0.14 + longBonus * 0.12) + ratings.pacing * 0.12 + ratings.mental * 0.06 + ratings.recovery * (0.06 + longBonus * 0.06);
  const upScore = ratings.mountainUp * 0.72 + ratings.stamina * (0.15 + longBonus * 0.05) + ratings.mental * 0.07 + ratings.pacing * 0.04 + ratings.recovery * 0.02;
  const downScore = ratings.mountainDown * 0.72 + ratings.speed * 0.16 + ratings.mental * 0.07 + ratings.pacing * 0.03 + ratings.recovery * 0.02;
  return flatPct / 100 * flatScore + uphillPct / 100 * upScore + downhillPct / 100 * downScore;
}
function calcAffinity(specialty, uphillPct, downhillPct, distanceKm) {
  const flatPct = Math.max(0, 100 - uphillPct - downhillPct);
  let mult = 1;
  switch (specialty) {
    case "sprinter":
      mult += flatPct / 100 * 0.12 * (distanceKm <= 8 ? 1.4 : 1);
      mult -= uphillPct / 100 * 0.18;
      break;
    case "mountain_up":
      mult += uphillPct / 100 * 0.14;
      mult -= flatPct / 100 * 0.07;
      break;
    case "mountain_down":
      mult += downhillPct / 100 * 0.14;
      mult -= uphillPct / 100 * 0.1;
      break;
    case "long":
      mult += distanceKm >= 15 ? 0.1 : distanceKm >= 10 ? 0.05 : -0.04;
      break;
    case "undulating":
      mult += (uphillPct + downhillPct) / 100 * 0.13;
      mult -= flatPct / 100 * 0.06;
      break;
    case "ace":
      break;
    case "allrounder":
      mult += 0.02;
      break;
    case "kick":
      mult += flatPct / 100 * 0.08;
      mult -= uphillPct / 100 * 0.08;
      break;
    case "grinder":
      mult += distanceKm >= 12 ? 0.07 : 0;
      mult += flatPct >= 50 ? 0.03 : 0;
      break;
  }
  return Math.max(0.9, Math.min(1.12, 1 + (mult - 1) * 0.6));
}
function calcSegmentAffinity(specialty, seg3) {
  const base = calcAffinity(specialty, seg3.uphillPct, seg3.downhillPct, seg3.distanceKm);
  if (specialty !== seg3.recommended) return base;
  return base * (specialty === "ace" ? 1.09 : 1.05);
}
function calcClubModifier(team, raceLocation) {
  let mod = 1;
  if (raceLocation && team.city && raceLocation.includes(team.city)) mod += 0.02;
  return mod;
}
function calcConditionModifier(fatigue, morale, form) {
  const fatigueMod = 1 - Math.max(0, (fatigue - 25) / 75) * 0.16;
  const moraleMod = morale <= 70 ? 0.95 + morale / 70 * 0.05 : 1 + (morale - 70) / 30 * 0.03;
  const formMod = 1 + form * 0.03;
  return fatigueMod * moraleMod * formMod;
}
function calcRandomFactor(traits) {
  const range = traits?.includes("consistent") ? 0.02 : traits?.includes("volatile") ? 0.07 : 0.04;
  return 1 - range + Math.random() * (range * 2);
}
function calcTraitModifier(traits, uphillPct, downhillPct, distanceKm, segIndex, totalSegs) {
  const flatPct = Math.max(0, 100 - uphillPct - downhillPct);
  let mod = 1;
  const isLast = segIndex === totalSegs;
  const isLate = segIndex >= Math.floor(totalSegs / 2);
  for (const t of traits) {
    if (t === "clutch" && isLast) mod *= 1.05;
    if (t === "fade" && isLate) mod *= 0.96;
    if (t === "mountain_ace" && uphillPct >= 30) mod *= 1.06;
    if (t === "sprint_burst" && flatPct >= 60 && distanceKm <= 10) mod *= 1.06;
    if (t === "iron_will" && distanceKm >= 15) mod *= 1.03;
    if (t === "big_stage" && (segIndex === 0 || isLast)) mod *= 1.02;
    if (t === "pressure_weak" && isLast) mod *= 0.97;
  }
  return mod;
}
var PACE_TABLE = [
  [0, 252],
  [30, 230],
  [40, 218],
  [50, 206],
  [60, 194],
  [70, 184],
  [80, 174],
  [85, 168],
  [90, 163],
  [95, 158],
  [99, 154]
];
function scoreToBasePace(score) {
  const t = PACE_TABLE;
  if (score <= t[0][0]) return t[0][1];
  if (score >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 0; i < t.length - 1; i++) {
    const [s0, p0] = t[i], [s1, p1] = t[i + 1];
    if (score >= s0 && score <= s1) return p0 + (score - s0) / (s1 - s0) * (p1 - p0);
  }
  return t[t.length - 1][1];
}
function scoreToTime(score, distanceKm, uphillPct = 0, downhillPct = 0) {
  const gradePenalty = uphillPct * 0.4 - downhillPct * 0.35;
  const basePaceSec = Math.max(50, scoreToBasePace(score) + gradePenalty);
  const distCoeff = distanceKm <= 5 ? 1 : distanceKm <= 10 ? 1.038 : distanceKm <= 16 ? 1.06 : distanceKm <= 21 ? 1.077 : 1.1;
  return Math.round(basePaceSec * distanceKm * distCoeff);
}
function assignLineupByTerrain(roster, race) {
  const sortedSegs = [...race.segments].sort((a, b) => Math.max(b.uphillPct, b.downhillPct) - Math.max(a.uphillPct, a.downhillPct));
  const used = /* @__PURE__ */ new Set();
  const lineup = {};
  for (const seg3 of sortedSegs) {
    if (roster.length === used.size) break;
    const candidates = roster.filter((p) => !used.has(p.id)).map((p) => ({
      id: p.id,
      score: calcBaseAbility(p.ratings, seg3.uphillPct, seg3.downhillPct, seg3.distanceKm, seg3.statWeights) * calcSegmentAffinity(p.specialty, seg3) * calcConditionModifier(p.fatigue ?? 0, p.morale ?? 70, p.form ?? 0)
    })).sort((a, b) => b.score - a.score);
    if (candidates.length === 0) continue;
    lineup[seg3.index] = candidates[0].id;
    used.add(candidates[0].id);
  }
  return lineup;
}
var TACTIC_MODS = {
  normal: 1,
  aggressive: 1.08,
  conservative: 0.95,
  pacemaker: 0.85
};
function calcWeatherModifier(weather, specialty, stamina, mental) {
  let mod = 1;
  switch (weather) {
    case "rainy":
      mod -= 0.035;
      mod += Math.min(0.03, Math.max(0, (stamina - 60) * 6e-4));
      if (specialty === "grinder" || specialty === "long") mod += 0.01;
      else if (specialty === "sprinter") mod -= 0.015;
      break;
    case "windy":
      mod -= 0.015;
      mod += (mental - 70) * 1e-3;
      break;
    case "sunny":
      if (specialty === "sprinter" || specialty === "kick") mod += 0.015;
      break;
    case "cloudy":
      break;
  }
  return Math.max(0.9, Math.min(1.1, mod));
}
function resolveSegmentEvents(ratings, isLastSeg) {
  const nEvents = Math.floor(Math.random() * 2) + 1;
  let timeMult = 1;
  for (let i = 0; i < nEvents; i++) {
    const type = Math.floor(Math.random() * 5);
    const roll = Math.floor(Math.random() * 100);
    if (type === 0) {
      if (ratings.speed > roll) timeMult *= 0.98;
    } else if (type === 1) {
      if (ratings.mental <= roll) timeMult *= 1.01;
    } else if (type === 2) {
      if ((ratings.mountainUp + ratings.mountainDown) / 2 > roll) timeMult *= 0.97;
    } else if (type === 3) {
      if (ratings.recovery > roll) timeMult *= 0.99;
    } else if (isLastSeg) {
      const ab = (ratings.stamina + ratings.speed) / 2;
      timeMult *= ab > roll ? 0.97 : 1.01;
    }
  }
  return timeMult;
}
function simulateRace(race, lineups, teams, players, _seasonProgress, playerTeamId, segmentTactics) {
  const teamIds = Object.keys(lineups);
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const cumTime = {};
  teamIds.forEach((id) => {
    cumTime[id] = 0;
  });
  const segPts = {};
  teamIds.forEach((id) => {
    segPts[id] = 0;
  });
  const segmentResults = [];
  const totalSegs = race.segments.length;
  for (const seg3 of race.segments) {
    const runners = [];
    for (const teamId of teamIds) {
      const playerId = lineups[teamId]?.[seg3.index];
      if (!playerId) continue;
      const player = playerMap.get(playerId);
      if (!player) continue;
      const team = teamMap.get(teamId);
      const traits = player.traits ?? [];
      const effectiveRatings = player.ratings;
      const base = calcBaseAbility(effectiveRatings, seg3.uphillPct, seg3.downhillPct, seg3.distanceKm, seg3.statWeights);
      const aff = calcSegmentAffinity(player.specialty, seg3);
      const clubMod = team ? calcClubModifier(team, race.location) : 1;
      const rand = calcRandomFactor(traits);
      const fatigue = player.specialty === "grinder" ? Math.min(player.fatigue ?? 0, 40) : player.fatigue ?? 0;
      const condMod = calcConditionModifier(fatigue, player.morale ?? 70, player.form ?? 0);
      const traitMod = calcTraitModifier(traits, seg3.uphillPct, seg3.downhillPct, seg3.distanceKm, seg3.index, totalSegs);
      const isLastThird = seg3.index >= Math.floor(totalSegs * 2 / 3);
      const isFirstThird = seg3.index < Math.floor(totalSegs / 3);
      const kickMod = player.specialty === "kick" ? isLastThird ? 1.08 : isFirstThird ? 0.96 : 1 : 1;
      const tacticMod = playerTeamId && teamId === playerTeamId && segmentTactics ? TACTIC_MODS[segmentTactics[seg3.index] ?? "normal"] ?? 1 : 1;
      const weatherMod = race.conditions ? calcWeatherModifier(race.conditions.weather, player.specialty, effectiveRatings.stamina, effectiveRatings.mental) : 1;
      const score = base * aff * clubMod * rand * condMod * traitMod * kickMod * tacticMod * weatherMod;
      const isLastSeg = seg3.index === totalSegs;
      const eventMult = resolveSegmentEvents(effectiveRatings, isLastSeg);
      runners.push({ playerId, teamId, timeSec: Math.round(scoreToTime(score, seg3.distanceKm, seg3.uphillPct, seg3.downhillPct) * eventMult), rank: 0 });
    }
    runners.sort((a, b) => a.timeSec - b.timeSec);
    runners.forEach((r, i) => {
      r.rank = i + 1;
      const pt = segmentAwardPoints(teamIds.length, r.rank);
      if (pt > 0) segPts[r.teamId] = (segPts[r.teamId] ?? 0) + pt;
      cumTime[r.teamId] = (cumTime[r.teamId] ?? 0) + r.timeSec;
    });
    segmentResults.push({ segmentIndex: seg3.index, runners });
  }
  const teamRankings = buildTeamRankings({
    teamIds,
    cumTime,
    segCountByTeam: countSegmentsByTeam(segmentResults),
    segPts,
    totalSegs
  });
  return { teamRankings, segmentResults };
}
function countSegmentsByTeam(segments) {
  const out = {};
  for (const sr of segments) for (const r of sr.runners) out[r.teamId] = (out[r.teamId] ?? 0) + 1;
  return out;
}
function buildTeamRankings(args) {
  const { teamIds, cumTime, segCountByTeam, segPts, totalSegs } = args;
  const complete = teamIds.filter((id) => (segCountByTeam[id] ?? 0) >= totalSegs).sort((a, b) => cumTime[a] - cumTime[b]);
  const incomplete = teamIds.filter((id) => (segCountByTeam[id] ?? 0) < totalSegs).sort((a, b) => (segCountByTeam[b] ?? 0) - (segCountByTeam[a] ?? 0) || cumTime[a] - cumTime[b]);
  return [...complete, ...incomplete].map((teamId, i) => ({
    teamId,
    totalTimeSec: cumTime[teamId],
    rank: i + 1,
    positionPoints: positionPointsFor(teamIds.length, i + 1),
    segmentPoints: segPts[teamId] ?? 0
  }));
}

// src/data/races.ts
function seg(index, distanceKm, uphillPct, downhillPct, w, recommended) {
  return { index, distanceKm, uphillPct, downhillPct, ...w ? { statWeights: w } : {}, ...recommended ? { recommended } : {} };
}
var SEASON_2027_RACES = [
  // ───── Race 01: 出雲開幕戦 ─────
  // 短〜中距離平坦主体。スプリンターと知性型の争い。
  {
    id: "race-2027-01",
    name: "\u51FA\u96F2\u958B\u5E55\u6226",
    date: "2027-03-15",
    location: "\u51FA\u96F2",
    type: "league",
    conditions: { temperature: 12, weather: "sunny", elevation: 50 },
    segments: [
      // 1区 8.0km 平坦: 開幕爆走。速さとペース読みが全て
      seg(1, 8, 0, 0, { speed: 0.58, pacing: 0.18, mental: 0.12, stamina: 0.08, recovery: 0.04 }, "sprinter"),
      // 2区 5.8km 緩傾斜: 短くても起伏あり。ペース管理が鍵
      seg(2, 5.8, 5, 5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }, "sprinter"),
      // 3区 8.5km 緩傾斜: 中盤の精神消耗戦。冷静さが差を生む
      seg(3, 8.5, 5, 5, { mental: 0.35, pacing: 0.3, stamina: 0.2, recovery: 0.1, speed: 0.05 }, "ace"),
      // 4区 6.2km 平坦: 短距離爆発区間。純粋な速さ勝負
      seg(4, 6.2, 0, 0, { speed: 0.68, pacing: 0.14, mental: 0.1, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 5区 6.4km 緩傾斜: つなぎ区間。ペースを乱さない安定性
      seg(5, 6.4, 5, 5, { pacing: 0.38, speed: 0.3, mental: 0.18, recovery: 0.08, stamina: 0.06 }, "sprinter"),
      // 6区 10.2km 緩上り: 最長アンカー。スタミナと回復力で粘る
      seg(6, 10.2, 8, 3, { stamina: 0.38, pacing: 0.25, recovery: 0.22, mental: 0.1, speed: 0.05 }, "long"),
      // 7区  9.5km 平坦: 追加区間
      seg(7, 9.5, 0, 0, { pacing: 0.38, stamina: 0.3, mental: 0.2, recovery: 0.08, speed: 0.04 }, "long"),
      // 8区  7.5km 緩起伏: 追加区間
      seg(8, 7.5, 5, 5, { pacing: 0.36, stamina: 0.3, mental: 0.18, recovery: 0.12, speed: 0.04 }, "undulating"),
      // 9区 11.0km 平坦: 追加区間
      seg(9, 11, 0, 0, { pacing: 0.38, stamina: 0.3, mental: 0.2, recovery: 0.08, speed: 0.04 }, "grinder"),
      // 10区  6.5km 平坦: 追加区間
      seg(10, 6.5, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "sprinter")
    ]
  },
  // ───── Race 02: 東北桜駅伝 ─────
  // 長距離主体。起伏区間が2回あり、スタミナ・回復力が問われる持久戦。
  {
    id: "race-2027-02",
    name: "\u6771\u5317\u685C\u99C5\u4F1D",
    date: "2027-04-05",
    location: "\u4ED9\u53F0",
    type: "league",
    conditions: { temperature: 13, weather: "sunny", elevation: 80 },
    segments: [
      // 1区 9.0km 緩傾斜: 精神の立ち上がり。メンタルが初速を決める
      seg(1, 9, 5, 5, { mental: 0.32, pacing: 0.3, speed: 0.18, stamina: 0.14, recovery: 0.06 }, "ace"),
      // 2区 11.5km 起伏: 最初の山岳越え。オールラウンドな山岳力
      seg(2, 11.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.1 }, "allrounder"),
      // 3区 17.0km 緩上り: 最長。真のスタミナと回復力の消耗戦
      seg(3, 17, 8, 3, { stamina: 0.45, recovery: 0.25, pacing: 0.18, mental: 0.08, speed: 0.04 }, "long"),
      // 4区 10.0km 緩傾斜: 中間つなぎ。ペースとメンタルで繋ぐ
      seg(4, 10, 5, 5, { pacing: 0.36, mental: 0.26, stamina: 0.22, recovery: 0.12, speed: 0.04 }, "ace"),
      // 5区 12.5km 起伏: 二度目の山岳越え。疲弊した脚での粘り
      seg(5, 12.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.2, stamina: 0.26, recovery: 0.16, pacing: 0.1 }, "allrounder"),
      // 6区 9.5km 緩傾斜: 回復力で後半を粘りきる区間
      seg(6, 9.5, 5, 5, { recovery: 0.38, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.04 }, "grinder"),
      // 7区 16.0km 緩上り: 二つ目の長丁場。スタミナの真価が出る
      seg(7, 16, 8, 3, { stamina: 0.42, recovery: 0.24, pacing: 0.2, mental: 0.1, speed: 0.04 }, "long"),
      // 8区 7.5km 平坦: 最終スプリントアンカー
      seg(8, 7.5, 0, 0, { speed: 0.6, pacing: 0.18, mental: 0.14, stamina: 0.05, recovery: 0.03 }, "sprinter")
    ]
  },
  // ───── Race 03: 東京スプリント駅伝 ─────
  // 都市型。短い区間が多くスプリンター天国。長い区間は精神・スタミナが要る。
  {
    id: "race-2027-03",
    name: "\u6771\u4EAC\u30B9\u30D7\u30EA\u30F3\u30C8\u99C5\u4F1D",
    date: "2027-05-03",
    location: "\u6771\u4EAC",
    type: "league",
    conditions: { temperature: 17, weather: "cloudy", elevation: 30 },
    segments: [
      // 1区 6.5km 平坦: 都市開幕スプリント
      seg(1, 6.5, 0, 0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 2区 7.0km 平坦: 連続スプリント。前区間との繋ぎが課題
      seg(2, 7, 0, 0, { speed: 0.65, pacing: 0.16, mental: 0.1, stamina: 0.06, recovery: 0.03 }, "sprinter"),
      // 3区 11.5km 緩傾斜: 長めの精神消耗戦
      seg(3, 11.5, 5, 5, { mental: 0.32, pacing: 0.32, stamina: 0.22, recovery: 0.1, speed: 0.04 }, "ace"),
      // 4区 6.0km 平坦: 純粋速さ爆発区間
      seg(4, 6, 0, 0, { speed: 0.7, pacing: 0.14, mental: 0.08, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 5区 10.8km 緩傾斜: 中盤タクティカル
      seg(5, 10.8, 5, 5, { pacing: 0.38, mental: 0.28, stamina: 0.2, recovery: 0.1, speed: 0.04 }, "ace"),
      // 6区 5.5km 平坦: 最短区間・絶対速度のみ問われる
      seg(6, 5.5, 0, 0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 7区 9.2km 緩傾斜: アンカー前の消耗戦
      seg(7, 9.2, 5, 5, { pacing: 0.35, stamina: 0.25, mental: 0.22, recovery: 0.12, speed: 0.06 }, "ace"),
      // 8区 12.5km 緩上り: 最長アンカー。スタミナ型が有利
      seg(8, 12.5, 8, 3, { stamina: 0.4, pacing: 0.24, recovery: 0.2, mental: 0.12, speed: 0.04 }, "long")
    ]
  },
  // ───── Race 04: 富士山岳駅伝 ─────
  // 本格山岳。登り専門・下り専門に分かれる。フラット選手には過酷。
  {
    id: "race-2027-04",
    name: "\u5BCC\u58EB\u5C71\u5CB3\u99C5\u4F1D",
    date: "2027-05-31",
    location: "\u5BCC\u58EB\u5C71",
    type: "league",
    conditions: { temperature: 12, weather: "cloudy", elevation: 1200 },
    segments: [
      // 1区 10.0km アップダウン: 起伏のアプローチ。山岳・スタミナ複合
      seg(1, 10, 20, 18, { mountainUp: 0.25, mountainDown: 0.2, stamina: 0.3, pacing: 0.15, recovery: 0.1 }, "allrounder"),
      // 2区 12.0km 急登: 長い山登り区間。スタミナで失速しない持続力
      seg(2, 12, 55, 2, { mountainUp: 0.68, stamina: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }, "mountain_up"),
      // 3区 9.0km 急登: 短くて急。爆発的な登攀力が全て
      seg(3, 9, 55, 2, { mountainUp: 0.75, stamina: 0.12, mental: 0.07, recovery: 0.04, pacing: 0.02 }, "mountain_up"),
      // 4区 11.0km 急降: 長い下り。技術と速さのコントロール
      seg(4, 11, 2, 55, { mountainDown: 0.62, speed: 0.2, mental: 0.1, pacing: 0.05, recovery: 0.03 }, "mountain_down"),
      // 5区 9.5km 急降: 短い急降。攻撃的な下り専門が輝く
      seg(5, 9.5, 2, 55, { mountainDown: 0.68, speed: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }, "mountain_down"),
      // 6区 8.5km アップダウン: 帰路起伏。疲弊した脚で最後の山岳戦
      seg(6, 8.5, 20, 18, { mountainUp: 0.22, mountainDown: 0.25, stamina: 0.28, pacing: 0.15, recovery: 0.1 }, "allrounder")
    ]
  },
  // ───── Race 05: 関西スプリント駅伝 ─────
  // 平坦主体の短距離戦。ただし4区だけ長くスタミナ勝負になる。
  {
    id: "race-2027-05",
    name: "\u95A2\u897F\u30B9\u30D7\u30EA\u30F3\u30C8\u99C5\u4F1D",
    date: "2027-06-28",
    location: "\u5927\u962A",
    type: "league",
    conditions: { temperature: 24, weather: "sunny", elevation: 20 },
    segments: [
      // 1区 7.5km 平坦: 速さのオープニング
      seg(1, 7.5, 0, 0, { speed: 0.63, pacing: 0.18, mental: 0.11, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 2区 8.0km 緩傾斜: ペースの読み合い
      seg(2, 8, 5, 5, { pacing: 0.4, speed: 0.26, mental: 0.2, stamina: 0.09, recovery: 0.05 }, "sprinter"),
      // 3区 6.5km 平坦: 再び速さ区間
      seg(3, 6.5, 0, 0, { speed: 0.68, pacing: 0.14, mental: 0.1, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 4区 13.5km 緩上り: 唯一の長丁場。スタミナと回復力が鍵
      seg(4, 13.5, 8, 3, { stamina: 0.4, recovery: 0.26, pacing: 0.2, mental: 0.1, speed: 0.04 }, "long"),
      // 5区 6.0km 平坦: 最短爆発区間
      seg(5, 6, 0, 0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 6区 9.5km 緩傾斜: 精神のアンカー戦
      seg(6, 9.5, 5, 5, { mental: 0.36, pacing: 0.3, stamina: 0.2, recovery: 0.1, speed: 0.04 }, "ace")
    ]
  },
  // ───── Race 06: 九州夏季駅伝 ─────
  // 酷暑。スタミナ・回復力の消耗戦。速さよりメンタルが重要になる。
  {
    id: "race-2027-06",
    name: "\u4E5D\u5DDE\u590F\u5B63\u99C5\u4F1D",
    date: "2027-07-19",
    location: "\u798F\u5CA1",
    type: "league",
    conditions: { temperature: 31, weather: "sunny", elevation: 60 },
    segments: [
      // 1区 7.0km 平坦: 熱気の中の先行。精神とペースが速さより重要
      seg(1, 7, 0, 0, { speed: 0.55, pacing: 0.22, mental: 0.14, stamina: 0.06, recovery: 0.03 }, "sprinter"),
      // 2区 9.0km 緩傾斜: 夏の精神消耗戦
      seg(2, 9, 5, 5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.1, speed: 0.04 }, "ace"),
      // 3区 16.5km 緩上り: 猛暑の長丁場。回復力がないと後半崩壊
      seg(3, 16.5, 8, 3, { stamina: 0.44, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.04 }, "long"),
      // 4区 10.5km 緩傾斜: 消耗した体で回復力が問われる
      seg(4, 10.5, 5, 5, { recovery: 0.4, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.02 }, "grinder"),
      // 5区 11.0km 起伏: 夏の起伏。回復力ありきの山岳戦
      seg(5, 11, 20, 18, { mountainUp: 0.24, mountainDown: 0.2, stamina: 0.28, recovery: 0.18, pacing: 0.1 }, "allrounder"),
      // 6区 6.0km 平坦: 一瞬の爆発区間
      seg(6, 6, 0, 0, { speed: 0.65, pacing: 0.16, mental: 0.12, stamina: 0.04, recovery: 0.03 }, "sprinter"),
      // 7区 8.5km 緩傾斜: アンカー前。ペースと精神で踏ん張る
      seg(7, 8.5, 5, 5, { pacing: 0.38, mental: 0.26, stamina: 0.2, recovery: 0.12, speed: 0.04 }, "ace"),
      // 8区 14.5km 緩上り: 夏最長アンカー。スタミナ・回復力の総決算
      seg(8, 14.5, 8, 3, { stamina: 0.42, recovery: 0.28, pacing: 0.18, mental: 0.08, speed: 0.04 }, "long")
    ]
  },
  // ───── Race 07: 信州アルペン駅伝 ─────
  // 山岳に特化。登り下りが連続し、アンカーのみスタミナ型が活きる。
  {
    id: "race-2027-07",
    name: "\u4FE1\u5DDE\u30A2\u30EB\u30DA\u30F3\u99C5\u4F1D",
    date: "2027-09-13",
    location: "\u9577\u91CE",
    type: "league",
    conditions: { temperature: 19, weather: "sunny", elevation: 800 },
    segments: [
      // 1区 9.5km 起伏: 山岳へのアプローチ。オールラウンドな山岳力
      seg(1, 9.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, pacing: 0.14, recovery: 0.1 }, "allrounder"),
      // 2区 10.5km 急登: 長い技術的登り。スタミナ込みの山登り力
      seg(2, 10.5, 55, 2, { mountainUp: 0.55, stamina: 0.24, pacing: 0.12, mental: 0.06, recovery: 0.03 }, "mountain_up"),
      // 3区 8.5km 急登: 短い急登。爆発的登山力が支配
      seg(3, 8.5, 55, 2, { mountainUp: 0.74, stamina: 0.12, mental: 0.08, recovery: 0.04, pacing: 0.02 }, "mountain_up"),
      // 4区 10.0km 急降: 技術的長い下り。山下りとスピードのバランス
      seg(4, 10, 2, 55, { mountainDown: 0.55, speed: 0.22, pacing: 0.12, mental: 0.08, recovery: 0.03 }, "mountain_down"),
      // 5区 8.5km 急降: 短い急降。攻撃的山下り
      seg(5, 8.5, 2, 55, { mountainDown: 0.68, speed: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }, "mountain_down"),
      // 6区 11.0km 緩上り: 山から帰るアンカー。スタミナ型の逆襲
      seg(6, 11, 8, 3, { stamina: 0.4, pacing: 0.24, recovery: 0.22, mental: 0.1, speed: 0.04 }, "long")
    ]
  },
  // ───── Race 08: 全日本プロ駅伝 ─────
  // 最難関クラスの長距離大会。全区間が長く、スタミナ・回復力なしには完走できない。
  {
    id: "race-2027-08",
    name: "\u5168\u65E5\u672C\u30D7\u30ED\u99C5\u4F1D",
    date: "2027-10-11",
    location: "\u540D\u53E4\u5C4B",
    type: "league",
    conditions: { temperature: 19, weather: "sunny", elevation: 50 },
    segments: [
      // 1区 9.5km 平坦: 戦略的開幕。ペースと精神で位置を取る
      seg(1, 9.5, 0, 0, { pacing: 0.38, speed: 0.28, mental: 0.2, stamina: 0.1, recovery: 0.04 }, "ace"),
      // 2区 13.3km 緩傾斜: 長い戦術区間。回復力でペースを維持
      seg(2, 13.3, 5, 5, { pacing: 0.35, stamina: 0.28, mental: 0.22, recovery: 0.12, speed: 0.03 }, "ace"),
      // 3区 19.7km 緩上り: 全試合屈指の最長区間。スタミナと回復力が全て
      seg(3, 19.7, 8, 3, { stamina: 0.48, recovery: 0.28, pacing: 0.16, mental: 0.06, speed: 0.02 }, "long"),
      // 4区 14.1km 起伏: 長い起伏。脚への累積ダメージに耐える
      seg(4, 14.1, 20, 18, { mountainUp: 0.26, mountainDown: 0.2, stamina: 0.3, recovery: 0.14, pacing: 0.1 }, "allrounder"),
      // 5区 18.5km 緩上り: もう一つの超長区間。純粋スタミナ勝負
      seg(5, 18.5, 8, 3, { stamina: 0.46, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.02 }, "long"),
      // 6区 12.8km 緩傾斜: メンタルの踏ん張り区間
      seg(6, 12.8, 5, 5, { mental: 0.35, pacing: 0.3, stamina: 0.22, recovery: 0.1, speed: 0.03 }, "ace"),
      // 7区 11.6km 起伏: 二つ目の起伏。疲弊した体での山岳戦
      seg(7, 11.6, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.1 }, "allrounder"),
      // 8区 21.4km 緩上り: シーズン最長アンカー。究極のスタミナ戦
      seg(8, 21.4, 8, 3, { stamina: 0.5, recovery: 0.28, pacing: 0.14, mental: 0.06, speed: 0.02 }, "long")
    ]
  },
  // ───── Race 09: 秋季グランプリ ─────
  // バランス型。スプリンター・山岳・スタミナ型がまんべんなく活きるコース。
  {
    id: "race-2027-09",
    name: "\u79CB\u5B63\u30B0\u30E9\u30F3\u30D7\u30EA",
    date: "2027-11-08",
    location: "\u6A2A\u6D5C",
    type: "league",
    conditions: { temperature: 14, weather: "cloudy", elevation: 40 },
    segments: [
      // 1区 8.5km 平坦: 秋の開幕ダッシュ
      seg(1, 8.5, 0, 0, { speed: 0.6, pacing: 0.2, mental: 0.12, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 2区 12.0km 起伏: 最初の山岳区間
      seg(2, 12, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.1 }, "allrounder"),
      // 3区 17.5km 緩上り: 長距離スタミナ区間
      seg(3, 17.5, 8, 3, { stamina: 0.44, recovery: 0.24, pacing: 0.2, mental: 0.08, speed: 0.04 }, "long"),
      // 4区 11.0km 緩傾斜: 中間タクティカル
      seg(4, 11, 5, 5, { pacing: 0.38, mental: 0.28, stamina: 0.2, recovery: 0.1, speed: 0.04 }, "ace"),
      // 5区 13.5km 起伏: 二つ目の山岳。スタミナ込みの起伏耐性
      seg(5, 13.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.2, stamina: 0.28, recovery: 0.14, pacing: 0.1 }, "allrounder"),
      // 6区 7.0km 平坦: 短い爆発区間
      seg(6, 7, 0, 0, { speed: 0.66, pacing: 0.16, mental: 0.1, stamina: 0.05, recovery: 0.03 }, "sprinter"),
      // 7区 16.5km 緩上り: ラスト前の長丁場
      seg(7, 16.5, 8, 3, { stamina: 0.44, recovery: 0.24, pacing: 0.2, mental: 0.08, speed: 0.04 }, "long"),
      // 8区 9.0km 緩傾斜: 精神のアンカー戦
      seg(8, 9, 5, 5, { mental: 0.38, pacing: 0.3, stamina: 0.2, recovery: 0.08, speed: 0.04 }, "ace")
    ]
  },
  // ───── Race 10: JPELグランドファイナル ─────
  // 全能力が問われる集大成。10区間で全てのスタット型に見せ場がある。
  {
    id: "race-2027-10",
    name: "JPEL\u30B0\u30E9\u30F3\u30C9\u30D5\u30A1\u30A4\u30CA\u30EB",
    date: "2027-12-27",
    location: "\u6771\u4EAC",
    type: "league",
    conditions: { temperature: 6, weather: "sunny", elevation: 30 },
    segments: [
      // 1区 9.0km 平坦: 戦術的な幕開け。速さよりも読み合い
      seg(1, 9, 0, 0, { pacing: 0.36, speed: 0.28, mental: 0.22, stamina: 0.1, recovery: 0.04 }, "ace"),
      // 2区 12.0km 緩傾斜: 精神の中盤入り。メンタルが差を生む
      seg(2, 12, 5, 5, { mental: 0.36, pacing: 0.3, stamina: 0.22, recovery: 0.08, speed: 0.04 }, "ace"),
      // 3区 14.5km 起伏: 長い起伏の試練
      seg(3, 14.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.2, stamina: 0.3, recovery: 0.14, pacing: 0.1 }, "allrounder"),
      // 4区 21.0km 緩上り: 全レース最長区間。究極のスタミナ持久戦
      seg(4, 21, 8, 3, { stamina: 0.48, recovery: 0.28, pacing: 0.16, mental: 0.06, speed: 0.02 }, "long"),
      // 5区 11.5km 急登: 技術的登り。スタミナ込みの山岳力
      seg(5, 11.5, 55, 2, { mountainUp: 0.55, stamina: 0.24, pacing: 0.12, mental: 0.06, recovery: 0.03 }, "mountain_up"),
      // 6区 10.5km 急降: 頂上からの技術的下り
      seg(6, 10.5, 2, 55, { mountainDown: 0.55, speed: 0.22, pacing: 0.12, mental: 0.08, recovery: 0.03 }, "mountain_down"),
      // 7区 20.0km 緩上り: 二つ目の超長区間。回復力で後半を守る
      seg(7, 20, 8, 3, { stamina: 0.46, recovery: 0.26, pacing: 0.18, mental: 0.07, speed: 0.03 }, "long"),
      // 8区 13.5km 起伏: 最終起伏の難関
      seg(8, 13.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.1 }, "allrounder"),
      // 9区 11.0km 緩傾斜: 回復力で粘り込む終盤
      seg(9, 11, 5, 5, { recovery: 0.4, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.02 }, "grinder"),
      // 10区 7.0km 平坦: 大詰めの最終スプリント
      seg(10, 7, 0, 0, { speed: 0.62, pacing: 0.18, mental: 0.14, stamina: 0.04, recovery: 0.02 }, "sprinter")
    ]
  }
];
function toTemplate(r) {
  const m = Number(r.date.slice(5, 7));
  const wrap = (x) => (x - 1 + 12) % 12 + 1;
  return {
    name: r.name,
    location: r.location,
    type: r.type,
    conditions: r.conditions,
    segments: r.segments,
    months: [wrap(m - 2), wrap(m - 1), m, wrap(m + 1), wrap(m + 2)]
  };
}
var LEAGUE_COURSE_POOL = [
  // SEASON_2027_RACES の非ファイナル9本（1部専用ではなく全部共通プールに合流）
  ...SEASON_2027_RACES.slice(0, 9).map(toTemplate),
  // 旧 RESERVE_RACE_POOL（改名済み、5区間だった9本は6区間に拡張済み）
  {
    name: "\u5DDD\u8D8A\u6625\u5B63\u30AA\u30FC\u30D7\u30F3",
    location: "\u5DDD\u8D8A",
    type: "league",
    months: [3, 4, 5],
    conditions: { temperature: 14, weather: "sunny", elevation: 30 },
    segments: [
      seg(1, 7, 0, 0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 6.5, 5, 5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 9, 8, 3, { pacing: 0.36, stamina: 0.26, mental: 0.2, recovery: 0.12, speed: 0.06 }),
      seg(4, 11.5, 0, 0, { pacing: 0.38, stamina: 0.28, mental: 0.2, recovery: 0.1, speed: 0.04 }),
      seg(5, 13.5, 5, 5, { recovery: 0.36, stamina: 0.28, pacing: 0.22, mental: 0.1, speed: 0.04 }),
      // 6区 6.5km 平坦: 新設アンカー。純粋な速さで締める
      seg(6, 6.5, 0, 0, { speed: 0.6, pacing: 0.2, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      // 7区 8.5km 平坦: 追加区間
      seg(7, 8.5, 0, 0, { speed: 0.52, pacing: 0.26, mental: 0.14, stamina: 0.05, recovery: 0.03 }),
      // 8区 10.0km 緩起伏: 追加区間
      seg(8, 10, 7, 7, { pacing: 0.36, stamina: 0.3, mental: 0.18, recovery: 0.12, speed: 0.04 }, "undulating"),
      // 9区 7.0km 平坦: 追加区間。アンカー
      seg(9, 7, 0, 0, { speed: 0.58, pacing: 0.2, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "sprinter")
    ]
  },
  {
    name: "\u6D5C\u677E\u6771\u6D77\u99C5\u4F1D",
    location: "\u6D5C\u677E",
    type: "league",
    conditions: { temperature: 18, weather: "cloudy", elevation: 50 },
    segments: [
      seg(1, 6, 0, 0, { speed: 0.64, pacing: 0.18, mental: 0.1, stamina: 0.05, recovery: 0.03 }),
      seg(2, 8.5, 5, 5, { mental: 0.34, pacing: 0.3, stamina: 0.22, recovery: 0.1, speed: 0.04 }),
      seg(3, 10, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.1 }),
      seg(4, 7.5, 0, 0, { speed: 0.6, pacing: 0.2, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5, 12, 8, 3, { recovery: 0.34, stamina: 0.32, pacing: 0.2, mental: 0.1, speed: 0.04 }),
      seg(6, 14.5, 0, 0, { stamina: 0.4, pacing: 0.26, recovery: 0.2, mental: 0.1, speed: 0.04 }),
      // 7区  8.8km 平坦: 追加区間
      seg(7, 8.8, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }),
      // 8区 10.5km 登り: 追加区間
      seg(8, 10.5, 8, 4, { mountainUp: 0.52, stamina: 0.24, mental: 0.16, pacing: 0.06, speed: 0.02 }, "mountain_up"),
      // 9区  9.0km 下り: 追加区間
      seg(9, 9, 4, 8, { mountainDown: 0.5, speed: 0.24, mental: 0.16, pacing: 0.08, stamina: 0.02 }, "mountain_down"),
      // 10区  7.2km 平坦: 追加区間
      seg(10, 7.2, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "kick")
    ]
  },
  {
    name: "\u6C34\u6238\u4EA4\u6D41\u99C5\u4F1D",
    location: "\u6C34\u6238",
    type: "league",
    conditions: { temperature: 20, weather: "sunny", elevation: 40 },
    segments: [
      seg(1, 5.5, 0, 0, { speed: 0.68, pacing: 0.14, mental: 0.1, stamina: 0.05, recovery: 0.03 }),
      seg(2, 7, 5, 5, { pacing: 0.4, speed: 0.28, mental: 0.2, stamina: 0.08, recovery: 0.04 }),
      seg(3, 6, 0, 0, { speed: 0.65, pacing: 0.16, mental: 0.1, stamina: 0.06, recovery: 0.03 }),
      seg(4, 9.5, 8, 3, { pacing: 0.38, stamina: 0.24, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5, 11, 5, 5, { mental: 0.34, pacing: 0.3, stamina: 0.22, recovery: 0.1, speed: 0.04 }),
      // 6区 7.0km 平坦: 新設アンカー。速さ勝負で決着
      seg(6, 7, 0, 0, { speed: 0.66, pacing: 0.16, mental: 0.1, stamina: 0.05, recovery: 0.03 }),
      // 7区 7.5km 平坦: 追加区間。速さで締める
      seg(7, 7.5, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "sprinter")
    ]
  },
  {
    name: "\u9AD8\u677E\u30B5\u30DE\u30FC\u99C5\u4F1D",
    location: "\u9AD8\u677E",
    type: "league",
    months: [6, 9],
    conditions: { temperature: 27, weather: "sunny", elevation: 60 },
    segments: [
      seg(1, 6.5, 0, 0, { speed: 0.6, pacing: 0.18, mental: 0.14, stamina: 0.05, recovery: 0.03 }),
      seg(2, 9, 55, 2, { mountainUp: 0.72, stamina: 0.14, mental: 0.08, recovery: 0.04, pacing: 0.02 }),
      seg(3, 8.5, 2, 55, { mountainDown: 0.66, speed: 0.18, mental: 0.09, pacing: 0.04, recovery: 0.03 }),
      seg(4, 7, 5, 5, { pacing: 0.4, speed: 0.26, mental: 0.2, stamina: 0.08, recovery: 0.06 }),
      seg(5, 12.5, 8, 3, { recovery: 0.38, stamina: 0.28, pacing: 0.2, mental: 0.1, speed: 0.04 }),
      // 6区 10.0km アップダウン: 新設。夏の疲労を回復力で乗り切る仕上げ区間
      seg(6, 10, 5, 5, { recovery: 0.34, stamina: 0.28, pacing: 0.2, mental: 0.12, speed: 0.06 }),
      // 7区 8.0km 緩起伏: 追加区間。粘りどころ
      seg(7, 8, 6, 6, { pacing: 0.38, stamina: 0.3, mental: 0.18, recovery: 0.1, speed: 0.04 }, "grinder")
    ]
  },
  {
    name: "\u76DB\u5CA1\u590F\u5B63\u5927\u4F1A",
    location: "\u76DB\u5CA1",
    type: "league",
    months: [6, 9],
    conditions: { temperature: 22, weather: "cloudy", elevation: 70 },
    segments: [
      seg(1, 8, 5, 5, { mental: 0.34, pacing: 0.3, speed: 0.18, stamina: 0.12, recovery: 0.06 }),
      seg(2, 10.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.2, stamina: 0.28, pacing: 0.14, recovery: 0.1 }),
      seg(3, 9, 55, 2, { mountainUp: 0.74, stamina: 0.13, mental: 0.07, recovery: 0.04, pacing: 0.02 }),
      seg(4, 7.5, 0, 0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5, 13, 8, 3, { recovery: 0.36, stamina: 0.3, pacing: 0.2, mental: 0.1, speed: 0.04 }),
      // 6区 11.5km 緩上り: 新設アンカー。長丁場でスタミナと回復力を試す
      seg(6, 11.5, 8, 3, { stamina: 0.4, recovery: 0.26, pacing: 0.2, mental: 0.1, speed: 0.04 }),
      // 7区  9.0km 緩起伏: 追加区間
      seg(7, 9, 6, 6, { pacing: 0.36, stamina: 0.3, mental: 0.18, recovery: 0.12, speed: 0.04 }, "undulating"),
      // 8区 12.0km 平坦: 追加区間
      seg(8, 12, 0, 0, { pacing: 0.38, stamina: 0.3, mental: 0.2, recovery: 0.08, speed: 0.04 }, "long"),
      // 9区  7.0km 平坦: 追加区間
      seg(9, 7, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "kick")
    ]
  },
  {
    name: "\u5B87\u90FD\u5BAE\u79CB\u5B63\u30D5\u30A3\u30CA\u30FC\u30EC",
    location: "\u5B87\u90FD\u5BAE",
    type: "league",
    months: [9, 10, 11],
    conditions: { temperature: 20, weather: "sunny", elevation: 45 },
    segments: [
      seg(1, 7.5, 0, 0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 8, 5, 5, { mental: 0.35, pacing: 0.3, stamina: 0.2, recovery: 0.1, speed: 0.05 }),
      seg(3, 11.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.1 }),
      seg(4, 9, 0, 0, { pacing: 0.38, speed: 0.26, mental: 0.2, stamina: 0.1, recovery: 0.06 }),
      seg(5, 13, 8, 3, { recovery: 0.36, stamina: 0.3, pacing: 0.2, mental: 0.1, speed: 0.04 }),
      seg(6, 15.5, 5, 5, { stamina: 0.42, recovery: 0.26, pacing: 0.2, mental: 0.08, speed: 0.04 }),
      // 7区 10.0km 緩起伏: 追加区間
      seg(7, 10, 7, 7, { pacing: 0.36, stamina: 0.3, mental: 0.18, recovery: 0.12, speed: 0.04 }, "undulating"),
      // 8区  8.5km 平坦: 追加区間
      seg(8, 8.5, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }),
      // 9区  6.8km 平坦: 追加区間
      seg(9, 6.8, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "sprinter")
    ]
  },
  {
    name: "\u5927\u962A\u30AB\u30C3\u30D7",
    location: "\u5927\u962A",
    type: "league",
    conditions: { temperature: 16, weather: "cloudy", elevation: 25 },
    segments: [
      seg(1, 5.8, 0, 0, { speed: 0.68, pacing: 0.14, mental: 0.1, stamina: 0.05, recovery: 0.03 }),
      seg(2, 7.5, 5, 5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 6.5, 0, 0, { speed: 0.66, pacing: 0.16, mental: 0.1, stamina: 0.05, recovery: 0.03 }),
      seg(4, 10, 8, 3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5, 12, 0, 0, { pacing: 0.36, stamina: 0.28, recovery: 0.18, mental: 0.14, speed: 0.04 }),
      // 6区 8.0km 平坦: 新設アンカー。速さで押し切る仕上げ
      seg(6, 8, 0, 0, { speed: 0.58, pacing: 0.22, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      // 7区 6.8km 平坦: 追加区間。アンカー前の勝負区
      seg(7, 6.8, 0, 0, { speed: 0.54, pacing: 0.24, mental: 0.14, stamina: 0.05, recovery: 0.03 }, "kick")
    ]
  },
  {
    name: "\u7532\u5E9C\u5C71\u5CB3\u99C5\u4F1D",
    location: "\u7532\u5E9C",
    type: "league",
    conditions: { temperature: 15, weather: "sunny", elevation: 120 },
    segments: [
      seg(1, 7, 8, 3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2, 9.5, 55, 2, { mountainUp: 0.73, stamina: 0.14, mental: 0.07, recovery: 0.04, pacing: 0.02 }),
      seg(3, 8, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, pacing: 0.14, recovery: 0.1 }),
      seg(4, 10.5, 2, 55, { mountainDown: 0.52, speed: 0.24, pacing: 0.12, mental: 0.08, recovery: 0.04 }),
      seg(5, 7.5, 5, 5, { pacing: 0.4, speed: 0.26, mental: 0.2, stamina: 0.08, recovery: 0.06 }),
      // 6区 9.0km アップダウン: 新設アンカー。山岳の締めくくりに複合力を問う
      seg(6, 9, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.1 })
    ]
  },
  {
    name: "\u718A\u672C\u4EA4\u6D41\u99C5\u4F1D",
    location: "\u718A\u672C",
    type: "league",
    conditions: { temperature: 23, weather: "sunny", elevation: 55 },
    segments: [
      seg(1, 6.5, 5, 5, { pacing: 0.4, speed: 0.28, mental: 0.18, stamina: 0.09, recovery: 0.05 }),
      seg(2, 9, 0, 0, { speed: 0.6, pacing: 0.2, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(3, 11, 20, 18, { mountainUp: 0.24, mountainDown: 0.22, stamina: 0.3, recovery: 0.14, pacing: 0.1 }),
      seg(4, 8.5, 8, 3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5, 10, 0, 0, { mental: 0.34, pacing: 0.3, stamina: 0.22, recovery: 0.1, speed: 0.04 }),
      // 6区 9.5km アップダウン: 新設アンカー。精神力で最後の起伏を制する
      seg(6, 9.5, 5, 5, { mental: 0.34, pacing: 0.28, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      // 7区  8.0km 平坦: 追加区間
      seg(7, 8, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "sprinter")
    ]
  },
  {
    name: "\u9759\u5CA1\u4E2D\u90E8\u99C5\u4F1D",
    location: "\u9759\u5CA1",
    type: "league",
    conditions: { temperature: 19, weather: "windy", elevation: 40 },
    segments: [
      seg(1, 7.5, 0, 0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 6, 5, 5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 8.5, 0, 0, { pacing: 0.38, speed: 0.28, mental: 0.2, stamina: 0.1, recovery: 0.04 }),
      seg(4, 11, 8, 3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5, 9.5, 5, 5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.1, speed: 0.04 }),
      seg(6, 13, 0, 0, { stamina: 0.4, pacing: 0.26, recovery: 0.2, mental: 0.1, speed: 0.04 }),
      // 7区 9.5km 緩傾斜: 追加区間。起伏をこなす力が要る
      seg(7, 9.5, 8, 8, { pacing: 0.34, stamina: 0.3, mental: 0.2, recovery: 0.12, speed: 0.04 }, "undulating")
    ]
  },
  {
    name: "\u65ED\u5DDD\u79CB\u51AC\u99C5\u4F1D",
    location: "\u65ED\u5DDD",
    type: "league",
    months: [10, 11],
    conditions: { temperature: 10, weather: "cloudy", elevation: 65 },
    segments: [
      seg(1, 8, 8, 3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2, 10.5, 5, 5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.1, speed: 0.04 }),
      seg(3, 7, 0, 0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(4, 12.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.1 }),
      seg(5, 9, 0, 0, { pacing: 0.38, speed: 0.26, mental: 0.2, stamina: 0.1, recovery: 0.06 }),
      // 6区 11.0km 緩上り: 新設アンカー。冷え込みの中でスタミナと回復力を試す
      seg(6, 11, 8, 3, { stamina: 0.4, recovery: 0.28, pacing: 0.18, mental: 0.1, speed: 0.04 }),
      // 7区 10.0km 平坦: 追加区間
      seg(7, 10, 0, 0, { pacing: 0.38, stamina: 0.3, mental: 0.2, recovery: 0.08, speed: 0.04 }, "long"),
      // 8区  8.0km 緩起伏: 追加区間
      seg(8, 8, 6, 6, { pacing: 0.36, stamina: 0.3, mental: 0.18, recovery: 0.12, speed: 0.04 }, "undulating"),
      // 9区 12.5km 平坦: 追加区間
      seg(9, 12.5, 0, 0, { pacing: 0.38, stamina: 0.3, mental: 0.2, recovery: 0.08, speed: 0.04 }, "grinder"),
      // 10区  6.8km 平坦: 追加区間
      seg(10, 6.8, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "sprinter")
    ]
  },
  {
    name: "\u5DDD\u5D0E\u30B9\u30D7\u30EA\u30F3\u30C8\u99C5\u4F1D",
    location: "\u5DDD\u5D0E",
    type: "league",
    conditions: { temperature: 17, weather: "sunny", elevation: 20 },
    segments: [
      seg(1, 5, 0, 0, { speed: 0.7, pacing: 0.14, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      seg(2, 4.5, 0, 0, { speed: 0.74, pacing: 0.12, mental: 0.07, stamina: 0.04, recovery: 0.03 }),
      seg(3, 6, 5, 5, { speed: 0.55, pacing: 0.24, mental: 0.14, stamina: 0.04, recovery: 0.03 }),
      seg(4, 5.5, 0, 0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      seg(5, 7, 0, 0, { speed: 0.65, pacing: 0.16, mental: 0.11, stamina: 0.05, recovery: 0.03 }),
      seg(6, 5.8, 0, 0, { speed: 0.68, pacing: 0.14, mental: 0.1, stamina: 0.05, recovery: 0.03 }),
      // 7区  7.0km 平坦: 追加区間
      seg(7, 7, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "sprinter"),
      // 8区  9.5km 緩起伏: 追加区間
      seg(8, 9.5, 5, 5, { pacing: 0.36, stamina: 0.3, mental: 0.18, recovery: 0.12, speed: 0.04 }, "undulating"),
      // 9区  8.2km 平坦: 追加区間
      seg(9, 8.2, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }),
      // 10区  6.0km 平坦: 追加区間
      seg(10, 6, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, "kick")
    ]
  },
  {
    name: "\u795E\u6238\u8010\u4E45\u99C5\u4F1D",
    location: "\u795E\u6238",
    type: "league",
    conditions: { temperature: 21, weather: "sunny", elevation: 55 },
    segments: [
      seg(1, 9, 5, 5, { mental: 0.34, pacing: 0.28, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2, 13.5, 8, 3, { recovery: 0.36, stamina: 0.32, pacing: 0.2, mental: 0.08, speed: 0.04 }),
      seg(3, 11, 0, 0, { pacing: 0.36, stamina: 0.28, mental: 0.2, recovery: 0.12, speed: 0.04 }),
      seg(4, 15, 5, 5, { stamina: 0.42, recovery: 0.26, pacing: 0.2, mental: 0.08, speed: 0.04 }),
      seg(5, 14.5, 8, 3, { stamina: 0.44, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.04 }),
      // 6区 2.0km 平坦: 新設。長い耐久戦の締めに置く短い勝負スプリント
      seg(6, 2, 0, 0, { speed: 0.3, pacing: 0.26, mental: 0.18, stamina: 0.16, recovery: 0.1 }),
      // 7区 12.0km 平坦: 追加区間
      seg(7, 12, 0, 0, { pacing: 0.38, stamina: 0.3, mental: 0.2, recovery: 0.08, speed: 0.04 }, "long"),
      // 8区 9.0km 緩起伏: 追加区間
      seg(8, 9, 6, 6, { pacing: 0.36, stamina: 0.3, mental: 0.18, recovery: 0.12, speed: 0.04 }, "undulating"),
      // 9区 7.5km 平坦: 追加区間。アンカー
      seg(9, 7.5, 0, 0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 })
    ]
  }
];
var FINAL_COURSES = [
  // 1部ファイナル: JPELグランドファイナル（SEASON_2027_RACES race-10 をそのまま流用）
  toTemplate(SEASON_2027_RACES[9]),
  {
    // 2部ファイナル: 金沢ファイナル駅伝（新規・25本目。location は他の24本と重複しない）
    name: "\u91D1\u6CA2\u30D5\u30A1\u30A4\u30CA\u30EB\u99C5\u4F1D",
    location: "\u91D1\u6CA2",
    type: "league",
    months: [11, 12],
    conditions: { temperature: 9, weather: "cloudy", elevation: 20 },
    segments: [
      // 1区 8.5km 平坦: 戦術的な幕開け
      seg(1, 8.5, 0, 0, { pacing: 0.38, speed: 0.28, mental: 0.2, stamina: 0.1, recovery: 0.04 }),
      // 2区 10.5km 起伏: 最初の山岳複合区間
      seg(2, 10.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.1 }),
      // 3区 16.0km 緩上り: 長距離スタミナ区間
      seg(3, 16, 8, 3, { stamina: 0.44, recovery: 0.24, pacing: 0.2, mental: 0.08, speed: 0.04 }),
      // 4区 9.5km 緩傾斜: 中盤の精神消耗戦
      seg(4, 9.5, 5, 5, { mental: 0.36, pacing: 0.28, stamina: 0.2, recovery: 0.12, speed: 0.04 }),
      // 5区 12.5km 急登: 技術的登り。スタミナ込みの山岳力
      seg(5, 12.5, 55, 2, { mountainUp: 0.55, stamina: 0.24, pacing: 0.12, mental: 0.06, recovery: 0.03 }),
      // 6区 11.0km 急降: 技術的下り。速さとコントロール
      seg(6, 11, 2, 55, { mountainDown: 0.55, speed: 0.22, pacing: 0.12, mental: 0.08, recovery: 0.03 }),
      // 7区 10.0km 緩上り: 回復力で後半を支える
      seg(7, 10, 8, 3, { recovery: 0.38, stamina: 0.28, pacing: 0.2, mental: 0.1, speed: 0.04 }),
      // 8区 13.0km 起伏: 疲弊した脚での二度目の山岳戦
      seg(8, 13, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.1 }),
      // 9区 8.0km 平坦: 最終スプリントアンカー
      seg(9, 8, 0, 0, { speed: 0.62, pacing: 0.18, mental: 0.14, stamina: 0.04, recovery: 0.02 })
    ]
  },
  {
    // 3部ファイナル: 房総ファイナル駅伝（旧リザーブファイナルを改名して転用。location・区間は据え置き）
    name: "\u623F\u7DCF\u30D5\u30A1\u30A4\u30CA\u30EB\u99C5\u4F1D",
    location: "\u5343\u8449",
    type: "league",
    months: [10, 11],
    conditions: { temperature: 18, weather: "sunny", elevation: 35 },
    segments: [
      seg(1, 6, 5, 5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(2, 8, 0, 0, { pacing: 0.38, speed: 0.28, mental: 0.2, stamina: 0.1, recovery: 0.04 }),
      seg(3, 10.5, 12, 8, { mental: 0.32, pacing: 0.3, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(4, 7.5, 0, 0, { speed: 0.64, pacing: 0.16, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5, 9, 20, 18, { mountainUp: 0.26, mountainDown: 0.24, stamina: 0.28, pacing: 0.12, recovery: 0.1 }),
      seg(6, 14, 8, 3, { stamina: 0.4, recovery: 0.26, pacing: 0.2, mental: 0.1, speed: 0.04 })
    ]
  }
];
var MAIN_RACE_NAMES = SEASON_2027_RACES.map((r) => r.name);
var RESERVE_RACE_POOL = [
  ...LEAGUE_COURSE_POOL.slice(9),
  ...FINAL_COURSES.slice(1)
];

// src/data/eclCourses.ts
function seg2(index, distanceKm, uphillPct, downhillPct, recommended) {
  return { index, distanceKm, uphillPct, downhillPct, ...recommended ? { recommended } : {} };
}
var ECL_COURSES = [
  {
    id: "london",
    name: "\u30ED\u30F3\u30C9\u30F3\u30FB\u30C6\u30E0\u30BA\u30B5\u30FC\u30AD\u30C3\u30C8",
    location: "\u30ED\u30F3\u30C9\u30F3",
    character: "\u5B8C\u5168\u30D5\u30E9\u30C3\u30C8\u306E\u9AD8\u901F\u30B3\u30FC\u30B9\u3002\u7D14\u7C8B\u306A\u30B9\u30D4\u30FC\u30C9\u52DD\u8CA0",
    segments: [seg2(1, 10, 2, 2, "sprinter"), seg2(2, 12, 3, 3, "ace"), seg2(3, 8.5, 2, 2, "sprinter"), seg2(4, 13, 3, 3, "ace"), seg2(5, 10.5, 2, 2, "sprinter"), seg2(6, 9, 2, 2, "sprinter"), seg2(7, 14, 3, 3, "ace")]
  },
  {
    id: "riftvalley",
    name: "\u30EA\u30D5\u30C8\u30D0\u30EC\u30FC\u9AD8\u5730\u30B3\u30FC\u30B9",
    location: "\u30B1\u30CB\u30A2\u30FB\u30A8\u30EB\u30C9\u30EC\u30C3\u30C8",
    character: "\u6A19\u9AD82400m\u306E\u9AD8\u5730\u3002\u30B9\u30BF\u30DF\u30CA\u3068\u56DE\u5FA9\u529B\u304C\u8A66\u3055\u308C\u308B",
    segments: [seg2(1, 9.5, 15, 5, "sprinter"), seg2(2, 11, 20, 10, "allrounder"), seg2(3, 10, 10, 15, "sprinter"), seg2(4, 12.5, 15, 10, "ace"), seg2(5, 8.5, 20, 5, "sprinter"), seg2(6, 10.5, 10, 15, "sprinter"), seg2(7, 12, 15, 10, "ace")]
  },
  {
    id: "alps",
    name: "\u30A2\u30EB\u30D7\u30B9\u5C71\u5CB3\u30B9\u30C6\u30FC\u30B8",
    location: "\u30B7\u30E3\u30E2\u30CB\u30FC",
    character: "\u5CE0\u30922\u3064\u8D8A\u3048\u308B\u5C71\u5CB3\u30B3\u30FC\u30B9\u3002\u767B\u308A\u3068\u4E0B\u308A\u306E\u8077\u4EBA\u304C\u4E3B\u5F79",
    segments: [seg2(1, 8, 5, 5, "sprinter"), seg2(2, 10, 45, 5, "mountain_up"), seg2(3, 9, 10, 45, "mountain_down"), seg2(4, 11, 30, 20, "allrounder"), seg2(5, 8.5, 40, 10, "mountain_up"), seg2(6, 9.5, 5, 40, "mountain_down"), seg2(7, 10, 10, 10, "sprinter")]
  },
  {
    id: "dubai",
    name: "\u30C9\u30D0\u30A4\u30FB\u30C7\u30B6\u30FC\u30C8\u30CF\u30A4\u30A6\u30A7\u30A4",
    location: "\u30C9\u30D0\u30A4",
    character: "\u707C\u71B1\u306E\u30D5\u30E9\u30C3\u30C8\u30B3\u30FC\u30B9\u3002\u30E1\u30F3\u30BF\u30EB\u306E\u5F37\u3055\u304C\u554F\u308F\u308C\u308B",
    segments: [seg2(1, 11, 1, 1, "sprinter"), seg2(2, 13.5, 2, 2, "ace"), seg2(3, 9.5, 1, 1, "sprinter"), seg2(4, 12, 2, 2, "ace"), seg2(5, 11.5, 1, 1, "ace"), seg2(6, 10, 1, 1, "sprinter"), seg2(7, 13, 2, 2, "ace")]
  },
  {
    id: "newyork",
    name: "\u30CB\u30E5\u30FC\u30E8\u30FC\u30AF\u30FB\u30D5\u30A1\u30A4\u30D6\u30DC\u30ED\u30FC",
    location: "\u30CB\u30E5\u30FC\u30E8\u30FC\u30AF",
    character: "\u6A4B\u306E\u30A2\u30C3\u30D7\u30C0\u30A6\u30F3\u304C\u9023\u7D9A\u3059\u308B\u5E02\u8857\u5730\u30B3\u30FC\u30B9",
    segments: [seg2(1, 10.5, 12, 12, "sprinter"), seg2(2, 11.5, 15, 10, "ace"), seg2(3, 9, 10, 15, "sprinter"), seg2(4, 12.5, 12, 12, "ace"), seg2(5, 10, 15, 10, "sprinter"), seg2(6, 9.5, 10, 15, "sprinter"), seg2(7, 12, 12, 12, "ace")]
  },
  {
    id: "addis",
    name: "\u30A2\u30C7\u30A3\u30B9\u30A2\u30D9\u30D0\u9AD8\u539F\u30B3\u30FC\u30B9",
    location: "\u30A2\u30C7\u30A3\u30B9\u30A2\u30D9\u30D0",
    character: "\u6A19\u9AD82300m\u30FB\u7DE9\u3044\u767B\u308A\u57FA\u8ABF\u3002\u6301\u4E45\u529B\u306E\u6D88\u8017\u6226",
    segments: [seg2(1, 10, 18, 8, "sprinter"), seg2(2, 12, 15, 10, "ace"), seg2(3, 9.5, 20, 5, "sprinter"), seg2(4, 11, 15, 10, "sprinter"), seg2(5, 10.5, 18, 8, "sprinter"), seg2(6, 9, 15, 10, "sprinter"), seg2(7, 12.5, 12, 12, "ace")]
  },
  {
    id: "paris",
    name: "\u30D1\u30EA\u30FB\u30B7\u30E3\u30F3\u30BC\u30EA\u30BC\u30B5\u30FC\u30AD\u30C3\u30C8",
    location: "\u30D1\u30EA",
    character: "\u77F3\u7573\u3068\u7DE9\u659C\u9762\u306E\u5468\u56DE\u30B3\u30FC\u30B9\u3002\u30DA\u30FC\u30B9\u914D\u5206\u304C\u9375",
    segments: [seg2(1, 9, 8, 8, "sprinter"), seg2(2, 10.5, 10, 8, "sprinter"), seg2(3, 11, 8, 10, "sprinter"), seg2(4, 9.5, 10, 8, "sprinter"), seg2(5, 12, 8, 10, "ace"), seg2(6, 10, 10, 8, "sprinter"), seg2(7, 11.5, 8, 8, "ace")]
  },
  {
    id: "sydney",
    name: "\u30B7\u30C9\u30CB\u30FC\u30FB\u30D9\u30A4\u30B5\u30A4\u30C9\u30E9\u30A4\u30F3",
    location: "\u30B7\u30C9\u30CB\u30FC",
    character: "\u6D77\u6CBF\u3044\u306E\u5F37\u98A8\u30D5\u30E9\u30C3\u30C8\u30B3\u30FC\u30B9\u3002\u7D42\u76E4\u306B\u6A4B\u306E\u6025\u5742",
    segments: [seg2(1, 10.5, 3, 3, "sprinter"), seg2(2, 12, 4, 4, "ace"), seg2(3, 10, 3, 3, "sprinter"), seg2(4, 11.5, 4, 4, "ace"), seg2(5, 9.5, 3, 3, "sprinter"), seg2(6, 10.5, 4, 4, "sprinter"), seg2(7, 11, 25, 25, "allrounder")]
  },
  {
    id: "fuji",
    name: "\u5BCC\u58EB\u5C71\u9E93\u30A4\u30F3\u30BF\u30FC\u30CA\u30B7\u30E7\u30CA\u30EB",
    location: "\u5BCC\u58EB\u5C71\u9E93",
    character: "\u65E5\u672C\u958B\u50AC\u306E\u5C71\u5CB3\u30B3\u30FC\u30B9\u30025\u533A\u306E\u5BCC\u58EB\u767B\u308A\u304C\u6700\u5927\u306E\u52DD\u8CA0\u6240",
    segments: [seg2(1, 10, 5, 5, "sprinter"), seg2(2, 11.5, 10, 8, "ace"), seg2(3, 9.5, 8, 10, "sprinter"), seg2(4, 12, 15, 10, "ace"), seg2(5, 9, 55, 5, "mountain_up"), seg2(6, 8.5, 5, 55, "mountain_down"), seg2(7, 13, 5, 5, "ace")]
  },
  {
    id: "seoul",
    name: "\u30BD\u30A6\u30EB\u30FB\u6F22\u6C5F\u30EA\u30D0\u30FC\u30B5\u30A4\u30C9",
    location: "\u30BD\u30A6\u30EB",
    character: "\u5DDD\u6CBF\u3044\u306E\u9AD8\u901F\u30B3\u30FC\u30B9\u3002\u30E9\u30B9\u30C8\u533A\u9593\u304C\u9577\u3044\u7DCF\u529B\u6226",
    segments: [seg2(1, 9.5, 4, 4, "sprinter"), seg2(2, 11, 5, 5, "sprinter"), seg2(3, 10.5, 4, 4, "sprinter"), seg2(4, 9, 5, 5, "sprinter"), seg2(5, 11.5, 4, 4, "ace"), seg2(6, 10, 5, 5, "sprinter"), seg2(7, 15, 6, 6, "long")]
  }
];

// src/data/matchCourses.ts
var pad2 = (n) => String(n).padStart(2, "0");
var totalKm = (segs) => Math.round(segs.reduce((s, x) => s + x.distanceKm, 0) * 10) / 10;
var ECL_CONDITIONS = { temperature: 12, weather: "sunny", elevation: 0 };
var MATCH_COURSES = [
  ...SEASON_2027_RACES.map((r, i) => ({
    id: `main-${pad2(i + 1)}`,
    name: r.name,
    category: "main",
    location: r.location,
    segments: r.segments,
    conditions: r.conditions,
    distanceKm: totalKm(r.segments)
  })),
  ...RESERVE_RACE_POOL.map((t, i) => ({
    id: `rsv-${pad2(i + 1)}`,
    name: t.name,
    category: "reserve",
    location: t.location,
    segments: t.segments,
    conditions: t.conditions,
    distanceKm: totalKm(t.segments)
  })),
  ...ECL_COURSES.map((c) => ({
    id: `ecl-${c.id}`,
    name: c.name,
    category: "ecl",
    location: c.location,
    segments: c.segments,
    conditions: ECL_CONDITIONS,
    distanceKm: totalKm(c.segments)
  }))
];
var BY_ID = new Map(MATCH_COURSES.map((c) => [c.id, c]));
function courseToRace(c, raceNo) {
  return {
    id: `mp-${c.id}-${raceNo}`,
    name: c.name,
    date: "",
    location: c.location,
    type: "league",
    segments: c.segments,
    conditions: c.conditions
  };
}

// src/lib/roomMachine.ts
function usableRoster(roster) {
  return roster.filter((p) => p.status !== "retired");
}
function autoOrder(roster, course, raceNo = 1) {
  const segCount = course.segments.length;
  const list = usableRoster(roster);
  const healthy = list.filter((p) => p.status !== "injured");
  const pool = healthy.length >= segCount ? healthy : list;
  return { lineup: assignLineupByTerrain(pool, courseToRace(course, raceNo)) };
}
function isOrderComplete(o, course) {
  if (!o?.lineup) return false;
  return course.segments.every((s) => !!o.lineup[s.index]);
}
function resolveOrders(args) {
  const { activeIds, entries, course, rosters, raceNo } = args;
  const orders = {};
  const forfeits = [];
  for (const id of activeIds) {
    const got = entries[id];
    if (isOrderComplete(got, course)) {
      orders[id] = got.lineup;
      continue;
    }
    orders[id] = autoOrder(rosters[id] ?? [], course, raceNo).lineup;
    if (!got) forfeits.push(id);
  }
  return { orders, forfeits };
}

// src/lib/matchSim.ts
var NS = "#";
var nsId = (userId, playerId) => `${userId}${NS}${playerId}`;
function asTeam(info) {
  return {
    id: info.id,
    name: info.name,
    shortName: info.shortName,
    city: "",
    region: "",
    founded: 0,
    colors: { primary: info.primary, secondary: info.secondary },
    logoId: info.logoId,
    finance: { budget: 0 },
    draftPicks: [],
    initialRank: 0,
    isPlayerControlled: false,
    gmName: ""
  };
}
function buildRacePayload(args) {
  const { raceNo, course, startAt, teams, rosters, orders, teamCount } = args;
  const race = courseToRace(course, raceNo + 1);
  const simPlayers = [];
  const runnerInfo = /* @__PURE__ */ new Map();
  const lineups = {};
  for (const t of teams) {
    const roster = rosters[t.id] ?? [];
    const byId = new Map(roster.map((p) => [p.id, p]));
    const line = {};
    for (const seg3 of course.segments) {
      const pid = orders[t.id]?.[seg3.index];
      const p = pid ? byId.get(pid) : void 0;
      if (!p) continue;
      const nid = nsId(t.id, p.id);
      line[seg3.index] = nid;
      if (!runnerInfo.has(nid)) {
        simPlayers.push({ ...p, id: nid, teamId: t.id });
        runnerInfo.set(nid, {
          id: nid,
          srcId: p.id,
          teamId: t.id,
          name: p.name,
          nationality: String(p.nationality ?? "JPN")
        });
      }
    }
    lineups[t.id] = line;
  }
  const results = simulateRace(race, lineups, teams.map(asTeam), simPlayers, 0);
  const segPts = {};
  const segments = results.segmentResults.map((sr) => {
    for (const r of sr.runners) {
      const pt = segmentAwardPoints(teamCount, r.rank);
      if (pt) segPts[r.teamId] = (segPts[r.teamId] ?? 0) + pt;
    }
    return { segmentIndex: sr.segmentIndex, runners: sr.runners };
  });
  const standings = results.teamRankings.map((tr) => {
    const sp = segPts[tr.teamId] ?? 0;
    return {
      teamId: tr.teamId,
      totalTimeSec: tr.totalTimeSec,
      rank: tr.rank,
      segPts: sp,
      points: positionPointsFor(teamCount, tr.rank) + sp
    };
  });
  return {
    race: raceNo,
    courseId: course.id,
    startAt,
    teams,
    runners: [...runnerInfo.values()],
    segments,
    standings,
    forfeits: args.forfeits ?? []
  };
}

// src/lib/ratedTick.ts
function runRatedRound(args) {
  const { dateISO, day, entrants, lineups } = args;
  const course = ratedMatchCourse(dateISO);
  const pool = entrants.map((e) => ({ id: e.userId, rating: e.rating }));
  const groups = splitGroups(pool);
  if (groups.length === 0) return { skipped: true, groups: 0, rows: [], races: [] };
  const byId = new Map(entrants.map((e) => [e.userId, e]));
  const rows = [];
  const races = [];
  groups.forEach((group, gi) => {
    const groupNo = gi + 1;
    const members = group.map((g) => byId.get(g.id)).filter(Boolean);
    const activeIds = members.map((m) => m.userId);
    const rosters = {};
    const entries = {};
    for (const m of members) {
      rosters[m.userId] = m.hof.map((h) => h.player);
      const line = lineups[m.userId];
      entries[m.userId] = line && Object.keys(line).length > 0 ? { lineup: line } : void 0;
    }
    const { orders, forfeits } = resolveOrders({ activeIds, entries, course, rosters, raceNo: day });
    const race = buildRacePayload({
      raceNo: day - 1,
      // 0始まり
      course,
      startAt: 0,
      // 走り出す時刻の待ち合わせはしない（結果を配るだけ）
      teams: members.map((m) => m.team),
      rosters,
      orders,
      teamCount: members.length,
      forfeits
    });
    const order = [...race.standings].sort((a, b) => a.rank - b.rank || a.totalTimeSec - b.totalTimeSec);
    const delta = applyElo(group, order.map((s) => s.teamId));
    const place = new Map(race.standings.map((s) => [s.teamId, s]));
    for (const m of members) {
      const st = place.get(m.userId);
      const after2 = clampRating(m.rating + (delta[m.userId] ?? 0));
      const d = after2 - m.rating;
      rows.push({
        userId: m.userId,
        group: groupNo,
        place: st?.rank ?? 0,
        timeSec: st?.totalTimeSec ?? 0,
        delta: d,
        ratingAfter: after2,
        forfeit: forfeits.includes(m.userId),
        overall: 0,
        move: 0
        // ↓ 全グループが出そろってから入れる
      });
    }
    races.push({ group: groupNo, race });
  });
  const rankOfBy = (get) => {
    const sorted = [...rows].sort((a, b) => get(b) - get(a) || (a.userId < b.userId ? -1 : 1));
    return new Map(sorted.map((r, i) => [r.userId, i + 1]));
  };
  const before = rankOfBy((r) => byId.get(r.userId)?.rating ?? 0);
  const after = rankOfBy((r) => r.ratingAfter);
  for (const r of rows) {
    r.overall = after.get(r.userId) ?? 0;
    r.move = (before.get(r.userId) ?? 0) - r.overall;
  }
  return { skipped: false, groups: groups.length, rows, races };
}
export {
  GROUP_MIN,
  ratedCourse,
  ratedDateOf,
  ratedDayOf,
  ratedMatchCourse,
  runRatedRound
};
