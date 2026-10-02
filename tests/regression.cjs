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

function runtime(srv = server()) {
  const nodes = new Map(), timers = new Map(), docListeners = {};
  let serial = 0, authCallback, mode = 'ok', acks = [];
  const rejectPaths = new Set();
  const rt = {};
  function element() {
    const classes = new Set();
    return {style: {setProperty() {}}, dataset: {}, value: '', innerHTML: '', textContent: '', children: [], listeners: {},
      classList: {add(...xs) { xs.forEach(x => classes.add(x)); }, remove(...xs) { xs.forEach(x => classes.delete(x)); }, contains(x) { return classes.has(x); }, toggle(x, on) { if (on === undefined) on = !classes.has(x); on ? classes.add(x) : classes.delete(x); return on; }},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      appendChild(child) { this.children.push(child); this.lastElementChild = child; },
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
    matchMedia: () => ({matches: true}), addEventListener() {}, scrollTo() {}, localStorage: {getItem: () => null},
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
  srv.docs.set(`users/A/sessions/${TODAY}`, workout('Private A'));
  const r = runtime(srv);
  await r.login('A');
  assert.equal(r.run('currentSession.exercises[0].name'), 'Private A');
  await r.auth(null);
  r.context.getDocs = async () => { throw Error('read unavailable'); };
  await r.login('B');
  assert.equal(r.run('currentSession.exercises.length'), 0);
  assert.equal(r.run('Object.keys(sessions).length'), 0);
  assert.notEqual(r.nodes.get('main-app').style.display, 'block');
  assert.match(r.nodes.get('loading-screen').innerHTML, /nicht geladen/);
  assert.equal(await r.run('saveSession()'), false);
  assert.ok(![...srv.docs.keys()].some(k => k.startsWith('users/B/')));
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

test('F03 a training open past midnight stays on its day; rollover after idle', async () => {
  const srv = server();
  const r = runtime(srv);
  await r.login('A');
  r.run("addExercise('Yesterday')");
  await r.run('saveSession()');
  r.setToday('2026-10-03');
  r.run("currentSession.notes='After midnight';scheduleSave();");
  await r.run('saveSession()');
  assert.ok(!srv.docs.has('users/A/sessions/2026-10-03'));
  assert.equal(srv.docs.get(`users/A/sessions/${TODAY}`).notes, 'After midnight');
  r.run('rolloverIfNewDay()'); // edited just now: still the same training
  assert.equal(r.run('currentKey'), TODAY);
  r.run('lastEditAt=0;rolloverIfNewDay()');
  assert.equal(r.run('currentKey'), '2026-10-03');
  assert.equal(r.run('currentSession.exercises.length'), 0);
});

test('F04 a second tab picks up remote changes instead of overwriting them', async () => {
  const srv = server();
  srv.docs.set(`users/A/sessions/${TODAY}`, workout());
  const a = runtime(srv), b = runtime(srv);
  await a.login('A'); await b.login('A');
  a.run("addExercise('New exercise')");
  await a.run('saveSession()');
  assert.equal(b.run('currentSession.exercises.length'), 2);
  b.run("currentSession.notes='Second tab';scheduleSave();");
  await b.run('saveSession()');
  const saved = srv.docs.get(`users/A/sessions/${TODAY}`);
  assert.equal(saved.exercises.length, 2);
  assert.equal(saved.notes, 'Second tab');
});

test('F04 two tabs on the same device (shared cache) also sync', async () => {
  const srv = Object.assign(server(), {sameDevice: true});
  const a = runtime(srv), b = runtime(srv);
  await a.login('A'); await b.login('A');
  a.run("addExercise('Other tab')");
  await a.run('saveSession()');
  assert.equal(b.run('currentSession.exercises[0].name'), 'Other tab');
});

test('F04 unsaved local edits are only replaced after confirmation', async () => {
  const srv = server();
  const a = runtime(srv), b = runtime(srv);
  await a.login('A'); await b.login('A');
  let asked = 0;
  b.context.confirm = () => { asked++; return false; };
  b.run("currentSession.notes='Local draft';scheduleSave();");
  a.run("addExercise('Remote exercise')");
  await a.run('saveSession()');
  assert.equal(asked, 1);
  assert.equal(b.run('currentSession.notes'), 'Local draft');
});

test('F05 unacknowledged (offline) writes never block the UI', async () => {
  const r = runtime();
  await r.login('A');
  r.setMode('hang');
  r.context.document.getElementById('search').value = 'Offline exercise';
  r.run('addCustomExercise()');
  assert.equal(r.run('currentSession.exercises[0].name'), 'Offline exercise');
  r.run('finishTraining()');
  assert.equal(r.run('currentSession.exercises[0].open'), false);
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

test('F10 only the snapshot actually sent is recorded as saved', async () => {
  const srv = server();
  const r = runtime(srv);
  await r.login('A');
  r.run("addExercise('Bankdrücken')");
  r.setMode('manual');
  const pending = r.run('saveSession()');
  r.run("currentSession.notes='Not sent';scheduleSave();");
  r.ack();
  await pending;
  assert.equal(r.run(`sessions['${TODAY}'].notes`), '');
  assert.equal(srv.docs.get(`users/A/sessions/${TODAY}`).notes, '');
  assert.equal(r.run('currentSession.notes'), 'Not sent'); // own echo must not reset the draft
  assert.equal(r.nodes.get('sync-bar').className, 'sync-bar syncing'); // newer edit still pending
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
  r.run("currentSession.notes='Local';scheduleSave();");
  await r.run('saveSession()');
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
  b.run("currentDetailKey='2026-09-30';editSession();openTemplateEditor(0);");
  a.run("addBacklogExercise('Remote')");
  await a.run('saveBacklog()');
  b.context.document.getElementById('backlog-notes').value = 'Local';
  await b.run('saveBacklog()');
  assert.equal(asked, 1);
  assert.equal(srv.docs.get('users/A/sessions/2026-09-30').exercises.length, 2);
  assert.equal(b.run('backlogKey'), '2026-09-30'); // declined: editor and draft stay
  a.run("openTemplateEditor(0);addTplExercise('Remote');");
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
  r.run("openTemplateEditor(0);updateTplSet(0,0,'kg',{value:'100'});");
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
