import type {DutyGroup,FlowNode,PauseCalendar,PauseWindow,SlaSnapshot} from '../types';

/* 演示环境统一的“当前时间”，保证刷新后剩余时限计算结果一致 */
export const NOW='2026-07-11 16:40';

const MINUTE=60_000;
export const toMs=(s:string):number=>new Date(s.replace(' ','T')+':00').getTime();

export function fmtMinutes(min:number):string{
 const m=Math.round(Math.abs(min));
 if(m<60)return `${m} 分钟`;
 const h=Math.floor(m/60),r=m%60;
 return r?`${h} 小时 ${r} 分钟`:`${h} 小时`;
}

/* 合并互相重叠的暂停窗口，避免重复扣减 */
function mergeWindows(windows:PauseWindow[]):PauseWindow[]{
 const sorted=[...windows].sort((a,b)=>toMs(a.start)-toMs(b.start));
 const merged:PauseWindow[]=[];
 for(const w of sorted){
  const last=merged[merged.length-1];
  if(last&&toMs(w.start)<=toMs(last.end)){
   if(toMs(w.end)>toMs(last.end))last.end=w.end;
  }else merged.push({...w});
 }
 return merged;
}

/* 工作分钟：from→to 的墙钟分钟扣除暂停日历窗口，暂停时段不计时 */
export function workMinutesBetween(from:string,to:string,pauses:PauseWindow[]):number{
 const start=toMs(from),end=toMs(to);
 if(end<=start)return 0;
 let paused=0;
 for(const p of mergeWindows(pauses)){
  const s=Math.max(start,toMs(p.start)),e=Math.min(end,toMs(p.end));
  if(e>s)paused+=e-s;
 }
 return Math.round((end-start-paused)/MINUTE);
}

/* 剩余时限：进入节点起按工作分钟消耗，交接不改变 enteredAt，因此交接后剩余时限连续 */
export function remainingMinutes(limitMinutes:number,enteredAt:string,pauses:PauseWindow[],now:string=NOW):number{
 return limitMinutes-workMinutesBetween(enteredAt,now,pauses);
}

const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));

/* 发布时冻结时限快照：值班组、班次、时限与暂停窗口全部拷贝固化，之后改配置不影响已冻结快照 */
export function freezeSnapshot(nodes:FlowNode[],groups:DutyGroup[],calendars:PauseCalendar[],version:number,frozenAt:string):SlaSnapshot{
 return {version,frozenAt,nodes:nodes.filter(n=>n.type==='approval').map(n=>{
  const g=groups.find(x=>x.id===n.data.config.dutyGroupId);
  const cal=calendars.find(x=>x.id===n.data.config.pauseCalendarId);
  return {nodeId:n.id,nodeLabel:n.data.label,
   dutyGroupId:g?.id||'',dutyGroupName:g?.name||'未设置',shifts:clone(g?.shifts||[]),
   limitMinutes:Number(n.data.config.limitMinutes),
   pauseCalendarId:cal?.id||'',pauseCalendarName:cal?.name||'无暂停日历',pauseWindows:clone(cal?.windows||[])};
 })};
}
