// 移籍市場の検索フィルタの保持。
// TransferPageはルート遷移（検索結果⇄一覧・チャット往復など）でアンマウントされるたびに
// stateが初期化されてしまうため、モジュールスコープに退避しておく。
// クリアは「市場系の画面から完全に離れたとき」（App側で判定）のみ。

export type MarketFilters = {
  search: string
  spec: string
  nat: string
  avail: string
  team: string
  age: string
  league: string
  sortKey: string
  sortDir: string
}

export const DEFAULT_MARKET_FILTERS: MarketFilters = {
  search: '', spec: 'all', nat: 'all', avail: 'all', team: 'all', age: 'all', league: 'all',
  sortKey: 'ovr', sortDir: 'desc',
}

let current: MarketFilters = { ...DEFAULT_MARKET_FILTERS }

export function getMarketFilters(): MarketFilters {
  return current
}

export function saveMarketFilters(f: Partial<MarketFilters>) {
  current = { ...current, ...f }
}

export function clearMarketFilters() {
  current = { ...DEFAULT_MARKET_FILTERS }
}
