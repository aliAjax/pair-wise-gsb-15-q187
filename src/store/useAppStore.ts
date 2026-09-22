import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import {workflows as seed} from '../../mock-data/workflows';
import {instances as seedInstances} from '../../mock-data/instances';
import {dutyGroups as seedGroups,pauseCalendars as seedCalendars} from '../../mock-data/duty';
import {currentShift,isoNow,nextHandover} from '../lib/sla';
import {freezeSnapshots,hasErrors,validateWorkflow} from '../lib/validation';
import type {DutyGroup,FlowEdge,FlowNode,HandoverRecord,Instance,PauseCalendar,SlaSnapshot,ValidationIssue,Workflow} from '../types';

const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
const PUBLISHED_AT='2026-09-22 15:30';

interface State{
 workflows:Workflow[];instances:Instance[];dutyGroups:DutyGroup[];pauseCalendars:PauseCalendar[];
 currentId:string;selectedNodeId:string|null;issues:ValidationIssue[];toast:string;
 setCurrent:(id:string)=>void;selectNode:(id:string|null)=>void;
 updateNodes:(nodes:FlowNode[])=>void;updateEdges:(edges:FlowEdge[])=>void;
 updateConfig:(id:string,config:Record<string,any>)=>void;
 runValidation:()=>ValidationIssue[];save:()=>void;
 publish:()=>boolean;create:()=>string;copy:(id:string)=>void;archive:(id:string)=>void;restore:(v:number)=>void;
 startInstance:(workflowId:string,applicant:string)=>string| null;
 handover:(instanceId:string)=>void;
 clearToast:()=>void;
}
const ctxOf=(s:State)=>({groups:s.dutyGroups,calendars:s.pauseCalendars});

export const useAppStore=create<State>()(persist((set,get)=>({
 workflows:clone(seed),instances:clone(seedInstances),dutyGroups:clone(seedGroups),pauseCalendars:clone(seedCalendars),
 currentId:'wf-1',selectedNodeId:null,issues:[],toast:'',
 setCurrent:id=>set({currentId:id,selectedNodeId:null,issues:[]}),
 selectNode:id=>set({selectedNodeId:id}),
 updateNodes:nodes=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes}:w)})),
 updateEdges:edges=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,edges}:w)})),
 updateConfig:(id,config)=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes:w.nodes.map(n=>n.id===id?{...n,data:{...n.data,config:{...n.data.config,...config},state:'configuring'}}:n)}:w)})),
 runValidation:()=>{
  const s=get(),w=s.workflows.find(x=>x.id===s.currentId)!;
  const issues=validateWorkflow(w,ctxOf(s));
  const errNodes=new Set(issues.filter(i=>i.level==='error').map(i=>i.nodeId));
  set({issues,workflows:s.workflows.map(x=>x.id===w.id?{...x,nodes:x.nodes.map(n=>({...n,data:{...n.data,state:errNodes.has(n.id)?'invalid':'valid'}}))}:x),
   toast:issues.some(i=>i.level==='error')?`发现 ${issues.filter(i=>i.level==='error').length} 个阻断问题，无法发布`:'校验通过'});
  return issues;
 },
 save:()=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,status:'draft',updatedAt:PUBLISHED_AT}:w),toast:'草稿已保存'})),
 publish:()=>{
  const s=get(),w=s.workflows.find(x=>x.id===s.currentId)!;
  const issues=validateWorkflow(w,ctxOf(s));
  const errNodes=new Set(issues.filter(i=>i.level==='error').map(i=>i.nodeId));
  if(hasErrors(issues)){
   /* 整批拒绝：不产生新版本、不冻结快照、保持草稿 */
   set({issues,workflows:s.workflows.map(x=>x.id===w.id?{...x,status:'draft',nodes:x.nodes.map(n=>({...n,data:{...n.data,state:errNodes.has(n.id)?'invalid':'valid'}}))}:x),
    toast:`发布被拒绝：${issues.filter(i=>i.level==='error').length} 个阻断问题`});
   return false;
  }
  const version=Math.max(w.version,...w.versions.map(v=>v.version))+1;
  const snapshots=freezeSnapshots(w,ctxOf(s),version);
  set(st=>({issues:[],workflows:st.workflows.map(x=>x.id===w.id?{
   ...x,status:'published',version,publishedAt:PUBLISHED_AT,updatedAt:PUBLISHED_AT,
   nodes:x.nodes.map(n=>({...n,data:{...n.data,state:'valid'}})),
   versions:[...x.versions,{version,createdAt:PUBLISHED_AT,note:'发布最新审批服务时限配置',nodes:clone(x.nodes),edges:clone(x.edges),snapshots:clone(snapshots)}],
  }:x),toast:'流程发布成功，服务时限快照已冻结'}));
  return true;
 },
 create:()=>{const id='wf-'+Date.now();set(s=>({workflows:[{id,name:'未命名流程',domain:'财务',status:'draft',version:0,editor:'林秋',updatedAt:PUBLISHED_AT,abnormalCount:0,nodes:[],edges:[],versions:[]},...s.workflows],currentId:id}));return id},
 copy:id=>set(s=>{const w=s.workflows.find(x=>x.id===id)!;return{workflows:[{...clone(w),id:'wf-'+Date.now(),name:w.name+'（副本）',status:'draft'},...s.workflows]}}),
 archive:id=>set(s=>({workflows:s.workflows.map(w=>w.id===id?{...w,status:'archived'}:w)})),
 restore:v=>set(s=>({workflows:s.workflows.map(w=>{if(w.id!==s.currentId)return w;const old=w.versions.find(x=>x.version===v)!;return{...w,status:'draft',nodes:clone(old.nodes),edges:clone(old.edges)}}),toast:`已恢复 v${v} 为草稿`})),
 startInstance:(workflowId,applicant)=>{
  const s=get(),w=s.workflows.find(x=>x.id===workflowId);
  if(!w||w.status!=='published'){set({toast:'仅已发布流程可以发起实例'});return null}
  const ver=[...w.versions].reverse().find(v=>v.snapshots.length);
  const snapshot=ver?.snapshots.find(x=>x.nodeId==='approval');
  if(!snapshot){set({toast:'该流程没有可用的时限快照'});return null}
  const id='INS-2026-NEW-'+Date.now().toString().slice(-6);
  const startedAt=isoNow();
  const inst:Instance={id,workflowId,applicant,domain:w.domain,currentNode:snapshot.nodeLabel,status:'running',submittedAt:'刚刚',duration:'进行中',risk:'low',
   timeline:[{title:'提交申请',time:'刚刚',status:'completed'},{title:snapshot.nodeLabel,time:'刚刚',status:'current'},{title:'后续节点',time:'—',status:'pending'}],
   sla:{snapshot:clone(snapshot),startedAt,handovers:[]}};
  set(st=>({instances:[inst,...st.instances],toast:`实例 ${id} 已发起，使用 v${snapshot.workflowVersion} 时限快照`}));
  return id;
 },
 handover:instanceId=>set(st=>{
  const ins=st.instances.find(i=>i.id===instanceId);
  if(!ins?.sla)return {};
  const g={id:ins.sla.snapshot.dutyGroupId,name:ins.sla.snapshot.dutyGroupName,shifts:ins.sla.snapshot.shifts};
  const now=new Date();
  const cur=currentShift(g,now),next=nextHandover(g,now);
  const record:HandoverRecord={at:isoNow(),fromShift:cur?.label||(next?.kind==='接班'?'班次间隙':next?.shift.label||'当前班次'),toShift:next?`${next.shift.label}（${next.kind}）`:'待排班',note:'交接后剩余时限连续，不重新计时'};
  return {instances:st.instances.map(i=>i.id===instanceId?{...i,sla:{...i.sla!,handovers:[...i.sla!.handovers,record]}}:i),toast:`已完成交接：${record.fromShift} → ${record.toShift}，剩余工作分钟连续`};
 }),
 clearToast:()=>set({toast:''}),
}),{name:'flowdesk-sla-v1',partialize:s=>({workflows:s.workflows,instances:s.instances,dutyGroups:s.dutyGroups,pauseCalendars:s.pauseCalendars})}));
