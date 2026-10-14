import { todayStr } from '../shared/date'
import { DEFAULT_LIST, TASK_COLORS, TASK_ICONS, validDate, validTime, completedOn, type TaskItem, type TaskList, type TaskOptions, type TaskPatch } from '../shared/tasks'
import Store from './cachedStore'
import { randomUUID } from 'crypto'
export type { TaskItem } from '../shared/tasks'
export interface TasksSchema { items: TaskItem[]; lists: TaskList[] }
const store = new Store<TasksSchema>({ name: 'tasks', defaults: { items: [], lists: [DEFAULT_LIST] } })
export function getTaskLists(): TaskList[] {
  const lists = store.get('lists') ?? []
  if (!lists.some(l => l.id === 'default')) {
    const next = [DEFAULT_LIST, ...lists]; store.set('lists', next); return next
  }
  return lists
}
/** Migrate legacy tasks once, preserving their last known completion date. */
function records(): TaskItem[] {
  const today = todayStr(), lists = getTaskLists()
  const old = store.get('items')
  const items = old.map(t => {
    const completedDates = t.completedDates ?? (t.daily && t.completed ? [t.lastResetDate] : [])
    const createdDate = t.createdDate ?? t.lastResetDate ?? today
    const wasDaily=t.daily===true,completedToday=completedDates.includes(today)
    return { ...t, daily:false,countdown:typeof t.countdown==='boolean'?t.countdown:false,listId: lists.some(l => l.id === t.listId) ? t.listId : 'default',
      dueDate:wasDaily?today:(t.dueDate ?? null), dueTime: t.dueTime ?? null, createdDate, completedDates,
      completedDate:wasDaily?(completedToday?today:null):(t.completedDate ?? (t.completed ? t.lastResetDate : null)),
      completed:wasDaily?completedToday:t.completed,
      lastResetDate:wasDaily?today:t.lastResetDate }
  })
  if (JSON.stringify(items) !== JSON.stringify(old)) store.set('items', items)
  return items
}
export function getTaskData() { return { items: records(), lists: getTaskLists() } }
/** Bubble summary includes today's tasks plus future one-off tasks explicitly marked as countdowns. */
export function getTasks(): TaskItem[] {
  const today = todayStr()
  return records().filter(t => t.countdown||(t.dueDate ?? t.createdDate) <= today)
}
function checkOptions(options: TaskOptions): void {
  if (options.dueDate !== undefined && options.dueDate !== null && !validDate(options.dueDate)) throw new Error('请选择有效的截止日期')
  if (options.dueTime !== undefined && options.dueTime !== null && !validTime(options.dueTime)) throw new Error('请选择有效的提醒时间')
  if (options.listId !== undefined && !getTaskLists().some(l => l.id === options.listId)) throw new Error('分类不存在')
  if(options.countdown!==undefined&&typeof options.countdown!=='boolean')throw new Error('倒计时设置无效')
}
export function addTask(text: string, daily: boolean, options: TaskOptions = {}): TaskItem {
  if (typeof text !== 'string' || !text.trim() || typeof daily !== 'boolean') throw new Error('请输入任务内容')
  checkOptions(options)
  const task: TaskItem = { id: randomUUID(), text: text.trim(), completed: false, daily:false,countdown:options.countdown??false,
    lastResetDate: todayStr(), listId: options.listId ?? 'default', dueDate: options.dueDate ?? todayStr(), dueTime: options.dueTime === undefined ? '09:00' : options.dueTime,
    createdDate: todayStr(), completedDates: [], completedDate: null }
  store.set('items', [...records(), task]); return task
}
export function updateTask(id: string, patch: TaskPatch): void {
  checkOptions(patch)
  if (patch.text !== undefined && (typeof patch.text !== 'string' || !patch.text.trim())) throw new Error('任务内容不能为空')
  store.set('items', records().map(t => t.id === id ? { ...t,
    ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
    ...(patch.listId !== undefined ? { listId: patch.listId } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
    ...(patch.dueTime !== undefined ? { dueTime: patch.dueTime } : {}),
    ...(patch.countdown !== undefined ? { countdown:patch.countdown } : {}) } : t))
}
export function toggleTask(id: string, date = todayStr()): TaskItem | null {
  if (!validDate(date)) throw new Error('日期无效')
  let toggled: TaskItem | null = null
  const items = records().map(t => {
    if (t.id !== id) return t
    const completed = !completedOn(t, date)
    toggled = { ...t, completed, completedDate: completed ? date : null }
    return toggled
  })
  store.set('items', items)
  return toggled
}
export function deleteTask(id: string): void { store.set('items', records().filter(t => t.id !== id)) }
export function saveTaskList(input: Omit<TaskList, 'id'> & { id?: string }): TaskList {
  if (typeof input.name !== 'string' || !input.name.trim() || !TASK_COLORS.includes(input.color) || !TASK_ICONS.includes(input.icon)) throw new Error('分类名称、颜色或图标无效')
  const lists = getTaskLists()
  if (input.id && !lists.some(l => l.id === input.id)) throw new Error('分类不存在')
  const list: TaskList = { id: input.id ?? randomUUID(), name: input.name.trim(), color: input.color, icon: input.icon }
  store.set('lists', input.id ? lists.map(l => l.id === input.id ? list : l) : [...lists, list])
  return list
}
export function deleteTaskList(id:string):void{
  if(id==='default')throw new Error('默认清单不能删除')
  const lists=getTaskLists()
  if(!lists.some(list=>list.id===id))throw new Error('清单不存在')
  // Preserve every task and its completion history when its visual group is removed.
  store.set('items',records().map(task=>task.listId===id?{...task,listId:'default'}:task))
  store.set('lists',lists.filter(list=>list.id!==id))
}
export default store
