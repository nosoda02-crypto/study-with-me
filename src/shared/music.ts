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
