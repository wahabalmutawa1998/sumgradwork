function Schools(ctx) {
  const { db, setDb, me, isAdmin, edit, pendVal, flash, mutate, logLine, addPerson, revertLog } = ctx;
  const cfg = db.config;
  const [batch, setBatch] = useState(cfg.batches[0]);
  const [q,setQ]=useState(''); const [fC,setFC]=useState([]); const [fT,setFT]=useState([]);
  const [fO,setFO]=useState([]); const [fS,setFS]=useState([]); const [fStar,setFStar]=useState([]);
  const [sort,setSort]=useState('stars'); const [open,setOpen]=useState(null); const [adding,setAdding]=useState(false);

  const prog = s => progressOf(s, cfg);
  const batchMap = useMemo(() => { const m={};
    db.schools.forEach(s => { if (s.active === false) return;
      const k = norm(s.name); (m[k] = m[k] || new Set()).add(s.batch); }); return m; }, [db.schools]);
  const batchesOf = s => s.batchesOverride ? s.batchesOverride : [...(batchMap[norm(s.name)] || new Set())].sort();
  const owners = useMemo(() => { const set = new Set(cfg.team);
    db.schools.forEach(s => [s.owner1,s.owner2].forEach(o => o && set.add(o)));
    return [...set].sort((a,b) => a.localeCompare(b,'ar')); }, [db.schools, cfg.team]);
  const isPerson = n => cfg.team.includes(n);
  const isNew = s => s.joinedAt && daysSince(s.joinedAt) < NEW_DAYS;

  const inBatch = db.schools.filter(s => s.batch === batch);
  const live = inBatch.filter(s => s.active !== false);

  const shown = useMemo(() => {
    let out = inBatch.filter(s => {
      if (q && ![s.name,s.code,s.slogan,s.idea,s.notes,s.owner1,s.owner2].join(' ').toLowerCase().includes(q.toLowerCase())) return false;
      if (fC.length && !fC.includes(s.company)) return false;
      if (fT.length && !fT.includes(s.type)) return false;
      if (fO.length && !fO.some(o => s.owner1===o || s.owner2===o)) return false;
      if (fStar.length && !fStar.includes(String(s.stars||0))) return false;
      if (fS.length) { const p = prog(s), gone = s.active === false;
        if (!fS.some(f => f==='done'?(!gone&&p===100) : f==='wip'?(!gone&&p>0&&p<100) : f==='zero'?(!gone&&p===0)
          : f==='late'?(!gone&&p<50) : f==='noowner'?(!isPerson(s.owner1)&&!isPerson(s.owner2))
          : f==='shared'?Number(s.staffCount)===2 : f==='solo'?Number(s.staffCount)!==2
          : f==='gone'?gone : f==='new'?isNew(s)
          : f==='noig'?!s.instagram : false)) return false; }
      return true;
    });
    if (!fS.includes('gone')) out = [...out.filter(s => s.active!==false), ...out.filter(s => s.active===false)];
    const by = { stars:(a,b)=>(b.stars||0)-(a.stars||0)||a.name.localeCompare(b.name,'ar'),
      low:(a,b)=>prog(a)-prog(b), high:(a,b)=>prog(b)-prog(a),
      newest:(a,b)=>String(b.joinedAt||'').localeCompare(String(a.joinedAt||'')),
      name:(a,b)=>a.name.localeCompare(b.name,'ar'), order:null };
    if (by[sort]) out = [...out].sort(by[sort]);
    return out;
  }, [inBatch,q,fC,fT,fO,fS,fStar,sort,cfg]);

  const avg = live.length ? Math.round(live.reduce((a,s)=>a+prog(s),0)/live.length) : 0;
  const doneN = live.filter(s => prog(s)===100).length;
  const zeroN = live.filter(s => prog(s)===0).length;
  const noOwn = live.filter(s => !isPerson(s.owner1) && !isPerson(s.owner2)).length;
  const newN  = live.filter(isNew).length;
  const goneN = inBatch.length - live.length;

  const fullyDone = cfg.tasks.filter(t => !t.hidden && !t.text && live.length
    && live.every(s => (s.tasks?.[t.k]||'none') === 'done'));

  const saveNew = draft => {
    const s = { ...draft, id:uid('S'), batch, no:'', active:true, batchesOverride:null, bagsQty:'',
      joinedAt: nowISO(), leftAt:null, leftOwner1:'', leftOwner2:'', fromSheet:false, custom:{}, localFields:[],
      tasks: Object.fromEntries(cfg.tasks.filter(t=>!t.text).map(t=>[t.k,'none'])),
      printables: Object.fromEntries(cfg.printables.map(p=>[p.k,'need'])) };
    mutate('إضافة ' + s.name,
      d => logLine({ ...d, schools:[...d.schools, s] }, { kind:'create', schoolId:s.id, schoolName:s.name,
        batch, path:'—', label:'مدرسة جديدة', from:'', to:s.name }),
      d => ({ ...d, schools: d.schools.filter(x => x.id !== s.id) }));
    setAdding(false); flash('انضافت «' + s.name + '»');
  };
  const delSchool = s => {
    if (!isAdmin) return flash('الحذف للأدمن بس');
    if (!confirm('تشيل «' + s.name + '» من دفعة ' + s.batch + '؟ تقدر ترجعها بـ ↶')) return;
    mutate('حذف ' + s.name,
      d => logLine({ ...d, schools: d.schools.filter(x => x.id !== s.id) }, { kind:'delete', schoolId:s.id,
        schoolName:s.name, batch:s.batch, path:'—', label:'حذف مدرسة', from:s.name, to:'' }),
      d => ({ ...d, schools:[...d.schools, s] }));
  };
  const hideTask = k => { setDb(d => ({ ...d, config:{ ...d.config,
    tasks: d.config.tasks.map(t => t.k===k ? { ...t, hidden:true } : t) } })); flash('انخفت للفريق كله'); };

  const addField = (school, f, scope) => {
    if (scope === 'all') mutate('خانة «' + f.t + '» لكل المدارس',
      d => ({ ...d, config:{ ...d.config, customFields:[...(d.config.customFields||[]), f] } }),
      d => ({ ...d, config:{ ...d.config, customFields:(d.config.customFields||[]).filter(x => x.k !== f.k) } }));
    else mutate('خانة «' + f.t + '» لـ' + school.name,
      d => ({ ...d, schools: d.schools.map(s => s.id===school.id ? { ...s, localFields:[...(s.localFields||[]), f] } : s) }),
      d => ({ ...d, schools: d.schools.map(s => s.id===school.id ? { ...s, localFields:(s.localFields||[]).filter(x => x.k!==f.k) } : s) }));
    flash('انضافت خانة «' + f.t + '»');
  };
  const dropField = (school, f) => {
    if (!confirm('تشيل خانة «' + f.t + '»؟')) return;
    const global = (cfg.customFields||[]).some(x => x.k === f.k);
    if (global) mutate('حذف خانة ' + f.t,
      d => ({ ...d, config:{ ...d.config, customFields:d.config.customFields.filter(x => x.k!==f.k) } }),
      d => ({ ...d, config:{ ...d.config, customFields:[...d.config.customFields, f] } }));
    else mutate('حذف خانة ' + f.t,
      d => ({ ...d, schools: d.schools.map(s => s.id===school.id ? { ...s, localFields:s.localFields.filter(x=>x.k!==f.k) } : s) }),
      d => ({ ...d, schools: d.schools.map(s => s.id===school.id ? { ...s, localFields:[...s.localFields, f] } : s) }));
  };

  const active = fC.length+fT.length+fO.length+fS.length+fStar.length;

  return (
    <>
      <div className="btabs">
        {cfg.batches.map(b => (
          <button key={b} className={'btab'+(b===batch?' on':'')} onClick={() => { setBatch(b); setOpen(null); }}>
            دفعة <span className="num">{b}</span>
            <em>{db.schools.filter(s => s.batch===b && s.active!==false).length}</em></button>
        ))}
      </div>

      <div className="cards">
        <div className="kpi"><span>مدارس معانا</span><b className="num">{live.length}</b>
          <i>{goneN ? goneN + ' طلعت' : 'ما طلع أحد'}</i></div>
        <div className="kpi"><span>خلّصت كامل</span><b className="num ok">{doneN}</b><i>من {live.length}</i></div>
        <div className="kpi"><span>ما بدينا فيها</span><b className="num bad">{zeroN}</b><i>ولا مهمة</i></div>
        <div className="kpi"><span>تنتظر تعيين</span><b className={'num'+(noOwn?' warn':'')}>{noOwn}</b><i>بدون مسؤول</i></div>
        <div className="kpi"><span>جديدة</span><b className={'num'+(newN?' new':'')}>{newN}</b><i>آخر {NEW_DAYS} يوم</i></div>
        <div className="kpi wide"><span>إنجاز الدفعة</span><b className="num">{avg}%</b>
          <div className="pbar"><span style={{width:avg+'%'}} /></div></div>
      </div>

      {isAdmin && fullyDone.length > 0 && (
        <div className="tip"><span>خلصت عند كل المدارس النشطة:</span>
          {fullyDone.map(t => <button key={t.k} className="tipbtn" onClick={() => hideTask(t.k)}>أخفِ {t.t}</button>)}</div>
      )}

      <div className="bar">
        <input className="search" placeholder="دوّر باسم المدرسة، الكود، السلوقن، الفكرة، المسؤول…"
          value={q} onChange={e => setQ(e.target.value)} />
        <MultiFilter label="الشركة" value={fC} onChange={setFC} options={cfg.companies.map(c=>({v:c,t:c}))} />
        <MultiFilter label="النوع" value={fT} onChange={setFT} options={cfg.types.map(t=>({v:t,t}))} />
        <MultiFilter label="المسؤول" value={fO} onChange={setFO} options={owners.map(o=>({v:o,t:o}))} />
        <MultiFilter label="الأهمية" value={fStar} onChange={setFStar}
          options={[{v:'3',t:'★★★ مهمة حيل'},{v:'2',t:'★★ متوسطة'},{v:'1',t:'★ مو مهمة'},{v:'0',t:'ما تحددت'}]} />
        <MultiFilter label="الحالة" value={fS} onChange={setFS} options={[
          {v:'late',t:'متأخرة (أقل من 50%)'},{v:'zero',t:'ما بدينا فيها'},{v:'wip',t:'شغّالة'},
          {v:'done',t:'خلّصت'},{v:'new',t:'جديدة'},{v:'noowner',t:'تنتظر تعيين'},
          {v:'solo',t:'ستاف واحد'},{v:'shared',t:'ستافين (مشتركة)'},
          {v:'noig',t:'بدون انستقرام'},{v:'gone',t:'طلعت'}]} />
        <select className="sel" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="stars">الأهم أول</option><option value="low">الأقل إنجازاً</option>
          <option value="high">الأكثر إنجازاً</option><option value="newest">الأحدث انضماماً</option>
          <option value="name">أبجدي</option><option value="order">ترتيب الملف</option>
        </select>
        {isAdmin && <button className="btn grad" onClick={() => setAdding(true)}>+ مدرسة</button>}
      </div>

      {active > 0 && (
        <div className="chips"><span className="chips-l">مفعّل:</span>
          {[...fC,...fT,...fO,...fStar.map(s => '★'.repeat(+s)||'بدون نجوم'),...fS].map((x,i) => <em key={i}>{x}</em>)}
          <button onClick={() => { setFC([]);setFT([]);setFO([]);setFS([]);setFStar([]); }}>مسح الكل</button>
          <span className="chips-n num">{shown.length}</span></div>
      )}

      <div className="list">
        {shown.length === 0 && <div className="empty"><b>ما في نتايج</b>غيّر الفلاتر أو دوّر بكلمة ثانية.</div>}
        {shown.map(s => (
          <SchoolRow key={s.id} s={s} ctx={ctx} cfg={cfg} owners={owners} isPerson={isPerson}
            batches={batchesOf(s)} progress={prog(s)} isNew={isNew(s)}
            open={open===s.id} setOpen={() => setOpen(open===s.id?null:s.id)}
            del={() => delSchool(s)} addField={addField} dropField={dropField} />
        ))}
      </div>
      {adding && <NewSchool batch={batch} cfg={cfg} owners={owners} onSave={saveNew}
        onCancel={() => setAdding(false)} addPerson={isAdmin?addPerson:null} />}
    </>
  );
}

function SchoolRow({ s, ctx, cfg, owners, isPerson, batches, progress, isNew, open, setOpen, del, addField, dropField }) {
  const { isAdmin, edit, pendVal, db, revertLog } = ctx;
  const [tab, setTab] = useState('main');
  const [addSec, setAddSec] = useState(null);
  const gone = s.active === false;
  const E = (p,v,l,o) => edit(s,p,v,l,o);
  const P = p => pendVal(s,p,getP(s,p));
  const ownTxt = o => o || cfg.ownerPlaceholder;
  const myLog = db.log.filter(l => l.schoolId === s.id);
  const shownTasks = cfg.tasks.filter(t => !t.hidden);
  const canEditFields = isAdmin;

  return (
    <div className={'row'+(open?' open':'')+(gone?' gone':'')+(isNew?' fresh':'')} data-co={s.company}>
      <div className="spine" />
      <div className="rowhead" onClick={e => { if (!e.target.closest('button,a')) setOpen(); }}>
        <div className="nmwrap">
          <div className="nmline">
            <span className="nm">{s.name}</span>
            <Stars n={s.stars||0} onSet={v => E('stars',v,'الأهمية')} />
            <span className="bchips">{batches.map(b =>
              <em key={b} className={'num'+(b===s.batch?' cur':'')}>{String(b).slice(2)}</em>)}</span>
            {isNew && <span className="tag-new">جديدة · <span className="num">{daysSince(s.joinedAt)}</span> يوم</span>}
            {gone && <span className="tag-gone">طلعت{s.leftAt && <span className="num"> · {fmtShort(s.leftAt)}</span>}</span>}
            <span className={'tag-staff '+(Number(s.staffCount)===2 ? 'two '+(s.stronger||'none') : 'one')}
              title={Number(s.staffCount)===2
                ? 'ستافين' + (s.otherCompany ? ' — الثاني مع ' + s.otherCompany : ' — ما حددنا شركة الثاني')
                  + (s.stronger ? ' — ' + STRONG[s.stronger] : '')
                : 'ستاف واحد — احنا بس'}>
              <i className="sdots"><b /><b /></i>
              {Number(s.staffCount)===2 ? 'ستافين' : 'ستاف واحد'}
              {Number(s.staffCount)===2 && s.stronger ? ' · ' + STRONG[s.stronger] : ''}
            </span>
          </div>
          <div className="sub">
            {s.code ? <span className="num">#{s.code}</span> : null}
            {s.joinedAt ? <span className="joined num">معانا من {fmtShort(s.joinedAt)}</span> : null}
            {s.slogan ? <span className="slg">{s.slogan}</span> : <span className="dim">بدون سلوقن</span>}
          </div>
        </div>
        <span className={'co co-'+(s.company==='SUM'?'sum':s.company==='Trend'?'tr':'na')}>{s.company}</span>
        <span className="typ">{s.type}</span>
        <div className="owns">
          <span className={'ow'+(isPerson(s.owner1)?'':' soft')} title={ownTxt(s.owner1)}><i>1</i><b>{ownTxt(s.owner1)}</b></span>
          <span className={'ow'+(isPerson(s.owner2)?'':' soft')} title={ownTxt(s.owner2)}><i>2</i><b>{ownTxt(s.owner2)}</b></span>
        </div>
        <div className="lnks">
          {s.instagram ? <a href={igUrl(s.instagram)} target="_blank" rel="noreferrer" className="lnk ig" title="انستقرام">IG</a>
            : <span className="lnk off" title="ما فيه انستقرام">IG</span>}
          {s.tiktok ? <a href={ttUrl(s.tiktok)} target="_blank" rel="noreferrer" className="lnk tt" title="تيك توك">TT</a>
            : <span className="lnk off" title="ما فيه تيك توك">TT</span>}
          {okUrl(s.drive) ? <a href={s.drive} target="_blank" rel="noreferrer" className="lnk dr" title="لوقو المدرسة">لوقو</a>
            : <span className="lnk off" title="ما فيه لنك لوقو">لوقو</span>}
        </div>
        <button className="caret">{open?'▲':'▼'}</button>
      </div>

      {open && (
        <div className="body">
          <div className="tabs2">
            {[['main','الأساسي'],['tasks','المهام'],['print','المطبوعات'],['log','السجل']].map(([k,t]) =>
              <button key={k} className={tab===k?'on':''} onClick={() => setTab(k)}>{t}</button>)}
            <span className="prog">الإنجاز <b className="num">{progress}%</b></span>
          </div>

          {tab === 'main' && <MainTab s={s} cfg={cfg} owners={owners} batches={batches} isAdmin={isAdmin}
            del={del} E={E} P={P} addPerson={ctx.addPerson} onAddField={() => setAddSec('basic')}
            onAddLink={() => setAddSec('links')} dropField={f => dropField(s,f)} canEditFields={canEditFields} />}

          {tab === 'tasks' && (
            <div className="tgrid">
              {shownTasks.map(t => t.text ? (
                <div className="trow txt" key={t.k}><span className="tnm">{t.t}</span>
                  <input className={P(t.k).pending?'pending':''} value={P(t.k).val||''} placeholder="اكتب هنا…"
                    onChange={e => E(t.k, e.target.value, t.t)} /></div>
              ) : (
                <div className="trow" key={t.k}>
                  <i className={'dot '+(P('tasks.'+t.k).val||'none')} />
                  <span className="tnm">{t.t}</span>
                  <select className={P('tasks.'+t.k).pending?'pending':''} value={P('tasks.'+t.k).val||'none'}
                    onChange={e => E('tasks.'+t.k, e.target.value, t.t,
                      { fromTxt:ST[s.tasks?.[t.k]||'none'], toTxt:ST[e.target.value] })}>
                    {Object.keys(ST).map(k => <option key={k} value={k}>{ST[k]}</option>)}</select>
                  {isAdmin && <button className="hidebtn" title="أخفِ للفريق كله"
                    onClick={() => ctx.setDb(d => ({ ...d, config:{ ...d.config,
                      tasks:d.config.tasks.map(x => x.k===t.k?{...x,hidden:true}:x) } }))}>أخفِ</button>}
                </div>
              ))}
              {fieldsOf(s,cfg,'tasks').map(f => (
                <CustomField key={f.k} f={f} pv={P('custom.'+f.k)} canDrop={canEditFields}
                  onDrop={() => dropField(s,f)}
                  onChange={v => E('custom.'+f.k, v, f.t,
                    f.type==='status' ? { fromTxt:ST[s.custom?.[f.k]||'none'], toTxt:ST[v] } : {})} />
              ))}
              <div className="addwrap"><AddFieldBtn onClick={() => setAddSec('tasks')} /></div>
            </div>
          )}

          {tab === 'print' && <>
            <div className="hint">المطبوعات ما تدخل بحسبة الإنجاز — شغل توصيل مو شغل إبداعي.</div>
            <div className="tgrid">
              {cfg.printables.map(p => (
                <div className="trow" key={p.k}>
                  <i className={'dot p-'+(P('printables.'+p.k).val||'need')} />
                  <span className="tnm">{p.t}</span>
                  {p.qty && <input className="qty ltr" placeholder="العدد" value={P('bagsQty').val||''}
                    onChange={e => E('bagsQty', e.target.value, 'عدد الأكياس')} />}
                  <select className={P('printables.'+p.k).pending?'pending':''} value={P('printables.'+p.k).val||'need'}
                    onChange={e => E('printables.'+p.k, e.target.value, p.t,
                      { fromTxt:PST[s.printables?.[p.k]||'need'], toTxt:PST[e.target.value] })}>
                    {Object.keys(PST).map(k => <option key={k} value={k}>{PST[k]}</option>)}</select>
                </div>
              ))}
              {fieldsOf(s,cfg,'print').map(f => (
                <CustomField key={f.k} f={f} pv={P('custom.'+f.k)} canDrop={canEditFields}
                  onDrop={() => dropField(s,f)} onChange={v => E('custom.'+f.k, v, f.t)} />
              ))}
              <div className="addwrap"><AddFieldBtn onClick={() => setAddSec('print')} /></div>
            </div>
          </>}

          {tab === 'log' && (
            <div className="loglist">
              {myLog.length === 0 && <div className="hint">ما فيه تعديلات على هالمدرسة بعد.</div>}
              {myLog.slice(0,60).map(l => <LogLine key={l.id} l={l} onRevert={isAdmin?revertLog:null} />)}
            </div>
          )}
        </div>
      )}

      {addSec && <AddField section={addSec} isAdmin={isAdmin} onCancel={() => setAddSec(null)}
        onAdd={(f,scope) => { addField(s,f,scope); setAddSec(null); }} />}
    </div>
  );
}
