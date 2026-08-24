const { useState, useEffect, useMemo, useRef } = React;

const DBKEY = 'st_db_v4', OLDKEY = 'st_db_v3', SESKEY = 'st_session_v3';

const ST   = { done:'تم', wip:'قيد التنفيذ', todo:'ما تم', na:'ما ينطبق', none:'ما تحدد' };
const PST  = { need:'يحتاجون', delivered:'وصلت', no:'ما يحتاجون' };
const STRONG = { us:'احنا أقوى', them:'هم أقوى', even:'متقاربين' };
const CHANCE = { weak:{t:'ضعيف',p:25}, mid:{t:'متوسط',p:50}, strong:{t:'قوي',p:75}, almost:{t:'شبه مؤكد',p:90} };
const FTYPES = { status:'حالة (تم / قيد / ما تم)', text:'نص', link:'لنك', num:'رقم', bool:'نعم أو لا' };
const SECTIONS = { basic:'الأساسي', links:'اللنكات', tasks:'المهام', print:'المطبوعات' };
const NEW_DAYS = 30;

const TEAM0 = ['ريم البناي','فرح العنزي','فاطمة الرويح','مريم','لولو','سلمان الحجي','فرح العبيدان','فاطمة الشريدة','العمر','وهاب'];
const CONFIG0 = {
  batches:[2027,2028,2029], types:['بنات','شباب','خاص','—'], companies:['SUM','Trend','—'],
  team:TEAM0, ownerPlaceholder:'بنشوف منو',
  tasks:[
    {k:'logo',t:'اللوقو'},{k:'store',t:'الستور'},{k:'storyStore',t:'ستوري ستور'},
    {k:'slogan',t:'السلوقن',text:true},{k:'media',t:'الميديا'},{k:'batchVideo',t:'فيديو الدفعة'},
    {k:'highlight',t:'الهايلايت'},{k:'promo',t:'البرومو'},{k:'idea',t:'الفكرة',text:true},
  ].map(t => ({ ...t, hidden:false })),
  printables:[{k:'flag',t:'علم'},{k:'frame',t:'فريم'},{k:'cards',t:'كروت'},{k:'bags',t:'أكياس',qty:true},{k:'pens',t:'أقلام'}],
  customFields:[],
};
const USERS0 = [
  { id:'U1', name:'وهاب', code:'1234', role:'admin', active:true, lastLogin:null },
  ...TEAM0.filter(n => n !== 'وهاب').map((n,i) => ({ id:'U'+(i+2), name:n, code:'', role:'staff', active:false, lastLogin:null })),
];

/* ---------- utils ---------- */
const A2E = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
const dig  = t => String(t ?? '').replace(/[٠-٩]/g, c => A2E[c]);
const norm = n => dig(n).toLowerCase().replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
  .replace(/[\u064B-\u0652\u0640]/g,'').replace(/\s+(trend|sum)\b/g,'').replace(/[()\[\]]/g,'').replace(/\s+/g,'');
const uid = p => p + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-3);
const nowISO = () => new Date().toISOString();
const fmt = d => d ? new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}) : '—';
const fmtShort = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const daysSince = d => d ? Math.floor((Date.now() - new Date(d)) / 864e5) : null;
const getP = (o,p) => String(p).split('.').reduce((a,k) => (a == null ? a : a[k]), o);
const setP = (o,p,v) => {
  const s = String(p).split('.');
  if (s.length === 1) return { ...o, [s[0]]: v };
  return { ...o, [s[0]]: { ...(o[s[0]] || {}), [s[1]]: v } };
};
const igUrl = v => { const t = String(v||'').trim(); if(!t) return '';
  return /^https?:\/\//i.test(t) ? t : 'https://instagram.com/' + t.replace(/^@/,''); };
const ttUrl = v => { const t = String(v||'').trim(); if(!t) return '';
  return /^https?:\/\//i.test(t) ? t : 'https://tiktok.com/@' + t.replace(/^@/,''); };
const okUrl = v => /^https?:\/\//i.test(String(v||'').trim());

/* ---------- custom fields ---------- */
function fieldsOf(s, cfg, section) {
  return [ ...(cfg.customFields||[]).filter(f => f.section === section),
           ...((s && s.localFields) || []).filter(f => f.section === section) ];
}
function allFields(s, cfg) {
  return [ ...(cfg.customFields||[]), ...((s && s.localFields) || []) ];
}
function progressOf(s, cfg) {
  let got = 0, tot = 0;
  cfg.tasks.filter(t => !t.hidden).forEach(t => {
    const v = t.text ? ((s[t.k]||'').trim() ? 'done' : 'none') : (s.tasks?.[t.k] || 'none');
    if (v === 'na') return; tot++; if (v === 'done') got++; else if (v === 'wip') got += .5;
  });
  allFields(s, cfg).filter(f => f.type === 'status' && f.counts).forEach(f => {
    const v = s.custom?.[f.k] || 'none';
    if (v === 'na') return; tot++; if (v === 'done') got++; else if (v === 'wip') got += .5;
  });
  return tot ? Math.round(got / tot * 100) : 0;
}

/* ---------- normalise records loaded from storage / seed ---------- */
function fixSchool(s, cfg) {
  return { custom:{}, localFields:[], tiktok:'', joinedAt:null, leftAt:null,
    leftOwner1:'', leftOwner2:'', fromSheet:true, ...s,
    tasks: s.tasks || {}, printables: s.printables || {} };
}
function fixProspect(p) {
  return { owner:'', source:'', meetingSet:false, meetingAt:'', meetingDone:false,
    chance:'mid', notes:'', instagram:'', tiktok:'', drive:'', won:false,
    convertedTo:null, wonAt:null, createdAt:nowISO(), ...p };
}
const RENAMES = { 'فاطمة العبيدان': 'فرح العبيدان' };
const ren = n => RENAMES[n] || n;

function fixDb(d) {
  const cfg = { ...CONFIG0, ...(d.config||{}) };
  cfg.customFields = cfg.customFields || [];
  cfg.team = [...new Set((cfg.team||[]).map(ren))];
  const fixOwners = s => ({ ...s, owner1:ren(s.owner1), owner2:ren(s.owner2),
    leftOwner1:ren(s.leftOwner1), leftOwner2:ren(s.leftOwner2) });
  return { schools:(d.schools||[]).map(s => fixOwners(fixSchool(s,cfg))), config:cfg,
    users:(d.users||USERS0).map(u => ({ ...u, name:ren(u.name) })),
    reqs:d.reqs||[], log:d.log||[],
    prospects:(d.prospects||[]).map(p => ({ ...fixProspect(p), owner:ren(p.owner) })) };
}

/* ---------- small shared components ---------- */
function Fld({ label, pv, onChange, ph, wide, ltr, area, type }) {
  return (
    <div className={'f' + (wide ? ' wide' : '')}>
      {label ? <label>{label}{pv.pending && <em className="pend">معلّق</em>}</label> : null}
      {area
        ? <textarea className={pv.pending?'pending':''} value={pv.val||''} placeholder={ph}
            onChange={e => onChange(e.target.value)} />
        : <input type={type||'text'} className={(pv.pending?'pending ':'')+(ltr?'ltr':'')}
            value={pv.val||''} placeholder={ph} onChange={e => onChange(e.target.value)} />}
    </div>
  );
}
function Sel({ label, pv, onChange, opts, wide, cast }) {
  const conv = v => cast === 'bool' ? v === 'true' : cast === 'num' ? +v : v;
  return (
    <div className={'f' + (wide ? ' wide' : '')}>
      <label>{label}{pv.pending && <em className="pend">معلّق</em>}</label>
      <select className={pv.pending?'pending':''} value={String(pv.val ?? '')}
        onChange={e => onChange(conv(e.target.value))}>
        {opts.map(o => <option key={String(o.v)} value={String(o.v)}>{o.t}</option>)}
      </select>
    </div>
  );
}
function Stars({ n, onSet }) {
  return (
    <span className="stars" onClick={e => e.stopPropagation()}>
      {[1,2,3].map(i => (
        <button key={i} className={'star'+(i<=n?' on':'')} title={['مو مهمة','متوسطة','مهمة حيل'][i-1]}
          onClick={() => onSet(n === i ? 0 : i)}>★</button>
      ))}
    </span>
  );
}
function MultiFilter({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => { const h = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const toggle = v => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div className="mf" ref={box}>
      <button className={'mf-btn'+(value.length?' on':'')} onClick={() => setOpen(!open)}>
        {label}{value.length ? <em>{value.length}</em> : null}<i>▾</i></button>
      {open && (
        <div className="mf-pop">
          {options.map(o => (
            <label key={o.v} className="mf-row">
              <input type="checkbox" checked={value.includes(o.v)} onChange={() => toggle(o.v)} />
              <span>{o.t}</span></label>
          ))}
          {value.length > 0 && <button className="mf-clr" onClick={() => onChange([])}>امسح</button>}
        </div>
      )}
    </div>
  );
}
function LogLine({ l, showSchool, onRevert }) {
  const kind = { direct:'مباشر', approved:'موافق', rejected:'مرفوض', create:'إضافة',
    delete:'حذف', undo:'تراجع', revert:'إرجاع' }[l.kind] || l.kind;
  const from = l.fromTxt ?? (l.from === '' ? '(فاضي)' : String(l.from));
  const to   = l.toTxt   ?? (l.to   === '' ? '(فاضي)' : String(l.to));
  const revertable = onRevert && ['direct','approved','revert','undo'].includes(l.kind) && l.path && l.path !== '—';
  return (
    <div className={'logline k-'+l.kind}>
      <span className="lt num">{fmt(l.at)}</span>
      <span className="lby">{l.by}</span>
      {showSchool && <span className="lsch">{l.schoolName} <em className="num">{l.batch}</em></span>}
      <span className="lfld">{l.label}</span>
      {!['create','delete'].includes(l.kind) && (
        <span className="lval"><s>{from}</s><i>←</i><b>{to}</b></span>)}
      <span className={'lk k-'+l.kind}>{kind}</span>
      {l.reviewedBy && <span className="lrev">بواسطة {l.reviewedBy}</span>}
      {revertable && <button className="revbtn" onClick={() => onRevert(l)}>رجّعها</button>}
    </div>
  );
}

/* ---------- add-a-field dialog ---------- */
function AddField({ section, isAdmin, onAdd, onCancel }) {
  const [t, setT] = useState('');
  const [type, setType] = useState(section === 'links' ? 'link' : section === 'basic' ? 'text' : 'status');
  const [scope, setScope] = useState('one');
  const [counts, setCounts] = useState(section === 'tasks');
  const [err, setErr] = useState('');
  useEffect(() => { const h = e => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, []);
  const go = () => { if (!t.trim()) return setErr('اكتب اسم الخانة');
    onAdd({ k: uid('c'), t: t.trim(), type, section, counts: type === 'status' && counts }, scope); };
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-h">
          <div><b>خانة جديدة</b><span>تنضاف لقسم «{SECTIONS[section]}»</span></div>
          <button className="xbtn" onClick={onCancel}>×</button>
        </div>
        <div className="modal-b">
          <div className="grid g1">
            <div className="f"><label>اسم الخانة</label>
              <input autoFocus value={t} placeholder="مثال: إيفنت القهوة" onChange={e => { setT(e.target.value); setErr(''); }} /></div>
            <div className="f"><label>نوعها</label>
              <select value={type} onChange={e => setType(e.target.value)}>
                {Object.entries(FTYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            {type === 'status' && (
              <label className="cbx big"><input type="checkbox" checked={counts}
                onChange={e => setCounts(e.target.checked)} /> تُحسب بنسبة الإنجاز</label>
            )}
            <div className="f"><label>وين تنضاف</label>
              <div className="segs sm">
                <button className={'seg'+(scope==='one'?' on':'')} onClick={() => setScope('one')}>لهالمدرسة بس</button>
                <button className={'seg'+(scope==='all'?' on':'')} onClick={() => setScope('all')}
                  disabled={!isAdmin} title={isAdmin?'':'للأدمن بس'}>لكل المدارس</button>
              </div>
              {!isAdmin && <div className="cbox-note">إضافة خانة لكل المدارس للأدمن بس.</div>}
            </div>
          </div>
        </div>
        <div className="modal-f">
          {err && <span className="modal-err">{err}</span>}
          <button className="btn" onClick={onCancel}>إلغاء</button>
          <button className="btn grad" onClick={go}>أضف</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- render one custom field ---------- */
function CustomField({ f, pv, onChange, onDrop, canDrop }) {
  const path = 'custom.' + f.k;
  const opts = f.type === 'bool'
    ? [{v:'',t:'— ما تحدد —'},{v:'yes',t:'نعم'},{v:'no',t:'لا'}]
    : Object.keys(ST).map(k => ({ v:k, t:ST[k] }));
  if (f.type === 'status' || f.type === 'bool') {
    return (
      <div className="trow">
        <i className={'dot ' + (f.type==='bool' ? 'b-'+(pv.val||'none') : (pv.val||'none'))} />
        <span className="tnm">{f.t}{f.counts && <em className="cnt" title="تُحسب بالإنجاز">%</em>}</span>
        <select className={pv.pending?'pending':''} value={pv.val || (f.type==='bool'?'':'none')}
          onChange={e => onChange(e.target.value)}>
          {opts.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
        {canDrop && <button className="hidebtn" onClick={onDrop} title="شيل الخانة">×</button>}
      </div>
    );
  }
  return (
    <div className="f">
      <label>{f.t}{pv.pending && <em className="pend">معلّق</em>}
        {canDrop && <button className="fdrop" onClick={onDrop} title="شيل الخانة">×</button>}</label>
      <input className={(pv.pending?'pending ':'')+(f.type==='link'||f.type==='num'?'ltr':'')}
        type={f.type==='num'?'text':'text'} value={pv.val || ''}
        placeholder={f.type==='link'?'https://…':''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
function AddFieldBtn({ onClick }) {
  return <button className="addfield" onClick={onClick} title="أضف خانة جديدة">+ خانة</button>;
}
