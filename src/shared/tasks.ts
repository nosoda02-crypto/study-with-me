import { addDays, todayStr } from './date'
export const TASK_COLORS = ['#007aff', '#ff9500', '#34c759', '#af52de', '#ff3b30', '#ff2d55']
export const TASK_ICONS = ['☰', '▣', '▤', '⌂', '♡', '⚑', '★', '◉']
export interface TaskList { id: string; name: string; color: string; icon: string }
export const DEFAULT_LIST: TaskList = { id: 'default', name: '提醒事项', color: '#007aff', icon: '☰' }
export interface TaskItem {
  id: string
  text: string
  completed: boolean
  daily: boolean
  countdown: boolean
  lastResetDate: string
  listId: string
  dueDate: string | null
  dueTime: string | null
  createdDate: string
  completedDates: string[]
  completedDate: string | null
}
export interface TaskOptions { listId?: string; dueDate?: string | null; dueTime?: string | null; countdown?:boolean }
export interface TaskPatch extends TaskOptions { text?: string }
export interface TaskData { items: TaskItem[]; lists: TaskList[] }
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value + 'T12:00:00')
  return Number.isFinite(d.getTime()) && todayStr(d) === value
}
export function validTime(value: unknown): value is string { return typeof value==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) }
/** Order the compact bubble by urgency while keeping today's reminders first. */
export function compareBubbleTasks(a:TaskItem,b:TaskItem,today=todayStr()):number{
  const group=(task:TaskItem):number=>task.dueDate===null?3:task.dueDate===today?0:task.dueDate<today?1:2
  const aGroup=group(a),bGroup=group(b)
  if(aGroup!==bGroup)return aGroup-bGroup
  if(a.dueDate!==b.dueDate){
    // For overdue reminders, yesterday is nearer than last week. Future dates ascend normally.
    return aGroup===1?(b.dueDate??'').localeCompare(a.dueDate??''):(a.dueDate??'').localeCompare(b.dueDate??'')
  }
  const time=(task:TaskItem)=>task.dueTime??'99:99'
  const timeOrder=time(a).localeCompare(time(b))
  if(timeOrder)return timeOrder
  return a.createdDate.localeCompare(b.createdDate)
}
export function completedOn(task: TaskItem, date: string): boolean {
  return task.daily ? task.completedDates.includes(date) : task.completed && (!task.completedDate || task.completedDate <= date)
}
export function scheduledOn(task: TaskItem, date: string): boolean {
  const start = task.dueDate ?? task.createdDate
  return task.daily ? date >= start : date === start
}
export type TaskView = 'day' | 'week' | 'month'
export function periodDays(date: string, view: TaskView): string[] {
  if (view === 'day') return [date]
  const d = new Date(date + 'T12:00:00')
  if (view === 'week') {
    const start = addDays(date, -((d.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }
  const start = date.slice(0, 8) + '01'
  const count = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}
export function shiftPeriod(date: string, view: TaskView, direction: number): string {
  if (view !== 'month') return addDays(date, direction * (view === 'week' ? 7 : 1))
  const d = new Date(date + 'T12:00:00')
  d.setDate(1); d.setMonth(d.getMonth() + direction)
  return todayStr(d)
}
