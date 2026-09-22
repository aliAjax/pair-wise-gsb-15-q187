export type WorkflowStatus='draft'|'published'|'archived';
export type NodeKind='start'|'form'|'approval'|'condition'|'automation'|'notify'|'end';
export type NodeState='unconfigured'|'configuring'|'valid'|'invalid';
export interface FormField {id:string;label:string;type:'text'|'number'|'amount'|'date'|'select'|'attachment';required:boolean;options?:string[]}
export interface FlowNode {id:string;type:NodeKind;position:{x:number;y:number};data:{label:string;state:NodeState;config:Record<string,any>}}
export interface FlowEdge {id:string;source:string;target:string;label?:string}

/** 值班班次：days 为星期（0=周日 … 6=周六），start/end 为 HH:MM（同日不跨午夜） */
export interface DutyShift {id:string;label:string;days:number[];start:string;end:string}
export interface DutyGroup {id:string;name:string;shifts:DutyShift[]}
/** 暂停日历条目：date 为 YYYY-MM-DD 表示全天暂停；start/end 为本地 ISO 日期时间表示时段暂停 */
export interface PauseInterval {label?:string;date?:string;start?:string;end?:string}
export interface PauseCalendar {id:string;name:string;intervals:PauseInterval[]}
/** 发布时冻结的时限快照：运行中实例永远持有自己那份副本，不受后续发布影响 */
export interface SlaSnapshot {
  workflowId:string;workflowName:string;workflowVersion:number;
  nodeId:string;nodeLabel:string;
  dutyGroupId:string;dutyGroupName:string;shifts:DutyShift[];
  slaMinutes:number;
  pauseCalendarId?:string;pauseCalendarName?:string;pauses:PauseInterval[];
  frozenAt:string;
}
export interface HandoverRecord {at:string;fromShift:string;toShift:string;note?:string}
export interface InstanceSla {snapshot:SlaSnapshot;startedAt:string;handovers:HandoverRecord[]}

export interface Version {version:number;createdAt:string;note:string;nodes:FlowNode[];edges:FlowEdge[];snapshots:SlaSnapshot[]}
export interface Workflow {id:string;name:string;domain:string;status:WorkflowStatus;version:number;editor:string;updatedAt:string;publishedAt?:string;abnormalCount:number;nodes:FlowNode[];edges:FlowEdge[];versions:Version[]}
export interface Instance {id:string;workflowId:string;applicant:string;domain:string;currentNode:string;status:'abnormal'|'timeout'|'running'|'completed';submittedAt:string;duration:string;risk:'high'|'medium'|'low';timeline:{title:string;time:string;status:string}[];sla?:InstanceSla}
export interface ValidationIssue {nodeId:string;level:'error'|'warning';message:string;nodeLabel?:string;conflicts?:string[]}
