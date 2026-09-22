import type {DutyGroup,PauseCalendar} from '../src/types';

export const dutyGroups:DutyGroup[]=[
 {id:'grp-finance',name:'财务审批组',shifts:[
  {id:'sh-fin-day',label:'财务白班',days:[1,2,3,4,5],start:'09:00',end:'18:00'},
  {id:'sh-fin-night',label:'财务晚班',days:[1,2,3,4],start:'18:00',end:'23:00'},
 ]},
 {id:'grp-procure',name:'采购审批组',shifts:[
  {id:'sh-prc-day',label:'采购白班',days:[1,2,3,4,5],start:'09:30',end:'18:00'},
  {id:'sh-prc-sat',label:'周六值守',days:[6],start:'10:00',end:'16:00'},
 ]},
 {id:'grp-legal',name:'法务值班组',shifts:[
  {id:'sh-leg-day',label:'法务白班',days:[1,2,3,4,5],start:'09:00',end:'17:30'},
 ]},
 {id:'grp-dual',name:'综合应急值班组',shifts:[
  {id:'sh-dual-a',label:'应急早班',days:[1,2,3,4,5],start:'09:00',end:'14:00'},
  {id:'sh-dual-b',label:'应急连班',days:[3],start:'10:00',end:'12:00'},
 ]},
];

export const pauseCalendars:PauseCalendar[]=[
 {id:'cal-public',name:'公司公共暂停日历',intervals:[
  {label:'国庆节全天暂停',date:'2026-10-01'},
  {label:'国庆节全天暂停',date:'2026-10-02'},
  {label:'系统月结维护',start:'2026-09-22T12:00:00',end:'2026-09-22T13:30:00'},
 ]},
 {id:'cal-finance',name:'财务月结日历',intervals:[
  {label:'月结封账全天暂停',date:'2026-09-30'},
  {label:'月底对账',start:'2026-09-29T15:00:00',end:'2026-09-29T18:00:00'},
 ]},
];
