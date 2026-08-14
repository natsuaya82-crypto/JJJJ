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

export const CATEGORY_LABEL: Record<TraitCategory, string> = {
  mental: '精神',
  physical: '身体',
  situational: '状況',
}
