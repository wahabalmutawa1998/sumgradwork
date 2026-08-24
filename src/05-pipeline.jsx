function gcalUrl(p) {
  if (!p.meetingAt) return '';
  const st = new Date(p.meetingAt);
  const en = new Date(st.getTime() + 60*60*1000);
  const z = d => d.toISOString().replace(/[-:]|\.\d{3}/g,'');
  const det = ['مدرسة محتملة: ' + p.name,
    p.owner ? 'المسؤول: ' + p.owner : '', p.source ? 'عن طريق: ' + p.source : '',
    'الاحتمالية: ' + (CHANCE[p.chance]||{}).t, p.notes || ''].filter(Boolean).join('\n');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent('ميتنق — ' + p.name)
    + '&dates=' + z(st) + '/' + z(en)
    + '&details=' + encodeURIComponent(det);
}

function Pipeline(ctx) {
  const { db, me, isAdmin, flash, mutate, logLine, addPerson } = ctx;
  const cfg = db.config;
  const [tab, setTab] = useState('open');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [winning, setWinning] = useState(null);
  const owners = useMemo(() => { const s = new Set(cfg.team);
    db.prospects.forEach(p => p.owner && s.add(p.owner));
    return [...s].sort((a,b) => a.localeCompare(b,'ar')); }, [db.prospects, cfg.team]);

  const list = db.prospects.filter(p => tab === 'open' ? !p.won : p.won)
    .sort((a,b) => tab === 'open'
      ? (CHANCE[b.chance]||{}).p - (CHANCE[a.chance]||{}).p
      : String(b.wonAt||'').localeCompare(String(a.wonAt||'')));

  const pTxt = (k,v) => k==='chance' ? (CHANCE[v]||{}).t
    : ['meetingSet','meetingDone'].includes(k) ? (v?'إي':'لا')
    : k==='meetingAt' ? (v?fmt(v):'(ما تحدد)') : (v===''||v==null?'(فاضي)':String(v));
  const setP2 = (p, k, v, label) => {
    const from = p[k];
    if (String(from ?? '') === String(v ?? '')) return;
    const meta = { schoolId:p.id, schoolName:p.name, batch:'محتملة', path:'prospect.'+k,
      label, from:from??'', to:v??'', fromTxt:pTxt(k,from), toTxt:pTxt(k,v) };
    const write = (val, ft, tt) => d => logLine(
      { ...d, prospects: d.prospects.map(x => x.id===p.id ? { ...x, [k]:val } : x) },
      { kind:'direct', ...meta, from: val===v ? (from??'') : (v??''), to: val??'',
        fromTxt: val===v ? pTxt(k,from) : pTxt(k,v), toTxt: pTxt(k,val) });
    mutate(label + ' — ' + p.name, write(v), write(from));
  };
  const addP = draft => {
    const p = fixProspect({ ...draft, id:uid('P'), createdAt:nowISO() });
    mutate('مدرسة محتملة ' + p.name,
      d => logLine({ ...d, prospects:[p, ...d.prospects] },
        { kind:'create', schoolId:p.id, schoolName:p.name, batch:'محتملة', path:'—',
          label:'مدرسة محتملة جديدة', from:'', to:p.name }),
      d => ({ ...d, prospects: d.prospects.filter(x => x.id !== p.id) }));
    setAdding(false); flash('انضافت «' + p.name + '»');
  };
  const delP = p => { if (!confirm('تشيل «' + p.name + '»؟')) return;
    mutate('حذف محتملة ' + p.name,
      d => logLine({ ...d, prospects: d.prospects.filter(x => x.id !== p.id) },
        { kind:'delete', schoolId:p.id, schoolName:p.name, batch:'محتملة', path:'—',
          label:'حذف مدرسة محتملة', from:p.name, to:'' }),
      d => ({ ...d, prospects:[p, ...d.prospects] })); };

  const convert = (p, batch) => {
    const stamp = nowISO();
    const s = { id:uid('S'), batch, no:'', name:p.name, company:'—', active:true, code:'', type:'بنات',
      owner1:p.owner||'', owner2:'', stars:0, instagram:p.instagram||'', tiktok:p.tiktok||'', drive:p.drive||'',
      staffCount:1, otherCompany:'', stronger:'', slogan:'', idea:'',
      notes:[p.notes, p.source ? 'جانا عن طريق: '+p.source : ''].filter(Boolean).join('\n'),
      bagsQty:'', batchesOverride:null, joinedAt:stamp, leftAt:null, leftOwner1:'', leftOwner2:'',
      fromSheet:false, custom:{}, localFields:[],
      tasks:Object.fromEntries(cfg.tasks.filter(t=>!t.text).map(t=>[t.k,'none'])),
      printables:Object.fromEntries(cfg.printables.map(x=>[x.k,'need'])) };
    mutate('توقيع ' + p.name,
      d => logLine({ ...d, schools:[...d.schools, s],
        prospects:d.prospects.map(x => x.id===p.id ? { ...x, won:true, wonAt:stamp, convertedTo:s.id } : x) },
        { kind:'create', schoolId:s.id, schoolName:s.name, batch, path:'—',
          label:'وقّعت — من المدارس المحتملة', from:'', to:s.name }),
      d => ({ ...d, schools:d.schools.filter(x => x.id!==s.id),
        prospects:d.prospects.map(x => x.id===p.id ? { ...x, won:false, wonAt:null, convertedTo:null } : x) }));
    setWinning(null); setOpen(null);
    flash('«' + p.name + '» صارت معانا بدفعة ' + batch);
  };

  const openN = db.prospects.filter(p => !p.won).length;
  const wonN  = db.prospects.filter(p => p.won).length;
  const meetings = db.prospects.filter(p => !p.won && p.meetingSet && !p.meetingDone).length;
  const hot = db.prospects.filter(p => !p.won && ['strong','almost'].includes(p.chance)).length;
  const expected = db.prospects.filter(p => !p.won)
    .reduce((a,p) => a + ((CHANCE[p.chance]||{}).p || 0)/100, 0);

  return (
    <>
      <div className="phead"><h2>مدارس محتملة</h2>
        <div className="tabs2 plain">
          <button className={tab==='open'?'on':''} onClick={() => { setTab('open'); setOpen(null); }}>
            بالمفاوضات <em className="num">{openN}</em></button>
          <button className={tab==='won'?'on':''} onClick={() => { setTab('won'); setOpen(null); }}>
            وقّعوا <em className="num">{wonN}</em></button>
        </div>
        {isAdmin && <button className="btn grad" style={{marginInlineStart:'auto'}}
          onClick={() => setAdding(true)}>+ مدرسة محتملة</button>}
      </div>

      <div className="cards">
        <div className="kpi"><span>بالمفاوضات</span><b className="num">{openN}</b><i>مدرسة</i></div>
        <div className="kpi"><span>ميتنقات معلّقة</span><b className={'num'+(meetings?' warn':'')}>{meetings}</b><i>ما قعدناها</i></div>
        <div className="kpi"><span>احتمالية عالية</span><b className="num ok">{hot}</b><i>قوي أو شبه مؤكد</i></div>
        <div className="kpi"><span>متوقع نوقّع</span><b className="num">{expected.toFixed(1)}</b><i>بحسب الاحتمالية</i></div>
        <div className="kpi"><span>وقّعوا</span><b className="num ok">{wonN}</b><i>صاروا معانا</i></div>
      </div>

      <div className="list">
        {list.length === 0 && <div className="empty">
          <b>{tab==='open' ? 'ما فيه مدارس بالمفاوضات' : 'ما وقّع أحد بعد'}</b>
          {tab==='open' ? 'اضغط «+ مدرسة محتملة» وابدأ.' : 'أول ما تأشر «صارت معانا» تطلع هني.'}</div>}
        {list.map(p => {
          const isOpen = open === p.id, ch = CHANCE[p.chance] || {};
          return (
            <div className={'row prow'+(isOpen?' open':'')+(p.won?' won':'')} key={p.id} data-ch={p.chance}>
              <div className="spine" />
              <div className="rowhead prowhead" onClick={e => { if (!e.target.closest('button,a,select,input')) setOpen(isOpen?null:p.id); }}>
                <div className="nmwrap">
                  <div className="nmline"><span className="nm">{p.name}</span>
                    {p.won && <span className="tag-won">وقّعت{p.wonAt && <span className="num"> · {fmtShort(p.wonAt)}</span>}</span>}
                    {!p.won && p.meetingSet && !p.meetingDone && p.meetingAt &&
                      <span className="tag-meet">ميتنق <span className="num">{fmtShort(p.meetingAt)}</span></span>}
                    {!p.won && p.meetingDone && <span className="tag-met">قعدنا الميتنق</span>}
                  </div>
                  <div className="sub">
                    {p.source ? <span>عن طريق {p.source}</span> : <span className="dim">ما ندري عن طريق منو</span>}
                    {p.notes ? <span className="slg">{p.notes}</span> : null}
                  </div>
                </div>
                <span className={'chance c-'+p.chance}>{ch.t}<em className="num">{ch.p}%</em></span>
                <div className="owns"><span className={'ow'+(cfg.team.includes(p.owner)?'':' soft')}>
                  <i>1</i><b>{p.owner || cfg.ownerPlaceholder}</b></span></div>
                <div className="lnks">
                  {p.instagram ? <a href={igUrl(p.instagram)} target="_blank" rel="noreferrer" className="lnk ig">IG</a>
                    : <span className="lnk off">IG</span>}
                  {p.tiktok ? <a href={ttUrl(p.tiktok)} target="_blank" rel="noreferrer" className="lnk tt">TT</a>
                    : <span className="lnk off">TT</span>}
                </div>
                <button className="caret">{isOpen?'▲':'▼'}</button>
              </div>

              {isOpen && (
                <div className="body">
                  <div className="fsec">الأساسي</div>
                  <div className="grid g2">
                    <div className="f"><label>اسم المدرسة</label>
                      <input value={p.name} onChange={e => setP2(p,'name',e.target.value,'اسم المدرسة')} /></div>
                    <div className="f"><label>عن طريق منو جايين؟</label>
                      <input value={p.source} placeholder="اسم الشخص أو الجهة"
                        onChange={e => setP2(p,'source',e.target.value,'المصدر')} /></div>
                    <OwnerPick label="المسؤول" value={p.owner} options={owners} known={cfg.team}
                      placeholder={cfg.ownerPlaceholder} onAddPerson={isAdmin?addPerson:null}
                      onChange={v => setP2(p,'owner',v,'المسؤول')} />
                    <div className="f"><label>الاحتمالية</label>
                      <div className="segs sm">
                        {Object.entries(CHANCE).map(([k,v]) => (
                          <button key={k} className={'seg'+(p.chance===k?' on':'')}
                            onClick={() => setP2(p,'chance',k,'الاحتمالية')}>{v.t}</button>))}
                      </div></div>
                  </div>

                  <div className="fsec">الميتنق</div>
                  <div className="grid g2">
                    <div className="f"><label>تحدد ميتنق؟</label>
                      <select value={p.meetingSet?'yes':'no'}
                        onChange={e => setP2(p,'meetingSet',e.target.value==='yes','تحديد ميتنق')}>
                        <option value="no">لا</option><option value="yes">إي</option></select></div>
                    {p.meetingSet && <>
                      <div className="f"><label>متى؟</label>
                        <input type="datetime-local" className="ltr" value={p.meetingAt ? p.meetingAt.slice(0,16) : ''}
                          onChange={e => setP2(p,'meetingAt', e.target.value ? new Date(e.target.value).toISOString() : '','موعد الميتنق')} /></div>
                      <div className="f"><label>قعدنا الميتنق؟</label>
                        <select value={p.meetingDone?'yes':'no'}
                          onChange={e => setP2(p,'meetingDone',e.target.value==='yes','حضور الميتنق')}>
                          <option value="no">لا، لسا</option><option value="yes">إي، قعدناه</option></select></div>
                      <div className="f"><label>&nbsp;</label>
                        {p.meetingAt
                          ? <a className="btn gcal" href={gcalUrl(p)} target="_blank" rel="noreferrer">أضفه لقوقل كالندر</a>
                          : <span className="hint sm">حدّد الموعد أول</span>}</div>
                    </>}
                  </div>

                  <div className="fsec">اللنكات</div>
                  <div className="grid g2">
                    <div className="f"><label>انستقرام</label><input className="ltr" value={p.instagram}
                      onChange={e => setP2(p,'instagram',e.target.value,'انستقرام')} /></div>
                    <div className="f"><label>تيك توك</label><input className="ltr" value={p.tiktok}
                      onChange={e => setP2(p,'tiktok',e.target.value,'تيك توك')} /></div>
                    <div className="f"><label>لنك الدرايف</label><input className="ltr" value={p.drive}
                      onChange={e => setP2(p,'drive',e.target.value,'الدرايف')} /></div>
                  </div>

                  <div className="fsec">ملاحظات</div>
                  <div className="grid g1"><div className="f">
                    <textarea value={p.notes} placeholder="أي شي عن المفاوضات…"
                      onChange={e => setP2(p,'notes',e.target.value,'ملاحظات')} /></div></div>

                  <div className="fsec">صارت معانا؟</div>
                  {p.won ? (
                    <div className="wonbox">وقّعت بتاريخ <b className="num">{fmtShort(p.wonAt)}</b> — موجودة بالمدارس الحين.</div>
                  ) : (
                    <div className="addrow">
                      <button className="btn grad" onClick={() => setWinning(p)}>إي — صارت معانا</button>
                      <span className="hint sm">بنسألك أي دفعة، وينتسجل تاريخ التوقيع تلقائياً وما ينشال.</span>
                    </div>
                  )}
                  {isAdmin && <div className="delrow"><button className="btn danger" onClick={() => delP(p)}>شيل المدرسة المحتملة</button></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding && <NewProspect cfg={cfg} owners={owners} onSave={addP}
        onCancel={() => setAdding(false)} addPerson={isAdmin?addPerson:null} />}
      {winning && <PickBatch p={winning} cfg={cfg} onPick={b => convert(winning,b)} onCancel={() => setWinning(null)} />}
    </>
  );
}

function PickBatch({ p, cfg, onPick, onCancel }) {
  const [b, setB] = useState(cfg.batches[0]);
  useEffect(() => { const h = e => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, []);
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal sm">
        <div className="modal-h"><div><b>«{p.name}» صارت معانا</b><span>اختر الدفعة اللي تنتقل لها</span></div>
          <button className="xbtn" onClick={onCancel}>×</button></div>
        <div className="modal-b">
          <div className="segs big">{cfg.batches.map(x =>
            <button key={x} className={'seg'+(b===x?' on':'')} onClick={() => setB(x)}>
              دفعة <span className="num">{x}</span></button>)}</div>
          <div className="hint" style={{marginTop:14}}>
            بتنتقل لصفحة المدارس بدفعة <b className="num">{b}</b> ببياناتها، وينتسجل تاريخ التوقيع
            <b className="num"> {fmtShort(new Date())}</b> ثابت ما ينشال.
          </div>
        </div>
        <div className="modal-f">
          <button className="btn" onClick={onCancel}>إلغاء</button>
          <button className="btn grad" onClick={() => onPick(b)}>انقلها لدفعة {b}</button>
        </div>
      </div>
    </div>
  );
}

function NewProspect({ cfg, owners, onSave, onCancel, addPerson }) {
  const [d, setD] = useState({ name:'', source:'', owner:'', chance:'mid',
    meetingSet:false, meetingAt:'', meetingDone:false, instagram:'', tiktok:'', drive:'', notes:'' });
  const [err, setErr] = useState('');
  const set = (k,v) => { setD(x => ({ ...x, [k]:v })); setErr(''); };
  useEffect(() => { const h = e => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, []);
  const go = () => { if (!d.name.trim()) return setErr('لازم تكتب اسم المدرسة'); onSave({ ...d, name:d.name.trim() }); };
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <div className="modal-h"><div><b>مدرسة محتملة</b><span>مدرسة نتفاوض وياها</span></div>
          <button className="xbtn" onClick={onCancel}>×</button></div>
        <div className="modal-b">
          <div className="fsec">الأساسي</div>
          <div className="grid g2">
            <div className="f"><label>اسم المدرسة</label>
              <input autoFocus value={d.name} onChange={e => set('name',e.target.value)} /></div>
            <div className="f"><label>عن طريق منو جايين؟</label>
              <input value={d.source} placeholder="اسم الشخص أو الجهة" onChange={e => set('source',e.target.value)} /></div>
            <OwnerPick label="المسؤول" value={d.owner} options={owners} known={cfg.team}
              placeholder={cfg.ownerPlaceholder} onAddPerson={addPerson} onChange={v => set('owner',v)} />
            <div className="f"><label>الاحتمالية</label>
              <div className="segs sm">{Object.entries(CHANCE).map(([k,v]) =>
                <button key={k} className={'seg'+(d.chance===k?' on':'')} onClick={() => set('chance',k)}>{v.t}</button>)}</div></div>
          </div>
          <div className="fsec">الميتنق</div>
          <div className="grid g2">
            <div className="f"><label>تحدد ميتنق؟</label>
              <select value={d.meetingSet?'yes':'no'} onChange={e => set('meetingSet',e.target.value==='yes')}>
                <option value="no">لا</option><option value="yes">إي</option></select></div>
            {d.meetingSet && <>
              <div className="f"><label>متى؟</label>
                <input type="datetime-local" className="ltr" value={d.meetingAt?d.meetingAt.slice(0,16):''}
                  onChange={e => set('meetingAt', e.target.value ? new Date(e.target.value).toISOString():'')} /></div>
              <div className="f"><label>قعدنا الميتنق؟</label>
                <select value={d.meetingDone?'yes':'no'} onChange={e => set('meetingDone',e.target.value==='yes')}>
                  <option value="no">لا، لسا</option><option value="yes">إي، قعدناه</option></select></div>
            </>}
          </div>
          <div className="fsec">اللنكات</div>
          <div className="grid g2">
            <div className="f"><label>انستقرام</label><input className="ltr" value={d.instagram}
              placeholder="@username" onChange={e => set('instagram',e.target.value)} /></div>
            <div className="f"><label>تيك توك</label><input className="ltr" value={d.tiktok}
              placeholder="@username" onChange={e => set('tiktok',e.target.value)} /></div>
            <div className="f"><label>لنك الدرايف</label><input className="ltr" value={d.drive}
              placeholder="https://drive.google.com/…" onChange={e => set('drive',e.target.value)} /></div>
          </div>
          <div className="fsec">ملاحظات</div>
          <div className="grid g1"><div className="f">
            <textarea value={d.notes} placeholder="أي شي عن المفاوضات…" onChange={e => set('notes',e.target.value)} /></div></div>
        </div>
        <div className="modal-f">
          {err && <span className="modal-err">{err}</span>}
          <button className="btn" onClick={onCancel}>إلغاء</button>
          <button className="btn grad" onClick={go}>احفظ</button>
        </div>
      </div>
    </div>
  );
}
