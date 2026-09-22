import {useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowRight,CalendarClock,ClipboardList,PauseCircle,ShieldCheck,Timer,UserCog,Users} from 'lucide-react';
import {PageTitle} from '../components/common';
import {useAppStore} from '../store/useAppStore';
import {WEEK_NAMES,currentShift,deadlineOf,describeConflict,formatClock,formatWorkMinutes,groupFromSnapshot,isPaused,nextHandover,remainingFor,shiftConflicts} from '../lib/sla';
import type {Instance} from '../types';

export function Desk(){
 const nav=useNavigate();
 const workflows=useAppStore(s=>s.workflows);
 const instances=useAppStore(s=>s.instances);
 const groups=useAppStore(s=>s.dutyGroups);
 const calendars=useAppStore(s=>s.pauseCalendars);
 const handover=useAppStore(s=>s.handover);
 const startInstance=useAppStore(s=>s.startInstance);
 const [now,setNow]=useState(()=>new Date());
 const [flashId,setFlashId]=useState<string|null>(null);
 const [before,setBefore]=useState<Record<string,number>>({});

 /* 所有持有冻结快照、仍在审批节点上的实例（新老实例并存：旧实例持旧快照，新实例持最新快照） */
 const tasks=useMemo(()=>instances.filter(i=>i.status==='running'&&i.sla),[instances]);
 const published=workflows.filter(w=>w.status==='published'&&w.versions.some(v=>v.snapshots.length));
 const overdueCount=tasks.filter(t=>remainingFor(t.sla!.snapshot,t.sla!.startedAt,now).overdue>0).length;

 const doHandover=(t:Instance)=>{
  const r=remainingFor(t.sla!.snapshot,t.sla!.startedAt,now);
  setBefore(b=>({...b,[t.id]:r.remaining}));
  handover(t.id);setFlashId(t.id);
 };
 const launch=(wfId:string)=>{const id=startInstance(wfId,'林秋');if(id){setFlashId(id);setNow(new Date())}};

 return <div className="page desk-page">
  <PageTitle eyebrow="服务运营" title="服务时限与值班交接台" desc="按工作分钟计时：仅值班时段计时，暂停日历不计时，班次交接后剩余时限连续。运行中实例始终使用各自发布时冻结的快照。" actions={<button className="secondary" onClick={()=>setNow(new Date())}>刷新计时</button>}/>

  <section className="desk-kpis">
   {[[ClipboardList,'在办审批任务',tasks.length],[Timer,'已超时限',overdueCount],[Users,'值班组',groups.length],[CalendarClock,'暂停日历',calendars.length]].map(([Icon,label,val]:any)=><article key={label}><Icon/><span><small>{label}</small><b data-testid={'kpi-'+label}>{val}</b></span></article>)}
  </section>

  <div className="desk-grid">
   <section className="panel task-panel">
    <div className="panel-head"><div><h2>在办审批任务</h2><p>剩余时限基于实例自己的冻结快照实时计算（刷新后一致）</p></div></div>
    <div className="task-list">
     {tasks.map(t=>{
      const snap=t.sla!.snapshot;const g=groupFromSnapshot(snap);
      const r=remainingFor(snap,t.sla!.startedAt,now);
      const shift=currentShift(g,now),paused=isPaused(snap.pauses,now),nh=nextHandover(g,now);
      const deadline=deadlineOf(new Date(t.sla!.startedAt),snap.slaMinutes,g,snap.pauses);
      const flashing=flashId===t.id;
      return <article key={t.id} className={'task-card '+(r.overdue?'overdue':r.remaining<snap.slaMinutes*0.2?'tight':'')+(flashing?' flashing':'')} data-testid="task-card" data-instance={t.id}>
       <div className="task-top">
        <div><b>{t.id}</b><small onClick={()=>nav(`/monitor?instance=${t.id}`)}>{snap.workflowName} · {t.applicant} <ArrowRight/></small></div>
        <span className={'clock-badge '+(paused?'paused':shift?'live':'off')} data-testid="clock-badge">{paused?'暂停日历中 · 不计时':shift?`值班中 · ${shift.label}`:'班次间隙 · 不计时'}</span>
       </div>
       <div className="sla-gauge" data-testid="sla-remaining" data-remaining={r.remaining}>
        <div className="gauge-num"><b>{formatWorkMinutes(r.remaining)}</b>{r.overdue>0&&<em className="over">已超 {formatWorkMinutes(r.overdue)}</em>}</div>
        <div className="gauge-bar"><i style={{width:`${Math.min(100,Math.round(r.used/Math.max(r.limit,1)*100))}%`}}/></div>
        <small>已用 {formatWorkMinutes(r.used)} / 时限 {formatWorkMinutes(r.limit)}（工作分钟）{flashing&&before[t.id]!==undefined&&<em className="continuous"> 交接后剩余连续：{formatWorkMinutes(before[t.id])} → {formatWorkMinutes(r.remaining)}</em>}</small>
       </div>
       <div className="task-meta">
        <div><small>值班组</small><b>{snap.dutyGroupName}</b></div>
        <div><small>时限截止</small><b>{formatClock(deadline.toISOString(),now)}</b></div>
        <div><small>下次交接</small><b>{nh?`${formatClock(nh.at.toISOString(),now)} ${nh.kind} · ${nh.shift.label}`:'—'}</b></div>
        <div><small>规则快照</small><b>v{snap.workflowVersion} · {snap.frozenAt.slice(0,10)}</b></div>
       </div>
       {snap.pauseCalendarName&&<div className="task-pause"><PauseCircle/> 暂停日历：{snap.pauseCalendarName}（{snap.pauses.filter(p=>p.date).length} 个全天 + {snap.pauses.filter(p=>!p.date).length} 个时段）</div>}
       {t.sla!.handovers.length>0&&<div className="handover-log" data-testid="handover-log"><ShieldCheck/> 最近交接：{t.sla!.handovers[t.sla!.handovers.length-1].fromShift} → {t.sla!.handovers[t.sla!.handovers.length-1].toShift}（{formatClock(t.sla!.handovers[t.sla!.handovers.length-1].at,now)}）· 剩余时限连续未重置</div>}
       <div className="task-actions"><button className="secondary mini" data-testid="handover-btn" onClick={()=>doHandover(t)}><UserCog/>登记交接</button><button className="text" onClick={()=>nav(`/monitor?instance=${t.id}`)}>实例详情</button></div>
      </article>;
     })}
     {!tasks.length&&<div className="empty"><ClipboardList/><b>暂无在办任务</b></div>}
    </div>
   </section>

   <div className="desk-side">
    <section className="panel">
     <div className="panel-head"><div><h2>值班组班次</h2><p>同组班次重叠会阻断发布</p></div></div>
     {groups.map(g=>{const conf=shiftConflicts(g);return <div key={g.id} className={'group-card '+(conf.length?'conflict':'')}>
      <div className="group-head"><b>{g.name}</b>{conf.length?<em className="conflict-tag">{conf.length} 组重叠</em>:<em className="ok-tag">班次正常</em>}</div>
      {g.shifts.map(sh=><div key={sh.id} className="shift-row"><span>{sh.label}</span><small>{sh.days.map(d=>WEEK_NAMES[d]).join(' ')}</small><i>{sh.start}–{sh.end}</i></div>)}
      {conf.map((c,k)=><div key={k} className="conflict-row" data-testid="group-conflict">班次冲突：{describeConflict(c)}</div>)}
     </div>})}
    </section>
    <section className="panel">
     <div className="panel-head"><div><h2>暂停日历</h2><p>暂停时段不消耗工作分钟</p></div></div>
     {calendars.map(ca=><div key={ca.id} className="cal-card"><b>{ca.name}</b>{ca.intervals.map((p,k)=>p.date?<div key={k} className="cal-row day"><span>全天</span><small>{p.date}</small>{p.label&&<em>{p.label}</em>}</div>:<div key={k} className="cal-row"><span>{p.start?.slice(5,16).replace('T',' ')}</span><small>至 {p.end?.slice(11,16)}</small>{p.label&&<em>{p.label}</em>}</div>)}</div>)}
    </section>
    <section className="panel">
     <div className="panel-head"><div><h2>发起新实例</h2><p>新实例立即使用最新发布快照</p></div></div>
     <div className="launch-list">{published.map(w=>{const ver=[...w.versions].reverse().find(v=>v.snapshots.length);const snap=ver?.snapshots[0];return <button key={w.id} className="launch-row" data-testid="launch-instance" onClick={()=>launch(w.id)}><span className="grow"><b>{w.name}</b><small>v{ver?.version??w.version} · {snap?.dutyGroupName||'暂无审批快照'} · 时限 {snap?formatWorkMinutes(snap.slaMinutes):'—'}</small></span><ArrowRight/></button>})}</div>
    </section>
   </div>
  </div>
 </div>;
}
