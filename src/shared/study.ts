import { validDate, validTime } from './tasks'

export type StudySchedule='daily'|'date'
export interface StudyTask{
  id:string
  title:string
  schedule:StudySchedule
  startDate:string
  targetDate:string|null
  reminderTime:string|null
  enabled:boolean
  completedDates:string[]
  createdAt:number
}
export interface StudyTaskInput{title:string;schedule:StudySchedule;startDate:string;targetDate:string|null;reminderTime:string|null;enabled:boolean}
export interface StudyData{items:StudyTask[]}
export function studyScheduledOn(item:StudyTask,date:string):boolean{
  return item.enabled&&(item.schedule==='daily'?date>=item.startDate:item.targetDate===date)
}
export function studyCompletedOn(item:StudyTask,date:string):boolean{return item.completedDates.includes(date)}
export function validStudyInput(value:StudyTaskInput):boolean{
  return typeof value.title==='string'&&!!value.title.trim()&&['daily','date'].includes(value.schedule)&&validDate(value.startDate)&&
    (value.schedule==='daily'?value.targetDate===null:validDate(value.targetDate))&&
    (value.reminderTime===null||validTime(value.reminderTime))&&typeof value.enabled==='boolean'
}
