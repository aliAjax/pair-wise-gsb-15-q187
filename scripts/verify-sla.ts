import {dutyGroups,pauseCalendars} from '../mock-data/duty';
import {deadlineOf,elapsedWorkingMinutes,formatWorkMinutes,remainingFor,shiftConflicts,workSegments,describeConflict} from '../src/lib/sla';
import type {SlaSnapshot} from '../src/types';

const fin=dutyGroups.find(g=>g.id==='grp-finance')!;
const proc=dutyGroups.find(g=>g.id==='grp-procure')!;
const dual=dutyGroups.find(g=>g.id==='grp-dual')!;

let pass=0,fail=0;
const check=(name:string,cond:boolean,extra='')=>{if(cond){pass++}else{fail++;console.error('FAIL:',name,extra)}};

// 1. 班次重叠检测
const conf=shiftConflicts(dual);
check('综合组检测到1组重叠',conf.length===1,JSON.stringify(conf));
check('冲突描述包含两个班次',describeConflict(conf[0]).includes('应急早班')&&describeConflict(conf[0]).includes('应急连班'));
check('财务白班/晚班首尾相接不算重叠',shiftConflicts(fin).length===0);

// 2. 工作分钟：周一 10:00 → 周一 12:00 = 120 分钟
const mon10=new Date(2026,8,21,10,0); // 2026-09-21 周一
const mon12=new Date(2026,8,21,12,0);
check('连续值班2小时=120工作分钟',elapsedWorkingMinutes(mon10.toISOString(),mon12,fin)===120);

// 3. 跨班次：周一 17:00 → 周二 00:00 → 白班1h + 晚班5h = 360
const mon17=new Date(2026,8,21,17,0);
const tue0=new Date(2026,8,22,0,0);
check('跨班次=360分钟',elapsedWorkingMinutes(mon17.toISOString(),tue0,fin)===360,String(elapsedWorkingMinutes(mon17.toISOString(),tue0,fin)));

// 4. 周末不计时：周五 17:00 → 周一 10:00 → 周五1h + 周一1h = 120（晚班只到周四）
const fri17=new Date(2026,8,25,17,0);
const mon10b=new Date(2026,8,28,10,0);
check('周末不计时=120分钟',elapsedWorkingMinutes(fri17.toISOString(),mon10b,fin)===120,String(elapsedWorkingMinutes(fri17.toISOString(),mon10b,fin)));

// 5. 暂停日历时段不计时：2026-09-22 12:00-13:30 维护
const tue11=new Date(2026,8,22,11,0);
const tue15=new Date(2026,8,22,15,0);
const cal=pauseCalendars[0];
// 11→15 墙上4h，扣 12:00-13:30 = 150 工作分钟
check('暂停时段不计时=150',elapsedWorkingMinutes(tue11.toISOString(),tue15,fin,cal.intervals)===150,String(elapsedWorkingMinutes(tue11.toISOString(),tue15,fin,cal.intervals)));

// 6. 全天暂停：10-01、10-02 国庆（注意 JS 月份从 0 起）
const sep30=new Date(2026,8,30,17,0);
const oct2noon=new Date(2026,9,2,12,0);
// 9/30(周三) 17-18白班=60 + 18-23晚班=300；10/1、10/2 全天暂停 → 360
check('全天暂停日历不计时=360',elapsedWorkingMinutes(sep30.toISOString(),oct2noon,fin,cal.intervals)===360,String(elapsedWorkingMinutes(sep30.toISOString(),oct2noon,fin,cal.intervals)));

// 7. deadlineOf：240 工作分钟从周一 10:00 起 = 周一 14:00（无暂停）
const dl=deadlineOf(mon10,240,fin,[]);
check('240分钟时限=当天14:00',dl.getHours()===14&&dl.getMinutes()===0,dl.toISOString());

// 8. 跨过暂停窗口的时限：周二 11:00 起 180 工作分钟
// 11→12 =60, 暂停90, 13:30→15:30 =120 → 15:30
const dl2=deadlineOf(new Date(2026,8,22,11,0),180,fin,cal.intervals);
check('跨过暂停窗口时限=15:30',dl2.getHours()===15&&dl2.getMinutes()===30,dl2.toISOString());

// 9. 快照计时与剩余
const snap:SlaSnapshot={workflowId:'wf-1',workflowName:'差旅费用审批',workflowVersion:2,nodeId:'approval',nodeLabel:'直属主管审批',dutyGroupId:fin.id,dutyGroupName:fin.name,shifts:JSON.parse(JSON.stringify(fin.shifts)),slaMinutes:240,pauseCalendarId:cal.id,pauseCalendarName:cal.name,pauses:JSON.parse(JSON.stringify(cal.intervals)),frozenAt:'2026-07-01'};
// 起点周一09:00，现在周一12:00 → 已用180，剩余60
const r=remainingFor(snap,new Date(2026,8,21,9,0).toISOString(),mon12);
check('剩余=60 已用=180',r.remaining===60&&r.used===180,JSON.stringify(r));

// 10. 交接后剩余连续：交接动作不改 startedAt 与 snapshot → 同刻计算结果不变
const r2=remainingFor(snap,new Date(2026,8,21,9,0).toISOString(),mon12);
check('交接后剩余连续(同一快照同刻一致)',r.remaining===r2.remaining);

// 11. 采购组周六值守
const sat12=new Date(2026,8,26,12,0);
const sat14=new Date(2026,8,26,14,0);
check('采购周六值守计时=120',elapsedWorkingMinutes(sat12.toISOString(),sat14,proc,[])===120);
check('财务周六不值班=0',elapsedWorkingMinutes(sat12.toISOString(),sat14,fin,[])===0);

// 12. formatWorkMinutes
check('格式化',formatWorkMinutes(90)==='1 小时 30 分'&&formatWorkMinutes(45)==='45 分钟'&&formatWorkMinutes(120)==='2 小时');

// 13. workSegments 跨多天拼接：周一17点含晚班(到23点)+周二1h = 60+300+60 = 420
const segs=workSegments(new Date(2026,8,21,17,0),new Date(2026,8,22,10,0),fin,[]);
const total=Math.round(segs.reduce((a,[s,e])=>a+e-s,0)/60000);
check('跨天段总时长=420',total===420,String(total));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
