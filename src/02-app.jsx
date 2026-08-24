function App() {
  const [db, setDb]   = useState(null);
  const [me, setMe]   = useState(null);
  const [page, setPage] = useState('schools');
  const [toast, setToast] = useState('');
  const [undoS, setUndoS] = useState([]);
  const [redoS, setRedoS] = useState([]);
  const first = useRef(true);

  useEffect(() => { (async () => {
    let raw = null;
    try { const r = await window.storage.get(DBKEY, true); if (r && r.value) raw = JSON.parse(r.value); } catch(e){}
    if (!raw) { try { const o = await window.storage.get(OLDKEY, true); if (o && o.value) raw = JSON.parse(o.value); } catch(e){} }
    if (!raw) raw = { schools: SEED, config: CONFIG0, users: USERS0, reqs: [], log: [], prospects: [] };
    const d = fixDb(raw);
    setDb(d);
    try { const s = await window.storage.get(SESKEY, false);
      if (s && s.value) { const u = d.users.find(x => x.id === s.value); if (u && u.active) setMe(u); } } catch(e){}
  })(); }, []);

  useEffect(() => {
    if (!db) return;
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => {
      window.storage.set(DBKEY, JSON.stringify(db), true).catch(() => flash('ما انحفظ — جرّب مرة ثانية'));
    }, 400);
    return () => clearTimeout(id);
  }, [db]);

  const flash = m => { setToast(m); setTimeout(() => setToast(''), 2600); };

  /* ---------- undo engine: every mutation is apply + revert ---------- */
  const mutate = (label, apply, revert) => {
    setDb(d => apply(d));
    setUndoS(u => [{ label, apply, revert, at: nowISO() }, ...u].slice(0, 60));
    setRedoS([]);
  };
  const logLine = (d, e) => ({ ...d, log: [{ id: uid('L'), at: nowISO(), by: me ? me.name : '—', ...e }, ...d.log].slice(0, 5000) });
  const doUndo = () => {
    if (!undoS.length) return;
    const [top, ...rest] = undoS;
    setDb(d => logLine(top.revert(d), { kind:'undo', schoolId:top.schoolId||'—', schoolName:top.schoolName||'—',
      batch:top.batch||'', path:top.path||'—', label:'تراجع — ' + top.label, from:'', to:'' }));
    setUndoS(rest); setRedoS(r => [top, ...r].slice(0, 60));
    flash('رجعت: ' + top.label);
  };
  const doRedo = () => {
    if (!redoS.length) return;
    const [top, ...rest] = redoS;
    setDb(d => top.apply(d));
    setRedoS(rest); setUndoS(u => [top, ...u].slice(0, 60));
    flash('أعدت: ' + top.label);
  };
  useEffect(() => {
    const h = e => {
      const k = e.key.toLowerCase();
      if (!(e.metaKey || e.ctrlKey) || k !== 'z') return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input','textarea'].includes(tag)) return;
      e.preventDefault(); e.shiftKey ? doRedo() : doUndo();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [undoS, redoS, me]);

  if (!db) return <div className="boot">يحمّل…</div>;
  if (!me) return <Login users={db.users} onLogin={async u0 => {
    const u = { ...u0, lastLogin: nowISO() };
    setDb(d => ({ ...d, users: d.users.map(x => x.id === u.id ? u : x) }));
    setMe(u); try { await window.storage.set(SESKEY, u.id, false); } catch(e){}
  }} />;

  const isAdmin = me.role === 'admin';
  const pending = db.reqs.filter(r => r.status === 'pending');
  const myPending = pending.filter(r => r.by === me.name);
  const logout = async () => { setMe(null); setPage('schools'); setUndoS([]); setRedoS([]);
    try { await window.storage.delete(SESKEY, false); } catch(e){} };

  /* ---------- the single write gate ---------- */
  const edit = (school, path, to, label, opts = {}) => {
    const from = getP(school, path);
    if (String(from ?? '') === String(to ?? '')) return;
    const meta = { schoolId:school.id, schoolName:school.name, batch:school.batch, path, label,
      fromTxt:opts.fromTxt, toTxt:opts.toTxt };
    if (!isAdmin) {
      setDb(d => ({ ...d, reqs: [{ id:uid('R'), at:nowISO(), by:me.name, status:'pending', from:from??'', to:to??'', ...meta },
        ...d.reqs.filter(r => !(r.status==='pending' && r.schoolId===school.id && r.path===path && r.by===me.name))] }));
      flash('انرسل للأدمن — بانتظار الموافقة');
      return;
    }
    const write = (v, kind) => d => logLine(
      { ...d, schools: d.schools.map(s => s.id === school.id ? applySide(setP(s, path, v), path, v, d) : s) },
      { kind, ...meta, from: v === to ? (from??'') : (to??''), to: v ?? '' });
    mutate(label + ' — ' + school.name, write(to,'direct'), write(from,'direct'));
  };

  /* joined/left stamps are written automatically and never removed */
  const applySide = (s, path, v) => {
    if (path !== 'active') return s;
    if (v === false) return { ...s, leftAt: s.leftAt || nowISO(),
      leftOwner1: s.leftOwner1 || s.owner1 || '', leftOwner2: s.leftOwner2 || s.owner2 || '' };
    return s;
  };

  const decide = (ids, ok, reason = '') => {
    const picked = db.reqs.filter(r => ids.includes(r.id) && r.status === 'pending');
    if (!picked.length) return;
    const stamp = nowISO();
    const apply = d => {
      let schools = d.schools;
      if (ok) picked.forEach(r => { schools = schools.map(s => s.id === r.schoolId
        ? applySide(setP(s, r.path, r.to), r.path, r.to) : s); });
      return { ...d, schools,
        reqs: d.reqs.map(r => ids.includes(r.id) ? { ...r, status: ok?'approved':'rejected', reviewedAt:stamp, reviewedBy:me.name, reason } : r),
        log: [...picked.map(r => ({ id:uid('L'), at:stamp, by:r.by, kind: ok?'approved':'rejected',
          reviewedBy:me.name, requestedAt:r.at, reason, schoolId:r.schoolId, schoolName:r.schoolName,
          batch:r.batch, path:r.path, label:r.label, from:r.from, to:r.to, fromTxt:r.fromTxt, toTxt:r.toTxt })), ...d.log] };
    };
    const revert = d => {
      let schools = d.schools;
      if (ok) picked.forEach(r => { schools = schools.map(s => s.id === r.schoolId ? setP(s, r.path, r.from) : s); });
      return { ...d, schools, reqs: d.reqs.map(r => ids.includes(r.id) ? { ...r, status:'pending', reviewedAt:null, reviewedBy:null, reason:'' } : r),
        log: d.log.filter(l => !(l.at === stamp && picked.some(p => p.schoolId === l.schoolId && p.path === l.path))) };
    };
    mutate((ok ? 'موافقة على ' : 'رفض ') + picked.length + ' طلب', apply, revert);
    flash(ok ? 'انطبق' : 'انرفض');
  };

  const revertLog = l => {
    const s = db.schools.find(x => x.id === l.schoolId);
    if (!s) return flash('المدرسة مو موجودة');
    const cur = getP(s, l.path);
    if (String(cur ?? '') !== String(l.to ?? '')
      && !confirm('الخانة تغيّرت بعد هالتعديل (الحالي: ' + (cur || 'فاضي') + '). ترجّعها لـ«' + (l.from || 'فاضي') + '» على أي حال؟')) return;
    const write = v => d => logLine({ ...d, schools: d.schools.map(x => x.id === s.id ? setP(x, l.path, v) : x) },
      { kind:'revert', schoolId:s.id, schoolName:s.name, batch:s.batch, path:l.path,
        label:'إرجاع — ' + l.label, from: v === l.from ? l.to : l.from, to: v,
        fromTxt: v === l.from ? l.toTxt : l.fromTxt, toTxt: v === l.from ? l.fromTxt : l.toTxt });
    mutate('إرجاع ' + l.label + ' — ' + s.name, write(l.from), write(cur));
    flash('رجعت');
  };

  const addPerson = n => {
    const nm = String(n||'').trim(); if (!nm) return;
    setDb(d => d.config.team.includes(nm) ? d : { ...d, config:{ ...d.config, team:[...d.config.team, nm] } });
    flash('انضاف «' + nm + '» للفريق');
  };

  const pendVal = (school, path, actual) => {
    if (isAdmin) return { val: actual, pending: false };
    const r = myPending.find(r => r.schoolId === school.id && r.path === path);
    return r ? { val: r.to, pending: true } : { val: actual, pending: false };
  };

  const ctx = { db, setDb, me, isAdmin, edit, decide, pendVal, pending, myPending,
    flash, mutate, logLine, addPerson, revertLog, applySide };

  const NAV = [
    { k:'schools',  t:'المدارس' },
    { k:'pipe',     t:'محتملة', badge: db.prospects.filter(p => !p.won).length },
    { k:'reqs',     t:'الطلبات', admin:true, badge: pending.length },
    { k:'log',      t:'السجل' },
    { k:'stats',    t:'الإحصائيات', admin:true },
    { k:'settings', t:'الإعدادات', admin:true },
  ].filter(n => !n.admin || isAdmin);

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-logos">
          <img src={SUMLOGO} alt="SUM GRADS" className="lg lg-sum" />
          <span className="lg-div" />
          <img src={TRENDLOGO} alt="TREND GRADUATION" className="lg lg-tr" />
        </div>
        <div className="hdr-user">
          <div className="undoer">
            <button className="ub" disabled={!undoS.length} onClick={doUndo}
              title={undoS.length ? 'تراجع عن: ' + undoS[0].label : 'ما فيه شي ترجع عنه'}>↶</button>
            <button className="ub" disabled={!redoS.length} onClick={doRedo}
              title={redoS.length ? 'أعد: ' + redoS[0].label : 'ما فيه شي تعيده'}>↷</button>
          </div>
          <div className="hu-txt"><b>{me.name}</b>
            <span>{isAdmin ? 'أدمن — صلاحية كاملة' : 'موظف — التعديل يبي موافقة'}</span></div>
          <button className="hu-out" onClick={logout}>خروج</button>
        </div>
      </header>

      <nav className="nav">
        {NAV.map(n => (
          <button key={n.k} className={'navbtn'+(page===n.k?' on':'')} onClick={() => setPage(n.k)}>
            {n.t}{n.badge ? <em className="bdg">{n.badge}</em> : null}</button>
        ))}
      </nav>

      {undoS.length > 0 && (
        <div className="undobar">آخر شي سويته: <b>{undoS[0].label}</b>
          <button onClick={doUndo}>تراجع</button>
          <span className="dim">أو {navigator.platform.includes('Mac') ? '⌘Z' : 'Ctrl+Z'}</span></div>
      )}
      {!isAdmin && myPending.length > 0 && (
        <div className="notice">عندك <b>{myPending.length}</b> تعديل بانتظار موافقة الأدمن.</div>
      )}

      <main>
        {page === 'schools'  && <Schools {...ctx} />}
        {page === 'pipe'     && <Pipeline {...ctx} />}
        {page === 'reqs'     && <Requests {...ctx} />}
        {page === 'log'      && <LogPage {...ctx} />}
        {page === 'stats'    && <Stats {...ctx} />}
        {page === 'settings' && <Settings {...ctx} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Login({ users, onLogin }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState('');
  const go = () => {
    const u = users.find(x => x.code && x.code === code.trim());
    if (!u) return setErr('الكود غلط');
    if (!u.active) return setErr('هذا الحساب موقّف — كلّم الأدمن');
    onLogin(u);
  };
  return (
    <div className="login"><div className="login-card">
      <div className="login-logos">
        <img src={SUMLOGO} alt="SUM GRADS" className="lg lg-sum" />
        <span className="lg-div" />
        <img src={TRENDLOGO} alt="TREND GRADUATION" className="lg lg-tr" />
      </div>
      <h1>متابعة المدارس</h1><p>دخّل الكود حقك</p>
      <input type="password" inputMode="numeric" className="code" placeholder="••••" value={code}
        onChange={e => { setCode(e.target.value); setErr(''); }}
        onKeyDown={e => e.key === 'Enter' && go()} autoFocus />
      {err && <div className="login-err">{err}</div>}
      <button className="btn grad big" onClick={go}>دخول</button>
    </div></div>
  );
}
