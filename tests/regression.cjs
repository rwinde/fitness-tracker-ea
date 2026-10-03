// Regression tests for the findings of audit/2026-10-02/AUDIT.md.
// Loads the real app.js into a Node VM; only Firebase, browser APIs and timers
// are replaced by test doubles (same approach as the audit's repro.cjs, but the
// assertions check the CORRECT behavior). Run: node tests/regression.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').replace(/^import .*;\n/gm, '');
const clone = structuredClone;
const TODAY = '2026-10-02';
const workout = (name = 'Bankdrücken', kg = '80') => ({exercises: [{name, open: true, sets: [{kg, reps: '8'}]}], notes: ''});

// Fake Firestore backend; several runtimes (= tabs/devices) can share one.
const server = () => ({docs: new Map(), listeners: []});

// localStorage of one device: tabs/restarts on the same device share it
function storage(srv) {
  const ls = srv.sameDevice ? (srv.ls ??= new Map()) : new Map();
  return {getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k)};
}

function runtime(srv = server()) {
  const nodes = new Map(), timers = new Map(), docListeners = {}, winListeners = {};
  let serial = 0, authCallback, mode = 'ok', acks = [];
  const rejectPaths = new Set();
  const rt = {};
  function element() {
    const classes = new Set();
    return {style: {setProperty() {}}, dataset: {}, value: '', innerHTML: '', textContent: '', children: [], listeners: {},
      classList: {add(...xs) { xs.forEach(x => classes.add(x)); }, remove(...xs) { xs.forEach(x => classes.delete(x)); }, contains(x) { return classes.has(x); }, toggle(x, on) { if (on === undefined) on = !classes.has(x); on ? classes.add(x) : classes.delete(x); return on; }},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      appendChild(child) { this.children.push(child); this.lastElementChild = child; child.parentNode = this; },
      // Minimal layout for the reorder code: children stacked 60px apart
      insertBefore(child, ref) { this.children.splice(this.children.indexOf(child), 1); this.children.splice(ref ? this.children.indexOf(ref) : this.children.length, 0, child); },
      get nextElementSibling() { const s = this.parentNode?.children || []; return s[s.indexOf(this) + 1] || null; },
      getBoundingClientRect() { const s = this.parentNode?.children || []; return {top: s.indexOf(this) * 60, height: 60}; },
      setPointerCapture() {},
      querySelector() { return null; }, querySelectorAll() { return []; }, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, focus() {},
      get offsetWidth() { return this.style.display === 'none' ? 0 : 360; },
      get offsetHeight() { return this.style.display === 'none' ? 0 : 220; },
      getContext() { return new Proxy({}, {get: (_, key) => key === 'createLinearGradient' ? () => ({addColorStop() {}}) : () => {}}); },
    };
  }
  const document = {getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    querySelector: () => null, querySelectorAll: () => [], createElement: element, documentElement: element(), body: element(),
    visibilityState: 'visible', addEventListener(type, fn) { (docListeners[type] ??= []).push(fn); }};
  const isCollection = p => p.split('/').length % 2 === 1;
  const under = (p, col) => p.startsWith(col + '/') && p.split('/').length === col.split('/').length + 1;
  function snapshot(ref, changed, pending) {
    if (isCollection(ref)) return {
      forEach(fn) { for (const [k, v] of srv.docs) if (under(k, ref)) fn({id: k.slice(ref.length + 1), data: () => clone(v)}); },
      docChanges: () => changed.map(p => ({type: srv.docs.has(p) ? 'modified' : 'removed',
        doc: {id: p.slice(ref.length + 1), data: () => clone(srv.docs.get(p)), metadata: {hasPendingWrites: pending}}})),
      metadata: {hasPendingWrites: pending},
    };
    return {exists: () => srv.docs.has(ref), data: () => clone(srv.docs.get(ref)), metadata: {hasPendingWrites: pending}};
  }
  // ops: [[path, value | undefined (= delete)]], applied atomically.
  // mode: ok | reject | hang (offline, never acked) | manual (acked via rt.ack());
  // rejectPaths: writes touching one of these paths are rejected
  function write(ops) {
    if (mode === 'reject' || ops.some(([p]) => rejectPaths.has(p))) return Promise.reject(Error('write rejected'));
    ops.forEach(([p, v]) => v === undefined ? srv.docs.delete(p) : srv.docs.set(p, clone(v)));
    const paths = ops.map(o => o[0]);
    for (const l of [...srv.listeners]) {
      const changed = paths.filter(p => p === l.ref || under(p, l.ref));
      // Own writes echo as pending; on one device (shared cache) other tabs' writes do too
      if (changed.length) l.cb(snapshot(l.ref, changed, srv.sameDevice || l.rt === rt));
    }
    if (mode === 'hang') return new Promise(() => {});
    if (mode === 'manual') return new Promise(r => acks.push(r));
    return Promise.resolve();
  }
  const context = {document, structuredClone, Map, Set, Date, console: {error() {}}, performance: {now: () => 0}, navigator: {onLine: true},
    setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, alert() {}, confirm: () => true,
    matchMedia: () => ({matches: true}), addEventListener(type, fn) { (winListeners[type] ??= []).push(fn); }, scrollTo() {}, localStorage: storage(srv),
    getComputedStyle: () => ({getPropertyValue: () => '#000'}), initializeApp: () => ({}), getAuth: () => ({}),
    initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}), GoogleAuthProvider: function () {},
    onAuthStateChanged(_, fn) { authCallback = fn; }, fbSignOut: async () => {}, signInWithPopup: async () => {},
    doc: (_, ...p) => p.join('/'), collection: (_, ...p) => p.join('/'),
    getDocs: async ref => snapshot(ref, [], false), getDoc: async ref => snapshot(ref, [], false),
    setDoc: (p, v) => write([[p, v]]), deleteDoc: p => write([[p, undefined]]),
    writeBatch: () => { const ops = []; return {set(p, v) { ops.push([p, clone(v)]); }, delete(p) { ops.push([p, undefined]); }, commit: () => write(ops)}; },
    onSnapshot(ref, cb) {
      const l = {ref, cb, rt};
      srv.listeners.push(l);
      cb(snapshot(ref, [], false));
      return () => srv.listeners.splice(srv.listeners.indexOf(l), 1);
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  const run = s => vm.runInContext(s, context);
  run(`getTodayKey=()=>'${TODAY}'`);
  return Object.assign(rt, {context, run, nodes, srv, docListeners,
    auth: user => authCallback(user),
    // A browser fires storage events only in the other tabs, and may miss some
    fire: (type, e) => (winListeners[type] || []).forEach(fn => fn(e)),
    login: uid => authCallback({uid, displayName: 'Account ' + uid}),
    setMode: m => { mode = m; },
    rejectPath: p => rejectPaths.add(p),
    allowPath: p => rejectPaths.delete(p),
    ack: () => { acks.splice(0).forEach(r => r()); },
    tick: () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    setToday: key => run(`getTodayKey=()=>'${key}'`),
    put: (key, value) => { context[key] = clone(value); },
  });
}

const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test('F01 account switch drops the previous account; a failed load stays locked', async () => {
  const srv = server();
  srv.docs.set('users/A/sessions/2026-09-30', workout('Private A'));
  const r = runtime(srv), getDocs = r.context.getDocs;
  await r.login('A');
  r.run("addExercise('Draft A')");
  await r.auth(null);
  r.context.getDocs = async () => { throw Error('read unavailable'); };
  await r.login('B');
  assert.equal(r.run('drafting'), false);
  assert.equal(r.run('currentSession.exercises.length'), 0);
  assert.equal(r.run('Object.keys(sessions).length'), 0);
  assert.notEqual(r.nodes.get('main-app').style.display, 'block');
  assert.match(r.nodes.get('loading-screen').innerHTML, /nicht geladen/);
  r.run('finishTraining()');
  assert.ok(![...srv.docs.keys()].some(k => k.startsWith('users/B/')));
  // A's draft stays on the device, for A only
  r.context.getDocs = getDocs;
  await r.auth(null); await r.login('A');
  assert.equal(r.run('currentSession.exercises[0].name'), 'Draft A');
});

test('F02 moving a training is atomic; a rejected move keeps original and draft', async () => {
  const srv = server();
  srv.docs.set('users/A/sessions/2026-09-30', workout());
  const r = runtime(srv);
  await r.login('A');
  r.run("currentDetailKey='2026-09-30';editSession();changeBacklogDate('2026-10-01');");
  r.rejectPath('users/A/sessions/2026-10-01'); // deleting the original would work, writing the target not
  await r.run('saveBacklog()');
  assert.ok(srv.docs.has('users/A/sessions/2026-09-30'));
  assert.ok(!srv.docs.has('users/A/sessions/2026-10-01'));
  assert.equal(r.run('backlogKey'), '2026-10-01'); // editor + draft kept for a retry
  r.allowPath('users/A/sessions/2026-10-01');
  await r.run('saveBacklog()');
  assert.ok(!srv.docs.has('users/A/sessions/2026-09-30'));
  assert.equal(srv.docs.get('users/A/sessions/2026-10-01').exercises[0].name, 'Bankdrücken');
});

test('F03 a training keeps the day it was started, also after a restart; with none running the next day shows', async () => {
  const srv = Object.assign(server(), {sameDevice: true});
  const r = runtime(srv);
  await r.login('A');
  r.run("addExercise('Late');toggleDone(0);");
  r.setToday('2026-10-03');
  const reopened = runtime(srv); // app restarted after midnight
  reopened.setToday('2026-10-03');
  await reopened.login('A');
  assert.equal(reopened.run('currentKey'), TODAY);
  assert.equal(reopened.run('currentSession.exercises[0].name'), 'Late');
  const resume = () => r.docListeners.visibilitychange.forEach(fn => fn());
  resume(); // still running: stays on its day
  assert.equal(r.run('currentKey'), TODAY);
  r.run('finishTraining()');
  assert.ok(srv.docs.has(`users/A/sessions/${TODAY}`));
  assert.ok(!srv.docs.has('users/A/sessions/2026-10-03'));
  assert.equal(r.run('currentKey'), '2026-10-03'); // finished: on to today
  r.setToday('2026-10-04');
  resume();
  assert.equal(r.run('currentKey'), '2026-10-04');
});

test('F04 a training saved elsewhere shows up; a running draft is never replaced, finishing asks', async () => {
  const srv = server();
  const a = runtime(srv), b = runtime(srv);
  await a.login('A'); await b.login('A');
  a.run("addExercise('From A');toggleDone(0);finishTraining();");
  assert.equal(b.run(`sessions['${TODAY}'].exercises[0].name`), 'From A');
  b.run('editToday()'); // continues from the stored training
  assert.equal(b.run('currentSession.exercises[0].done'), true);
  b.run("addExercise('From B');toggleDone(1);");
  a.run("editToday();addExercise('A again');toggleDone(1);finishTraining();");
  assert.equal(b.run("currentSession.exercises.map(e=>e.name).join()"), 'From A,From B'); // draft untouched
  let asked = 0;
  b.context.confirm = () => { asked++; return false; };
  b.run('finishTraining()');
  assert.equal(asked, 1);
  assert.equal(b.run('drafting'), true); // declined: the draft stays
  assert.deepEqual(srv.docs.get(`users/A/sessions/${TODAY}`).exercises.map(e => e.name), ['From A', 'A again']);
  b.context.confirm = () => true;
  b.run('finishTraining()');
  assert.deepEqual(srv.docs.get(`users/A/sessions/${TODAY}`).exercises.map(e => e.name), ['From A', 'From B']);
});

test('F04 two tabs on the same device (shared cache) also sync', async () => {
  const srv = Object.assign(server(), {sameDevice: true});
  const a = runtime(srv), b = runtime(srv);
  await a.login('A'); await b.login('A');
  a.run("addExercise('Other tab');toggleDone(0);finishTraining();");
  assert.equal(b.run(`sessions['${TODAY}'].exercises[0].name`), 'Other tab');
});

test('F05 unacknowledged (offline) writes never block the UI', async () => {
  const r = runtime();
  await r.login('A');
  r.setMode('hang');
  r.context.document.getElementById('search').value = 'Offline exercise';
  r.run('addCustomExercise()');
  assert.equal(r.run('currentSession.exercises[0].name'), 'Offline exercise');
  r.run('toggleDone(0);finishTraining()');
  assert.equal(r.run('drafting'), false);
  assert.equal(r.run(`sessions['${TODAY}'].exercises.length`), 1);
  r.run("openTemplateEditor(null);addTplExercise('Bankdrücken');");
  r.context.document.getElementById('tpl-name-input').value = 'Push';
  const saving = r.run('saveTemplate()');
  r.tick(); // ACK_WAIT_MS passes without an ack = queued offline
  await saving;
  assert.equal(r.run('editingTemplate'), null);
  assert.equal(r.run('templates.length'), 1);
});

test('F06 signing in again does not duplicate event handlers', async () => {
  const r = runtime();
  await r.login('A'); await r.auth(null); await r.login('A');
  const callbacks = r.nodes.get('exercise-options').listeners.click;
  assert.equal(callbacks.length, 1);
  assert.equal(r.nodes.get('notes').listeners.input.length, 1);
  callbacks[0]({target: {closest: () => ({dataset: {name: 'Bankdrücken'}})}});
  assert.equal(r.run('currentSession.exercises.length'), 1);
});

test('F07 the chart canvas is measured after it is shown', () => {
  const r = runtime();
  const sel = r.context.document.getElementById('progress-ex-select');
  sel.value = '';
  r.run('renderProgressChart()');
  r.put('fixture', workout());
  r.run("sessions={'2026-09-30':fixture,'2026-10-01':fixture};");
  sel.value = 'Bankdrücken';
  r.run('renderProgressChart()');
  const canvas = r.nodes.get('progress-chart');
  assert.equal(canvas.style.display, 'block');
  assert.equal(canvas.width, 360);
  assert.equal(canvas.height, 220);
});

test('F08 stored markup or malformed data in sessions is neutralised', async () => {
  const srv = server();
  srv.docs.set('users/A/sessions/2026-09-30', workout('Safe name', '<img src=x onerror="void(0)">'));
  srv.docs.set('users/A/sessions/2026-09-29', {exercises: 'oops', notes: 42});
  const r = runtime(srv);
  await r.login('A');
  assert.equal(r.run("sessions['2026-09-30'].exercises[0].sets[0].kg"), '');
  assert.deepEqual(r.run("JSON.stringify(sessions['2026-09-29'])"), '{"exercises":[],"notes":""}');
  r.put('fixture', workout('Safe name', '<img src=x>'));
  const html = r.run('renderExerciseCard(fixture.exercises[0],{readonly:true}).innerHTML + renderExerciseCard(fixture.exercises[0],{}).innerHTML');
  assert.ok(!html.includes('<img'));
});

test('F09 a rejected template save keeps the editor and draft open', async () => {
  const srv = server();
  const r = runtime(srv);
  await r.login('A');
  r.run("openTemplateEditor(null);addTplExercise('Bankdrücken');");
  r.context.document.getElementById('tpl-name-input').value = 'Push';
  r.setMode('reject');
  await r.run('saveTemplate()');
  assert.notEqual(r.run('editingTemplate'), null);
  assert.ok(r.nodes.get('tpl-editor-overlay').classList.contains('open'));
  assert.equal(r.run('templates.length'), 0);
  assert.match(r.nodes.get('sync-toast').textContent, /fehlgeschlagen/);
  r.setMode('ok');
  await r.run('saveTemplate()');
  assert.equal(r.run('editingTemplate'), null);
  assert.equal(srv.docs.get('users/A/data/templates').list[0].name, 'Push');
});

test('F10 a rejected finish brings the training back as a draft; nothing counts as saved', async () => {
  const srv = server();
  const r = runtime(srv);
  await r.login('A');
  r.run("addExercise('Bankdrücken');toggleDone(0);");
  r.setMode('reject');
  r.run('finishTraining()');
  await new Promise(res => setImmediate(res));
  assert.equal(r.run('drafting'), true);
  assert.equal(r.run('currentSession.exercises[0].name'), 'Bankdrücken');
  assert.equal(r.run(`sessions['${TODAY}']`), undefined);
  assert.match(r.nodes.get('sync-toast').textContent, /fehlgeschlagen/);
  r.setMode('ok');
  r.run('finishTraining()');
  const saved = srv.docs.get(`users/A/sessions/${TODAY}`).exercises[0];
  assert.equal(saved.name, 'Bankdrücken');
  assert.equal(saved.done, undefined); // UI flags stay local
});

// Retest findings (audit/2026-10-02/RETEST.md)
test('R1 the first listener snapshot picks up changes made since the initial reads', async () => {
  const srv = server(), key = `users/A/sessions/${TODAY}`;
  srv.docs.set(key, workout());
  const r = runtime(srv), listen = r.context.onSnapshot;
  r.context.onSnapshot = (ref, cb) => {
    if (ref === 'users/A/sessions') srv.docs.set(key, {...workout(), exercises: [...workout().exercises, ...workout('Remote').exercises]});
    return listen(ref, cb);
  };
  await r.login('A');
  assert.equal(r.run(`sessions['${TODAY}'].exercises.length`), 2);
  r.run("editToday();currentSession.notes='Local';finishTraining();");
  assert.equal(srv.docs.get(key).exercises.length, 2);
});

test('R2 a stale past-training or template editor asks before overwriting', async () => {
  const srv = server();
  srv.docs.set('users/A/sessions/2026-09-30', workout());
  srv.docs.set('users/A/data/templates', {list: [{id: 1, name: 'Push', exercises: workout().exercises}]});
  const a = runtime(srv), b = runtime(srv);
  await a.login('A'); await b.login('A');
  let asked = 0;
  b.context.confirm = () => { asked++; return false; };
  a.run("currentDetailKey='2026-09-30';editSession();");
  b.run("currentDetailKey='2026-09-30';editSession();openTemplateEditor(1);");
  a.run("addBacklogExercise('Remote')");
  await a.run('saveBacklog()');
  b.context.document.getElementById('backlog-notes').value = 'Local';
  await b.run('saveBacklog()');
  assert.equal(asked, 1);
  assert.equal(srv.docs.get('users/A/sessions/2026-09-30').exercises.length, 2);
  assert.equal(b.run('backlogKey'), '2026-09-30'); // declined: editor and draft stay
  a.run("openTemplateEditor(1);addTplExercise('Remote');");
  a.context.document.getElementById('tpl-name-input').value = 'Push';
  await a.run('saveTemplate()');
  b.context.document.getElementById('tpl-name-input').value = 'Local';
  await b.run('saveTemplate()');
  assert.equal(asked, 2);
  assert.equal(srv.docs.get('users/A/data/templates').list[0].name, 'Push');
});

test('R3 a rejection after the editor closed brings the draft back', async () => {
  const r = runtime();
  await r.login('A');
  let reject;
  const pending = () => new Promise((_, no) => { reject = no; });
  r.run("openTemplateEditor(null);addTplExercise('Bankdrücken');");
  r.context.document.getElementById('tpl-name-input').value = 'Late';
  r.context.setDoc = pending;
  const saving = r.run('saveTemplate()');
  r.tick(); // ACK_WAIT_MS passes: editor closes, write still pending
  await saving;
  assert.equal(r.run('editingTemplate'), null);
  reject(Error('rejected late'));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(r.run('editingTemplate.name'), 'Late');
  assert.ok(r.nodes.get('tpl-editor-overlay').classList.contains('open'));
  assert.equal(r.run('templates.length'), 0);
  r.run("openBacklog('2026-09-30',null,{exercises:[],notes:''});addBacklogExercise('Bankdrücken');");
  r.context.writeBatch = () => ({set() {}, delete() {}, commit: pending});
  const backlog = r.run('saveBacklog()');
  r.tick();
  await backlog;
  assert.equal(r.run('backlogKey'), null);
  reject(Error('rejected late'));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(r.run('backlogKey'), '2026-09-30');
  assert.equal(r.run('backlogSession.exercises[0].name'), 'Bankdrücken');
});

test('R4 a direct account switch hides the previous UI at once', async () => {
  const srv = server();
  srv.docs.set(`users/A/sessions/${TODAY}`, workout('Private A'));
  const r = runtime(srv);
  await r.login('A');
  assert.equal(r.nodes.get('main-app').style.display, 'block');
  r.context.getDocs = async () => { throw Error('read unavailable'); };
  await r.login('B'); // no signed-out event in between
  for (const id of ['main-app', 'bottom-nav', 'profile']) assert.equal(r.nodes.get(id).style.display, 'none');
});

test('R5 a finishing save never closes a newer editor', async () => {
  const r = runtime();
  await r.login('A');
  r.setMode('manual');
  r.run("openTemplateEditor(null);addTplExercise('Bankdrücken');");
  r.context.document.getElementById('tpl-name-input').value = 'First';
  const tpl = r.run('saveTemplate()');
  r.run("closeModal('tpl-editor-overlay');openTemplateEditor(null);addTplExercise('Newer');");
  r.run("openBacklog('2026-09-30',null,{exercises:[],notes:''});addBacklogExercise('Bankdrücken');");
  const backlog = r.run('saveBacklog()');
  r.run("cancelBacklog();openBacklog('2026-09-29',null,{exercises:[],notes:''});addBacklogExercise('Newer');");
  r.ack();
  await tpl; await backlog;
  assert.equal(r.run('editingTemplate.exercises[0].name'), 'Newer');
  assert.equal(r.run('backlogKey'), '2026-09-29');
  assert.equal(r.run('backlogSession.exercises[0].name'), 'Newer');
});

// Second retest (audit/2026-10-03/RETEST.md); S1 is a documented limit
test('S2 edits made while saving stay in the editor; saving twice is no conflict', async () => {
  const r = runtime();
  await r.login('A');
  r.setMode('manual');
  let asked = 0;
  r.context.confirm = () => { asked++; return true; };
  r.run("openTemplateEditor(null);addTplExercise('Bankdrücken');");
  r.context.document.getElementById('tpl-name-input').value = 'Push';
  let saving = r.run('saveTemplate()');
  r.run("updateTplSet(0,0,'kg',{value:'95'});");
  r.ack(); await saving;
  assert.equal(r.run('editingTemplate.exercises[0].sets[0].kg'), '95');
  saving = r.run('saveTemplate()');
  const twice = r.run('saveTemplate()');
  r.ack(); await saving; await twice;
  assert.equal(asked, 0);
  assert.equal(r.srv.docs.get('users/A/data/templates').list[0].exercises[0].sets[0].kg, '95');
  assert.equal(r.run('editingTemplate'), null);
  r.run("openBacklog('2026-09-30',null,{exercises:[],notes:''});addBacklogExercise('Bankdrücken');");
  saving = r.run('saveBacklog()');
  r.run("updateBacklogSet(0,0,'kg',{value:'95'});");
  r.ack(); await saving;
  assert.equal(r.run('backlogSession.exercises[0].sets[0].kg'), '95');
  saving = r.run('saveBacklog()');
  const again = r.run('saveBacklog()');
  r.ack(); await saving; await again;
  assert.equal(asked, 0);
  assert.equal(r.srv.docs.get('users/A/sessions/2026-09-30').exercises[0].sets[0].kg, '95');
  assert.equal(r.run('backlogKey'), null);
  // A rejected save puts the editor back on its old base: retrying is no conflict either
  r.setMode('reject');
  r.run("openTemplateEditor(templates[0].id);updateTplSet(0,0,'kg',{value:'100'});");
  await r.run('saveTemplate()');
  r.setMode('ok');
  await r.run('saveTemplate()');
  assert.equal(asked, 0);
  assert.equal(r.srv.docs.get('users/A/data/templates').list[0].exercises[0].sets[0].kg, '100');
});

test('S3 a training rejected while another one is open comes back with its date', async () => {
  const r = runtime();
  await r.login('A');
  r.run("openBacklog('2026-09-30',null,{exercises:[],notes:''});addBacklogExercise('First draft');");
  let reject;
  r.context.writeBatch = () => ({set() {}, delete() {}, commit: () => new Promise((_, no) => { reject = no; })});
  const saving = r.run('saveBacklog()');
  r.tick(); await saving;
  r.run("openBacklog('2026-09-29',null,{exercises:[],notes:''});addBacklogExercise('Second draft');");
  reject(Error('rejected late'));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  // The server state arrives without the rejected training (Firestore rolls back its cache)
  r.srv.listeners.find(l => l.ref === 'users/A/sessions').cb(await r.context.getDocs('users/A/sessions'));
  assert.equal(r.run("sessions['2026-09-30']"), undefined);
  assert.equal(r.run('backlogSession.exercises[0].name'), 'Second draft');
  r.run('cancelBacklog()');
  r.context.document.getElementById('backlog-date-input').value = '2026-09-30';
  r.run('confirmBacklogDate()');
  assert.equal(r.run('backlogSession.exercises[0].name'), 'First draft');
  r.run('cancelBacklog()');
  r.run("lostDrafts['2026-09-30']={from:null,draft:{exercises:[],notes:''},seen:{}}");
  await r.login('B'); // never offered to another account
  assert.equal(r.run('Object.keys(lostDrafts).length'), 0);
});

// Redesign v3: deletable sets, start options, copying earlier trainings
test('V3 sets can be deleted; a new exercise starts like last time', async () => {
  const srv = server();
  srv.docs.set('users/A/sessions/2026-09-28', {exercises: [{name: 'Bankdrücken', sets: [{kg: '70', reps: '10'}, {kg: '70', reps: '10'}, {kg: '70', reps: '9'}]}], notes: ''});
  srv.docs.set('users/A/sessions/2026-09-30', {exercises: [{name: 'Bankdrücken', sets: [{kg: '80', reps: '8'}, {kg: '82.5', reps: '6'}, {kg: '', reps: ''}]}], notes: ''});
  const r = runtime(srv);
  await r.login('A');
  r.run("addExercise('Bankdrücken');addExercise('Neu');");
  assert.equal(r.run('currentSession.exercises[0].sets.length'), 2); // last time's empty third set doesn't count
  assert.equal(r.run('currentSession.exercises[1].sets.length'), 2); // never done before
  const cards = r.nodes.get('exercise-list').children;
  assert.match(cards[cards.length - 2].innerHTML, /placeholder="82.5"/); // last values as placeholders
  r.run('addSet(0);addSet(0);removeSet(0,1);');
  assert.equal(r.run('currentSession.exercises[0].sets.length'), 3);
  r.run('removeSet(0,0);removeSet(0,0);removeSet(0,0);toggleDone(0);toggleDone(1);finishTraining();');
  assert.equal(srv.docs.get(`users/A/sessions/${TODAY}`).exercises[0].sets.length, 0);
  r.run("openTemplateEditor(null);addTplExercise('Bankdrücken');removeTplSet(0,0);");
  assert.equal(r.run('editingTemplate.exercises[0].sets.length'), 1);
  r.run("openBacklog('2026-09-29',null,{exercises:[],notes:''});addBacklogExercise('Bankdrücken');removeBacklogSet(0,0);");
  assert.equal(r.run('backlogSession.exercises[0].sets.length'), 2); // before 09-30: like 09-28
  assert.match(r.nodes.get('backlog-exercise-list').lastElementChild.innerHTML, /placeholder="70"/);
});

test('V3 one start button; templates and earlier trainings load as an unsaved draft', async () => {
  const srv = server();
  srv.docs.set('users/A/sessions/2026-09-30', workout('Kniebeugen', '100'));
  srv.docs.set('users/A/data/templates', {list: [{id: 1, name: 'Push', exercises: [{name: 'Bankdrücken', sets: [{kg: '80', reps: '8'}, {kg: '80', reps: '8'}]}]}]});
  const r = runtime(srv);
  await r.login('A');
  assert.match(r.nodes.get('start-panel').innerHTML, /openStartModal\(\)/);
  r.run('openStartModal()');
  const sheet = r.nodes.get('start-options').innerHTML;
  for (const option of [/openLoadModal\('templates'\)/, /copySessionToToday\('2026-09-30'\)/, /openLoadModal\('trainings'\)/, /startEmpty\(\)/]) assert.match(sheet, option);
  r.run("openLoadModal('templates')");
  assert.ok(!r.nodes.get('start-modal-overlay').classList.contains('open'));
  assert.match(r.nodes.get('load-options').innerHTML, /startTemplate\(1\)/);
  assert.doesNotMatch(r.nodes.get('load-options').innerHTML, /copySessionToToday/);
  r.run('startTemplate(1)'); // empty day: taken directly, as a draft
  assert.equal(r.run('currentSession.exercises[0].sets[1].kg'), '80');
  assert.equal(r.nodes.get('start-panel').style.display, 'none');
  assert.ok(!srv.docs.has(`users/A/sessions/${TODAY}`)); // nothing saved yet
  r.run("copySessionToToday('2026-09-30')"); // not empty: add or replace?
  assert.ok(r.nodes.get('import-modal-overlay').classList.contains('open'));
  r.run("doImport('add')");
  assert.equal(r.run('JSON.stringify(currentSession.exercises.map(e=>e.name))'), '["Bankdrücken","Kniebeugen"]');
  r.run("currentDetailKey='2026-09-30';copySession();doImport('replace');");
  assert.equal(r.run('JSON.stringify(currentSession.exercises.map(e=>[e.name,e.sets[0].kg]))'), '[["Kniebeugen","100"]]');
  // The copy is today's own training: editing it leaves the original alone
  r.run("updateSet(0,0,'kg',{value:'105'})");
  assert.equal(r.run("sessions['2026-09-30'].exercises[0].sets[0].kg"), '100');
  assert.ok(!srv.docs.has(`users/A/sessions/${TODAY}`));
  r.run('toggleDone(0);finishTraining();');
  assert.equal(srv.docs.get(`users/A/sessions/${TODAY}`).exercises[0].sets[0].kg, '105');
  assert.equal(srv.docs.get('users/A/sessions/2026-09-30').exercises[0].sets[0].kg, '100');
  assert.match(r.nodes.get('start-panel').innerHTML, /Training gespeichert/);
});

test('V3 finishing needs every exercise ticked off; discarding drops the whole draft', async () => {
  const srv = server();
  srv.docs.set('users/A/data/templates', {list: [{id: 1, name: 'Push', exercises: ['Bankdrücken', 'Dips'].map(name => ({name, sets: [{kg: '80', reps: '8'}]}))}]});
  const r = runtime(srv);
  await r.login('A');
  r.run('startTemplate(1);finishTraining();');
  assert.equal(r.run('drafting'), true); // none done: not finished
  r.run('toggleDone(0);finishTraining();');
  assert.equal(r.nodes.get('draft-progress').textContent, '1 von 2 erledigt');
  assert.equal(r.nodes.get('finish-btn').disabled, true);
  assert.equal(r.run('drafting'), true);
  r.run('discardDraft()'); // wrong template: all exercises gone at once
  assert.equal(r.run('drafting'), false);
  assert.equal(r.context.localStorage.getItem('draft:A'), null);
  assert.ok(!srv.docs.has(`users/A/sessions/${TODAY}`));
  r.run('startTemplate(1);toggleDone(0);toggleDone(1);');
  assert.equal(r.nodes.get('finish-btn').disabled, false);
  r.run('finishTraining()');
  assert.equal(srv.docs.get(`users/A/sessions/${TODAY}`).exercises.length, 2);
  r.run('editToday();removeEx(0);discardDraft();'); // discarding edits keeps the stored training
  assert.equal(srv.docs.get(`users/A/sessions/${TODAY}`).exercises.length, 2);
  assert.match(r.nodes.get('start-panel').innerHTML, /Training gespeichert/);
});

test('V3 a template picker shown before a deletion elsewhere still loads the right template', async () => {
  const srv = server();
  srv.docs.set('users/A/data/templates', {list: [
    {id: 1, name: 'Push', exercises: [{name: 'Bankdrücken', sets: [{kg: '80', reps: '8'}]}]},
    {id: 2, name: 'Pull', exercises: [{name: 'Klimmzüge', sets: [{kg: '0', reps: '8'}]}]}]});
  const a = runtime(srv), b = runtime(srv);
  await a.login('A'); await b.login('A');
  b.run('openLoadModal()');
  const rows = b.nodes.get('load-options').innerHTML.match(/startTemplate\([^)]*\)/g);
  a.run('deleteTemplate(1)'); // Push deleted on another device while b's picker is open
  await new Promise(r => setImmediate(r));
  assert.equal(b.run('templates.map(t=>t.name).join()'), 'Pull');
  b.run(rows[0]); // the shown "Push" row must not load Pull
  assert.equal(b.run('currentSession.exercises.length'), 0);
  b.run(rows[1]);
  assert.equal(b.run('currentSession.exercises[0].name'), 'Klimmzüge');
});

test('V3 tapping a template shows it; start, edit and delete from there', async () => {
  const srv = server();
  srv.docs.set('users/A/data/templates', {list: [
    {id: 2, name: 'Pull', exercises: [{name: 'Klimmzüge', sets: [{kg: '0', reps: '8'}]}]},
    {id: 1, name: 'Push', exercises: [{name: 'Bankdrücken', sets: [{kg: '80', reps: '8'}, {kg: '', reps: ''}]}]}]});
  const r = runtime(srv);
  await r.login('A');
  r.run("showPage('templates')");
  r.nodes.get('page-templates').classList.remove('active'); // the fake DOM never deactivates pages
  r.nodes.get('template-list').children[1].onclick();
  assert.ok(r.nodes.get('page-tpl-detail').classList.contains('active'));
  assert.ok(!r.nodes.get('tpl-editor-overlay')?.classList.contains('open')); // a tap shows, it doesn't edit
  assert.equal(r.nodes.get('tpl-detail-title').textContent, 'Push');
  assert.equal(r.nodes.get('tpl-detail-exercises').children[0].innerHTML.match(/ro-row/g).length, 2); // planned (empty) sets too
  assert.match(r.nodes.get('tpl-detail-actions').innerHTML, /startTemplate\(1\)/);
  r.context.document.querySelector = q => q === '.page.active' ? {id: 'page-tpl-detail'} : null;
  r.run("openTemplateEditor(1);updateTplSet(0,0,'kg',{value:'85'});");
  await r.run('saveTemplate()');
  assert.match(r.nodes.get('tpl-detail-exercises').lastElementChild.innerHTML, /85 kg/); // saved edit shows at once
  r.run('deleteTemplate(1)');
  assert.ok(r.nodes.get('page-templates').classList.contains('active'));
  assert.deepEqual(srv.docs.get('users/A/data/templates').list.map(t => t.name), ['Pull']);
});

test('V3 notes without exercises stay reachable (running training and history)', async () => {
  const srv = server();
  srv.docs.set('users/A/sessions/2026-09-29', {exercises: [], notes: 'Knie zwickt'});
  srv.docs.set(`users/A/sessions/${TODAY}`, {exercises: [], notes: 'Heute locker'});
  const r = runtime(srv);
  await r.login('A');
  r.run("addExercise('Bankdrücken');removeEx(0);");
  assert.equal(r.run('currentSession.notes'), 'Heute locker'); // a stored day's notes carry over
  assert.equal(r.nodes.get('training-panel').style.display, ''); // notes field still shown
  assert.equal(r.nodes.get('start-panel').style.display, 'none');
  r.run("showPage('history')");
  const cards = r.nodes.get('history-list').children.filter(c => c.className === 'card session-card');
  assert.equal(cards.length, 2);
  assert.ok(cards.every(c => c.innerHTML.includes('Nur Notiz')));
  r.run("showDetail('2026-09-29')");
  assert.ok(r.nodes.get('detail-notes-wrap').innerHTML.includes('Knie zwickt'));
  assert.equal(r.nodes.get('detail-copy').style.display, 'none'); // nothing to copy
});

test('V3 dragging the handle reorders; a tap or a re-render meanwhile changes nothing', async () => {
  const srv = server();
  srv.docs.set(`users/A/sessions/${TODAY}`, {exercises: ['A', 'B', 'C'].map(name => ({name, sets: [{kg: '10', reps: '5'}]})), notes: ''});
  const r = runtime(srv);
  await r.login('A');
  r.run('editToday()');
  const list = r.nodes.get('exercise-list'), on = (type, e) => list.listeners[type].forEach(fn => fn(e));
  const cards = () => list.children.slice(-3); // the fake innerHTML='' keeps old children
  const grab = i => { const card = cards()[i]; on('pointerdown', {button: 0, pointerId: 1, clientY: i * 60 + 30, preventDefault() {}, target: {closest: q => q === '.drag-handle' ? {closest: () => card} : null}}); };
  const names = () => r.run('currentSession.exercises.map(e=>e.name).join()');
  list.children = cards();
  grab(0); on('lostpointercapture', {}); // tap: nothing moves
  assert.equal(names(), 'A,B,C');
  list.children = cards();
  grab(0); on('pointermove', {clientY: 170}); on('lostpointercapture', {});
  assert.equal(names(), 'B,C,A');
  assert.deepEqual(JSON.parse(r.context.localStorage.getItem('draft:A')).session.exercises.map(e => e.name), ['B', 'C', 'A']);
  list.children = cards();
  grab(2); on('pointermove', {clientY: 10});
  r.run('render()'); list.children = cards(); // remote change re-renders mid-drag
  on('lostpointercapture', {});
  assert.equal(names(), 'B,C,A');
  assert.ok(!list.classList.contains('reordering'));
});

test('V3 a PR is marked only above the standing best', async () => {
  const srv = server();
  srv.docs.set('users/A/sessions/2026-09-30', workout('Bankdrücken', '80'));
  const r = runtime(srv);
  await r.login('A');
  r.run("addExercise('Bankdrücken');addExercise('Neu');");
  const cards = () => r.nodes.get('exercise-list').children.slice(-2).map(c => c.innerHTML);
  r.run("updateSet(0,0,'kg',{value:'80'});updateSet(0,0,'reps',{value:'8'});updateSet(1,0,'kg',{value:'50'});updateSet(1,0,'reps',{value:'5'});render();");
  assert.ok(cards().every(html => !html.includes('pr-value') && !html.includes('Neuer PR'))); // equal to best / no best yet
  r.run("updateSet(0,0,'reps',{value:'9'});render();");
  assert.match(cards()[0], /pr-value/);
  assert.match(cards()[0], /Neuer PR/);
});

// Retest findings of v3.2.0
test('V3 tabs share one draft: a change elsewhere is taken over, never saved or dropped unseen', async () => {
  const srv = Object.assign(server(), {sameDevice: true});
  srv.docs.set('users/A/data/templates', {list: [{id: 1, name: 'Push', exercises: [{name: 'Bankdrücken', sets: [{kg: '80', reps: '8'}]}]}]});
  const a = runtime(srv), b = runtime(srv);
  await a.login('A');
  a.run('startTemplate(1);toggleDone(0);');
  await b.login('A');
  const kg = rt => rt.run('currentSession.exercises[0].sets[0].kg');
  b.run("updateSet(0,0,'kg',{value:'95'})");
  a.fire('storage', {key: 'draft:A'});
  assert.equal(kg(a), '95'); // live
  b.run("updateSet(0,0,'kg',{value:'100'})"); // event missed
  a.run('finishTraining()');
  assert.equal(kg(a), '100');
  assert.ok(!srv.docs.has(`users/A/sessions/${TODAY}`));
  assert.match(a.nodes.get('sync-toast').textContent, /anderen Tab/);
  b.run("updateSet(0,0,'reps',{value:'6'})");
  a.run('discardDraft()');
  assert.equal(a.run('currentSession.exercises[0].sets[0].reps'), '6');
  assert.ok(a.context.localStorage.getItem('draft:A'));
  a.run('finishTraining()');
  assert.equal(srv.docs.get(`users/A/sessions/${TODAY}`).exercises[0].sets[0].kg, '100');
  b.fire('storage', {key: 'draft:A'});
  assert.equal(b.run('drafting'), false);
  b.run("editToday();updateSet(0,0,'kg',{value:'105'})");
  a.docListeners.visibilitychange.forEach(fn => fn()); // back in front after missing events
  assert.equal(kg(a), '105');
});

test('V3 a finish rejected late while a newer draft runs is not lost', async () => {
  const r = runtime();
  await r.login('A');
  const setDoc = r.context.setDoc, rejections = [];
  r.context.setDoc = () => new Promise((_, no) => rejections.push(no));
  const flush = () => new Promise(res => setImmediate(res));
  // Next day's draft running: the rejected one is kept for its date
  r.run("addExercise('Day one');toggleDone(0);finishTraining();");
  r.setToday('2026-10-03');
  r.run("addExercise('Day two')");
  rejections.shift()(Error('rejected late')); await flush();
  assert.equal(r.run('currentSession.exercises[0].name'), 'Day two');
  assert.equal(r.run(`sessions['${TODAY}']`), undefined);
  assert.match(r.nodes.get('sync-toast').textContent, /nicht gespeichert/);
  r.context.document.getElementById('backlog-date-input').value = TODAY;
  r.run('confirmBacklogDate()');
  assert.equal(r.run('backlogSession.exercises[0].name'), 'Day one');
  r.run('cancelBacklog();discardDraft();');
  // Same day, draft reopened on top of the pending save: it still holds it, no false conflict
  r.run("addExercise('Day two');toggleDone(0);finishTraining();editToday();");
  rejections.shift()(Error('rejected late')); await flush();
  assert.equal(r.run("currentSession.exercises.map(e=>e.name).join()"), 'Day two');
  let asked = 0;
  r.context.confirm = () => { asked++; return true; };
  r.context.setDoc = setDoc;
  r.run('finishTraining()');
  assert.equal(asked, 0);
  assert.equal(r.srv.docs.get('users/A/sessions/2026-10-03').exercises[0].name, 'Day two');
});

test('V3 a failing local backup of the draft is reported once', async () => {
  const r = runtime();
  await r.login('A');
  r.context.localStorage.setItem = () => { throw Error('QuotaExceededError'); };
  r.run("addExercise('Bankdrücken')");
  assert.match(r.nodes.get('sync-toast').textContent, /nicht gesichert/);
  r.nodes.get('sync-toast').textContent = '';
  r.run('toggleDone(0)');
  assert.equal(r.nodes.get('sync-toast').textContent, ''); // not on every input
  assert.equal(r.run('drafting'), true); // goes on in memory
});

test('F12 the drag handle no longer swallows touchstart', () => {
  const r = runtime();
  r.put('fixture', workout());
  assert.ok(!r.run('renderExerciseCard(fixture.exercises[0],{draggable:true}).innerHTML').includes('ontouchstart'));
});

test('F13 keyboard: Enter activates role=button, Escape closes the top modal', () => {
  const r = runtime();
  const keydown = e => r.docListeners.keydown.forEach(fn => fn({preventDefault() {}, target: {getAttribute: () => null}, ...e}));
  let clicked = 0;
  keydown({key: 'Enter', target: {getAttribute: a => a === 'role' ? 'button' : null, click() { clicked++; }}});
  assert.equal(clicked, 1);
  r.run("openModal('tpl-editor-overlay');openModal('tpl-ex-modal-overlay');");
  keydown({key: 'Escape'});
  assert.ok(!r.nodes.get('tpl-ex-modal-overlay').classList.contains('open'));
  assert.ok(r.nodes.get('tpl-editor-overlay').classList.contains('open'));
  r.put('fixture', workout());
  assert.ok(r.run('renderExerciseCard(fixture.exercises[0],{}).innerHTML').includes('role="button" tabindex="0"'));
});

(async () => {
  let failures = 0;
  for (const [name, fn] of cases) {
    try { await fn(); console.log('ok   ' + name); }
    catch (e) { failures++; console.error('FAIL ' + name + '\n', e); }
  }
  console.log(`${cases.length - failures}/${cases.length} passed`);
  process.exitCode = failures ? 1 : 0;
})();
