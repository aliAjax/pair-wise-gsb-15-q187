import type {DutyGroup,DutyShift,FlowNode} from '../types';

export interface PublishProblem {nodeId:string;nodeLabel:string;kind:'missing-group'|'invalid-limit'|'shift-overlap';message:string;groupName?:string;shifts?:[DutyShift,DutyShift]}

const toMin=(t:string):number=>{const[h,m]=t.split(':').map(Number);return h*60+m};

export function shiftsOverlap(a:DutyShift,b:DutyShift):boolean{
 return toMin(a.start)<toMin(b.end)&&toMin(b.start)<toMin(a.end);
}

/* 同一值班组内两两检测班次重叠，返回全部冲突班次对 */
export function findShiftConflicts(group:DutyGroup):[DutyShift,DutyShift][]{
 const sorted=[...group.shifts].sort((a,b)=>toMin(a.start)-toMin(b.start));
 const pairs:[DutyShift,DutyShift][]=[];
 for(let i=0;i<sorted.length;i++)
  for(let j=i+1;j<sorted.length;j++)
   if(shiftsOverlap(sorted[i],sorted[j]))pairs.push([sorted[i],sorted[j]]);
 return pairs;
}

/* 发布整批校验：任一审批节点缺值班组、时限非正数，或所引用值班组内班次重叠，则整批拒绝 */
export function checkPublish(nodes:FlowNode[],groups:DutyGroup[]):PublishProblem[]{
 const problems:PublishProblem[]=[];
 for(const n of nodes.filter(x=>x.type==='approval')){
  const c=n.data.config,label=n.data.label;
  const group=groups.find(g=>g.id===c.dutyGroupId);
  if(!c.dutyGroupId)problems.push({nodeId:n.id,nodeLabel:label,kind:'missing-group',message:'节点未配置值班组'});
  else if(!group)problems.push({nodeId:n.id,nodeLabel:label,kind:'missing-group',message:`值班组不存在（${c.dutyGroupId}）`});
  else for(const [a,b] of findShiftConflicts(group))
   problems.push({nodeId:n.id,nodeLabel:label,kind:'shift-overlap',groupName:group.name,shifts:[a,b],
    message:`值班组「${group.name}」班次重叠：${a.label}（${a.start}–${a.end}）与 ${b.label}（${b.start}–${b.end}）`});
  const limit=Number(c.limitMinutes);
  if(!Number.isFinite(limit)||limit<=0)
   problems.push({nodeId:n.id,nodeLabel:label,kind:'invalid-limit',message:`审批时限必须为正数分钟（当前：${c.limitMinutes??'未设置'}）`});
 }
 return problems;
}
