import { addDays, todayStr } from './date'

export type CheckinPeriod='week'|'month'|'year'
export interface DailyWorkSummary{
  date:string
  companionSeconds:number
  keystrokes:number
  durations:Record<string,number>
}
export interface WorkStatistics{
  period:CheckinPeriod
  anchorDate:string
  startDate:string
  endDate:string
  days:DailyWorkSummary[]
  companionSeconds:number
  keystrokes:number
  durations:Record<string,number>
  activeDays:number
}

export function periodRange(period:CheckinPeriod,anchorDate:string):{startDate:string;endDate:string}{
  const anchor=new Date(anchorDate+'T12:00:00')
  if(period==='week'){
    const startDate=addDays(anchorDate,-((anchor.getDay()+6)%7))
    return{startDate,endDate:addDays(startDate,6)}
  }
  if(period==='month'){
    const startDate=anchorDate.slice(0,8)+'01'
    const end=new Date(anchor.getFullYear(),anchor.getMonth()+1,0,12)
    return{startDate,endDate:todayStr(end)}
  }
  return{startDate:`${anchor.getFullYear()}-01-01`,endDate:`${anchor.getFullYear()}-12-31`}
}

export function shiftStatisticsPeriod(period:CheckinPeriod,anchorDate:string,direction:number):string{
  if(period==='week')return addDays(anchorDate,direction*7)
  const date=new Date(anchorDate+'T12:00:00')
  date.setDate(1)
  date.setMonth(date.getMonth()+direction*(period==='month'?1:12))
  return todayStr(date)
}
