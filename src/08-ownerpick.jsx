function OwnerPick({ label, value, pending, options, known, placeholder, onChange, onAddPerson }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(null);          // null = not typing
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const box = useRef(null);
  const close = () => { setOpen(false); setQ(null); setAdding(false); setDraft(''); };
  useEffect(() => {
    const h = e => { if (box.current && !box.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const txt = value || '', shown = q === null ? txt : q, term = (q || '').trim();
  const list = term ? options.filter(o => o.includes(term)) : options;
  const onRoster = n => known.includes(n);
  const quickAdd = term && !onRoster(term) && onAddPerson;
  const pick = v => { onChange(v); close(); };
  const startAdd = () => { setAdding(true); setDraft(term || ''); };
  const commitTeam = () => { const n = draft.trim(); if (!n) return; onAddPerson(n); onChange(n); close(); };
  const commitTemp = () => { const n = draft.trim(); if (!n) return; onChange(n); close(); };

  return (
    <div className="f" ref={box}>
      <label>{label}{pending && <em className="pend">معلّق</em>}</label>
      <div className="cbox">
        <input className={(pending ? 'pending ' : '') + (txt && !onRoster(txt) ? 'freetxt' : '')}
          value={shown} placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); setAdding(false); }} />
        <button type="button" className="cbox-c" tabIndex={-1}
          onClick={() => { setOpen(!open); setQ(null); setAdding(false); }} aria-label="اختر مسؤول">▾</button>
        {open && (
          <div className="cbox-pop">
            {!adding && <>
              {quickAdd && <button type="button" className="cbox-new" onClick={() => { onAddPerson(term); onChange(term); close(); }}>
                أضف «{term}» للفريق</button>}
              {term && !onRoster(term) && !onAddPerson && (
                <div className="cbox-note">«{term}» اسم مؤقت — ما ينحسب على أحد بالإحصائيات</div>
              )}
              {list.map(o => (
                <button type="button" key={o} className={'cbox-o' + (o === txt ? ' on' : '')}
                  onClick={() => pick(o)}>{o}{o === txt && <i>✓</i>}</button>
              ))}
              {list.length === 0 && term && <div className="cbox-empty">ما فيه اسم يطابق «{term}»</div>}
              {list.length === 0 && !term && <div className="cbox-empty">ما فيه أسماء</div>}
              <button type="button" className="cbox-add" onClick={startAdd}>+ أضف اسم جديد</button>
              <button type="button" className="cbox-clr" onClick={() => pick('')}>
                {txt ? 'امسح' : 'خلّها فاضية'}</button>
            </>}
            {adding && (
              <div className="cbox-addbox">
                <div className="cbox-addttl">اسم جديد</div>
                <input autoFocus value={draft} placeholder="اكتب الاسم كامل"
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { onAddPerson ? commitTeam() : commitTemp(); }
                                    if (e.key === 'Escape') { setAdding(false); setDraft(''); } }} />
                <div className="cbox-addbtns">
                  {onAddPerson && <button type="button" className="btn grad sm" disabled={!draft.trim()}
                    onClick={commitTeam}>أضف للفريق</button>}
                  <button type="button" className="btn sm" disabled={!draft.trim()}
                    onClick={commitTemp}>خلّها مؤقتة</button>
                  <button type="button" className="btn sm ghost" onClick={() => { setAdding(false); setDraft(''); }}>رجوع</button>
                </div>
                <div className="cbox-note">
                  {onAddPerson
                    ? '«للفريق» يدخل القائمة وينحسب بالإحصائيات · «مؤقتة» مجرد ملاحظة على هالمدرسة'
                    : 'الاسم ينحفظ كملاحظة — إضافته للفريق للأدمن بس'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
