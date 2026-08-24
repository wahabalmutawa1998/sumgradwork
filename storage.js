/* =====================================================================
   storage.js — طبقة حفظ البيانات.
   البيانات نفسها محفوظة بمتصفح كل جهاز (localStorage) بمفاتيح st_db_v4،
   يعني تحديث ملفات النظام ما يمسح أي بيانات.
   لا تعدّل هذا الملف ولا تغيّر أسماء المفاتيح — أي تغيير هنا هو اللي
   ممكن يفصلك عن بياناتك المحفوظة.
   ===================================================================== */
(function () {
  if (window.storage) return;
  var LS = null;
  try { var k='__t'; window.localStorage.setItem(k,'1'); window.localStorage.removeItem(k); LS = window.localStorage; } catch (e) {}
  var mem = {};
  window.storage = {
    get:    async function (k) { var v = LS ? LS.getItem('st_' + k) : mem[k];
             return (v === null || v === undefined) ? null : { key:k, value:v }; },
    set:    async function (k, v) { if (LS) LS.setItem('st_' + k, v); else mem[k] = v; return { key:k, value:v }; },
    delete: async function (k) { if (LS) LS.removeItem('st_' + k); else delete mem[k]; return { key:k, deleted:true }; },
    list:   async function () { return { keys: LS ? Object.keys(LS).filter(function(x){return x.indexOf('st_')===0;})
             .map(function(x){return x.slice(3);}) : Object.keys(mem) }; }
  };
})();
