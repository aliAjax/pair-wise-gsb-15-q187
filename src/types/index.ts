export type WorkflowStatus='draft'|'published'|'archived';
export type NodeKind='start'|'form'|'approval'|'condition'|'automation'|'notify'|'end';
export type NodeState='unconfigured'|'configuring'|'valid'|'invalid';
export interface FormField {id:string;label:string;type:'text'|'number'|'amount'|'date'|'select'|'attachment';required:boolean;options?:string[]}
export interface FlowNode {id:string;type:NodeKind;position:{x:number;y:number};data:{label:string;state:NodeState;config:Record<string,any>}}
export interface FlowEdge {id:string;source:string;target:string;label?:string}
export interface Version {version:number;createdAt:string;note:string;nodes:FlowNode[];edges:FlowEdge[]}

/* 值班与服务时限 */
export interface DutyShift {id:string;label:string;start:string;end:string}
export interface DutyGroup {id:string;name:string;shifts:DutyShift[]}
export interface PauseWindow {start:string;end:string;label:string}
export interface PauseCalendar {id:string;name:string;windows:PauseWindow[]}
export interface SlaSnapshotNode {nodeId:string;nodeLabel:string;dutyGroupId:string;dutyGroupName:string;shifts:DutyShift[];limitMinutes:number;pauseCalendarId:string;pauseCalendarName:string;pauseWindows:PauseWindow[]}
export interface SlaSnapshot {version:number;frozenAt:string;nodes:SlaSnapshotNode[]}
export interface HandoverRecord {at:string;from:string;to:string;remainingMinutes:number;operator:string}
export interface InstanceSla {nodeId:string;version:number;enteredAt:string;duty:{groupId:string;shiftId:string};handovers:HandoverRecord[]}

export interface Workflow {id:string;name:string;domain:string;status:WorkflowStatus;version:number;editor:string;updatedAt:string;publishedAt?:string;abnormalCount:number;nodes:FlowNode[];edges:FlowEdge[];versions:Version[];slaSnapshots?:SlaSnapshot[]}
export interface Instance {id:string;workflowId:string;applicant:string;domain:string;currentNode:string;status:'abnormal'|'timeout'|'running'|'completed';submittedAt:string;duration:string;risk:'high'|'medium'|'low';timeline:{title:string;time:string;status:string}[];sla?:InstanceSla}
export interface ValidationIssue {nodeId:string;level:'error'|'warning';message:string}
