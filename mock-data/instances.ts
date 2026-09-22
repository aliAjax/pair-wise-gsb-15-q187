import type {Instance,SlaSnapshot} from '../src/types';
import {domains,users} from './catalog';
import {dutyGroups,pauseCalendars} from './duty';
import {pad2,shiftMinutesOnDay} from '../src/lib/sla';

/** 生成一个起点，使从起点到现在经过的「值班工作分钟」约等于 minutesBack；会避开暂停日历 */
function onShiftStart(minutesBack:number,dutyGroupId:string,calId?:string):string {
 const now=new Date();
 const g=dutyGroups.find(x=>x.id===dutyGroupId)!;
 const ranges=pauseCalendars.find(c=>c.id===calId)?.intervals.map(p=>p.date
  ?[new Date(`${p.date}T00:00:00`).getTime(),new Date(`${p.date}T23:59:59`).getTime()+1000] as [number,number]
  :[new Date(p.start!).getTime(),new Date(p.end!).getTime()] as [number,number])||[];
 const work=(s:number,e:number)=>{let len=e-s;for(const[cs,ce]of ranges){const a=Math.max(s,cs),b=Math.min(e,ce);if(b>a)len-=b-a}return len};
 let need=minutesBack*60000;
 for(let d=0;d<10;d++){
  const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()-d);
  const segs=shiftMinutesOnDay(g,day.getDay());
  for(let k=segs.length-1;k>=0;k--){
   const[sm,em]=segs[k];
   const s=new Date(day);s.setHours(Math.floor(sm/60),sm%60,0,0);
   const e=new Date(day);e.setHours(Math.floor(em/60),em%60,0,0);
   const end=Math.min(e.getTime(),now.getTime());
   const span=work(s.getTime(),end);
   if(span<=0)continue;
   if(span>=need){
    /* 在该值班段内从后向前再扣一次暂停 */
    let target=end,t=need;
    for(let dd=1;dd<2000&&t>0;dd++){target-=60000;if(work(target,target+60000)>=60000)t-=60000}
    return new Date(target).toISOString();
   }
   need-=span;
  }
 }
 return new Date(now.getTime()-minutesBack*60000).toISOString();
}
const makeSnapshot=(workflowId:string,workflowName:string,nodeLabel:string,slaMinutes:number,dutyGroupId:string,calId?:string):SlaSnapshot=>{
 const g=dutyGroups.find(x=>x.id===dutyGroupId)!;const c=pauseCalendars.find(x=>x.id===calId);
 return {workflowId,workflowName,workflowVersion:2,nodeId:'approval',nodeLabel,dutyGroupId:g.id,dutyGroupName:g.name,shifts:JSON.parse(JSON.stringify(g.shifts)),slaMinutes,pauseCalendarId:c?.id,pauseCalendarName:c?.name,pauses:c?JSON.parse(JSON.stringify(c.intervals)):[],frozenAt:'2026-07-01 16:20'};
};
const fmtSubmitted=(iso:string)=>{const d=new Date(iso);return `${d.getMonth()+1}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`};

const liveSpecs:[string,string,string,number,string,string|undefined][]=[
 /* 实例编号后缀, 流程, 申请人, 已用分钟, 值班组, 暂停日历 */
 ['LIVE-1','wf-1','林秋',75,'grp-finance','cal-public'],
 ['LIVE-2','wf-2','陈默',200,'grp-procure','cal-public'],
 ['LIVE-3','wf-8','周礼',400,'grp-legal','cal-public'],
];
const liveInstances:Instance[]=liveSpecs.map(([suffix,wfId,applicant,back,gid,calId],idx)=>{
 const wfName=['差旅费用审批','采购合同审批','员工入职流程','IT 服务请求','用印申请','供应商准入','年度预算调整','客户退款审批'][Number(wfId.slice(3))-1];
 const startedAt=onShiftStart(back,gid,calId);
 const snapshot=makeSnapshot(wfId,wfName,'直属主管审批',snapshotLimit(wfId),gid,calId);
 return {id:`INS-2026-${suffix}`,workflowId:wfId,applicant,domain:domains[Number(wfId.slice(3))-1],currentNode:'直属主管审批',status:'running',submittedAt:fmtSubmitted(startedAt),duration:'进行中',risk:idx===2?'high':'medium',
  timeline:[{title:'提交申请',time:'—',status:'completed'},{title:'直属主管审批',time:'—',status:'current'},{title:'金额判断',time:'—',status:'pending'}],
  sla:{snapshot,startedAt,handovers:[]}};
});
function snapshotLimit(wfId:string){return wfId==='wf-1'?360:wfId==='wf-2'?480:420}

export const instances:Instance[]=[...Array.from({length:80},(_,i):Instance=>{const status:Instance['status']=i<12?'abnormal':i<22?'timeout':i<50?'running':'completed';const risk:Instance['risk']=i<22?'high':i<45?'medium':'low'; return {id:`INS-2026-${String(i+1).padStart(4,'0')}`,workflowId:`wf-${i%12+1}`,applicant:users[i%8],domain:domains[i%5],currentNode:i%3===0?'直属主管审批':'金额判断',status,submittedAt:`2026-07-${String(10-i%9).padStart(2,'0')} ${String(8+i%10).padStart(2,'0')}:10`,duration:status==='timeout'?`${28+i}h`:`${i%9+1}h ${i%6*10}m`,risk,timeline:[{title:'提交申请',time:'09:10',status:'completed'},{title:'直属主管审批',time:'10:24',status:i%3===0?'current':'completed'},{title:'金额判断',time:'11:05',status:i%3!==0?'current':'pending'}]};}),...liveInstances];
