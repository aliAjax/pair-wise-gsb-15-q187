import type {Instance,InstanceSla} from '../src/types';
import {domains,users} from './catalog';
import {pauseCalendars} from './duty';
import {workMinutesBetween} from '../src/domain/sla';
const lunch=pauseCalendars.find(c=>c.id==='pc-lunch')!.windows;
/* 各流程审批节点快照中的值班组（wf-1 快照回退到财务值班组） */
const dutyOf:Record<string,{groupId:string;shiftId:string}>={'wf-1':{groupId:'dg-finance',shiftId:'f-am'},'wf-4':{groupId:'dg-it',shiftId:'it-am'},'wf-7':{groupId:'dg-hr',shiftId:'h-am'},'wf-10':{groupId:'dg-finance',shiftId:'f-am'}};
const slaFor=(i:number,status:Instance['status']):InstanceSla|undefined=>{
 if(i%3!==0||(status!=='running'&&status!=='timeout'))return undefined;
 const wf='wf-'+(i%12+1);
 const enteredAt=status==='timeout'?`2026-07-10 ${String(8+i%3).padStart(2,'0')}:10`:`2026-07-11 ${String(10+i%5).padStart(2,'0')}:${i%2?'10':'40'}`;
 const duty={...(dutyOf[wf]||dutyOf['wf-1'])};
 const handovers:InstanceSla['handovers']=[];
 if(status==='running'&&wf==='wf-1'){ /* 已交接过一次：剩余时限按进入时间连续计算，不随交接重置 */
  handovers.push({at:'2026-07-11 15:00',from:'财务值班组·早班',to:'财务值班组·晚班',remainingMinutes:600-workMinutesBetween(enteredAt,'2026-07-11 15:00',lunch),operator:'周礼'});
  duty.shiftId='f-pm';
 }
 return {nodeId:'approval',version:1,enteredAt,duty,handovers};
};
export const instances:Instance[]=Array.from({length:80},(_,i)=>{const status:Instance['status']=i<12?'abnormal':i<22?'timeout':i<50?'running':'completed'; return {id:`INS-2026-${String(i+1).padStart(4,'0')}`,workflowId:`wf-${i%12+1}`,applicant:users[i%8],domain:domains[i%5],currentNode:i%3===0?'直属主管审批':'金额判断',status,submittedAt:`2026-07-${String(10-i%9).padStart(2,'0')} ${String(8+i%10).padStart(2,'0')}:10`,duration:status==='timeout'?`${28+i}h`:`${i%9+1}h ${i%6*10}m`,risk:i<22?'high':i<45?'medium':'low',timeline:[{title:'提交申请',time:'09:10',status:'completed'},{title:'直属主管审批',time:'10:24',status:i%3===0?'current':'completed'},{title:'金额判断',time:'11:05',status:i%3!==0?'current':'pending'}],sla:slaFor(i,status)};});
