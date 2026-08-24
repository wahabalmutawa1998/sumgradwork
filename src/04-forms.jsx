function MainTab({ s, cfg, owners, batches, isAdmin, del, E, P, addPerson, onAddField, onAddLink, dropField, canEditFields }) {
  return (
    <div className="mainpane">
      <div className="fsec">بيانات المدرسة</div>
      <div className="grid g4">
        <Fld label="اسم المدرسة" pv={P('name')} onChange={v => E('name',v,'اسم المدرسة')} />
        <Fld label="كود التطبيق" pv={P('code')} ltr onChange={v => E('code',v,'كود التطبيق')} />
        <Sel label="الشركة" pv={P('company')} opts={cfg.companies.map(c=>({v:c,t:c}))} onChange={v => E('company',v,'الشركة')} />
        <Sel label="النوع" pv={P('type')} opts={cfg.types.map(t=>({v:t,t}))} onChange={v => E('type',v,'النوع')} />
        {fieldsOf(s,cfg,'basic').map(f => (
          <CustomField key={f.k} f={f} pv={P('custom.'+f.k)} canDrop={canEditFields}
            onDrop={() => dropField(f)} onChange={v => E('custom.'+f.k, v, f.t)} />))}
      </div>
      <div className="addwrap"><AddFieldBtn onClick={onAddField} /></div>

      <div className="fsec">المسؤولون</div>
      <div className="grid g2">
        <OwnerPick label="المسؤول الأول" value={P('owner1').val} pending={P('owner1').pending}
          options={owners} known={cfg.team} placeholder={cfg.ownerPlaceholder}
          onAddPerson={isAdmin?addPerson:null} onChange={v => E('owner1',v,'المسؤول الأول')} />
        <OwnerPick label="المسؤول الثاني" value={P('owner2').val} pending={P('owner2').pending}
          options={owners} known={cfg.team} placeholder={cfg.ownerPlaceholder}
          onAddPerson={isAdmin?addPerson:null} onChange={v => E('owner2',v,'المسؤول الثاني')} />
      </div>

      <div className="fsec">اللنكات</div>
      <div className="grid g2">
        <Fld label="لنك انستقرام" pv={P('instagram')} ph="@username أو اللنك كامل" ltr
          onChange={v => E('instagram',v,'لنك انستقرام')} />
        <Fld label="لنك تيك توك" pv={P('tiktok')} ph="@username أو اللنك كامل" ltr
          onChange={v => E('tiktok',v,'لنك تيك توك')} />
        <Fld label="لنك لوقو المدرسة (درايف)" pv={P('drive')} ph="https://drive.google.com/…" ltr
          onChange={v => E('drive',v,'لنك اللوقو')} />
        {fieldsOf(s,cfg,'links').map(f => (
          <CustomField key={f.k} f={f} pv={P('custom.'+f.k)} canDrop={canEditFields}
            onDrop={() => dropField(f)} onChange={v => E('custom.'+f.k, v, f.t)} />))}
      </div>
      <div className="addwrap"><AddFieldBtn onClick={onAddLink} /></div>

      <div className="fsec">الحالة والستاف</div>
      <div className="grid g2">
        <Sel label="حالة المدرسة" pv={P('active')} cast="bool"
          opts={[{v:true,t:'معانا'},{v:false,t:'طلعت'}]}
          onChange={v => E('active',v,'حالة المدرسة',{ fromTxt:s.active===false?'طلعت':'معانا', toTxt:v?'معانا':'طلعت' })} />
        <Sel label="عدد الستافات" pv={P('staffCount')} cast="num"
          opts={[{v:1,t:'ستاف واحد'},{v:2,t:'ستافين'}]} onChange={v => E('staffCount',v,'عدد الستافات')} />
        {Number(s.staffCount)===2 && <>
          <Fld label="الستاف الثاني مع أي شركة" pv={P('otherCompany')} ph="اكتب اسم الشركة"
            onChange={v => E('otherCompany',v,'شركة الستاف الثاني')} />
          <Sel label="منو أقوى" pv={P('stronger')} opts={[{v:'',t:'— ما تحدد —'},
            {v:'us',t:'احنا أقوى'},{v:'them',t:'هم أقوى'},{v:'even',t:'متقاربين'}]}
            onChange={v => E('stronger',v,'منو أقوى',{ fromTxt:STRONG[s.stronger]||'(ما تحدد)', toTxt:STRONG[v]||'(ما تحدد)' })} />
        </>}
      </div>
      <div className="stamps">
        <span>تاريخ الانضمام: <b className="num">{s.joinedAt ? fmtShort(s.joinedAt) : 'من الملف الأصلي'}</b></span>
        {s.leftAt && <span className="out">تاريخ الخروج: <b className="num">{fmtShort(s.leftAt)}</b></span>}
        {isAdmin && !s.joinedAt && (
          <label className="setjoin">حدّده يدوي
            <input type="date" className="ltr" onChange={e => e.target.value
              && E('joinedAt', new Date(e.target.value+'T12:00:00').toISOString(), 'تاريخ الانضمام')} /></label>
        )}
      </div>

      <div className="fsec">المحتوى</div>
      <div className="grid g2">
        <Fld label="السلوقن" pv={P('slogan')} ph="مثال: اثرنا باقي بريطه" onChange={v => E('slogan',v,'السلوقن')} />
        <Fld label="الفكرة" pv={P('idea')} ph="مثال: كارتنق" onChange={v => E('idea',v,'الفكرة')} />
      </div>

      <div className="fsec">ملاحظات</div>
      <div className="grid g1">
        <Fld label="" pv={P('notes')} area ph="أي شي لازم الفريق يدري عنه…" onChange={v => E('notes',v,'ملاحظات')} />
      </div>

      <div className="fsec">الدفعات اللي معانا فيها</div>
      <div className="bedit">
        {cfg.batches.map(b => { const on = batches.includes(b);
          return <button key={b} className={'bbtn'+(on?' on':'')}
            onClick={() => E('batchesOverride', on?batches.filter(x=>x!==b):[...batches,b].sort(), 'الدفعات')}>
            <span className="num">{b}</span></button>; })}
        {s.batchesOverride && <button className="bbtn reset" onClick={() => E('batchesOverride',null,'الدفعات')}>رجّع التلقائي</button>}
      </div>

      {isAdmin && <div className="delrow"><button className="btn danger" onClick={del}>شيل المدرسة</button></div>}
    </div>
  );
}

const BLANK_SCHOOL = { name:'', code:'', company:'—', type:'بنات', stars:0, owner1:'', owner2:'',
  instagram:'', tiktok:'', drive:'', staffCount:1, otherCompany:'', stronger:'', slogan:'', idea:'', notes:'' };

function NewSchool({ batch, cfg, owners, onSave, onCancel, addPerson, preset, title }) {
  const [d, setD] = useState({ ...BLANK_SCHOOL, ...(preset||{}) });
  const [err, setErr] = useState('');
  const set = (k,v) => { setD(x => ({ ...x, [k]:v })); setErr(''); };
  const submit = () => { if (!d.name.trim()) return setErr('لازم تكتب اسم المدرسة'); onSave({ ...d, name:d.name.trim() }); };
  useEffect(() => { const h = e => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, []);
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-h">
          <div><b>{title || 'مدرسة جديدة'}</b><span>تنضاف لدفعة <em className="num">{batch}</em></span></div>
          <button className="xbtn" onClick={onCancel}>×</button>
        </div>
        <div className="modal-b">
          <div className="fsec">بيانات المدرسة</div>
          <div className="grid g4">
            <div className="f"><label>اسم المدرسة</label>
              <input autoFocus value={d.name} placeholder="مثال: الرقة" onChange={e => set('name',e.target.value)} /></div>
            <div className="f"><label>كود التطبيق</label>
              <input className="ltr" value={d.code} onChange={e => set('code',e.target.value)} /></div>
            <div className="f"><label>الشركة</label>
              <select value={d.company} onChange={e => set('company',e.target.value)}>
                {cfg.companies.map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="f"><label>النوع</label>
              <select value={d.type} onChange={e => set('type',e.target.value)}>
                {cfg.types.map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div className="fsec">الأهمية</div>
          <div className="starpick"><Stars n={d.stars} onSet={v => set('stars',v)} />
            <span>{['ما تحددت','مو مهمة','متوسطة','مهمة حيل'][d.stars]}</span></div>
          <div className="fsec">المسؤولون</div>
          <div className="grid g2">
            <OwnerPick label="المسؤول الأول" value={d.owner1} options={owners} known={cfg.team}
              placeholder={cfg.ownerPlaceholder} onAddPerson={addPerson} onChange={v => set('owner1',v)} />
            <OwnerPick label="المسؤول الثاني" value={d.owner2} options={owners} known={cfg.team}
              placeholder={cfg.ownerPlaceholder} onAddPerson={addPerson} onChange={v => set('owner2',v)} />
          </div>
          <div className="fsec">اللنكات</div>
          <div className="grid g2">
            <div className="f"><label>لنك انستقرام</label>
              <input className="ltr" value={d.instagram} placeholder="@username أو اللنك كامل"
                onChange={e => set('instagram',e.target.value)} /></div>
            <div className="f"><label>لنك تيك توك</label>
              <input className="ltr" value={d.tiktok} placeholder="@username أو اللنك كامل"
                onChange={e => set('tiktok',e.target.value)} /></div>
            <div className="f"><label>لنك لوقو المدرسة (درايف)</label>
              <input className="ltr" value={d.drive} placeholder="https://drive.google.com/…"
                onChange={e => set('drive',e.target.value)} /></div>
          </div>
          <div className="fsec">الستاف</div>
          <div className="grid g2">
            <div className="f"><label>عدد الستافات</label>
              <select value={d.staffCount} onChange={e => set('staffCount',+e.target.value)}>
                <option value={1}>ستاف واحد</option><option value={2}>ستافين</option></select></div>
            {Number(d.staffCount)===2 && <>
              <div className="f"><label>الستاف الثاني مع أي شركة</label>
                <input value={d.otherCompany} placeholder="اكتب اسم الشركة" onChange={e => set('otherCompany',e.target.value)} /></div>
              <div className="f"><label>منو أقوى</label>
                <select value={d.stronger} onChange={e => set('stronger',e.target.value)}>
                  <option value="">— ما تحدد —</option><option value="us">احنا أقوى</option>
                  <option value="them">هم أقوى</option><option value="even">متقاربين</option></select></div>
            </>}
          </div>
          <div className="fsec">المحتوى</div>
          <div className="grid g2">
            <div className="f"><label>السلوقن</label>
              <input value={d.slogan} placeholder="مثال: اثرنا باقي بريطه" onChange={e => set('slogan',e.target.value)} /></div>
            <div className="f"><label>الفكرة</label>
              <input value={d.idea} placeholder="مثال: كارتنق" onChange={e => set('idea',e.target.value)} /></div>
          </div>
          <div className="fsec">ملاحظات</div>
          <div className="grid g1"><div className="f">
            <textarea value={d.notes} placeholder="أي شي لازم الفريق يدري عنه…" onChange={e => set('notes',e.target.value)} /></div></div>
        </div>
        <div className="modal-f">
          {err && <span className="modal-err">{err}</span>}
          <button className="btn" onClick={onCancel}>إلغاء</button>
          <button className="btn grad" onClick={submit}>احفظ المدرسة</button>
        </div>
      </div>
    </div>
  );
}
