import type {DutyGroup,DutyShift,PauseInterval,SlaSnapshot} from '../types';

/* —— 纯函数的工作分钟引擎：不依赖 React、store、localStorage，所有时间均为本地时区 —— */

export const WEEK_NAMES=['周日','周一','周二','周三','周四','周五','周六'];

export const pad2=(n:number)=>String(n).padStart(2,'0');
export const toHM=(m:number)=>`${pad2(Math.floor(m/60))}:${pad2(m%60)}`;
export const hmToMin=(hm:string)=>{const[h,m]=hm.split(':').map(Number);return h*60+(m||0)};
export const dayKey=(d:Date)=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
export const dateAt=(key:string,minute:number)=>new Date(`${key}T${toHM(minute)}:00`);
export const isoNow=()=>new Date().toISOString();

/** 暂停日历条目 → [startMs,endMs)，全天条目覆盖该自然日 */
export function pauseRanges(pauses:PauseInterval[]):[number,number][] {
 return pauses.map(p=>{
  if(p.date) return [dateAt(p.date,0).getTime(),dateAt(p.date,24*60).getTime()] as [number,number];
  if(p.start&&p.end) return [new Date(p.start).getTime(),new Date(p.end).getTime()] as [number,number];
  return null;
 }).filter((x):x is [number,number]=>x!==null);
}
/** 从 [s,e) 中扣除暂停区间后剩余的毫秒段 */
function cut(segments:[number,number][],cuts:[number,number][]):[number,number][] {
 for(const[cs,ce]of cuts){
  const next:[number,number][]=[];
  for(const[s,e]of segments){
   if(ce<=s||cs>=e) next.push([s,e]);
   else {if(cs>s)next.push([s,cs]); if(ce<e)next.push([ce,e]);}
  }
  segments=next;
 }
 return segments;
}
/** 某自然日内该值班组的班次时段（分钟区间） */
export function shiftMinutesOnDay(group:Pick<DutyGroup,'shifts'>,weekday:number):[number,number][]{
 return group.shifts.filter(sh=>sh.days.includes(weekday)).map(sh=>[hmToMin(sh.start),hmToMin(sh.end)] as [number,number]).filter(([s,e])=>e>s);
}
/** 取 [from,to) 内所有「值班且不在暂停日历中」的毫秒时段 */
export function workSegments(from:Date,to:Date,group:DutyGroup,pauses:PauseInterval[]=[]):[number,number][] {
 const ranges=pauseRanges(pauses); let out:[number,number][]=[];
 const cursor=new Date(from.getFullYear(),from.getMonth(),from.getDate());
 for(let guard=0;guard<400&&cursor.getTime()<=to.getTime();guard++,cursor.setDate(cursor.getDate()+1)){
  const key=dayKey(cursor);
  for(const[sm,em]of shiftMinutesOnDay(group,cursor.getDay())){
   const seg:[number,number]=[Math.max(dateAt(key,sm).getTime(),from.getTime()),Math.min(dateAt(key,em).getTime(),to.getTime())];
   if(seg[1]>seg[0]) out.push(seg);
  }
 }
 return cut(out,ranges);
}
/** 实例累计已经消耗的工作分钟（交接不影响计时） */
export function elapsedWorkingMinutes(startedAt:string,now:Date,group:DutyGroup,pauses:PauseInterval[]=[]):number {
 const start=new Date(startedAt); if(now.getTime()<=start.getTime()) return 0;
 return Math.round(workSegments(start,now,group,pauses).reduce((a,[s,e])=>a+(e-s),0)/60000);
}
/** 从 from 开始攒够 needMinutes 个工作分钟后的时限点（暂停日历内的时间不计时） */
export function deadlineOf(from:Date,needMinutes:number,group:DutyGroup,pauses:PauseInterval[]=[]):Date {
 const ranges=pauseRanges(pauses); let need=needMinutes*60000;
 const cursor=new Date(from.getFullYear(),from.getMonth(),from.getDate());
 for(let guard=0;guard<400;guard++,cursor.setDate(cursor.getDate()+1)){
  const key=dayKey(cursor);
  const daySegs=cut(shiftMinutesOnDay(group,cursor.getDay()).map(([sm,em])=>[dateAt(key,sm).getTime(),dateAt(key,em).getTime()] as [number,number]),ranges);
  for(let[s,e]of daySegs){
   if(e<=from.getTime())continue; s=Math.max(s,from.getTime());
   const span=e-s; if(span<=0)continue;
   if(span>=need) return new Date(s+need); need-=span;
  }
 }
 return new Date(from.getTime()+needMinutes*60000);
}
export interface Remaining {used:number;limit:number;remaining:number;overdue:number;onShift:boolean;paused:boolean}
/** 按快照计算剩余工作分钟 —— 运行中实例始终基于自己那份冻结快照 */
export function remainingFor(snapshot:SlaSnapshot,startedAt:string,now:Date):Remaining {
 const group:DutyGroup={id:snapshot.dutyGroupId,name:snapshot.dutyGroupName,shifts:snapshot.shifts};
 const used=elapsedWorkingMinutes(startedAt,now,group,snapshot.pauses);
 const remaining=Math.max(0,snapshot.slaMinutes-used);
 return {used,limit:snapshot.slaMinutes,remaining,overdue:Math.max(0,used-snapshot.slaMinutes),onShift:currentShift(group,now)!==null,paused:isPaused(snapshot.pauses,now)};
}
/** 当前时刻所在班次 */
export function currentShift(group:DutyGroup,now:Date):DutyShift|null {
 const mins=now.getHours()*60+now.getMinutes();
 return group.shifts.find(sh=>sh.days.includes(now.getDay())&&hmToMin(sh.start)<=mins&&mins<hmToMin(sh.end))||null;
}
/** 下一次交接点（班次开始或结束中离 now 最近的一个时刻） */
export function nextHandover(group:DutyGroup,now:Date):{at:Date;shift:DutyShift;kind:'交班'|'接班'}|null {
 let best:{at:Date;shift:DutyShift;kind:'交班'|'接班'}|null=null;
 for(let d=0;d<14;d++){
  const cur=new Date(now.getFullYear(),now.getMonth(),now.getDate()+d);
  for(const sh of group.shifts){
   if(!sh.days.includes(cur.getDay()))continue;
   for(const[m,kind]of[[hmToMin(sh.start),'接班'],[hmToMin(sh.end),'交班']]as[number,'接班'|'交班'][]){
    const at=dateAt(dayKey(cur),m);
    if(at.getTime()>now.getTime()&&(!best||at.getTime()<best.at.getTime())) best={at,shift:sh,kind};
   }
  }
 }
 return best;
}
export function isPaused(pauses:PauseInterval[],now:Date):boolean {const t=now.getTime();return pauseRanges(pauses).some(([s,e])=>s<=t&&t<e)}
/** 同组班次重叠检测：按星期与分钟区间两两求交 */
export interface ShiftConflict {a:DutyShift;b:DutyShift;days:number[]}
export function shiftConflicts(group:DutyGroup):ShiftConflict[] {
 const out:ShiftConflict[]=[];const{shifts}=group;
 for(let i=0;i<shifts.length;i++)for(let j=i+1;j<shifts.length;j++){
  const a=shifts[i],b=shifts[j];
  const days=a.days.filter(d=>b.days.includes(d));
  const overlap=days.length>0&&hmToMin(a.start)<hmToMin(b.end)&&hmToMin(b.start)<hmToMin(a.end);
  if(overlap) out.push({a,b,days});
 }
 return out;
}
export function describeConflict(c:ShiftConflict):string {
 return `${c.a.label}（${c.a.start}-${c.a.end}）与 ${c.b.label}（${c.b.start}-${c.b.end}）在 ${c.days.map(d=>WEEK_NAMES[d]).join('、')} 重叠`;
}
export function groupFromSnapshot(s:SlaSnapshot):DutyGroup {return {id:s.dutyGroupId,name:s.dutyGroupName,shifts:s.shifts}}

/** 格式化工作分钟 */
export function formatWorkMinutes(mins:number):string {
 if(mins<=0)return '0 分钟';
 const h=Math.floor(mins/60),m=mins%60;
 if(h===0)return `${m} 分钟`;
 return m?`${h} 小时 ${m} 分`:`${h} 小时`;
}
export function formatClock(iso:string,now:Date=new Date()):string {
 const d=new Date(iso);
 const same=dayKey(d)===dayKey(now);
 const hm=`${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
 return same?`今天 ${hm}`:`${d.getMonth()+1}月${d.getDate()}日 ${hm}`;
}
