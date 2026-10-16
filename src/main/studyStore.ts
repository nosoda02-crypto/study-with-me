import Store from './cachedStore'
import { randomUUID } from 'crypto'
import { validDate } from '../shared/tasks'
import { studyScheduledOn, validStudyInput, type StudyData, type StudyTask, type StudyTaskInput } from '../shared/study'

const store=new Store<StudyData>({name:'study-checkins',defaults:{items:[]}})
export function getStudyData():StudyData{return{items:store.get('items')??[]}}
export function saveStudyTask(input:StudyTaskInput,id?:string):StudyTask{
  if(!validStudyInput(input))throw new Error('学习计划内容无效')
  const items=getStudyData().items
  const old=id?items.find(item=>item.id===id):undefined
  if(id&&!old)throw new Error('学习计划不存在')
  const next:StudyTask={...input,title:input.title.trim(),id:id??randomUUID(),completedDates:old?.completedDates??[],createdAt:old?.createdAt??Date.now()}
  store.set('items',id?items.map(item=>item.id===id?next:item):[...items,next])
  return next
}
export function toggleStudyTask(id:string,date:string):StudyTask{
  if(!validDate(date))throw new Error('日期无效')
  let result:StudyTask|undefined
  const items=getStudyData().items.map(item=>{
    if(item.id!==id)return item
    if(!studyScheduledOn(item,date))throw new Error('这一天没有安排该任务')
    const done=item.completedDates.includes(date)
    result={...item,completedDates:done?item.completedDates.filter(value=>value!==date):[...item.completedDates,date].sort()}
    return result
  })
  if(!result)throw new Error('学习计划不存在')
  store.set('items',items);return result
}
export function deleteStudyTask(id:string):void{store.set('items',getStudyData().items.filter(item=>item.id!==id))}
export default store
