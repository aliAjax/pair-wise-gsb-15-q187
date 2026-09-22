import type {FlowEdge,FlowNode,SlaSnapshot,Workflow} from '../src/types';
import {dutyGroups,pauseCalendars} from './duty';
const n=(id:string,type:FlowNode['type'],x:number,y:number,label:string,config:Record<string,any>={}):FlowNode=>({id,type,position:{x,y},data:{label,state:Object.keys(config).length?'valid':'unconfigured',config}});
const finance=dutyGroups[0],cal=pauseCalendars[0];
const standard=(broken=false,duty='grp-finance',slaMinutes=480)=>{
 const nodes=[n('start','start',20,150,'开始',{ok:true}),n('form','form',210,150,'提交申请',{fields:[{id:'reason',label:'申请说明',type:'text',required:true},{id:'amount',label:'申请金额',type:'amount',required:true},{id:'attachment',label:'附件',type:'attachment',required:false}]}),n('approval','approval',420,150,'直属主管审批',{approverSource:'直属主管',instruction:'请确认申请内容与预算归属',dutyGroupId:duty,slaMinutes,pauseCalendarId:'cal-public'}),n('condition','condition',630,150,'金额判断',broken?{}:{ruleType:'amount',operator:'>',value:5000}),n('notify','notify',850,40,'高额通知',{targets:'财务审批人',template:'高额申请提醒',timing:'分支进入时'}),n('automation','automation',850,260,'记录系统',{action:'写入系统记录'}),n('end','end',1070,150,'结束',{ok:true})];
 const edges:FlowEdge[]=[['start','form'],['form','approval'],['approval','condition'],['condition','notify','大于 5,000'],['condition','automation','其他'],['notify','end'],['automation','end']].map((e,i)=>({id:'e'+i,source:e[0],target:e[1],label:e[2]})); return {nodes,edges};
};
const snap=(wfId:string,wfName:string,version:number,createdAt:string,slaMinutes:number,dutyGroupId='grp-finance',calId='cal-public'):SlaSnapshot=>{const g=dutyGroups.find(x=>x.id===dutyGroupId)!,c=pauseCalendars.find(x=>x.id===calId);return{workflowId:wfId,workflowName:wfName,workflowVersion:version,nodeId:'approval',nodeLabel:'直属主管审批',dutyGroupId:g.id,dutyGroupName:g.name,shifts:JSON.parse(JSON.stringify(g.shifts)),slaMinutes,pauseCalendarId:c?.id,pauseCalendarName:c?.name,pauses:c?JSON.parse(JSON.stringify(c.intervals)):[],frozenAt:createdAt}};
const names=['差旅费用审批','采购合同审批','员工入职流程','IT 服务请求','用印申请','供应商准入','年度预算调整','客户退款审批','法务审查流程','资产领用审批','营销活动报备','跨区域大型采购及多部门联合审批流程（集团特别管控版）'];
export const workflows:Workflow[]=names.map((name,i)=>{
 const broken=i===0||i===3;
 /* wf-5 用印申请（草稿）故意引用有重叠班次的综合应急值班组，用于整批拒绝演示 */
 const graph=i===10?{nodes:[],edges:[]}:standard(broken,i===4?'grp-dual':'grp-finance',i===0?360:480);
 if(i===8) graph.nodes=graph.nodes.filter(x=>x.type!=='end');
 if(i===9) graph.nodes.push(n('orphan','approval',650,390,'孤立审批',{approverSource:'固定角色',role:'部门负责人',dutyGroupId:'grp-finance',slaMinutes:240,pauseCalendarId:'cal-public'}));
 const status:Workflow['status']=i%4===0?'draft':i%5===0?'archived':'published';
 const oldNodes=graph.nodes.filter(x=>x.id!=='notify').map(x=>({...x,data:{...x.data}}));
 const wfId='wf-'+(i+1);
 return {id:wfId,name,domain:['财务','采购','人力资源','IT服务','法务'][i%5],status,version:i%3+1,editor:['林秋','陈默','周礼','王宁'][i%4],updatedAt:`2026-07-${String(10-i%9).padStart(2,'0')} ${9+i%8}:20`,publishedAt:status==='published'?'2026-07-08 14:30':undefined,abnormalCount:i===7?0:i%4,nodes:graph.nodes,edges:graph.edges,
  versions:[
   {version:1,createdAt:'2026-06-12 10:00',note:'初始化流程结构',nodes:oldNodes,edges:graph.edges.filter(e=>e.source!=='notify'&&e.target!=='notify'),snapshots:graph.nodes.some(x=>x.type==='approval')?[snap(wfId,name,1,'2026-06-12 10:00',720)]:[]},
   {version:2,createdAt:'2026-07-01 16:20',note:'增加金额分支与通知节点',nodes:graph.nodes,edges:graph.edges,snapshots:graph.nodes.some(x=>x.type==='approval')?[snap(wfId,name,2,'2026-07-01 16:20',i===0?360:480,i===4?'grp-dual':'grp-finance')]:[]},
  ]};
});
