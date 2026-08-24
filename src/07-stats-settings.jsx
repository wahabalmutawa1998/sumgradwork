const APPLIED = ['direct','approved','revert','undo'];
const tval  = v => v==='done'?1 : v==='wip'?0.5 : 0;
const txval = v => String(v||'').trim() ? 1 : 0;
const startOf = k => { const d=new Date(); d.setHours(0,0,0,0);
  if(k==='today') return d;
  if(k==='yday'){const y=new Date(d); y.setDate(y.getDate()-1); return y;}
  if(k==='week'){const w=new Date(d); w.setDate(w.getDate()-6); return w;}
  if(k==='month'){const m=new Date(d); m.setDate(m.getDate()-29); return m;}
  return null; };
const endOf = k => { if(k!=='yday') return null; const e=new Date(); e.setHours(0,0,0,0); return e; };
const dayKey = d => new Date(d).toISOString().slice(0,10);
const dayLbl = s => new Date(s+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});

function StatsPeriod({ db }) {
  const cfg = db.config;
  const [range,setRange]=useState('week'); const [from,setFrom]=useState(''); const [to,setTo]=useState('');
  const [pick,setPick]=useState(null);
  const textKeys = cfg.tasks.filter(t=>t.text).map(t=>t.k);
  const nTasks = Math.max(1, cfg.tasks.filter(t=>!t.hidden).length);
  const byId = useMemo(() => Object.fromEntries(db.schools.map(s=>[s.id,s])), [db.schools]);

  const bounds = useMemo(() => {
    if (range==='custom') return [ from?new Date(from+'T00:00:00'):null,
      to?(()=>{const h=new Date(to+'T00:00:00'); h.setDate(h.getDate()+1); return h;})():null ];
    return [startOf(range), endOf(range)];
  }, [range,from,to]);
  const inRange = t => { const [lo,hi]=bounds; const x=new Date(t);
    return !(lo&&x<lo) && !(hi&&x>=hi); };

  const logs = useMemo(() => db.log.filter(l => inRange(l.at)), [db.log,bounds]);
  const applied = logs.filter(l => APPLIED.includes(l.kind));

  const stats = useMemo(() => {
    const people={}, schoolDelta={}, days={};
    const P = n => (people[n] = people[n] || { name:n, edits:0, done:0, schools:new Set(), gain:0 });
    logs.forEach(l => { days[dayKey(l.at)] = (days[dayKey(l.at)]||0)+1; });
    applied.forEach(l => {
      const p=P(l.by); p.edits++; p.schools.add(l.schoolId);
      let d=0;
      if (String(l.path).startsWith('tasks.') || String(l.path).startsWith('custom.')) {
        d = tval(l.to)-tval(l.from); if (l.to==='done' && l.from!=='done') p.done++;
      } else if (textKeys.includes(l.path)) { d = txval(l.to)-txval(l.from); if (d>0) p.done++; }
      if (d) { p.gain+=d; schoolDelta[l.schoolId]=(schoolDelta[l.schoolId]||0)+d; }
    });
    const owner={}; const O = n => (owner[n]=owner[n]||{pts:0,schools:new Set()});
    Object.entries(schoolDelta).forEach(([sid,d]) => { const s=byId[sid]; if(!s) return;
      [s.owner1,s.owner2].filter(n=>n&&cfg.team.includes(n)).forEach(n => {
        const o=O(n); o.pts += d/nTasks*100; o.schools.add(sid); }); });
    const names=[...new Set([...Object.keys(people),...Object.keys(owner)])];
    const rows = names.map(n => { const p=people[n]||{edits:0,done:0,schools:new Set()}; const o=owner[n]||{pts:0,schools:new Set()};
      return { name:n, edits:p.edits, done:p.done, touched:p.schools.size,
        ownPts: o.schools.size ? o.pts/o.schools.size : 0, ownSchools:o.schools.size };
    }).sort((a,b)=>b.edits-a.edits||b.ownPts-a.ownPts);
    return { rows, schoolDelta, days };
  }, [logs,byId,cfg,nTasks]);

  const created = logs.filter(l => l.kind==='create');
  const deleted = logs.filter(l => l.kind==='delete');
  const rejected = logs.filter(l => l.kind==='rejected');
  const joined = db.schools.filter(s => s.joinedAt && inRange(s.joinedAt));
  const left   = db.schools.filter(s => s.leftAt && inRange(s.leftAt));
  const signed = db.prospects.filter(p => p.wonAt && inRange(p.wonAt));
  const doneTotal = stats.rows.reduce((a,r)=>a+r.done,0);
  const moved = Object.keys(stats.schoolDelta).length;
  const activeP = stats.rows.filter(r=>r.edits>0).length;
  const dayList = Object.entries(stats.days).sort((a,b)=>a[0]<b[0]?1:-1).slice(0,31);
  const maxDay = Math.max(1,...dayList.map(d=>d[1]));
  const topSchools = Object.entries(stats.schoolDelta).map(([id,d])=>({s:byId[id],pct:d/nTasks*100}))
    .filter(x=>x.s&&x.pct!==0).sort((a,b)=>b.pct-a.pct).slice(0,8);
  const RANGES=[['today','اليوم'],['yday','أمس'],['week','آخر 7 أيام'],['month','آخر 30 يوم'],['all','كل الوقت'],['custom','فترة محددة']];
  const nothing = applied.length===0 && created.length===0 && joined.length===0 && left.length===0;

  return (
    <>
      <div className="bar">
        <div className="segs">{RANGES.map(([k,t]) =>
          <button key={k} className={'seg'+(range===k?' on':'')} onClick={()=>setRange(k)}>{t}</button>)}</div>
        {range==='custom' && (
          <div className="daterange"><label>من</label>
            <input type="date" className="ltr" value={from} onChange={e=>setFrom(e.target.value)} />
            <label>إلى</label>
            <input type="date" className="ltr" value={to} onChange={e=>setTo(e.target.value)} /></div>
        )}
      </div>
      <div className="cards">
        <div className="kpi"><span>تعديلات انطبقت</span><b className="num">{applied.length}</b>
          <i>{rejected.length?rejected.length+' مرفوض':'ما فيه مرفوض'}</i></div>
        <div className="kpi"><span>مهام خلّصت</span><b className="num ok">{doneTotal}</b><i>بهالفترة</i></div>
        <div className="kpi"><span>موظفين اشتغلوا</span><b className="num">{activeP}</b><i>من {cfg.team.length}</i></div>
        <div className="kpi"><span>مدارس اتحركت</span><b className="num">{moved}</b><i>تقدّم إنجازها</i></div>
        <div className="kpi"><span>مدارس انضمت</span><b className={'num'+(joined.length?' ok':'')}>{joined.length}</b>
          <i>{signed.length?signed.length+' من المحتملة':'—'}</i></div>
        <div className="kpi"><span>مدارس طلعت</span><b className={'num'+(left.length?' bad':'')}>{left.length}</b>
          <i>{deleted.length?deleted.length+' انشالت':'—'}</i></div>
      </div>
      {nothing && <div className="empty"><b>ما صار شي بهالفترة</b>غيّر الفترة أو ارجع بعدين.</div>}
      {dayList.length>0 && <>
        <div className="sect">الحركة يوم بيوم</div>
        <div className="daybars">{dayList.map(([d,n]) => (
          <div className="daybar" key={d} title={n+' تعديل'}>
            <div className="db-track"><span style={{width:(n/maxDay*100)+'%'}} /></div>
            <span className="db-d num">{dayLbl(d)}</span><span className="db-n num">{n}</span></div>))}
        </div></>}
      {stats.rows.length>0 && <>
        <div className="sect">منو سوّى إيش</div>
        <div className="sttable">
          <div className="sthead pd"><span>الموظف</span><span>تعديلات</span><span>مهام خلّصها</span>
            <span>مدارس لمسها</span><span>تغيّر إنجاز مدارسه</span><span></span></div>
          {stats.rows.map(r => (
            <React.Fragment key={r.name}>
              <div className={'strow pd'+(pick===r.name?' on':'')} onClick={()=>setPick(pick===r.name?null:r.name)}>
                <span className="stnm">{r.name}</span>
                <span className="num strong">{r.edits}</span>
                <span className="num ok">{r.done||'—'}</span>
                <span className="num">{r.touched||'—'}</span>
                <span className={'num '+(r.ownPts>0?'ok':r.ownPts<0?'bad':'')}>
                  {r.ownSchools?(r.ownPts>0?'+':'')+r.ownPts.toFixed(1)+'%':'—'}</span>
                <span className="stcar">{pick===r.name?'▲':'▼'}</span></div>
              {pick===r.name && (
                <div className="stdet one"><div className="detcol">
                  <div className="detttl">تعديلاته بهالفترة <em className="num">{applied.filter(l=>l.by===r.name).length}</em></div>
                  {applied.filter(l=>l.by===r.name).slice(0,40).map(l => <LogLine key={l.id} l={l} showSchool />)}
                  {applied.filter(l=>l.by===r.name).length===0 && <div className="hint">ما سوّى تعديلات — بس مدارسه تحرّكت.</div>}
                </div></div>
              )}
            </React.Fragment>
          ))}
        </div></>}
      {topSchools.length>0 && <>
        <div className="sect">أكثر المدارس تقدّماً</div>
        <div className="waitlist">{topSchools.map(({s,pct}) => (
          <div className="wait" key={s.id}><b>{s.name}</b><em className="num">{s.batch}</em>
            <span className="typ">{s.owner1||cfg.ownerPlaceholder}</span>
            <span className={'wnote num '+(pct>0?'ok':'bad')}>{pct>0?'+':''}{pct.toFixed(1)}%</span></div>))}
        </div></>}
      {joined.length>0 && <>
        <div className="sect">مدارس انضمت <em className="num">{joined.length}</em></div>
        <div className="waitlist">{joined.map(s => (
          <div className="wait" key={s.id}><b>{s.name}</b><em className="num">{s.batch}</em>
            <span className="typ">{s.owner1||cfg.ownerPlaceholder}</span>
            <span className="wnote num ok">{fmtShort(s.joinedAt)}</span></div>))}
        </div></>}
      {left.length>0 && <>
        <div className="sect">مدارس طلعت <em className="num">{left.length}</em></div>
        <div className="waitlist">{left.map(s => (
          <div className="wait out" key={s.id}><b>{s.name}</b><em className="num">{s.batch}</em>
            <span className="typ">{s.leftOwner1||s.owner1||'—'}</span>
            <span className="wnote num bad">{fmtShort(s.leftAt)}</span></div>))}
        </div></>}
    </>
  );
}

function ListEd({ label, arr, onSet, hint }) {
  const [nv,setNv]=useState('');
  const add=()=>{ if(nv.trim()){ onSet([...arr,nv.trim()]); setNv(''); } };
  return (
    <div className="setblk"><div className="setttl">{label}</div>
      {hint && <div className="hint">{hint}</div>}
      <div className="pills">{arr.map((v,i)=>(
        <span className="pill" key={i}>
          <input value={v} onChange={e=>onSet(arr.map((x,j)=>j===i?e.target.value:x))} />
          <button onClick={()=>onSet(arr.filter((_,j)=>j!==i))}>×</button></span>))}
      </div>
      <div className="addrow">
        <input value={nv} placeholder={'أضف إلى '+label} onChange={e=>setNv(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&add()} />
        <button className="btn" onClick={add}>أضف</button></div>
    </div>
  );
}
function NewItem({ label, onAdd, askText }) {
  const [v,setV]=useState(''); const [isText,setIsText]=useState(false);
  return (
    <div className="addrow">
      <input value={v} placeholder={'اسم ال'+label+' الجديدة'} onChange={e=>setV(e.target.value)} />
      {askText && <label className="cbx"><input type="checkbox" checked={isText}
        onChange={e=>setIsText(e.target.checked)} /> حقل نص</label>}
      <button className="btn grad" onClick={()=>{ if(v.trim()){ onAdd(v.trim(),isText); setV(''); setIsText(false); } }}>أضف</button>
    </div>
  );
}

function Settings({ db, setDb, me, flash }) {
  const cfg = db.config;
  const [tab,setTab]=useState('users');
  const up = patch => setDb(d => ({ ...d, config:{ ...d.config, ...patch } }));
  const setUser = (id,k,v) => setDb(d => ({ ...d, users:d.users.map(u=>u.id===id?{...u,[k]:v}:u) }));
  const addUser = () => setDb(d => ({ ...d, users:[...d.users,
    { id:uid('U'), name:'موظف جديد', code:'', role:'staff', active:false, lastLogin:null }] }));
  const delUser = u => {
    if (u.id === me.id) return flash('ما تقدر تشيل حسابك');
    if (u.role==='admin' && db.users.filter(x=>x.role==='admin'&&x.active).length===1) return flash('لازم يبقى أدمن واحد');
    if (confirm('تشيل «'+u.name+'»؟')) setDb(d => ({ ...d, users:d.users.filter(x=>x.id!==u.id) }));
  };
  const dupCode = c => c && db.users.filter(u=>u.code===c).length>1;
  const TABS=[['users','المستخدمون'],['tasks','المهام'],['fields','الخانات المضافة'],
    ['print','المطبوعات'],['lists','القوائم'],['data','البيانات']];

  return (
    <>
      <div className="phead"><h2>الإعدادات</h2></div>
      <div className="tabs2 plain wide">{TABS.map(([k,t]) =>
        <button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{t}</button>)}</div>

      {tab==='users' && (
        <div className="setblk"><div className="setttl">المستخدمون والأكواد</div>
          <div className="hint">أنت تحط الكود بكيفك. الموقّف ما يقدر يدخل بس بياناته تبقى.</div>
          <div className="utable">
            <div className="uhead"><span>الاسم</span><span>الكود</span><span>الصلاحية</span>
              <span>الحالة</span><span>آخر دخول</span><span></span></div>
            {db.users.map(u => (
              <div className="urow" key={u.id}>
                <input value={u.name} onChange={e=>setUser(u.id,'name',e.target.value)} />
                <input className={'ltr'+(dupCode(u.code)?' bad':'')} value={u.code} placeholder="بدون كود"
                  onChange={e=>setUser(u.id,'code',e.target.value.trim())} />
                <select value={u.role} onChange={e=>setUser(u.id,'role',e.target.value)}>
                  <option value="admin">أدمن</option><option value="staff">موظف</option></select>
                <select value={u.active?'1':'0'} onChange={e=>setUser(u.id,'active',e.target.value==='1')}>
                  <option value="1">مفعّل</option><option value="0">موقّف</option></select>
                <span className="num dim">{u.lastLogin?fmtShort(u.lastLogin):'—'}</span>
                <button className="xbtn" onClick={()=>delUser(u)}>×</button></div>
            ))}
          </div>
          {db.users.some(u=>dupCode(u.code)) && <div className="warnbox">فيه كود مكرر — كل واحد لازم كود مختلف.</div>}
          <button className="btn grad" onClick={addUser}>+ مستخدم</button>
        </div>
      )}

      {tab==='tasks' && (
        <div className="setblk"><div className="setttl">المهام</div>
          <div className="hint">الإخفاء ينطبق على الفريق كله. البيانات ما تنمسح — ترجع بدقة وحدة.</div>
          {cfg.tasks.map((t,i) => (
            <div className="cfgrow" key={t.k}>
              <input value={t.t} onChange={e=>up({tasks:cfg.tasks.map((x,j)=>j===i?{...x,t:e.target.value}:x)})} />
              <span className="tagx">{t.text?'حقل نص':'حالة'}</span>
              <button className={'btn sm'+(t.hidden?' grad':'')}
                onClick={()=>up({tasks:cfg.tasks.map((x,j)=>j===i?{...x,hidden:!x.hidden}:x)})}>
                {t.hidden?'مخفية — رجّعها':'أخفِ'}</button>
              <button className="xbtn" onClick={()=>confirm('تشيل «'+t.t+'» من كل المدارس؟')
                && up({tasks:cfg.tasks.filter((_,j)=>j!==i)})}>×</button></div>
          ))}
          <NewItem label="مهمة" askText onAdd={(t,isText)=>up({tasks:[...cfg.tasks,
            { k:uid('t'), t, hidden:false, ...(isText?{text:true}:{}) }]})} />
        </div>
      )}

      {tab==='fields' && (
        <div className="setblk"><div className="setttl">الخانات المضافة</div>
          <div className="hint">الخانات اللي ضفتها لكل المدارس. الخانات الخاصة بمدرسة وحدة تشيلها من داخل المدرسة نفسها.</div>
          {(cfg.customFields||[]).length===0 && <div className="empty"><b>ما ضفت خانات بعد</b>
            افتح أي مدرسة واضغط «+ خانة» بآخر أي قسم.</div>}
          {(cfg.customFields||[]).map((f,i) => (
            <div className="cfgrow" key={f.k}>
              <input value={f.t} onChange={e=>up({customFields:cfg.customFields.map((x,j)=>j===i?{...x,t:e.target.value}:x)})} />
              <span className="tagx">{SECTIONS[f.section]}</span>
              <span className="tagx">{FTYPES[f.type]}</span>
              {f.type==='status' && <label className="cbx"><input type="checkbox" checked={!!f.counts}
                onChange={e=>up({customFields:cfg.customFields.map((x,j)=>j===i?{...x,counts:e.target.checked}:x)})} /> بالإنجاز</label>}
              <button className="xbtn" onClick={()=>confirm('تشيل «'+f.t+'» من كل المدارس؟')
                && up({customFields:cfg.customFields.filter((_,j)=>j!==i)})}>×</button></div>
          ))}
        </div>
      )}

      {tab==='print' && (
        <div className="setblk"><div className="setttl">المطبوعات</div>
          <div className="hint">ما تدخل بحسبة الإنجاز.</div>
          {cfg.printables.map((p,i) => (
            <div className="cfgrow" key={p.k}>
              <input value={p.t} onChange={e=>up({printables:cfg.printables.map((x,j)=>j===i?{...x,t:e.target.value}:x)})} />
              {p.qty && <span className="tagx">معها عدد</span>}
              <button className="xbtn" onClick={()=>confirm('تشيل «'+p.t+'»؟')
                && up({printables:cfg.printables.filter((_,j)=>j!==i)})}>×</button></div>
          ))}
          <NewItem label="مطبوعة" onAdd={t=>up({printables:[...cfg.printables,{k:uid('p'),t}]})} />
        </div>
      )}

      {tab==='lists' && <>
        <ListEd label="الفريق" arr={cfg.team} onSet={v=>up({team:v})}
          hint="الأسماء اللي تنحسب بالإحصائيات. أي شي خارج القائمة يعتبر ملاحظة مؤقتة." />
        <ListEd label="الأنواع" arr={cfg.types} onSet={v=>up({types:v})} />
        <ListEd label="الشركات" arr={cfg.companies} onSet={v=>up({companies:v})} />
        <div className="setblk"><div className="setttl">نص المسؤول الفاضي</div>
          <input className="one" value={cfg.ownerPlaceholder} onChange={e=>up({ownerPlaceholder:e.target.value})} /></div>
        <div className="setblk"><div className="setttl">الدفعات</div>
          <div className="pills">{cfg.batches.map((b,i)=>(
            <span className="pill" key={i}><input className="ltr" value={b}
              onChange={e=>up({batches:cfg.batches.map((x,j)=>j===i?(+e.target.value||x):x)})} />
              <button onClick={()=>up({batches:cfg.batches.filter((_,j)=>j!==i)})}>×</button></span>))}
            <button className="btn sm" onClick={()=>up({batches:[...cfg.batches,Math.max(...cfg.batches)+1]})}>+ دفعة</button>
          </div></div>
      </>}

      {tab==='data' && (
        <div className="setblk"><div className="setttl">البيانات</div>
          <div className="hint">نزّل نسخة كاملة قبل أي تغيير كبير. والاستيراد يستبدل كل شي — استخدمه عشان تنقل البيانات لجهاز ثاني.</div>
          <div className="addrow">
            <button className="btn" onClick={()=>{
              const b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
              const a=document.createElement('a'); a.href=URL.createObjectURL(b);
              a.download='schools-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); }}>
              نزّل نسخة احتياطية</button>
            <label className="btn grad imp">استورد نسخة
              <input type="file" accept=".json,application/json" onChange={e=>{
                const f=e.target.files && e.target.files[0]; if(!f) return;
                const rd=new FileReader();
                rd.onload=()=>{
                  let raw; try{ raw=JSON.parse(rd.result); }catch(x){ return flash('الملف مو JSON صالح'); }
                  if(!raw || !Array.isArray(raw.schools)) return flash('الملف ما فيه مدارس — تأكد إنه نسخة من هالنظام');
                  const n=raw.schools.length, p2=(raw.prospects||[]).length;
                  if(!confirm('بتستبدل كل البيانات الحالية بـ '+n+' مدرسة و '+p2+' مدرسة محتملة.\n\nالبيانات الحالية بتروح. متأكد؟')) { e.target.value=''; return; }
                  setDb(fixDb(raw)); flash('انستوردت '+n+' مدرسة');
                };
                rd.readAsText(f); e.target.value='';
              }} /></label>
            <button className="btn" onClick={()=>{
              const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
              const cf=cfg.customFields||[];
              const head=['Batch','School','Company','Code','Type','Stars','Owner 1','Owner 2','Instagram','TikTok','Drive',
                'Staff','Other company','Stronger',...cfg.tasks.map(t=>t.t),...cfg.printables.map(p=>p.t),
                ...cf.map(f=>f.t),'Bags qty','Notes','With us','Joined','Left'];
              const rows=db.schools.map(s=>[s.batch,s.name,s.company,s.code,s.type,s.stars||0,s.owner1,s.owner2,
                s.instagram,s.tiktok,s.drive,Number(s.staffCount)===2?'ستافين':'واحد',s.otherCompany,STRONG[s.stronger]||'',
                ...cfg.tasks.map(t=>t.text?(s[t.k]||''):ST[s.tasks?.[t.k]||'none']),
                ...cfg.printables.map(p=>PST[s.printables?.[p.k]||'need']),
                ...cf.map(f=>{const v=s.custom?.[f.k]; return f.type==='status'?ST[v||'none']:(v||'');}),
                s.bagsQty,s.notes,s.active===false?'طلعت':'معانا',
                s.joinedAt?fmtShort(s.joinedAt):'',s.leftAt?fmtShort(s.leftAt):''].map(esc).join(','));
              const b=new Blob(['\uFEFF'+[head.map(esc).join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8'});
              const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='schools.csv'; a.click(); }}>
              نزّل كل المدارس CSV</button>
          </div>
        </div>
      )}
    </>
  );
}
