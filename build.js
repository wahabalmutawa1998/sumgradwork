/*  البناء: يجمع ملفات المصدر (src/*.jsx بالترتيب)، يحوّل JSX إلى JS عادي
 *  بـ Babel (classic runtime)، ويكتب مخرجات النظام بجذر المشروع:
 *
 *      app.js     — النظام كامل (الكود + البيانات الأولية من seed.json)
 *      app.css    — التنسيق (من src/styles.css)
 *      assets.js  — الشعارات (base64 من src/assets)
 *
 *  التشغيل:  npm install && npm run build
 *
 *  ملاحظات مهمة:
 *  - index.html و storage.js و custom.js و custom.css و server.js
 *    لا يلمسها البناء أبداً — التعديلات والبيانات محفوظة.
 *  - ما فيه bundler ولا ESM: الملفات تتشارك نطاق global واحد، فكل مكوّن
 *    لازم يكون `function` declaration (مرفوعة hoisted) — أبداً مو
 *    `const X = () => {}` — وإلا ترتيب التحميل ينكسر.
 */
const babel = require('@babel/standalone');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = __dirname;

// ترتيب الدمج. 01-lib لازم أول (الثوابت + الأدوات + المكوّنات المشتركة).
const PARTS = [
  '01-lib.jsx',
  '02-app.jsx',
  '03-schools.jsx',
  '04-forms.jsx',
  '05-pipeline.jsx',
  '06-pages.jsx',
  '07-stats-settings.jsx',
  '08-ownerpick.jsx',
];

const b64 = f => 'data:image/png;base64,' +
  fs.readFileSync(path.join(SRC, 'assets', f)).toString('base64');

const seed = fs.readFileSync(path.join(SRC, 'seed.json'), 'utf8');
const css  = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');

const jsx = `const SEED = ${seed};\n\n`
  + PARTS.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n\n')
  + '\n\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));\n';

const js = babel.transform(jsx, { presets: [['react', { runtime: 'classic' }]] }).code;

// Babel افتراضياً يستخدم automatic runtime ويطلع `import ... from "react/jsx-runtime"`
// وهذا ينكسر في <script> عادي. نفشل بصوت عالي بدل ما نطلع ملف خربان.
if (/(^|\n)\s*import\s/.test(js)) throw new Error('ESM import leaked into the bundle');
new Function(js); // فحص صياغة

fs.writeFileSync(path.join(OUT, 'app.js'), js + '\n');
fs.writeFileSync(path.join(OUT, 'app.css'), css);
fs.writeFileSync(path.join(OUT, 'assets.js'),
  'var SUMLOGO = "' + b64('sum-grads-white.png') + '";\n' +
  'var TRENDLOGO = "' + b64('trend-graduation-white.png') + '";\n');

console.log('built app.js —', Math.round(js.length / 1024), 'KB, app.css —',
  Math.round(css.length / 1024), 'KB, assets.js');
