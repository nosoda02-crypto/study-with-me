export interface MusicSnapshot{
  enabled:boolean
  playing:boolean
  title:string
  artist:string
  todaySeconds:number
  error:string
}
export interface MusicDaySummary{date:string;seconds:number}
export interface MusicStatistics{startDate:string;endDate:string;days:MusicDaySummary[];totalSeconds:number}

/** Whether the status bubble shows its music row (the bubble grows taller while it does). */
export const musicRowVisible = (music: { enabled: boolean; playing: boolean; todaySeconds: number }): boolean =>
  music.enabled && (music.playing || music.todaySeconds > 0)
