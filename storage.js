/* =====================================================================
   storage.js — طبقة حفظ البيانات (نسخة السيرفر المشترك).

   - البيانات المشتركة (shared=true مثل قاعدة بيانات المدارس st_db_v4)
     تنحفظ على السيرفر → أي تعديل من أي موظف يبين لكل الفريق.
   - جلسة الدخول (shared=false) تظل بجهاز كل موظف لحاله.
   - لو ما فيه سيرفر (فتح الملف مباشرة أو استضافة ثابتة) يرجع تلقائياً
     للحفظ بالمتصفح مثل قبل — ما ينكسر شي.
   - فيه مراقبة: كل ١٥ ثانية يشيّك هل أحد من الفريق سوّى تعديل جديد،
     ولو فيه يطلع تنبيه أسفل الشاشة «حدّث الصفحة».
   - حماية التعارض: لو حاولت تحفظ فوق تعديل أحدث من زميلك، الحفظ يرفض
     ويطلب منك تحدّث الصفحة — عشان ما ينمسح شغل أحد.

   لا تعدّل هذا الملف ولا تغيّر أسماء المفاتيح (st_db_v4).
   ===================================================================== */
(function () {
  if (window.storage) return;

  var LS = null;
  try { var t = '__t'; window.localStorage.setItem(t, '1'); window.localStorage.removeItem(t); LS = window.localStorage; } catch (e) {}
  var mem = {};
  function lsGet(k) { var v = LS ? LS.getItem('st_' + k) : mem[k]; return (v === null || v === undefined) ? null : v; }
  function lsSet(k, v) { if (LS) LS.setItem('st_' + k, v); else mem[k] = v; }
  function lsDel(k) { if (LS) LS.removeItem('st_' + k); else delete mem[k]; }
  function lsKeys() {
    return LS ? Object.keys(LS).filter(function (x) { return x.indexOf('st_') === 0; })
                 .map(function (x) { return x.slice(3); })
              : Object.keys(mem);
  }

  var API = '/api/kv/';
  var versions = {};      // آخر نسخة شفناها لكل مفتاح مشترك
  var noApi = false;      // ما فيه سيرفر — وضع الحفظ بالمتصفح
  var WATCH_KEY = 'st_db_v4';

  async function jfetch(url, opts) {
    var r = await fetch(url, opts);
    var ct = r.headers.get('content-type') || '';
    if (ct.indexOf('application/json') === -1) { noApi = true; throw new Error('no-api'); }
    return r;
  }

  /* ---- تنبيه أسفل الشاشة ---- */
  var toastEl = null;
  function showToast(msg, danger) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('dir', 'rtl');
      toastEl.style.cssText = 'position:fixed;bottom:18px;right:50%;transform:translateX(50%);z-index:99999;' +
        'display:flex;align-items:center;gap:10px;padding:11px 16px;border-radius:12px;font-family:inherit;' +
        'font-size:14px;font-weight:600;box-shadow:0 8px 28px rgba(0,0,0,.22);max-width:92vw;';
      var btn = document.createElement('button');
      btn.textContent = 'حدّث الصفحة';
      btn.style.cssText = 'border:0;border-radius:9px;padding:7px 14px;cursor:pointer;font-family:inherit;' +
        'font-size:13.5px;font-weight:700;background:#fff;color:#1B4965;white-space:nowrap;';
      btn.onclick = function () { location.reload(); };
      toastEl.appendChild(document.createElement('span'));
      toastEl.appendChild(btn);
      document.body.appendChild(toastEl);
    }
    toastEl.firstChild.textContent = msg;
    toastEl.style.background = danger ? '#C0392B' : '#1B4965';
    toastEl.style.color = '#fff';
    toastEl.style.display = 'flex';
  }

  window.storage = {
    get: async function (k, shared) {
      if (!shared || noApi) { var lv = lsGet(k); return lv === null ? null : { key: k, value: lv }; }
      try {
        var r = await jfetch(API + encodeURIComponent(k));
        if (r.status === 404) {
          /* أول تشغيل للسيرفر: لو عندنا بيانات محلية قديمة نرفعها له (هجرة تلقائية) */
          var localV = lsGet(k);
          if (localV !== null) {
            try {
              var pr = await jfetch(API + encodeURIComponent(k), {
                method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': '0' },
                body: JSON.stringify({ value: localV })
              });
              if (pr.ok) { var pj = await pr.json(); versions[k] = pj.version; }
            } catch (e) {}
            return { key: k, value: localV };
          }
          return null;
        }
        if (!r.ok) throw new Error('bad');
        var j = await r.json();
        versions[k] = j.version;
        lsSet(k, j.value); /* كاش احتياطي لو انقطع النت */
        return (j.value === null || j.value === undefined) ? null : { key: k, value: j.value };
      } catch (e) {
        var cv = lsGet(k);
        return cv === null ? null : { key: k, value: cv };
      }
    },

    set: async function (k, v, shared) {
      if (!shared || noApi) { lsSet(k, v); return { key: k, value: v }; }
      var r;
      try {
        r = await jfetch(API + encodeURIComponent(k), {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'if-match': String(versions[k] || 0) },
          body: JSON.stringify({ value: v })
        });
      } catch (e) {
        if (noApi) { lsSet(k, v); return { key: k, value: v }; }
        showToast('ما فيه اتصال بالسيرفر — تعديلك ما انحفظ', true);
        throw e;
      }
      if (r.status === 409) {
        showToast('زميلك حفظ تعديل قبلك — حدّث الصفحة وأعد تعديلك عشان ما ينمسح شغله', true);
        throw new Error('conflict');
      }
      if (!r.ok) throw new Error('bad');
      var j = await r.json();
      versions[k] = j.version;
      lsSet(k, v);
      return { key: k, value: v };
    },

    delete: async function (k, shared) {
      if (shared && !noApi) {
        try { await jfetch(API + encodeURIComponent(k), { method: 'DELETE' }); } catch (e) {}
        delete versions[k];
      }
      lsDel(k);
      return { key: k, deleted: true };
    },

    list: async function () {
      if (!noApi) {
        try { var r = await jfetch('/api/kv'); if (r.ok) return await r.json(); } catch (e) {}
      }
      return { keys: lsKeys() };
    }
  };

  /* ---- مراقبة تعديلات بقية الفريق ---- */
  setInterval(async function () {
    if (noApi || versions[WATCH_KEY] === undefined) return;
    try {
      var r = await jfetch('/api/version/' + encodeURIComponent(WATCH_KEY));
      if (!r.ok) return;
      var j = await r.json();
      if (j.version !== versions[WATCH_KEY]) {
        showToast('فيه تعديل جديد من الفريق — حدّث الصفحة عشان يوصلك');
      }
    } catch (e) {}
  }, 15000);
})();
