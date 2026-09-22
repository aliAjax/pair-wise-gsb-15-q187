import type {DutyGroup,PauseCalendar,SlaSnapshot,ValidationIssue,Workflow,FlowNode} from '../types';
import {describeConflict,shiftConflicts} from './sla';

export interface SlaContext {groups:DutyGroup[];calendars:PauseCalendar[]}

/* 结构校验（原有规则，保持不变） */
export function structuralIssues(w:Workflow):ValidationIssue[] {
 const issues:ValidationIssue[]=[];
 if(!w.nodes.some(n=>n.type==='end')) issues.push({nodeId:w.nodes[0]?.id||'flow',level:'error',message:'流程缺少结束节点'});
 const linked=new Set(w.edges.flatMap(e=>[e.source,e.target]));
 w.nodes.filter(n=>n.type!=='start'&&n.type!=='end'&&!linked.has(n.id)).forEach(n=>issues.push({nodeId:n.id,nodeLabel:n.data.label,level:'error',message:'必经节点不能孤立'}));
 w.nodes.forEach(n=>{
  if(n.type==='condition'&&!n.data.config.ruleType) issues.push({nodeId:n.id,nodeLabel:n.data.label,level:'error',message:'条件分支规则未配置'});
  if(n.type==='approval'&&!n.data.config.approverSource) issues.push({nodeId:n.id,nodeLabel:n.data.label,level:'error',message:'审批人不能为空'});
 });
 return issues;
}

/* 服务时限 / 值班校验：缺值班组、时限非正数、同组班次重叠 —— 任一命中则整批拒绝发布 */
export function slaIssues(w:Workflow,ctx:SlaContext):ValidationIssue[] {
 const issues:ValidationIssue[]=[];
 const usedGroups=new Map<string,FlowNode[]>();
 w.nodes.filter(n=>n.type==='approval').forEach(node=>{
  const gid=node.data.config.dutyGroupId;
  const limit=Number(node.data.config.slaMinutes);
  if(!gid) issues.push({nodeId:node.id,nodeLabel:node.data.label,level:'error',message:`节点「${node.data.label}」未配置值班组`});
  if(!Number.isFinite(limit)||limit<=0) issues.push({nodeId:node.id,nodeLabel:node.data.label,level:'error',message:`节点「${node.data.label}」服务时限必须为正数`});
  const g=ctx.groups.find(x=>x.id===gid);
  if(gid&&!g) {issues.push({nodeId:node.id,nodeLabel:node.data.label,level:'error',message:`节点「${node.data.label}」配置的值班组不存在`});return;}
  if(g) usedGroups.set(gid,[...(usedGroups.get(gid)||[]),node]);
  const calId=node.data.config.pauseCalendarId;
  if(calId&&!ctx.calendars.find(c=>c.id===calId)) issues.push({nodeId:node.id,nodeLabel:node.data.label,level:'warning',message:`节点「${node.data.label}」引用的暂停日历已失效`});
 });
 /* 同组班次重叠：只对本流程实际使用的值班组报错，一次列出节点与全部冲突班次 */
 usedGroups.forEach((nodes,gid)=>{
  const g=ctx.groups.find(x=>x.id===gid)!;
  const conflicts=shiftConflicts(g);
  if(!conflicts.length)return;
  const labels=nodes.map(n=>`「${n.data.label}」`).join('、');
  issues.push({nodeId:nodes[0].id,nodeLabel:nodes[0].data.label,level:'error',
   message:`值班组「${g.name}」存在 ${conflicts.length} 组班次重叠，节点 ${labels} 无法发布`,
   conflicts:conflicts.map(describeConflict)});
 });
 return issues;
}

export const validateWorkflow=(w:Workflow,ctx:SlaContext):ValidationIssue[]=>[...structuralIssues(w),...slaIssues(w,ctx)];
export const hasErrors=(issues:ValidationIssue[])=>issues.some(i=>i.level==='error');

/** 发布时冻结：为每个审批节点生成不可变快照（深拷贝班次与暂停区间） */
export function freezeSnapshots(w:Workflow,ctx:SlaContext,version:number,frozenAt:string=isoFallback()):SlaSnapshot[] {
 return w.nodes.filter(n=>n.type==='approval').map(n=>{
  const g=ctx.groups.find(x=>x.id===n.data.config.dutyGroupId)!;
  const cal=ctx.calendars.find(c=>c.id===n.data.config.pauseCalendarId);
  return {
   workflowId:w.id,workflowName:w.name,workflowVersion:version,
   nodeId:n.id,nodeLabel:n.data.label,
   dutyGroupId:g.id,dutyGroupName:g.name,shifts:JSON.parse(JSON.stringify(g.shifts)),
   slaMinutes:Number(n.data.config.slaMinutes),
   pauseCalendarId:cal?.id,pauseCalendarName:cal?.name,pauses:cal?JSON.parse(JSON.stringify(cal.intervals)):[],
   frozenAt,
  };
 });
}
const isoFallback=()=>new Date().toISOString();
