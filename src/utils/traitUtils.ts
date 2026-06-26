export type TraitId =
  | 'big_stage'
  | 'pressure_weak'
  | 'clutch'
  | 'fade'
  | 'mountain_ace'
  | 'sprint_burst'
  | 'consistent'
  | 'volatile'
  | 'team_player'
  | 'iron_will'

export type TraitCategory = 'mental' | 'physical' | 'situational'

export type TraitDef = {
  id: TraitId
  label: string
  desc: string
  category: TraitCategory
  color: string
  positive: boolean
}

export const TRAITS: Record<TraitId, TraitDef> = {
  big_stage:     { id: 'big_stage',     label: '大舞台に強い',       desc: 'カップ戦・ポストシーズンで+4%',    category: 'mental',      color: '#FFD700', positive: true  },
  pressure_weak: { id: 'pressure_weak', label: 'プレッシャーに弱い', desc: 'カップ戦・重要試合で-4%',          category: 'mental',      color: '#E8462A', positive: false },
  clutch:        { id: 'clutch',        label: '土壇場の粘り',       desc: '最終区間で+5%のパフォーマンス',    category: 'mental',      color: '#C9A84C', positive: true  },
  fade:          { id: 'fade',          label: '終盤垂れる',         desc: '後半区間で-4%のパフォーマンス',    category: 'physical',    color: '#FF9800', positive: false },
  mountain_ace:  { id: 'mountain_ace',  label: '山岳特化',           desc: '山岳区間で+6%のパフォーマンス',   category: 'physical',    color: '#4CAF50', positive: true  },
  sprint_burst:  { id: 'sprint_burst',  label: '切れ味抜群',         desc: 'スプリント区間で+6%',             category: 'physical',    color: '#EC407A', positive: true  },
  consistent:    { id: 'consistent',    label: '安定感',             desc: 'パフォーマンスのブレが小さい',    category: 'mental',      color: '#7986CB', positive: true  },
  volatile:      { id: 'volatile',      label: '波がある',           desc: '好不調の振れ幅が大きい',          category: 'mental',      color: '#9B97A8', positive: false },
  team_player:   { id: 'team_player',   label: 'チームマン',         desc: 'チーム士気高時に+2%',             category: 'situational', color: '#26C6DA', positive: true  },
  iron_will:     { id: 'iron_will',     label: '鉄の意志',           desc: '士気低下・不調耐性が高い',        category: 'situational', color: '#9B97A8', positive: true  },
}

export const CATEGORY_LABEL: Record<TraitCategory, string> = {
  mental: '精神',
  physical: '身体',
  situational: '状況',
}
