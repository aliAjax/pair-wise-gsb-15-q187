import type {DutyGroup,PauseCalendar,SlaSnapshot,Workflow} from '../src/types';

/* 值班组与班次。IT 值班组的早班/中班在 12:00–16:00 重叠，用于演示发布整批拒绝 */
export const dutyGroups:DutyGroup[]=[
 {id:'dg-finance',name:'财务值班组',shifts:[{id:'f-am',label:'早班',start:'08:00',end:'16:00'},{id:'f-pm',label:'晚班',start:'16:00',end:'24:00'}]},
 {id:'dg-hr',name:'人事值班组',shifts:[{id:'h-am',label:'早班',start:'09:00',end:'17:00'},{id:'h-pm',label:'晚班',start:'17:00',end:'23:00'}]},
 {id:'dg-it',name:'IT 值班组',shifts:[{id:'it-am',label:'早班',start:'08:00',end:'16:00'},{id:'it-mid',label:'中班',start:'12:00',end:'20:00'}]},
 {id:'dg-legal',name:'法务值班组',shifts:[{id:'l-day',label:'日班',start:'09:00',end:'18:00'}]},
];

/* 暂停日历：窗口内不计工作分钟 */
export const pauseCalendars:PauseCalendar[]=[
 {id:'pc-none',name:'无暂停日历',windows:[]},
 {id:'pc-lunch',name:'午间维护暂停',windows:[{start:'2026-07-11 12:00',end:'2026-07-11 13:00',label:'系统午间维护'}]},
 {id:'pc-night',name:'夜间批量窗口',windows:[{start:'2026-07-10 22:00',end:'2026-07-11 06:00',label:'夜间批量作业'},{start:'2026-07-11 12:00',end:'2026-07-11 13:00',label:'系统午间维护'}]},
];

/* 为已有流程补生成历史时限快照：旧版本时限放宽 120 分钟，便于观察“运行中实例沿用旧快照” */
export function seedSnapshots(w:Workflow):SlaSnapshot[]{
 const out:SlaSnapshot[]=[];
 for(let v=1;v<=w.version;v++){
  const frozenAt=w.versions.find(x=>x.version===v)?.createdAt||w.updatedAt;
  out.push({version:v,frozenAt,nodes:w.nodes.filter(n=>n.type==='approval'&&n.data.config.approverSource).map(n=>{
   const c=n.data.config;
   const g=dutyGroups.find(x=>x.id===c.dutyGroupId)||dutyGroups[0];
   const cal=pauseCalendars.find(x=>x.id===c.pauseCalendarId)||pauseCalendars[1];
   const limit=Number(c.limitMinutes)>0?Number(c.limitMinutes):480;
   return {nodeId:n.id,nodeLabel:n.data.label,dutyGroupId:g.id,dutyGroupName:g.name,shifts:g.shifts,
    limitMinutes:v<w.version?limit+120:limit,
    pauseCalendarId:cal.id,pauseCalendarName:cal.name,pauseWindows:cal.windows};
  })});
 }
 return out;
}
