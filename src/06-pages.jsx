function Requests({ db, decide }) {
  const [tab,setTab]=useState('pending'); const [fBy,setFBy]=useState([]);
  const [fSch,setFSch]=useState([]); const [sel,setSel]=useState([]);
  const list = db.reqs.filter(r => tab==='pending' ? r.status==='pending' : r.status!=='pending');
  const people=[...new Set(db.reqs.map(r=>r.by))].sort();
  const schools=[...new Set(db.reqs.map(r=>r.schoolName))].sort();
  const view = list.filter(r => (!fBy.length||fBy.includes(r.by)) && (!fSch.length||fSch.includes(r.schoolName)));
  const groups = useMemo(() => { const g={};
    view.forEach(r => (g[r.schoolId] = g[r.schoolId]||{name:r.schoolName,batch:r.batch,items:[]}).items.push(r));
    return Object.entries(g); }, [view]);
  const conflict = r => view.some(x => x.id!==r.id && x.schoolId===r.schoolId && x.path===r.path);
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x=>x!==id) : [...s,id]);
  return (
    <>
      <div className="phead"><h2>طلبات التعديل</h2>
        <div className="tabs2 plain">
          <button className={tab==='pending'?'on':''} onClick={() => { setTab('pending'); setSel([]); }}>
            معلّقة <em className="num">{db.reqs.filter(r=>r.status==='pending').length}</em></button>
          <button className={tab==='past'?'on':''} onClick={() => { setTab('past'); setSel([]); }}>سابقة</button>
        </div></div>
      <div className="bar">
        <MultiFilter label="الموظف" value={fBy} onChange={setFBy} options={people.map(p=>({v:p,t:p}))} />
        <MultiFilter label="المدرسة" value={fSch} onChange={setFSch} options={schools.map(p=>({v:p,t:p}))} />
        {tab==='pending' && view.length>0 && <>
          <button className="btn" onClick={() => setSel(sel.length===view.length?[]:view.map(r=>r.id))}>
            {sel.length===view.length?'ألغِ التحديد':'حدّد الكل'}</button>
          <button className="btn ok" disabled={!sel.length} onClick={() => { decide(sel,true); setSel([]); }}>
            وافق على المحدد {sel.length?'('+sel.length+')':''}</button>
          <button className="btn danger" disabled={!sel.length}
            onClick={() => { const r=prompt('سبب الرفض (اختياري)'); if(r===null)return; decide(sel,false,r); setSel([]); }}>
            ارفض المحدد</button></>}
      </div>
      {groups.length===0 && <div className="empty"><b>ما فيه طلبات</b>
        {tab==='pending'?'كل شي مراجَع.':'ما راجعت شي بعد.'}</div>}
      {groups.map(([sid,g]) => (
        <div className="reqgrp" key={sid}>
          <div className="reqgrp-h"><b>{g.name}</b><em className="num">{g.batch}</em>
            <span className="num">{g.items.length} طلب</span>
            {tab==='pending' && <button className="btn ok sm" onClick={() => decide(g.items.map(r=>r.id),true)}>وافق على الكل</button>}</div>
          {g.items.map(r => (
            <div className={'req'+(conflict(r)?' conflict':'')} key={r.id}>
              {tab==='pending' && <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />}
              <span className="lt num">{fmt(r.at)}</span><span className="lby">{r.by}</span>
              <span className="lfld">{r.label}</span>
              <span className="lval"><s>{r.fromTxt ?? (r.from===''?'(فاضي)':String(r.from))}</s><i>←</i>
                <b>{r.toTxt ?? (r.to===''?'(فاضي)':String(r.to))}</b></span>
              {conflict(r) && <span className="warnpill">تعارض</span>}
              {r.status==='pending' ? (
                <span className="reqacts">
                  <button className="btn ok sm" onClick={() => decide([r.id],true)}>وافق</button>
                  <button className="btn danger sm" onClick={() => { const x=prompt('سبب الرفض (اختياري)'); if(x!==null) decide([r.id],false,x); }}>ارفض</button>
                </span>
              ) : (
                <span className={'lk k-'+r.status}>{r.status==='approved'?'موافق':'مرفوض'} ·
                  <span className="num"> {fmtShort(r.reviewedAt)}</span>{r.reason?' · '+r.reason:''}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function LogPage({ db, me, isAdmin, revertLog }) {
  const [fBy,setFBy]=useState([]); const [fSch,setFSch]=useState([]);
  const [fK,setFK]=useState([]); const [days,setDays]=useState('');
  const src = isAdmin ? db.log : db.log.filter(l => l.by === me.name);
  const people=[...new Set(src.map(l=>l.by))].sort();
  const schools=[...new Set(src.map(l=>l.schoolName))].sort();
  const view = src.filter(l => {
    if (fBy.length && !fBy.includes(l.by)) return false;
    if (fSch.length && !fSch.includes(l.schoolName)) return false;
    if (fK.length && !fK.includes(l.kind)) return false;
    if (days && (Date.now()-new Date(l.at)) > +days*864e5) return false;
    return true; });
  const exp = () => {
    const head=['Date','By','School','Batch','Field','From','To','Kind','Reviewed by'];
    const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const rows=view.map(l=>[fmt(l.at),l.by,l.schoolName,l.batch,l.label,l.fromTxt??l.from,l.toTxt??l.to,l.kind,l.reviewedBy||''].map(esc).join(','));
    const b=new Blob(['\uFEFF'+[head.map(esc).join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='change-log.csv'; a.click(); };
  return (
    <>
      <div className="phead"><h2>سجل التغييرات</h2><span className="phead-n num">{view.length}</span></div>
      <div className="bar">
        {isAdmin && <MultiFilter label="الموظف" value={fBy} onChange={setFBy} options={people.map(p=>({v:p,t:p}))} />}
        <MultiFilter label="المدرسة" value={fSch} onChange={setFSch} options={schools.map(p=>({v:p,t:p}))} />
        <MultiFilter label="النوع" value={fK} onChange={setFK} options={[{v:'direct',t:'مباشر'},
          {v:'approved',t:'موافق'},{v:'rejected',t:'مرفوض'},{v:'create',t:'إضافة'},
          {v:'delete',t:'حذف'},{v:'undo',t:'تراجع'},{v:'revert',t:'إرجاع'}]} />
        <select className="sel" value={days} onChange={e=>setDays(e.target.value)}>
          <option value="">كل الفترات</option><option value="1">آخر 24 ساعة</option>
          <option value="7">آخر 7 أيام</option><option value="30">آخر 30 يوم</option></select>
        <button className="btn" onClick={exp}>نزّل CSV</button>
      </div>
      <div className="loglist page">
        {view.length===0 && <div className="empty"><b>السجل فاضي</b>أول ما يصير تعديل بينكتب هني.</div>}
        {view.slice(0,400).map(l => <LogLine key={l.id} l={l} showSchool onRevert={isAdmin?revertLog:null} />)}
        {view.length>400 && <div className="hint">معروض أول 400 — ضيّق الفلتر أو نزّل CSV.</div>}
      </div>
    </>
  );
}

const tone = p => p>=80?'ok':p>=50?'warn':'bad';
function Detail({ title, list, prog }) {
  const sorted=[...list].sort((a,b)=>prog(a)-prog(b));
  return (
    <div className="detcol"><div className="detttl">{title} <em className="num">{list.length}</em></div>
      {list.length===0 && <div className="hint">ما عنده.</div>}
      {sorted.map(s => <div className="detrow" key={s.id}><span>{s.name}</span>
        <em className="num">{s.batch}</em><b className={'num '+tone(prog(s))}>{Math.round(prog(s))}%</b></div>)}
    </div>
  );
}

function Stats(props) {
  const [view, setView] = useState('now');
  return (
    <>
      <div className="phead"><h2>الإحصائيات</h2>
        <div className="tabs2 plain">
          <button className={view==='now'?'on':''} onClick={() => setView('now')}>الوضع الحالي</button>
          <button className={view==='period'?'on':''} onClick={() => setView('period')}>النشاط بالفترة</button>
        </div></div>
      {view==='now' ? <StatsNow {...props} /> : <StatsPeriod {...props} />}
    </>
  );
}

function StatsNow({ db }) {
  const cfg = db.config;
  const [pick, setPick] = useState(null);
  const isPerson = n => cfg.team.includes(n);
  const prog = s => progressOf(s, cfg);
  const live = db.schools.filter(s => s.active !== false);
  const gone = db.schools.filter(s => s.active === false);
  const avg = a => a.length ? Math.round(a.reduce((x,s)=>x+prog(s),0)/a.length) : 0;

  const rows = useMemo(() => cfg.team.map(n => {
    const a = live.filter(s => s.owner1===n), b = live.filter(s => s.owner2===n);
    const g1 = gone.filter(s => (s.leftOwner1 || s.owner1) === n);
    const g2 = gone.filter(s => (s.leftOwner2 || s.owner2) === n);
    return { name:n, a, b, g1, g2, n1:a.length, n2:b.length, total:a.length+b.length,
      p1:avg(a), p2:avg(b), lost:g1.length+g2.length };
  }).sort((x,y)=>y.total-x.total), [db.schools, cfg]);

  const maxT = Math.max(1, ...rows.map(r => r.total));
  const unassigned = live.filter(s => !isPerson(s.owner1) && !isPerson(s.owner2));
  const solo = live.filter(s => isPerson(s.owner1) && !isPerson(s.owner2));
  const shared = live.filter(s => Number(s.staffCount)===2);
  const fresh = live.filter(s => s.joinedAt && daysSince(s.joinedAt) < NEW_DAYS);

  return (
    <>
      <div className="cards">
        <div className="kpi"><span>مدارس معانا</span><b className="num">{live.length}</b><i>بكل الدفعات</i></div>
        <div className="kpi"><span>طلعت علينا</span><b className={'num'+(gone.length?' bad':'')}>{gone.length}</b><i>كانت معانا</i></div>
        <div className="kpi"><span>جديدة</span><b className={'num'+(fresh.length?' new':'')}>{fresh.length}</b><i>آخر {NEW_DAYS} يوم</i></div>
        <div className="kpi"><span>تنتظر تعيين</span><b className={'num'+(unassigned.length?' warn':'')}>{unassigned.length}</b><i>بدون مسؤول</i></div>
        <div className="kpi"><span>عليها أول بس</span><b className="num">{solo.length}</b><i>ما لها ثاني</i></div>
        <div className="kpi"><span>مشتركة</span><b className="num">{shared.length}</b><i>ستافين</i></div>
      </div>

      <div className="sect">توزيع الشغل على الفريق</div>
      <div className="sttable">
        <div className="sthead nw"><span>الموظف</span><span>مسؤول أول</span><span>مسؤول ثاني</span>
          <span>المجموع</span><span>إنجازه كأول</span><span>إنجازه كثاني</span><span>طلعت عليه</span><span></span></div>
        {rows.map(r => (
          <React.Fragment key={r.name}>
            <div className={'strow nw'+(pick===r.name?' on':'')} onClick={() => setPick(pick===r.name?null:r.name)}>
              <span className="stnm">{r.name}<i className="load"><em style={{width:(r.total/maxT*100)+'%'}} /></i></span>
              <span className="num">{r.n1}</span><span className="num">{r.n2}</span>
              <span className="num strong">{r.total}</span>
              <span className={'num '+tone(r.p1)}>{r.n1?r.p1+'%':'—'}</span>
              <span className={'num '+tone(r.p2)}>{r.n2?r.p2+'%':'—'}</span>
              <span className={'num'+(r.lost?' bad':'')}>{r.lost||'—'}</span>
              <span className="stcar">{pick===r.name?'▲':'▼'}</span>
            </div>
            {pick===r.name && (
              <div className="stdet">
                <Detail title="مسؤول أول" list={r.a} prog={prog} />
                <Detail title="مسؤول ثاني" list={r.b} prog={prog} />
                {(r.g1.length>0 || r.g2.length>0) && (
                  <div className="detcol lost" style={{gridColumn:'1 / -1'}}>
                    <div className="detttl">مدارس طلعت وهو ماسكها <em className="num">{r.lost}</em></div>
                    {r.g1.map(s => <div className="detrow" key={s.id}><span>{s.name}</span>
                      <em className="num">{s.batch}</em><b className="tagx">مسؤول أول</b>
                      <span className="num dim">{s.leftAt?fmtShort(s.leftAt):'من الملف'}</span></div>)}
                    {r.g2.map(s => <div className="detrow" key={s.id}><span>{s.name}</span>
                      <em className="num">{s.batch}</em><b className="tagx">مسؤول ثاني</b>
                      <span className="num dim">{s.leftAt?fmtShort(s.leftAt):'من الملف'}</span></div>)}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {gone.length>0 && <>
        <div className="sect">مدارس طلعت علينا <em className="num">{gone.length}</em></div>
        <div className="waitlist">
          {gone.map(s => (
            <div className="wait out" key={s.id}><b>{s.name}</b><em className="num">{s.batch}</em>
              <span className="typ">{s.leftOwner1 || s.owner1 || '—'}</span>
              <span className="wnote num">{s.leftAt ? fmtShort(s.leftAt) : 'من الملف الأصلي'}</span></div>
          ))}
        </div>
      </>}

      <div className="sect">مدارس تنتظر تعيين <em className="num">{unassigned.length}</em></div>
      <div className="waitlist">
        {unassigned.length===0 && <div className="hint">كل المدارس عليها مسؤول.</div>}
        {unassigned.map(s => (
          <div className="wait" key={s.id}><b>{s.name}</b><em className="num">{s.batch}</em>
            <span className="typ">{s.type}</span>
            <span className="wnote">{s.owner1 || s.owner2 || cfg.ownerPlaceholder}</span></div>
        ))}
      </div>
    </>
  );
}
