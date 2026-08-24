# SUM × TREND — School Tracking System
## Technical handoff / rebuild specification

> **ملخّص بالعربي**
> هذا نظام متابعة المدارس لشركتي SUM Grads و TREND Graduation. النسخة الحالية **نموذج (prototype)**
> يشتغل كامل بالمتصفح بدون سيرفر — بنيناه عشان نضبط المتطلبات على أرض الواقع قبل ما نبني النسخة الحقيقية.
> هذا الملف يشرح كل قاعدة عمل بالنظام، وكل عيب فيه، والمطلوب من النسخة النهائية.
> **الأولوية القصوى للنسخة الجديدة: سيرفر + قاعدة بيانات مشتركة + حسابات حقيقية.**
> كل شي ثاني بالنظام مضبوط ومجرّب — النقص الوحيد الجوهري هو إن البيانات ما تتشارك بين الأجهزة.

---

## 1. What this is

An internal operations tool for a Kuwaiti graduation-events agency (~4,000 graduating
students/year). It tracks every school the agency works with, across graduating classes
("دفعات"), through a checklist of creative deliverables, plus a sales pipeline of
prospective schools.

**Current state:** single self-contained `index.html` (~287 KB), React 18 via CDN, no
bundler, no server, no database. All state lives in one JSON blob in browser storage.

**Live data:** 105 real schools imported from the client's Excel workbook
(58 in batch 2027, 39 in 2028, 8 in 2029), seeded in `src/seed.json`.

**Language:** UI is Arabic (Kuwaiti dialect), RTL. All numerals rendered Latin (0-9)
by explicit user request. Dates formatted `en-GB` (`21 Aug 2026, 8:47 pm`).

---

## 2. Repo layout

```
build.js                 concat + compile + inline -> dist/index.html
package.json             one dev dep: @babel/standalone
dist-index.html          the current shipped build (reference)
src/
  01-lib.jsx             constants, utils, shared components   <- MUST load first
  02-app.jsx             App shell, auth, undo engine, the single write gate
  03-schools.jsx         Schools page + SchoolRow
  04-forms.jsx           MainTab (detail panel) + NewSchool modal
  05-pipeline.jsx        Prospective-schools pipeline + conversion
  06-pages.jsx           Requests, change log, current-state stats
  07-stats-settings.jsx  Period-activity stats + Settings
  08-ownerpick.jsx       Owner combobox
  styles.css             all styling
  seed.json              105 real school records
  assets/                brand logos (white for gradient, colour for light bg)
```

### Build model — read before touching anything

There is **no bundler and no module system**. All files are concatenated in the order
listed in `build.js` and evaluated in one global scope.

- Every component **must** be a hoisted `function` declaration.
  `const Foo = () => {}` will break depending on load order.
- Babel is configured with `runtime: 'classic'`. The default (`automatic`) emits
  `import { jsx } from "react/jsx-runtime"`, which throws in a plain `<script>`.
  `build.js` asserts on this — do not remove that check.
- Babel does **not** run in the browser. JSX is compiled at build time.
- Do not use `localStorage` directly in component code. Go through `window.storage`
  (see §7) so the artifact/web/server backends stay swappable.

---

## 3. Domain glossary (Arabic → English)

| Arabic | Meaning |
|---|---|
| دفعة | Graduating class / batch (2027, 2028, 2029) |
| المدارس | Schools we're contracted with |
| مدارس محتملة | Prospective schools (sales pipeline) |
| المهام | Creative deliverables checklist |
| المطبوعات | Printed goods (flags, frames, cards, bags, pens) |
| المسؤول الأول / الثاني | Primary / secondary owner (staff member) |
| السلوقن | Slogan (free text) |
| الفكرة | Concept idea (free text) |
| ستاف واحد / ستافين | One staff / two staff — see §5.6 |
| طلعت | School left us for a competitor |
| بنشوف منو | "we'll see who" — default placeholder for unassigned owner |
| الطلبات | Pending edit-approval requests |
| السجل | Change log |

---

## 4. Data model

One root object, persisted as a single JSON string.

```ts
DB = {
  schools:   School[],
  prospects: Prospect[],
  users:     User[],
  reqs:      EditRequest[],   // pending/approved/rejected staff edits
  log:       LogEntry[],      // append-only audit trail, newest first
  config:    Config,
}
```

### 4.1 School

```ts
{
  id: string,                 // "S001".."S105" from seed, uid() for new
  batch: number,              // 2027 | 2028 | 2029 (from config.batches)
  no: string,                 // original row number in the Excel, informational
  name: string,
  company: 'SUM'|'Trend'|'—', // which of the two brands services this school
  type: string,               // بنات | شباب | خاص  (from config.types)
  code: string,               // the school's app code, digits
  active: boolean,            // false = "طلعت" (left us)
  stars: 0|1|2|3,             // importance; 0 = unset

  owner1: string,             // free text. If in config.team -> real person.
  owner2: string,             //   If not -> a temporary note, excluded from stats.

  instagram: string,          // @handle or full URL
  tiktok: string,             // @handle or full URL
  drive: string,              // Drive folder URL for the school's logo files

  staffCount: 1|2,            // see §5.6
  otherCompany: string,       // competitor name, when staffCount === 2
  stronger: ''|'us'|'them'|'even',

  slogan: string,             // free text, counts toward progress when non-empty
  idea: string,               // ditto
  notes: string,

  tasks:      { [taskKey]: 'done'|'wip'|'todo'|'na'|'none' },
  printables: { [printKey]: 'need'|'delivered'|'no' },
  bagsQty: string,            // quantity for the "أكياس" printable

  custom: { [fieldKey]: any },   // values for user-defined fields (§5.7)
  localFields: CustomField[],    // fields that exist on THIS school only

  joinedAt: ISO|null,         // set once, never cleared. null = came from the Excel
  leftAt:   ISO|null,         // stamped when active flips to false
  leftOwner1: string,         // owner snapshot at the moment of leaving
  leftOwner2: string,
  fromSheet: boolean,         // true for the 105 imported rows

  batchesOverride: number[]|null,  // manual override of the auto batch-chips (§5.3)
}
```

### 4.2 Prospect

```ts
{
  id, name, owner, source,          // source = "عن طريق منو جايين" (referral)
  chance: 'weak'|'mid'|'strong'|'almost',   // 25 / 50 / 75 / 90 %
  meetingSet: boolean,
  meetingAt: ISO|'',
  meetingDone: boolean,
  instagram, tiktok, drive, notes,
  won: boolean,
  wonAt: ISO|null,
  convertedTo: schoolId|null,       // set on conversion; record is kept for history
  createdAt: ISO,
}
```

### 4.3 User

```ts
{ id, name, code: string, role: 'admin'|'staff', active: boolean, lastLogin: ISO|null }
```

`code` is a plaintext login code the admin types in freely. **This is not security** — see §8.1.

### 4.4 EditRequest / LogEntry

```ts
EditRequest = {
  id, at: ISO, by: userName, status: 'pending'|'approved'|'rejected',
  schoolId, schoolName, batch,
  path: string,        // dot-path into the School, e.g. "tasks.logo", "custom.c8f2x1"
  label: string,       // human label shown in the UI, e.g. "الهايلايت"
  from, to,            // raw values
  fromTxt, toTxt,      // pre-rendered display values (status codes -> Arabic labels)
  reviewedAt, reviewedBy, reason,
}

LogEntry = EditRequest-shaped, plus:
  kind: 'direct'    // admin edit, applied immediately
      | 'approved'  // staff edit, approved
      | 'rejected'  // staff edit, rejected (nothing applied)
      | 'create' | 'delete'
      | 'undo'      // an undo was performed
      | 'revert'    // a historical entry was reverted from the log page
```

### 4.5 Config (all admin-editable at runtime)

```ts
{
  batches: number[],
  types: string[],
  companies: string[],
  team: string[],              // the roster. Membership decides who counts in stats.
  ownerPlaceholder: string,    // "بنشوف منو"
  tasks: [{ k, t, hidden: boolean, text?: boolean }],
  printables: [{ k, t, qty?: boolean }],
  customFields: CustomField[], // fields added to ALL schools
}

CustomField = {
  k, t,
  type: 'status'|'text'|'link'|'num'|'bool',
  section: 'basic'|'links'|'tasks'|'print',
  counts: boolean,   // status fields only: include in the progress calculation
}
```

Default tasks (order matters, it's the UI order):
`logo, store, storyStore, slogan*, media, batchVideo, highlight, promo, idea*`
(`*` = `text: true`, i.e. a free-text field rather than a status dropdown).

---

## 5. Business rules

### 5.1 Progress calculation — `progressOf(school, config)`

```
items = config.tasks where !hidden
      + all custom fields (global + local) where type === 'status' && counts

for each item:
  value = text field ? (non-empty ? 'done' : 'none')
                     : (school.tasks[k] || 'none')
  if value === 'na': skip entirely (not in numerator or denominator)
  denominator += 1
  numerator   += (done ? 1 : wip ? 0.5 : 0)

progress = round(numerator / denominator * 100)
```

**Printables are deliberately excluded** — they're logistics, not creative work. A school
must not read as "behind" because pens haven't shipped.

### 5.2 Which schools count

Everything on the Schools page — counts, averages, the "fully done" detection — uses
`active !== false` only. Schools that left are still rendered (greyed, struck through,
sorted last) but never counted.

### 5.3 Batch chips (`27 28 29` next to the name)

Auto-derived, not stored. Group all **active** schools by a normalised name; a school
shows every batch its name group appears in. Normalisation (`norm()` in `01-lib.jsx`):

- Arabic-Indic digits → Latin
- `أإآٱ → ا`, `ى → ي`, `ة → ه`
- strip diacritics and tatweel
- strip a trailing ` sum` / ` trend` suffix
- strip brackets, then strip all whitespace

This makes `الرقة` / `الرقه` and `الجهراء` / `الجهرا` match. `batchesOverride` lets the
admin correct a bad merge or split; once set it wins permanently.

Schools that left contribute nothing and show no chips.

### 5.4 Joined / left stamps

- `joinedAt` is stamped when a school is created via the modal, or converted from a
  prospect. The 105 imported rows have `null` (the Excel had no dates) and display
  "من الملف الأصلي"; an admin can set one by hand.
- A school is **"new"** for `NEW_DAYS = 30` after `joinedAt`: green tint, green spine,
  and a badge counting the days. Purely derived — nothing to expire.
- `leftAt` is stamped automatically when `active` flips to `false`, along with
  `leftOwner1/2` snapshots. **Never cleared** — if the school comes back, the history
  stays. This is the rule that makes "how many did we lose this month, and on whose
  watch" answerable.

### 5.5 Owner semantics

`owner1`/`owner2` are free text on purpose. If the value is in `config.team` it's a real
person: counted in stats, filterable, normal styling. Anything else is a **temporary
note** ("بنشوف مين من البنات"): italic amber, never attributed to anyone.

The combobox (`08-ownerpick.jsx`) offers, always visible: pick from roster, filter by
typing, `+ أضف اسم جديد` → either **add to roster** (admin only) or **keep as a temporary
note** (anyone). Departures are credited to `leftOwner*`, i.e. whoever held the school
**at the time it left** — not whoever holds it now.

### 5.6 Two-staff schools

A school can be split between us and a competitor. `staffCount: 2` reveals
`otherCompany` and `stronger` (us / them / even). Every row shows a badge with two dots
(one filled = single staff, both = shared) coloured by `stronger` — green us, red them,
amber even. Filterable both ways.

### 5.7 User-defined fields

Any section (`basic`, `links`, `tasks`, `print`) has a `+ خانة` button. The dialog asks
for a label, a type, and a scope:

- **this school only** → appended to `school.localFields`
- **all schools** → appended to `config.customFields` (admin only)

`status` fields additionally ask "counts toward progress?" — so "coffee event: done?"
doesn't drag a school's percentage down but "graduation reel" does. Values live in
`school.custom[key]`. Removing a field deletes the definition, not the stored values.

### 5.8 Permissions

| | admin | staff |
|---|---|---|
| See everything | ✅ | ✅ (except Requests / Stats / Settings) |
| Edit a field | applies immediately | becomes a **pending request** |
| Add / delete a school | ✅ | ❌ |
| Add field to one school | ✅ | pending request |
| Add field to all schools | ✅ | ❌ |
| Add a person to the roster | ✅ | ❌ (temporary note only) |
| Hide a task for everyone | ✅ | ❌ |
| Approve / reject | ✅ | ❌ |
| Change log | all | own entries only |

**Everything a staff member changes needs approval** — the client explicitly rejected a
tiered model where trivial fields auto-apply. All writes funnel through one function,
`edit()` in `02-app.jsx`; that is the only place the admin/staff branch exists. Preserve
that shape.

Pending requests are deduped by `(schoolId, path, by)` — a staff member re-editing the
same field replaces their earlier request rather than queueing another.

### 5.9 Undo / redo

`mutate(label, apply, revert)` in `02-app.jsx`. Every mutation supplies both an `apply`
and a `revert` transform over the whole DB; both are pushed onto a stack (max 60).
`Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z`, plus buttons and a bar naming the last action.
Covers field edits, create, delete, approvals (undoing one returns the request to
pending), config changes, and field add/remove.

Separately, the change log has a **رجّعها** button per entry that reverts any historical
change, with a confirm if the field moved on since. Both paths write their own log
entries — there is no way to change data without leaving a trace.

### 5.10 Period activity stats

`07-stats-settings.jsx`. Ranges: today / yesterday / last 7 / last 30 / all / custom.
Applied kinds are `direct, approved, revert, undo` (rejected never applied, so excluded).

- **"تعديلات"** attribute to `log.by` — who did the work.
- **"تغيّر إنجاز مدارسه"** attributes the progress delta to the **current owners** of the
  affected school, averaged across their schools.

Two different questions, deliberately two different columns: if the admin edits Reem's
school, the edit is the admin's but the improvement is Reem's.

Delta per log entry: `taskValue(to) - taskValue(from)` for `tasks.*` and `custom.*`
paths, and `±1` for text tasks going empty↔non-empty. Divided by task count → percent.

---

## 6. UI conventions worth preserving

- **Gradient** `#4DABE3 → #4AA191` (from the client's own artwork) drives header, active
  tabs, primary buttons, progress bars.
- Brand colours: SUM `#00AEE8` + navy `#1D3462`; TREND teal `#08A591`. Navy is the text
  colour throughout.
- Fonts: IBM Plex Sans Arabic (UI) + IBM Plex Mono (all numerals, `direction: ltr`,
  `unicode-bidi: isolate` — critical for correct RTL rendering of Latin digits).
- Every row is a card with a 5px coloured spine on the inline-end edge: blue = SUM,
  teal = Trend, green = new school, grey = gone.
- **CSS grid gotcha:** `.spine` is `position: absolute`, so it is *not* a grid item.
  Row grids must have exactly as many columns as in-flow children. This has already
  caused one production layout bug where every cell shifted one column over. If you add
  or remove a child in `.rowhead`, `.prowhead`, `.sthead/.strow`, or `.uhead/.urow`,
  update the matching `grid-template-columns`.
- All modals close on `Escape` and on backdrop click.

---

## 7. Storage layer — the seam to replace

`window.storage` is the entire persistence API. Four async methods:
`get(key, shared?)`, `set(key, value, shared?)`, `delete(key)`, `list(prefix?)`.

Keys in use: `st_db_v4` (the whole DB, shared) and `st_session_v3` (current user id, per
device). The adapter is defined in `build.js` and resolves to Claude's artifact storage,
else `localStorage`, else memory.

**This is the single seam.** Swapping it for authenticated API calls is most of the
backend work on the client side. Everything above it is storage-agnostic.

---

## 8. Known problems — read this section fully

### 8.1 Blocking, must be fixed in the real version

1. **No real authentication.** Login codes sit in plaintext in the client bundle. Anyone
   can read them via View Source. They organise the team; they do not protect anything.
2. **No shared data.** Each browser holds its own copy. Two people using the same URL
   never see each other's work. The approval workflow, the log, and the stats are all
   effectively single-player right now. *This is the reason to rebuild.*
3. **Public hosting exposes everything.** The 105 schools, staff names, and codes are
   embedded in the HTML. On a public GitHub Pages / Netlify URL, all of it is public.
4. **Last-write-wins with no concurrency control.** The whole DB is one blob. Two
   concurrent writers silently clobber each other. Needs per-record versioning.

### 8.2 Real bugs / sharp edges in the current code

5. **Log noise from per-keystroke writes.** `edit()` fires on every `onChange`, so typing
   a 20-character slogan writes 20 log entries. Debounce or coalesce on blur.
6. **Log is capped at 5,000 entries** and truncated from the tail — oldest history is
   silently lost. Server-side the log should be unbounded and paginated.
7. **Whole DB in one storage key.** Artifact storage caps values at 5 MB. With log growth
   this will eventually fail; the UI shows a toast but the user can lose a write.
8. **Undo stack is in-memory only** — lost on refresh, and holds closures over DB
   snapshots (memory cost grows with stack depth). In multi-user it also has no guard
   against undoing someone else's newer change.
9. **Two staff editing the same field** produce two pending requests. The UI flags the
   conflict, but approving both applies them in sequence — last one silently wins.
10. **Batch-chip auto-matching can over-merge.** Two genuinely different schools with the
    same normalised name in different batches will be linked. `batchesOverride` is the
    manual escape hatch; there is no warning when it happens.
11. **`edit()` compares values with `String(from) === String(to)`.** Works for scalars and
    (by luck) arrays. It would silently no-op on objects. Replace with a proper deep
    compare if the model gains nested values.
12. **Deleting a task/field leaves orphan values** in `school.tasks` / `school.custom`.
    Harmless today, but it grows and pollutes exports.
13. **No URL validation.** Instagram/TikTok/Drive accept any string; `okUrl()` only gates
    whether the row renders a live link.
14. **`fixDb()` contains a hardcoded one-off rename** (`RENAMES`, فاطمة العبيدان →
    فرح العبيدان) to repair devices that already saved the wrong name. Drop it once the
    data lives server-side.
15. **No list virtualisation.** Fine at 105 rows; will degrade past ~1,000.
16. **Dropdowns are not keyboard-navigable** (mouse + Escape only). The owner combobox
    was rewritten away from native `<datalist>` precisely because Safari barely supports
    it — but arrow-key navigation was not added back.
17. **`datetime-local` is parsed in the browser's local timezone** and stored as ISO.
    Correct for a single-timezone team; needs an explicit timezone if that changes.
18. **Prospect → school conversion copies only** name, owner, the three links and notes.
    Everything else starts blank by design — confirm that's still wanted.

### 8.3 Deliberate design decisions — do not "fix" these

- Printables excluded from progress (§5.1).
- Owner fields are free text (§5.5).
- Departures credited to the owner at the time of leaving (§5.4).
- Every staff edit needs approval, with no auto-apply tier (§5.8).
- Hiding a completed task is global, admin-only, and non-destructive.
- `leftAt` / `joinedAt` are permanent.

---

## 9. What the production version needs

**Stack:** any server + relational DB. The client is plain React and can stay as-is
above the storage seam, or be rewritten — the spec above is the contract.

**Schema:** one table per entity in §4. Replace the single JSON blob. Add
`updated_at` + `version` to every row for optimistic concurrency.

**Auth:** real accounts (email + password or SSO), hashed credentials, server-issued
sessions. Roles `admin` / `staff` enforced **server-side** — the client checks in §5.8
are UX, not a security boundary.

**API shape** (illustrative):

```
GET    /api/bootstrap                 -> { schools, prospects, config, users, me }
PATCH  /api/schools/:id               -> { path, value, ifVersion }  409 on conflict
POST   /api/schools                   /  DELETE /api/schools/:id
GET    /api/requests?status=pending
POST   /api/requests/:id/approve      /  /reject
GET    /api/log?school=&by=&from=&to=&page=
POST   /api/log/:id/revert
GET/PUT /api/config
CRUD   /api/prospects   +   POST /api/prospects/:id/convert  { batch }
```

Server must own: the log (append-only, never truncated), the approval state machine, the
`joinedAt`/`leftAt` stamping, and the progress calculation used by stats.

**Realtime:** WebSocket or polling so the team sees each other's changes. This is the
whole point of the rebuild.

**Then:** Google Calendar OAuth for real two-way meeting sync (the prototype only builds
a prefilled `calendar.google.com/render` URL — see `gcalUrl()` in `05-pipeline.jsx`).

**Migration:** `Settings → البيانات → نزّل نسخة احتياطية` exports the whole DB as JSON in
exactly the shape in §4. Import that once and the prototype's data carries over.

---

## 10. Running it

```bash
npm install
npm run build      # -> dist/index.html
open dist/index.html
```

Default admin code: **1234**. Change it immediately in `Settings → المستخدمون`.
The rest of the team is pre-seeded there, deactivated and without codes.
