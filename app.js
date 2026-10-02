import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut as fbSignOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDb7vt_KFwn0Bw0szJ6wfFWoW_rvCdHjkA",
  authDomain: "fitness-tracker-ea.firebaseapp.com",
  projectId: "fitness-tracker-ea",
  storageBucket: "fitness-tracker-ea.firebasestorage.app",
  messagingSenderId: "730434955873",
  appId: "1:730434955873:web:1aeb4e346b78a9dced5820"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Persistent offline cache (IndexedDB): the app keeps working without
// network (e.g. in the gym) and repeated reads don't hit Firestore again.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});
const provider = new GoogleAuthProvider();


const BUILTIN=[
  {name:'Bankdrücken',muscle:'Brust'},{name:'Schrägbankdrücken',muscle:'Brust'},
  {name:'Kabelfliegende',muscle:'Brust'},{name:'Kurzhantel-Fliegende',muscle:'Brust'},
  {name:'Kniebeugen',muscle:'Beine'},{name:'Beinpresse',muscle:'Beine'},
  {name:'Beinstrecker',muscle:'Beine'},{name:'Beinbeuger',muscle:'Beine'},
  {name:'Kreuzheben',muscle:'Rücken'},{name:'Klimmzüge',muscle:'Rücken'},
  {name:'Rudern Maschine',muscle:'Rücken'},{name:'Latzug',muscle:'Rücken'},
  {name:'Schulterdrücken',muscle:'Schultern'},{name:'Seitheben',muscle:'Schultern'},
  {name:'Frontdrücken',muscle:'Schultern'},{name:'Bizeps Curls',muscle:'Arme'},
  {name:'Trizeps Drücken',muscle:'Arme'},{name:'Hammer Curls',muscle:'Arme'},
  {name:'Dips',muscle:'Arme'},{name:'Plank',muscle:'Core'},
  {name:'Crunches',muscle:'Core'},{name:'Beinheben',muscle:'Core'},
];

// Re-evaluated on every call so the app survives midnight crossings while open
function getTodayKey(){return localDateKey(new Date());}
const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const monthsFull = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const DAYS_FULL = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

// Local timezone date key — avoids UTC shift bugs
function localDateKey(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}

// HTML-escape any user-supplied string before interpolating into innerHTML.
// Required because exercise names, notes and template names are free-form text.
const HTML_ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>HTML_ESC[c]);}

// Inline SVG icons (Lucide-style) used by JS renderers. Static markup only —
// NEVER interpolate user data into these strings.
const ICON_ATTRS='class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICONS={
  trophy:`<svg ${ICON_ATTRS}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  history:`<svg ${ICON_ATTRS}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
  target:`<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  clipboardList:`<svg ${ICON_ATTRS}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
  calendar:`<svg ${ICON_ATTRS}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  check:`<svg ${ICON_ATTRS}><path d="M20 6 9 17l-5-5"/></svg>`,
  play:`<svg ${ICON_ATTRS}><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  pencil:`<svg ${ICON_ATTRS}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  x:`<svg ${ICON_ATTRS}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  gripVertical:`<svg ${ICON_ATTRS}><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`,
  chevronDown:`<svg ${ICON_ATTRS}><path d="m6 9 6 6 6-6"/></svg>`,
  chevronLeft:`<svg ${ICON_ATTRS}><path d="m15 18-6-6 6-6"/></svg>`,
  chevronRight:`<svg ${ICON_ATTRS}><path d="m9 18 6-6-6-6"/></svg>`,
  trash:`<svg ${ICON_ATTRS}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
  rotateCcw:`<svg ${ICON_ATTRS}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
  plus:`<svg ${ICON_ATTRS}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  logOut:`<svg ${ICON_ATTRS}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  home:`<svg ${ICON_ATTRS}><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  barChart:`<svg ${ICON_ATTRS}><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
  copy:`<svg ${ICON_ATTRS}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  repeat:`<svg ${ICON_ATTRS}><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`,
};
// Hydrate static markup: index.html carries <span data-icon="…"> placeholders so
// every SVG lives only here in the registry. Runs at module init — the app
// chrome is display:none until auth resolves, so the swap is never visible.
document.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=ICONS[el.dataset.icon]||'';});

// ── MOTION HELPERS ──
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Staggered entrance for a list container. Called only from showPage/initUI so
// mid-page re-renders (toggle / add / remove / stepper) never replay it.
function staggerIn(containerId){
  if(REDUCED_MOTION)return;
  const els=document.querySelectorAll('#'+containerId+' > *');
  if(!els.length)return;
  els.forEach(el=>el.classList.remove('anim-in'));
  void els[0].offsetWidth; // one forced reflow re-arms the animation for the whole list
  els.forEach((el,i)=>{
    el.classList.add('anim-in');
    el.style.animationDelay=Math.min(i*55,440)+'ms';
  });
}
// Restart a one-shot animation class: remove → forced reflow → re-add
function replayAnim(el,cls){el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);}
// Entrance for a single appended card — the rest of the list stays still
function popInLast(containerId){
  const last=document.getElementById(containerId).lastElementChild;
  if(last&&!REDUCED_MOTION)last.classList.add('anim-in');
}
// rAF count-up; data-val remembers the last value so unchanged stats render instantly
function countUp(el,to,fmt){
  fmt=fmt||String;
  const from=parseFloat(el.dataset.val)||0;
  el.dataset.val=to;
  if(REDUCED_MOTION||from===to){el.textContent=fmt(to);return;}
  const t0=performance.now(),dur=700;
  function frame(t){
    const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);
    el.textContent=fmt(Math.round(from+(to-from)*e));
    if(p<1)requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

let currentUser = null;
let sessions = {};
let templates = [];
let customExercises = [];
let goals = {trainDays: 3};
let currentSession = {exercises:[], notes:''};
let currentKey = getTodayKey(); // day the open training belongs to
let editingTemplate = null;
let tplSeen; // stamp of the stored template the editor started from
let pendingImport = null; // exercises waiting for the add/replace choice
let saveTimer = null;
let lastEditAt = 0;
let dragSrcIdx = null;
// Every auth change bumps authGen; async results that started under an older
// generation are dropped. activeUid is set only once the account's data has
// loaded — all writes go there, so nothing is saved before (or after) that.
let authGen = 0;
let activeUid = null;

// ── AUTH ──
window.signInWithGoogle = async () => {
  try { await signInWithPopup(auth, provider); }
  catch(e) { document.getElementById('login-error').textContent = 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.'; }
};
window.signOut = async () => { flushSave(); await fbSignOut(auth); };

// Theme: 'auto' follows the system via the CSS media query, 'light'/'dark'
// override it (data-theme). The head script applies a stored override before
// the first paint; this keeps the menu in sync and redraws the canvas chart,
// which reads its colors from CSS variables at draw time.
function applyThemeMode(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode);
  else document.documentElement.removeAttribute('data-theme');
  document.querySelectorAll('#theme-modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === (mode || 'auto')));
  redrawChartIfVisible();
}
window.setThemeMode = function(mode) {
  try { localStorage.setItem('themeMode', mode); } catch(e) {}
  applyThemeMode(mode);
};
function redrawChartIfVisible() {
  if (document.getElementById('page-progress').classList.contains('active')) window.renderProgressChart();
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', redrawChartIfVisible);
window.toggleProfileMenu = function(e) {
  e.stopPropagation();
  const menu = document.getElementById('profile-menu');
  const btn = document.getElementById('profile-btn');
  const open = menu.classList.toggle('open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
};
// Close the profile menu on any click outside of it
document.addEventListener('click', (e) => {
  const menu = document.getElementById('profile-menu');
  if (!menu || !menu.classList.contains('open')) return;
  const profile = document.getElementById('profile');
  if (profile && !profile.contains(e.target)) {
    menu.classList.remove('open');
    document.getElementById('profile-btn').setAttribute('aria-expanded', 'false');
  }
});
try { applyThemeMode(localStorage.getItem('themeMode')); }
catch(e) { applyThemeMode('auto'); /* localStorage unavailable — Safari private mode etc. */ }

onAuthStateChanged(auth, async (user) => {
  authGen++;
  resetAccountState();
  currentUser = user;
  // Hide the previous account's UI at once — also on a direct A → B switch
  // without a signed-out event in between
  ['main-app', 'bottom-nav', 'profile'].forEach(id => document.getElementById(id).style.display = 'none');
  if(user) {
    document.getElementById('login-screen').style.display = 'none';
    await enterApp();
  } else {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  }
});

// Daten hinter dem Loading-Screen laden, damit die App in einem
// einzigen Schritt fertig gerendert erscheint (kein "Doppel-Laden" in der PWA).
// A failed initial load is an error state: the app stays closed, so nothing
// can be edited or saved on top of missing data.
async function enterApp() {
  const gen = authGen;
  const loading = document.getElementById('loading-screen');
  loading.textContent = 'Wird geladen…';
  loading.style.display = '';
  const ok = await loadAllData();
  if(gen !== authGen) return;
  if(!ok) {
    loading.innerHTML = '<div class="load-error">Daten konnten nicht geladen werden.<div class="load-error-actions"><button class="btn btn--primary btn--sm" onclick="retryLoad()">Erneut versuchen</button><button class="btn btn--sm" onclick="signOut()">Abmelden</button></div></div>';
    return;
  }
  activeUid = currentUser.uid;
  watchRemote(activeUid);
  // Catch up templates with records logged on another device
  syncTemplatesWithBests();
  loading.style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
  document.getElementById('bottom-nav').style.display = 'flex';
  document.getElementById('profile').style.display = 'block';
  initUI();
}
window.retryLoad = enterApp;

// Drop everything account-bound, so a following account can never see — or
// save — the previous account's data, drafts or open editors.
function resetAccountState() {
  activeUid = null;
  unwatch();
  setCurrentSession(null); // also cancels a pending autosave
  currentKey = getTodayKey(); lastEditAt = 0;
  sessions = {}; templates = []; customExercises = []; goals = {trainDays: 3};
  invalidatePRCache();
  editingTemplate = null; pendingImport = null; currentDetailKey = null;
  backlogKey = null; backlogOriginalKey = null; backlogSession = {exercises:[], notes:''}; lostDrafts = {};
  closeAllModals();
  document.getElementById('profile-menu').classList.remove('open');
  window.showPage('today');
}

// ── FIRESTORE ──
let statusTimer = null, toastTimer = null;
// resetMs returns the bar to the neutral "Bereit" after a moment. Errors also
// raise a toast, because the sync bar is only visible on the Heute page.
function setSyncStatus(status, msg, resetMs) {
  clearTimeout(statusTimer);
  const bar = document.getElementById('sync-bar');
  bar.className = 'sync-bar ' + status;
  bar.textContent = msg;
  if(resetMs) statusTimer = setTimeout(() => setSyncStatus('', 'Alles gesichert'), resetMs);
  if(status === 'error') {
    const toast = document.getElementById('sync-toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
  }
}

// Firestore is a trust boundary: stored documents are coerced into the shape
// the renderers expect, so malformed data can't break rendering and kg/reps
// are always plain numbers, never markup.
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
function cleanNum(field, v) {
  const n = parseFloat(v);
  return isFinite(n) && n >= 0 ? String(Math.min(n, field === 'kg' ? KG_MAX : REPS_MAX)) : '';
}
function cleanExercises(list) {
  return (Array.isArray(list) ? list : []).filter(ex => ex && typeof ex.name === 'string').map(ex => ({
    ...ex,
    sets: (Array.isArray(ex.sets) ? ex.sets : []).map(s => ({kg: cleanNum('kg', s?.kg), reps: cleanNum('reps', s?.reps)})),
  }));
}
function applySessions(snap) {
  sessions = {};
  snap.forEach(d => {
    const s = d.data();
    if(DATE_KEY.test(d.id)) sessions[d.id] = {exercises: cleanExercises(s?.exercises), notes: typeof s?.notes === 'string' ? s.notes : ''};
  });
  invalidatePRCache();
}
const listOf = snap => snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
function applyTemplates(snap) { templates = listOf(snap).filter(t => t && typeof t.name === 'string').map(t => ({...t, exercises: cleanExercises(t.exercises)})); }
function applyCustom(snap)    { customExercises = listOf(snap).filter(n => typeof n === 'string'); }
function applyGoals(snap)     { goals = {trainDays: Math.min(7, Math.max(1, parseInt(snap.exists() && snap.data().trainDays) || 3))}; }

// Returns true on success, false on failure (never rejects)
async function loadAllData() {
  const gen = authGen, uid = currentUser.uid;
  try {
    // The four reads are independent — fetch them in parallel
    const [sessSnap, tplSnap, custSnap, goalsSnap] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'sessions')),
      getDoc(doc(db, 'users', uid, 'data', 'templates')),
      getDoc(doc(db, 'users', uid, 'data', 'custom')),
      getDoc(doc(db, 'users', uid, 'data', 'goals')),
    ]);
    if(gen !== authGen) return false;
    applySessions(sessSnap); applyTemplates(tplSnap); applyCustom(custSnap); applyGoals(goalsSnap);
    currentKey = getTodayKey();
    setCurrentSession(sessions[currentKey]);
    setSyncStatus('synced', 'Synchronisiert', 2000);
    return true;
  } catch(e) {
    console.error('loadAllData failed', e);
    return false;
  }
}

// Content fingerprint of a stored training/template — independent of key
// order, number formatting and the UI-only `open` flag — to tell real changes
// made elsewhere from echoes of what this tab already knows.
const stamp = o => o && JSON.stringify([o.name, o.notes, cleanExercises(o.exercises).map(e => [e.name, e.sets])]);

// ── LIVE SYNC ──
// After the initial load, snapshot listeners stream changes made in other
// tabs/devices into memory, so this tab never saves on top of stale data.
// The first snapshot counts too: it may already hold changes made between the
// initial reads and the subscription.
// Every write is tagged with this tab's CLIENT_ID to tell its own echoes from
// foreign changes (hasPendingWrites can't: tabs on one device share the cache).
// ponytail: edits of the same training on two devices that are BOTH offline
// stay last-write-wins; fixing that needs per-exercise docs or revision rules.
const CLIENT_ID = Math.random().toString(36).slice(2);
const foreign = d => d.data()?.writer !== CLIENT_ID;
let unwatchers = [];
function unwatch() { unwatchers.forEach(u => u()); unwatchers = []; }
function watchRemote(uid) {
  const gen = authGen;
  const watch = (ref, onChange) => {
    let first = true;
    unwatchers.push(onSnapshot(ref, snap => {
      if(gen === authGen) onChange(snap, first);
      first = false;
    }, e => console.error('live sync failed', e)));
  };
  watch(collection(db, 'users', uid, 'sessions'), (snap, first) => {
    const known = stamp(sessions[currentKey]);
    applySessions(snap);
    // The first snapshot lists every doc as new, so it can't say what changed
    if(!first && !snap.docChanges().some(c => c.type === 'removed' || foreign(c.doc))) return;
    if(stamp(sessions[currentKey]) !== known) adoptRemoteSession();
    refreshActivePage();
  });
  const watchDoc = (name, apply) => watch(doc(db, 'users', uid, 'data', name), snap => {
    if(!foreign(snap)) return;
    apply(snap); refreshActivePage();
  });
  watchDoc('templates', applyTemplates);
  watchDoc('custom', applyCustom);
  watchDoc('goals', applyGoals);
}
// Another device changed the open training: adopt it, unless this tab has
// unsaved edits — then the user decides which version wins.
function adoptRemoteSession() {
  if(saveTimer && !confirm('Dieses Training wurde gerade auf einem anderen Gerät geändert.\n\nOK: Version vom anderen Gerät übernehmen\nAbbrechen: deine Änderungen behalten (überschreibt die andere Version)')) return;
  setCurrentSession(sessions[currentKey]);
  render();
}
// Re-render list pages after remote changes; editors keep their drafts and
// an open training isn't re-rendered under the user's fingers
function refreshActivePage() {
  const page = document.querySelector('.page.active')?.id;
  if(page === 'page-today' && !currentSession.exercises.length) render();
  else if(page === 'page-history') renderHistory();
  else if(page === 'page-templates') renderTemplates();
  else if(page === 'page-progress') renderProgress();
}

// ── WRITES ──
// Firestore applies a write to its (offline-persistent) local cache at once
// but resolves the promise only when the server acknowledged it — offline it
// stays pending until the connection is back. So local state is updated
// first and the UI never waits for the ack; trackWrite only drives the sync
// status and reports rejections. Resolves true/false, never rejects.
let pendingWrites = 0;
function trackWrite(write, label, doneMsg = 'Gespeichert') {
  const gen = authGen;
  pendingWrites++;
  setSyncStatus('syncing', navigator.onLine ? 'Wird gespeichert…' : 'Offline gesichert, wird später synchronisiert');
  return new Promise(res => res(write())).then(() => true, e => { console.error(label + ' fehlgeschlagen', e); return false; }).then(ok => {
    pendingWrites--;
    if(gen !== authGen) return ok;
    if(!ok) setSyncStatus('error', label + ' fehlgeschlagen', 3000);
    // Newer edits still unsent or in flight: keep showing "pending"
    else if(!pendingWrites && !saveTimer) setSyncStatus('synced', doneMsg, 1500);
    return ok;
  });
}
// Editors wait briefly for the ack, so an immediate rejection (rules, invalid
// data) keeps the draft open for a retry. Still pending after that = queued
// offline, syncs later. Resolves true (saved) | false (failed) | null (queued).
const ACK_WAIT_MS = 2000;
function settleWrite(tracked) {
  if(!navigator.onLine) return Promise.resolve(null);
  return Promise.race([tracked, new Promise(r => setTimeout(() => r(null), ACK_WAIT_MS))]);
}

// Saves the open training under the day it belongs to (currentKey, not "now":
// a session left open past midnight must not land on the next day). The
// snapshot is taken synchronously, so later edits are never mistaken as saved.
function saveSession() {
  cancelSave();
  if(!activeUid) return Promise.resolve(false);
  const key = currentKey, snap = structuredClone(currentSession);
  sessions[key] = snap;
  invalidatePRCache();
  syncTemplatesWithBests();
  return trackWrite(() => setDoc(doc(db, 'users', activeUid, 'sessions', key), {...snap, writer: CLIENT_ID}), 'Speichern');
}
function saveUserDoc(name, payload, label) {
  if(!activeUid) return Promise.resolve(false);
  return trackWrite(() => setDoc(doc(db, 'users', activeUid, 'data', name), {...payload, writer: CLIENT_ID}), label);
}
function saveTemplates()       { return saveUserDoc('templates', {list: templates},        'Vorlagen speichern'); }
function saveCustomExercises() { return saveUserDoc('custom',    {list: customExercises}, 'Übungen speichern'); }
function saveGoals()           { return saveUserDoc('goals',     goals,                   'Ziele speichern'); }
function scheduleSave() {
  lastEditAt = Date.now();
  if(!saveTimer) setSyncStatus('syncing', 'Wird gesichert…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 1200);
}
function cancelSave() { clearTimeout(saveTimer); saveTimer = null; }
// Push a pending autosave out now (app goes to background, logout, day change)
function flushSave() { if(saveTimer) saveSession(); }
// Replace the open training (dropping unsaved edits) and sync the notes field
function setCurrentSession(s) {
  if(saveTimer && !pendingWrites) setSyncStatus('', 'Alles gesichert');
  cancelSave();
  currentSession = structuredClone(s || {exercises:[], notes:''});
  document.getElementById('notes').value = currentSession.notes || '';
}

// A training stays bound to the day it was started, so one running past
// midnight stays in one piece. The next day starts once the app is resumed
// on a later day and the training had no edits for ROLLOVER_IDLE_MS.
const ROLLOVER_IDLE_MS = 2 * 60 * 60 * 1000;
function rolloverIfNewDay() {
  if(!activeUid || currentKey === getTodayKey() || Date.now() - lastEditAt < ROLLOVER_IDLE_MS) return;
  flushSave(); // still saved under the old day
  currentKey = getTodayKey();
  setCurrentSession(sessions[currentKey]);
  renderDateHeader();
  render();
}
document.addEventListener('visibilitychange', () => {
  // Hidden: save now instead of after the debounce — the app may get killed
  if(document.visibilityState === 'hidden') flushSave();
  else rolloverIfNewDay();
});

// Two-letter initials from the display name (first + last), else first email char
function getInitials(user) {
  const dn = (user.displayName || '').trim();
  if (dn) {
    const parts = dn.split(/\s+/);
    const first = parts[0][0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }
  return ((user.email || '?')[0] || '?').toUpperCase();
}

// ── UI INIT ──
function initUI() {
  const userLabel = (currentUser.displayName||currentUser.email||'').split('@')[0];
  document.getElementById('user-name').textContent = userLabel;
  document.getElementById('profile-initials').textContent = getInitials(currentUser);
  renderDateHeader();
  animateNextStats=true;
  render();
  staggerIn('exercise-list');
}
// The header date shows the day the open training belongs to
function renderDateHeader() {
  const day = new Date(currentKey + 'T12:00:00');
  document.getElementById('today-date').textContent = DAYS_FULL[(day.getDay()+6)%7] + ', ' + day.getDate() + '. ' + monthsFull[day.getMonth()];
}

// Permanent listeners are installed exactly once at module load — not per
// login — so they never stack up across sign-out / sign-in.
document.getElementById('notes').addEventListener('input', e => {
  currentSession.notes = e.target.value;
  scheduleSave();
});
// Delegated picker handlers — read data-name to avoid building JS strings from user input
[
  ['exercise-options',n=>window.addExercise(n)],
  ['tpl-exercise-options',n=>window.addTplExercise(n)],
  ['backlog-exercise-options',n=>window.addBacklogExercise(n)],
].forEach(([id,fn])=>{
  document.getElementById(id).addEventListener('click',e=>{
    const opt=e.target.closest('.exercise-option');
    if(opt&&opt.dataset.name)fn(opt.dataset.name);
  });
});
// Redraw the progress chart on rotation/resize while the progress page is visible
let resizeTimer=null;
window.addEventListener('resize',()=>{
  if(resizeTimer)clearTimeout(resizeTimer);
  resizeTimer=setTimeout(redrawChartIfVisible,150);
});

// ── PAGE NAV ──
// Containers whose children get a staggered entrance on page entry
const PAGE_STAGGER={today:['exercise-list','start-panel'],history:['history-list'],templates:['template-list'],detail:['detail-exercises']};
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const page=document.getElementById('page-'+name);
  page.classList.add('active');
  const navId = name==='detail'||name==='backlog'?'nav-history':('nav-'+name);
  document.getElementById(navId)?.classList.add('active');
  if(name==='today') render();
  if(name==='history') renderHistory();
  if(name==='templates') renderTemplates();
  if(name==='progress') renderProgress();
  if(!REDUCED_MOTION){
    replayAnim(page,'page-anim');
    (PAGE_STAGGER[name]||[]).forEach(staggerIn);
  }
  window.scrollTo(0,0);
};

// ── TODAY ──
function allExercises(){return[...BUILTIN,...customExercises.map(n=>({name:n,muscle:'Eigene'}))];}
// Bounds on user input to keep storage clean and prevent UI layout overflow
const EXERCISE_NAME_MAX=60;
const KG_MAX=999, REPS_MAX=999;
// Clamps a raw set-input value into the allowed range. Returns '' for invalid/negative input.
function clampSetValue(field, raw){
  if(raw==null||raw==='')return '';
  const n=parseFloat(raw);
  if(!isFinite(n)||n<0)return '';
  const max=field==='kg'?KG_MAX:REPS_MAX;
  return n>max?String(max):raw;
}
// Returns the canonical name (built-in or custom) if one matches case-insensitively, else null
function findExerciseName(name){
  const q=name.toLowerCase();
  const builtin=BUILTIN.find(e=>e.name.toLowerCase()===q);
  if(builtin)return builtin.name;
  const custom=customExercises.find(n=>n.toLowerCase()===q);
  return custom||null;
}
// Adds a user-entered exercise to customExercises (case-insensitive, length-limited).
// Returns the canonical name to use, or null if input was invalid.
function ensureCustomExercise(rawName){
  const q=(rawName||'').trim();
  if(!q)return null;
  if(q.length>EXERCISE_NAME_MAX){alert('Übungsname ist zu lang (max. '+EXERCISE_NAME_MAX+' Zeichen).');return null;}
  const existing=findExerciseName(q);
  if(existing)return existing;
  customExercises.push(q);
  saveCustomExercises(); // background — never blocks adding the exercise
  return q;
}

// PR lookup cache. getExPR used to scan ALL sessions on every call — and it
// is called per exercise on each render(), per option in the picker and on
// every kg keystroke. The cache builds the map once per data state in a
// single pass; sessions mutations must call invalidatePRCache().
// The open training (currentKey) is excluded — a PR is always measured
// against OTHER sessions — so the cache also tracks which key it was built for.
let prCache=null, prCacheKey=null;
function invalidatePRCache(){prCache=null;}
function buildPRCache(todayKey){
  const map=new Map(); // exact exercise name -> {kg, reps}
  Object.entries(sessions).forEach(([k,s])=>{
    if(k===todayKey)return;
    (s.exercises||[]).forEach(ex=>{
      let best=map.get(ex.name)||null;
      ex.sets.forEach(set=>{
        const kg=parseFloat(set.kg)||0,reps=parseFloat(set.reps)||0;
        if(kg>0&&(!best||kg>best.kg||(kg===best.kg&&reps>best.reps)))best={kg,reps};
      });
      if(best)map.set(ex.name,best);
    });
  });
  return map;
}
function getExPR(name){
  if(!prCache||prCacheKey!==currentKey){prCache=buildPRCache(currentKey);prCacheKey=currentKey;}
  return prCache.get(name)||null;
}

function getTodayBest(ei){
  let best=null;
  currentSession.exercises[ei].sets.forEach(s=>{
    const kg=parseFloat(s.kg)||0,reps=parseFloat(s.reps)||0;
    if(kg>0&&(!best||kg>best.kg||(kg===best.kg&&reps>best.reps)))best={kg,reps};
  });
  return best;
}

function calcExVol(ex){return ex.sets.reduce((s,set)=>s+(parseFloat(set.kg)||0)*(parseFloat(set.reps)||0),0);}

// One-shot flag: the next updateStats() call animates the numbers (set before
// page-entry/import renders; keystroke updates stay instant).
let animateNextStats=false;
function updateStats(){
  const animate=animateNextStats&&!REDUCED_MOTION;
  animateNextStats=false;
  const {sets:totalSets,vol:totalVol}=sessionTotals(currentSession);
  const fmt=n=>n.toLocaleString('de');
  [['stat-ex',currentSession.exercises.length],['stat-sets',totalSets],['stat-vol',Math.round(totalVol)]].forEach(([id,val])=>{
    const el=document.getElementById(id);
    if(animate)countUp(el,val,fmt);
    else{el.dataset.val=val;el.textContent=fmt(val);}
  });
  const fb=document.getElementById('finish-btn');
  if(fb){
    const hasExercises=currentSession.exercises.length>0;
    fb.disabled=!hasExercises;
    fb.classList.toggle('disabled',!hasExercises);
  }
}

// Shared empty-state HTML — ICONS key + title + optional subtitle.
function renderEmpty(icon,title,sub){
  return `<div class="empty-state">
    <div class="empty-state-icon">${ICONS[icon]||''}</div>
    <div class="empty-state-title">${title}</div>
    ${sub?`<div class="empty-state-sub">${sub}</div>`:''}
  </div>`;
}

// Set rows (kg / reps / delete) shared by the training cards and the template
// editor. ghost: last time's sets, shown as placeholders in empty fields.
function setRows(sets,ei,updateFn,removeFn,isPRSet=()=>false,ghost=null){
  const head=sets.length?'<div class="sets-head"><span></span><span>kg</span><span>Wdh</span><span></span></div>':'';
  return head+sets.map((s,si)=>{
    const sKg=parseFloat(s.kg)||0,sR=parseFloat(s.reps)||0,g=ghost?.[si]||{};
    return `<div class="set-row">
      <span class="set-no">${si+1}</span>
      <input class="set-input${isPRSet(si,sKg,sR)?' pr-value':''}" type="number" min="0" max="${KG_MAX}" step="0.5" inputmode="decimal" value="${escapeHtml(s.kg)}" placeholder="${escapeHtml(g.kg||'')}" aria-label="Satz ${si+1} kg" oninput="${updateFn}(${ei},${si},'kg',this)">
      <input class="set-input" type="number" min="0" max="${REPS_MAX}" step="1" inputmode="numeric" value="${escapeHtml(s.reps)}" placeholder="${escapeHtml(g.reps||'')}" aria-label="Satz ${si+1} Wiederholungen" oninput="${updateFn}(${ei},${si},'reps',this)">
      <button class="set-del" onclick="${removeFn}(${ei},${si})" aria-label="Satz ${si+1} löschen">${ICONS.x}</button>
    </div>`;
  }).join('');
}
const setsLabel=n=>n+(n===1?' Satz':' Sätze');

// Shared exercise-card renderer used by today / backlog / detail views.
// opts: { idx, draggable, readonly, showDelete, namespace, badgeHtml, hasPRClass, flashAnimation, isPRSet, subOpen, ghost }
// subOpen: header subline while expanded (static markup / numbers only)
function renderExerciseCard(ex,opts){
  const {
    idx=0,
    draggable=false,
    readonly=false,
    showDelete=false,
    namespace='today',
    badgeHtml='',
    hasPRClass=false,
    flashAnimation=false,
    isPRSet=()=>false,
    subOpen='',
    ghost=null,
  }=opts||{};
  const vol=Math.round(calcExVol(ex)).toLocaleString('de');
  const card=document.createElement('div');
  if(readonly){
    // Sets left empty (planned, not done) are not shown
    const rows=ex.sets.map((set,i)=>{
      if(!set.kg&&!set.reps)return '';
      const setKg=parseFloat(set.kg)||0,setReps=parseFloat(set.reps)||0;
      const sv=setKg*setReps;
      return `<div class="ro-row${isPRSet(i,setKg,setReps)?' pr-row':''}"><span class="set-no">${i+1}</span><span>${escapeHtml(set.kg||'–')} kg</span><span>× ${escapeHtml(set.reps||'–')}</span><span class="ro-vol">${sv>0?Math.round(sv).toLocaleString('de'):'–'}</span></div>`;
    }).join('');
    card.className='card detail-ex-card'+(hasPRClass?' has-pr':'');
    card.innerHTML=`<div class="detail-ex-head"><div class="detail-ex-name">${escapeHtml(ex.name)}</div>${badgeHtml}</div>${rows}
      <div class="detail-ex-vol">Volumen <b>${vol} kg</b></div>`;
    return card;
  }
  const fn=namespace==='backlog'
    ?{update:'updateBacklogSet',toggle:'toggleBacklogEx',addSet:'addBacklogSet',removeSet:'removeBacklogSet',remove:'removeBacklogEx'}
    :{update:'updateSet',toggle:'toggleEx',addSet:'addSet',removeSet:'removeSet',remove:'removeEx'};
  card.className='exercise-card'+(hasPRClass?' has-pr':'');
  if(draggable){card.draggable=true;card.dataset.idx=idx;}
  if(flashAnimation)card.classList.add('pr-flash');
  // No touchstart stopPropagation here: the touch-drag starter listens on document
  const dragHandle=draggable?`<span class="drag-handle" onmousedown="event.stopPropagation()">${ICONS.gripVertical}</span>`:'';
  const sub=ex.open&&subOpen?subOpen:`${setsLabel(ex.sets.length)} · ${vol} kg`;
  card.innerHTML=`
    <div class="exercise-header" role="button" tabindex="0" aria-expanded="${!!ex.open}" onclick="${fn.toggle}(${idx})">
      ${dragHandle}
      <div class="ex-title"><div class="exercise-name">${escapeHtml(ex.name)}</div><div class="ex-sub">${sub}</div></div>${badgeHtml}
      <span class="exercise-toggle${ex.open?' open':''}">${ICONS.chevronDown}</span>
    </div>
    ${ex.open?`<div class="exercise-body">
      ${setRows(ex.sets,idx,fn.update,fn.removeSet,isPRSet,ghost)}
      <button class="add-set" onclick="${fn.addSet}(${idx})">+ Satz</button>
      <div class="ex-foot"><span class="ex-vol">Volumen <b>${vol} kg</b></span>
      ${showDelete?`<button class="ex-remove" onclick="${fn.remove}(${idx})">Übung entfernen</button>`:''}</div>
    </div>`:''}`;
  return card;
}

function render(){
  // Notes alone keep the training view, so they stay reachable
  const empty=!currentSession.exercises.length&&!currentSession.notes.trim();
  document.getElementById('start-panel').style.display=empty?'':'none';
  document.getElementById('training-panel').style.display=empty?'none':'';
  if(empty)renderStartPanel();
  const list=document.getElementById('exercise-list');
  list.innerHTML='';
  currentSession.exercises.forEach((ex,ei)=>{
    const pr=getExPR(ex.name);
    const todayBest=getTodayBest(ei);
    const isNewPR=todayBest&&(!pr||todayBest.kg>pr.kg||(todayBest.kg===pr.kg&&todayBest.reps>pr.reps));
    const card=renderExerciseCard(ex,{
      idx:ei,
      draggable:true,
      showDelete:true,
      namespace:'today',
      badgeHtml:isNewPR?`<span class="pr-chip">${ICONS.trophy} Neuer PR</span>`:'',
      subOpen:pr?`Bestwert ${pr.kg} kg × ${pr.reps}`:'Noch kein Bestwert',
      hasPRClass:isNewPR,
      flashAnimation:isNewPR,
      isPRSet:(si,sKg,sR)=>sKg>0&&(!pr||sKg>pr.kg||(sKg===pr.kg&&sR>=pr.reps)),
      ghost:lastSets(ex.name,currentKey),
    });
    // Drag & Drop
    card.addEventListener('dragstart',e=>{dragSrcIdx=ei;card.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');document.querySelectorAll('.exercise-card').forEach(c=>c.classList.remove('drag-over'));});
    card.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';card.classList.add('drag-over');});
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',e=>{
      e.preventDefault();card.classList.remove('drag-over');
      if(dragSrcIdx!==null&&dragSrcIdx!==ei){
        const moved=currentSession.exercises.splice(dragSrcIdx,1)[0];
        currentSession.exercises.splice(ei,0,moved);
        scheduleSave();render();
      }
      dragSrcIdx=null;
    });
    list.appendChild(card);
  });
  updateStats();
}

// ── START PANEL ──
// "Mi, 1. Okt" for list rows
function shortDate(key){const d=new Date(key+'T12:00:00');return DAYS[(d.getDay()+6)%7]+', '+d.getDate()+'. '+months[d.getMonth()];}
// One-line preview of a training's exercises (escaped)
const namesPreview=s=>escapeHtml(s.exercises.map(e=>e.name).join(', '));
// Days with a training before `key`, newest first
function trainedKeysBefore(key){return Object.keys(sessions).filter(k=>k<key&&sessions[k].exercises.length).sort().reverse();}
// Last time's done sets of an exercise (most recent training before `key`
// with values for it). A new exercise starts with as many sets, showing these
// values as placeholders; never done before: two sets.
function lastSets(name,key){
  let best=null,bestKey='';
  for(const k in sessions){
    if(k>=key||k<=bestKey)continue;
    const ex=sessions[k].exercises.find(e=>e.name===name);
    const sets=ex?ex.sets.filter(s=>s.kg||s.reps):[];
    if(sets.length){best=sets;bestKey=k;}
  }
  return best;
}
const emptySets=n=>Array.from({length:n},()=>({kg:'',reps:''}));
function newSets(name,key){return emptySets(lastSets(name,key)?.length||2);}

// Week progress towards the goal. full: with the goal stepper (Stats page);
// otherwise compact and a shortcut to Stats.
function weekCardHtml(full){
  const weekDays=getWeekDays(getMondayOfWeek(new Date()));
  const trained=countTrainedDays(weekDays),goal=goals.trainDays||3;
  const pct=Math.min(100,Math.round(trained/goal*100));
  const days=weekDays.map((k,i)=>{
    const t=sessions[k]&&sessions[k].exercises.length>0;
    return `<div class="wday${t?' done':''}${k===getTodayKey()?' today':''}"><i>${t?ICONS.check:''}</i>${DAYS[i]}</div>`;
  }).join('');
  return `<section class="card week-card"${full?'':' role="button" tabindex="0" onclick="showPage(\'progress\')"'}>
    <div class="week-head"><span>${trained>=goal?'Wochenziel erreicht':'Diese Woche'}</span><span><b>${trained}</b> von ${goal} Trainings</span></div>
    <div class="wdays">${days}</div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    ${full?`<div class="goal-row"><span>Wochenziel</span><div class="stepper"><button onclick="changeGoal(-1)" aria-label="Ziel verringern">−</button><b>${goal}</b><button onclick="changeGoal(1)" aria-label="Ziel erhöhen">+</button></div></div>`:''}
  </section>`;
}

// Empty day: week progress and the ways to start — a template, a copy of an
// earlier training, or empty
function renderStartPanel(){
  const past=trainedKeysBefore(currentKey);
  const row=(icon,title,sub,onclick)=>`<button class="list-row" onclick="${onclick}"><span class="list-ico">${ICONS[icon]}</span><span class="list-main"><span class="list-title">${title}</span><span class="list-sub">${sub}</span></span><span class="chev">${ICONS.chevronRight}</span></button>`;
  const tiles=templates.map(t=>`<button class="tpl-tile" onclick="startTemplate(${tplRef(t)})"><span class="tpl-tile-play">${ICONS.play}</span><span class="tpl-tile-name">${escapeHtml(t.name)}</span><span class="tpl-tile-meta">${t.exercises.length} Übungen</span></button>`).join('');
  // Date keys are validated (DATE_KEY), safe inside the handler
  document.getElementById('start-panel').innerHTML=`${weekCardHtml(false)}
    <div class="sec-label">Training starten</div>
    ${tiles?`<div class="tpl-grid">${tiles}</div>`:''}
    <div class="card list">
      ${past.length?row('repeat','Letztes Training wiederholen',shortDate(past[0])+' · '+namesPreview(sessions[past[0]]),`copySessionToToday('${past[0]}')`):''}
      ${past.length?row('copy','Aus dem Verlauf kopieren','Ein früheres Training als Basis','openLoadModal(true)'):''}
      ${row('plus','Leer starten','Übungen einzeln hinzufügen','openExerciseModal()')}
    </div>
    <button class="link-btn" onclick="openBacklogDateModal()">${ICONS.calendar} Vergangenes Training nachtragen</button>`;
}

// Touch-based drag & drop for mobile
let touchDragIdx=null,touchClone=null,touchTarget=null;
document.addEventListener('touchstart',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='BUTTON')return;
  const handle=e.target.closest('.drag-handle');
  if(!handle)return;
  const card=handle.closest('.exercise-card');
  if(!card)return;
  touchDragIdx=parseInt(card.dataset.idx);
  touchClone=card.cloneNode(true);
  touchClone.classList.add('drag-clone');
  touchClone.style.width=card.offsetWidth+'px';
  document.body.appendChild(touchClone);
  card.classList.add('dragging');
},{passive:true});
document.addEventListener('touchmove',e=>{
  if(touchDragIdx===null)return;
  const t=e.touches[0];
  if(touchClone){touchClone.style.setProperty('--x',(t.clientX-40)+'px');touchClone.style.setProperty('--y',(t.clientY-30)+'px');}
  const el=document.elementFromPoint(t.clientX,t.clientY);
  const card=el?.closest?.('.exercise-card');
  document.querySelectorAll('.exercise-card').forEach(c=>c.classList.remove('drag-over'));
  if(card&&parseInt(card.dataset.idx)!==touchDragIdx)card.classList.add('drag-over');
  touchTarget=card?parseInt(card.dataset.idx):null;
},{passive:true});
document.addEventListener('touchend',()=>{
  if(touchDragIdx===null)return;
  if(touchClone){touchClone.remove();touchClone=null;}
  document.querySelectorAll('.exercise-card').forEach(c=>{c.classList.remove('dragging','drag-over');});
  if(touchTarget!==null&&touchTarget!==touchDragIdx){
    const moved=currentSession.exercises.splice(touchDragIdx,1)[0];
    currentSession.exercises.splice(touchTarget,0,moved);
    scheduleSave();render();
  }
  touchDragIdx=null;touchTarget=null;
});

window.toggleEx = function(i){currentSession.exercises[i].open=!currentSession.exercises[i].open;render();}
window.updateSet = function(ei,si,field,input){
  const val=clampSetValue(field, input.value);
  if(val!==input.value)input.value=val;
  const ex=currentSession.exercises[ei],setObj=ex.sets[si];
  setObj[field]=val;
  scheduleSave();updateStats();
  const card=document.querySelectorAll('#exercise-list .exercise-card')[ei];
  if(!card)return;
  card.querySelector('.ex-vol b').textContent=Math.round(calcExVol(ex)).toLocaleString('de')+' kg';
  if(field==='kg'){
    const pr=getExPR(ex.name);
    const kg=parseFloat(val)||0,reps=parseFloat(setObj.reps)||0;
    const isPR=kg>0&&(!pr||kg>pr.kg||(kg===pr.kg&&reps>=pr.reps));
    const hadPR=input.classList.contains('pr-value');
    input.classList.toggle('pr-value',isPR);
    // Burst the moment a set first crosses the PR threshold
    if(isPR&&!hadPR&&!REDUCED_MOTION)replayAnim(card,'pr-burst');
  }
};
window.addSet = function(ei){currentSession.exercises[ei].sets.push({kg:'',reps:''});scheduleSave();render();}
window.removeSet = function(ei,si){currentSession.exercises[ei].sets.splice(si,1);scheduleSave();render();}
window.removeEx = function(ei){currentSession.exercises.splice(ei,1);scheduleSave();render();}

// ── FINISH TRAINING ──
window.finishTraining = function(){
  if(!currentSession.exercises.length)return;
  // Save immediately; the snapshot is taken before collapsing. Offline the
  // write is queued, the UI does not wait for it (failures raise a toast).
  saveSession().then(ok=>{if(ok)setSyncStatus('synced','Training gespeichert',3000);});
  // Collapse all exercises
  currentSession.exercises.forEach(ex=>ex.open=false);
  render();
  window.scrollTo({top:0,behavior:'smooth'});
};

// ── SHARED MODAL HELPERS ──
// Open modals form a stack: everything outside the top one is inert (neither
// focusable nor clickable), Escape closes it and focus returns to the opener.
const modalStack=[];
function updateInert(){
  const top=modalStack.length?document.getElementById(modalStack[modalStack.length-1].id):null;
  [...document.body.children].forEach(el=>{el.inert=!!top&&el!==top;});
}
window.openModal = function(id){
  const el=document.getElementById(id);
  if(!el.classList.contains('open'))modalStack.push({id,opener:document.activeElement});
  el.classList.add('open');
  updateInert();
  el.querySelector('.modal-close')?.focus({preventScroll:true});
};
window.closeModal = function(id){
  document.getElementById(id).classList.remove('open');
  const i=modalStack.findIndex(m=>m.id===id);
  if(i<0)return;
  const [m]=modalStack.splice(i,1);
  updateInert();
  m.opener?.focus?.({preventScroll:true});
};
window.closeModalOnOverlay = function(e,id){if(e.target===document.getElementById(id))window.closeModal(id);};
function closeAllModals(){while(modalStack.length)window.closeModal(modalStack[modalStack.length-1].id);}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&modalStack.length){window.closeModal(modalStack[modalStack.length-1].id);return;}
  // Clickable non-button elements (role="button") react to Enter/Space like real buttons
  if((e.key==='Enter'||e.key===' ')&&e.target.getAttribute?.('role')==='button'){e.preventDefault();e.target.click();}
});

// ── EXERCISE MODAL ──
window.openExerciseModal = function(){
  window.openModal('modal-overlay');
  document.getElementById('search').value='';
  document.getElementById('custom-btn').classList.remove('visible');
  filterExercises();
  setTimeout(()=>document.getElementById('search').focus(),300);
};
// Shared filter for the three exercise-picker modals (today / template /
// backlog). They only differ in element ids, whether the muscle group is
// searchable, and which extras (PR line, "eigene"-badge) are shown.
// cfg: {searchId, btnId, optionsId, matchMuscle, showPR, showCustomBadge, emptyText}
function filterExercisePicker(cfg){
  const q=document.getElementById(cfg.searchId).value.trim(),ql=q.toLowerCase();
  const all=allExercises();
  const filtered=q?all.filter(e=>e.name.toLowerCase().includes(ql)||(cfg.matchMuscle&&e.muscle.toLowerCase().includes(ql))):all;
  const exactMatch=all.some(e=>e.name.toLowerCase()===ql);
  const btn=document.getElementById(cfg.btnId);
  if(q&&!exactMatch){btn.textContent=`"${q}" neu`;btn.classList.add('visible');}
  else btn.classList.remove('visible');
  const opts=document.getElementById(cfg.optionsId);
  if(!filtered.length){opts.innerHTML=`<div class="no-results">${cfg.emptyText}</div>`;return;}
  const grouped={};
  filtered.forEach(e=>{if(!grouped[e.muscle])grouped[e.muscle]=[];grouped[e.muscle].push(e);});
  const showLabels=Object.keys(grouped).length>1;
  let html='';
  Object.entries(grouped).forEach(([muscle,exs])=>{
    if(showLabels)html+=`<div class="muscle-label">${muscle}</div>`;
    exs.forEach(e=>{
      const isCustom=cfg.showCustomBadge&&e.muscle==='Eigene';
      const badge=isCustom?'<span class="custom-badge">eigene</span>':'';
      let prHtml='';
      if(cfg.showPR){
        const pr=getExPR(e.name);
        const prText=pr?`Bestwert <span>${pr.kg} kg × ${pr.reps}</span>`:'Noch kein Eintrag';
        prHtml=`<div class="exercise-option-pr">${prText}</div>`;
      }
      html+=`<div class="exercise-option${isCustom?' custom':''}" role="button" tabindex="0" data-name="${escapeHtml(e.name)}">
        <div class="exercise-option-name">${escapeHtml(e.name)}${badge}</div>${prHtml}
      </div>`;
    });
  });
  opts.innerHTML=html;
}
window.filterExercises = ()=>filterExercisePicker({
  searchId:'search',btnId:'custom-btn',optionsId:'exercise-options',
  matchMuscle:true,showPR:true,showCustomBadge:true,
  emptyText:'Keine Übung gefunden — oben als neue hinzufügen.',
});
window.filterTplExercises = ()=>filterExercisePicker({
  searchId:'tpl-search',btnId:'tpl-custom-btn',optionsId:'tpl-exercise-options',
  matchMuscle:false,showPR:false,showCustomBadge:false,
  emptyText:'Keine Übung gefunden.',
});
window.filterBacklogExercises = ()=>filterExercisePicker({
  searchId:'backlog-search',btnId:'backlog-custom-btn',optionsId:'backlog-exercise-options',
  matchMuscle:true,showPR:false,showCustomBadge:true,
  emptyText:'Keine Übung gefunden — oben als neue hinzufügen.',
});
window.addCustomExercise = function(){
  const name=ensureCustomExercise(document.getElementById('search').value);
  if(!name)return;
  window.addExercise(name);
};
window.addExercise = function(name){
  currentSession.exercises.push({name,open:true,sets:newSets(name,currentKey)});
  scheduleSave();render();window.closeModal('modal-overlay');
  popInLast('exercise-list');
};

// ── HISTORY ──
// Done sets (any value entered) and volume of a training
function sessionTotals(s){
  let sets=0,vol=0;
  s.exercises.forEach(ex=>ex.sets.forEach(set=>{
    const kg=parseFloat(set.kg)||0,r=parseFloat(set.reps)||0;
    if(kg>0||r>0){sets++;vol+=kg*r;}
  }));
  return {sets,vol};
}
function renderHistory(){
  const list=document.getElementById('history-list');
  const keys=Object.keys(sessions).filter(k=>sessions[k].exercises.length||sessions[k].notes.trim()).sort().reverse();
  if(!keys.length){list.innerHTML=renderEmpty('history','Noch keine Trainings','Dein erstes Training erscheint hier.');return;}
  list.innerHTML='';
  let month='';
  keys.forEach(key=>{
    const s=sessions[key];
    const d=new Date(key+'T12:00:00');
    const m=monthsFull[d.getMonth()]+' '+d.getFullYear();
    if(m!==month){
      month=m;
      const label=document.createElement('div');
      label.className='month-label';label.textContent=m;
      list.appendChild(label);
    }
    const {sets,vol}=sessionTotals(s);
    const card=document.createElement('div');
    card.className='card session-card';
    card.setAttribute('role','button');card.tabIndex=0;
    card.onclick=()=>showDetail(key);
    card.innerHTML=`<div class="session-date"><b>${d.getDate()}</b><span>${DAYS[(d.getDay()+6)%7]}</span></div>
      <div class="session-main"><div class="session-names">${s.exercises.length?namesPreview(s):'Nur Notiz'}</div><div class="session-meta">${s.exercises.length} Übungen · ${setsLabel(sets)} · ${Math.round(vol).toLocaleString('de')} kg</div></div>
      <span class="chev">${ICONS.chevronRight}</span>`;
    list.appendChild(card);
  });
}

let currentDetailKey=null;

function showDetail(key){
  currentDetailKey=key;
  const s=sessions[key];if(!s)return;
  const d=new Date(key+'T12:00:00');
  const dayIdx=(d.getDay()+6)%7;
  document.getElementById('detail-sub').textContent=DAYS_FULL[dayIdx];
  document.getElementById('detail-title').textContent=d.getDate()+'. '+monthsFull[d.getMonth()]+' '+d.getFullYear();
  // Copying the open training onto itself makes no sense
  document.getElementById('detail-copy').style.display=key===currentKey||!s.exercises.length?'none':'';
  const {sets:totalSets,vol:totalVol}=sessionTotals(s);
  const vals=[s.exercises.length,totalSets,Math.round(totalVol)];
  document.getElementById('detail-stats').innerHTML=['Übungen','Sätze','kg Volumen']
    .map((label,i)=>`<div class="summary-item"><b>${vals[i].toLocaleString('de')}</b><span>${label}</span></div>`).join('');
  if(!REDUCED_MOTION){
    document.querySelectorAll('#detail-stats b').forEach((el,i)=>{el.dataset.val=0;countUp(el,vals[i],n=>n.toLocaleString('de'));});
  }
  const exEl=document.getElementById('detail-exercises');exEl.innerHTML='';
  const standingPRs=getStandingPRs();
  (s.exercises||[]).forEach(ex=>{
    const exNameLower=(ex.name||'').trim().toLowerCase();
    const standing=standingPRs.get(exNameLower);
    const isExPR=!!(standing&&standing.dateKey===key);
    // Find the FIRST set that matches the standing PR + count total matches.
    // Only the first match gets .pr-row; the trophy badge appears only when the
    // PR kg×reps was hit exactly once in this session (not repeated as
    // volume training).
    let firstMatchIndex=-1,matchCount=0;
    if(isExPR){
      ex.sets.forEach((set,i)=>{
        const setKg=parseFloat(set.kg)||0;
        const setReps=parseInt(set.reps)||0;
        if(setKg===standing.kg&&setReps===standing.reps){
          if(firstMatchIndex<0)firstMatchIndex=i;
          matchCount++;
        }
      });
    }
    const showExPRBadge=matchCount===1;
    const card=renderExerciseCard(ex,{
      readonly:true,
      badgeHtml:showExPRBadge?`<span class="pr-chip">${ICONS.trophy} PR</span>`:'',
      hasPRClass:showExPRBadge,
      isPRSet:i=>i===firstMatchIndex,
    });
    exEl.appendChild(card);
  });
  document.getElementById('detail-notes-wrap').innerHTML=s.notes&&s.notes.trim()?`<div class="sec-label">Notizen</div><div class="card detail-notes">${escapeHtml(s.notes)}</div>`:'';
  window.showPage('detail');
}

window.copySession = function(){if(currentDetailKey)window.copySessionToToday(currentDetailKey);};
window.editSession = function(){
  if(!currentDetailKey||!sessions[currentDetailKey])return;
  const draft=structuredClone(sessions[currentDetailKey]);
  draft.exercises.forEach(ex=>ex.open=true);
  // Original date remembered for a potential date change
  openBacklog(currentDetailKey,currentDetailKey,draft);
};

window.deleteSession = function(){
  if(!currentDetailKey||!activeUid)return;
  const key=currentDetailKey;
  const d=new Date(key+'T12:00:00');
  const dayIdx=(d.getDay()+6)%7;
  const label=DAYS_FULL[dayIdx]+', '+d.getDate()+'. '+monthsFull[d.getMonth()]+' '+d.getFullYear();
  if(!confirm('Training vom '+label+' wirklich löschen?'))return;
  trackWrite(()=>deleteDoc(doc(db,'users',activeUid,'sessions',key)),'Löschen','Gelöscht');
  delete sessions[key];
  invalidatePRCache();
  syncTemplatesWithBests();
  // If deleting the open training, reset currentSession too
  if(key===currentKey){setCurrentSession(null);render();}
  currentDetailKey=null;
  window.showPage('history');
};

// ── GOALS ──
function getMondayOfWeek(date){
  const d=new Date(date);const day=d.getDay();const diff=day===0?-6:1-day;
  d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);return d;
}
function getWeekDays(monday){
  const days=[];
  for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(d.getDate()+i);days.push(localDateKey(d));}
  return days;
}
function countTrainedDays(weekDays){
  return weekDays.filter(k=>{const s=sessions[k];return s&&s.exercises&&s.exercises.length>0;}).length;
}
function renderGoals(){
  document.getElementById('goals-content').innerHTML=weekCardHtml(true);
  renderWeekHistory();
}
window.changeGoal = function(delta){
  goals.trainDays=Math.max(1,Math.min(7,(goals.trainDays||3)+delta));
  renderGoals();saveGoals();
};
function renderWeekHistory(){
  const today=new Date();
  const list=document.getElementById('week-history-list');
  const result=[];
  for(let w=1;w<=8;w++){
    const d=new Date(today);d.setDate(d.getDate()-(w*7));
    const monday=getMondayOfWeek(d);const weekDays=getWeekDays(monday);
    const trained=countTrainedDays(weekDays);
    if(Object.keys(sessions).some(k=>weekDays.includes(k))){result.push({monday,weekDays,trained});}
  }
  const goal=goals.trainDays||3;
  if(!result.length){list.innerHTML=renderEmpty('target','Noch keine Daten','Hier erscheinen deine letzten Wochen.');return;}
  list.innerHTML=result.map(({monday,weekDays,trained})=>{
    const label=monday.getDate()+'.'+(monday.getMonth()+1)+'.';
    const dots=weekDays.map((k,i)=>{const t=sessions[k]&&sessions[k].exercises&&sessions[k].exercises.length>0;return `<div class="week-dot${t?' trained':''}">${DAYS[i]}</div>`;}).join('');
    const hit=trained>=goal;
    return `<div class="week-row"><div class="week-row-label">Ab ${label}</div><div class="week-row-dots">${dots}</div><div class="week-row-result ${hit?'hit':'miss'}">${trained}/${goal}</div></div>`;
  }).join('');
}

// ── TEMPLATES ──
// Templates always mirror the current all-time record: every set of a
// template exercise is overwritten with the heaviest set ever logged for
// that exercise (kg + that set's reps), INCLUDING today's session — so a
// new record during a workout lands in the template immediately. The best
// value always wins, even over manually entered template values; exercises
// without any logged set keep their stored values. Recomputed from the full
// history on every call, so it is idempotent and self-correcting (deleting
// a record session lowers the template again). Persists only on change.
// Must be called wherever `sessions` is mutated.
function syncTemplatesWithBests(){
  if(!templates.length)return;
  const bests=buildPRCache(null); // null = no day excluded, today counts
  let changed=false;
  templates.forEach(tpl=>{
    (tpl.exercises||[]).forEach(ex=>{
      const best=bests.get(ex.name);
      if(!best)return;
      const kg=String(best.kg);
      const reps=best.reps>0?String(best.reps):'';
      ex.sets.forEach(s=>{
        if(s.kg!==kg||s.reps!==reps){s.kg=kg;s.reps=reps;changed=true;}
      });
    });
  });
  if(changed)saveTemplates();
}

function renderTemplates(){
  const list=document.getElementById('template-list');
  if(!templates.length){list.innerHTML=renderEmpty('clipboardList','Noch keine Vorlagen','Erstelle deine erste Vorlage.');return;}
  list.innerHTML='';
  templates.forEach((tpl,ti)=>{
    const card=document.createElement('div');card.className='card template-card';
    card.innerHTML=`
      <div class="template-name">${escapeHtml(tpl.name)}</div>
      <div class="template-meta">${tpl.exercises.length} Übungen · ${setsLabel(tpl.exercises.reduce((s,e)=>s+e.sets.length,0))}</div>
      <div class="template-ex">${namesPreview(tpl)}</div>
      <div class="template-actions">
        <button class="btn btn--primary btn--sm" onclick="startTemplate(${tplRef(tpl)})">${ICONS.play} Starten</button>
        <button class="btn btn--sm" onclick="openTemplateEditor(${ti})">${ICONS.pencil} Bearbeiten</button>
        <button class="btn btn--sm btn--danger" onclick="deleteTemplate(${ti})" aria-label="Vorlage löschen">${ICONS.trash}</button>
      </div>`;
    list.appendChild(card);
  });
}
window.deleteTemplate = function(ti){
  if(!confirm(`Vorlage "${templates[ti].name}" wirklich löschen?`))return;
  templates.splice(ti,1);renderTemplates();saveTemplates();
};
window.openTemplateEditor = function(ti){
  showTemplateEditor(ti===null?{id:Date.now(),name:'',exercises:[]}:structuredClone(templates[ti]));
};
// Remembers the stored version, so a save can tell if it changed elsewhere meanwhile
function showTemplateEditor(tpl){
  editingTemplate=tpl;
  tplSeen=stamp(templates.find(t=>t.id===tpl.id));
  document.getElementById('tpl-editor-title').textContent=tplSeen?'Vorlage bearbeiten':'Neue Vorlage';
  document.getElementById('tpl-name-input').value=tpl.name;
  renderTplExList();window.openModal('tpl-editor-overlay');
}
function renderTplExList(){
  const list=document.getElementById('tpl-ex-list');list.innerHTML='';
  (editingTemplate.exercises||[]).forEach((ex,ei)=>{
    const div=document.createElement('div');div.className='tpl-ex';
    div.innerHTML=`
      <div class="tpl-ex-head"><div class="tpl-ex-name">${escapeHtml(ex.name)}</div><button class="tpl-ex-remove" onclick="removeTplEx(${ei})">Entfernen</button></div>
      ${setRows(ex.sets,ei,'updateTplSet','removeTplSet')}
      <button class="add-set" onclick="addTplSet(${ei})">+ Satz</button>`;
    list.appendChild(div);
  });
}
window.updateTplSet = function(ei,si,field,input){
  const val=clampSetValue(field, input.value);
  if(val!==input.value)input.value=val;
  editingTemplate.exercises[ei].sets[si][field]=val;
}
window.addTplSet = function(ei){editingTemplate.exercises[ei].sets.push({kg:'',reps:''});renderTplExList();}
window.removeTplSet = function(ei,si){editingTemplate.exercises[ei].sets.splice(si,1);renderTplExList();}
window.removeTplEx = function(ei){editingTemplate.exercises.splice(ei,1);renderTplExList();}
window.saveTemplate = async function(){
  const name=document.getElementById('tpl-name-input').value.trim();
  if(!name){alert('Bitte einen Namen eingeben.');return;}
  if(!editingTemplate.exercises.length){alert('Bitte mindestens eine Übung hinzufügen.');return;}
  const gen=authGen,editor=editingTemplate,draft={...structuredClone(editor),name};
  // Matched by id, not list index: the list may have changed on another device meanwhile
  const old=templates.find(t=>t.id===draft.id);
  if(stamp(old)!==tplSeen&&!confirm('Diese Vorlage wurde inzwischen auf einem anderen Gerät geändert oder gelöscht.\n\nOK: deine Version speichern (überschreibt die andere)\nAbbrechen: nicht speichern'))return;
  templates=old?templates.map(t=>t===old?draft:t):[...templates,draft];
  const tracked=saveTemplates();
  // The sent version is the editor's new base, so saving again meanwhile (double
  // tap, edits made while waiting) isn't taken for a change on another device
  const seen=tplSeen;tplSeen=stamp(draft);
  // Rejected — also later, after the editor was closed: undo the entry and
  // put the draft back into the editor for a retry. If another template is
  // being edited by then, the draft stays in the local list (until another
  // device's version arrives) and goes out with the next save.
  const recover=()=>{
    const open=document.getElementById('tpl-editor-overlay').classList.contains('open');
    if(gen!==authGen||open&&editingTemplate!==editor)return;
    templates=old?templates.map(t=>t.id===draft.id?old:t):templates.filter(t=>t.id!==draft.id);
    renderTemplates();
    if(open)tplSeen=seen;
    else showTemplateEditor(draft);
  };
  const ok=await settleWrite(tracked);
  if(gen!==authGen)return;
  if(ok===false)return recover();
  if(ok===null)tracked.then(saved=>{if(!saved)recover();});
  // Only close the editor this save came from, and only while it still shows
  // what was saved — a newer editor or newer edits stay open
  const shown={...editor,name:document.getElementById('tpl-name-input').value.trim()};
  if(editingTemplate===editor&&stamp(shown)===stamp(draft)){editingTemplate=null;window.closeModal('tpl-editor-overlay');}
  renderTemplates();
};
window.openTplExModal = function(){
  window.openModal('tpl-ex-modal-overlay');
  document.getElementById('tpl-search').value='';document.getElementById('tpl-custom-btn').classList.remove('visible');
  filterTplExercises();setTimeout(()=>document.getElementById('tpl-search').focus(),300);
};
window.addTplCustomExercise = function(){
  const name=ensureCustomExercise(document.getElementById('tpl-search').value);
  if(!name)return;
  window.addTplExercise(name);
};
window.addTplExercise = function(name){
  editingTemplate.exercises.push({name,sets:newSets(name,'9999-12-31')});
  window.closeModal('tpl-ex-modal-overlay');renderTplExList();
};
// ── LOAD INTO TODAY ──
// A template or an earlier training becomes today's training, values included.
// An empty day takes it directly; otherwise the user picks add or replace.
function loadIntoToday(exercises,label){
  pendingImport=exercises.map(e=>({name:e.name,open:true,sets:e.sets.map(s=>({kg:s.kg||'',reps:s.reps||''}))}));
  window.closeModal('load-modal-overlay');
  if(!currentSession.exercises.length)return window.doImport('replace');
  document.getElementById('import-modal-title').textContent=`„${label}“ übernehmen`;
  window.openModal('import-modal-overlay');
}
// By id, not list index: a list shown earlier (open picker) may be outdated by
// a change on another device. tplRef = the id as a JS literal for onclick.
function tplRef(t){return escapeHtml(JSON.stringify(t.id));}
window.startTemplate = function(id){const t=templates.find(t=>t.id===id);if(t)loadIntoToday(t.exercises,t.name);};
window.copySessionToToday = function(key){const s=sessions[key];if(s)loadIntoToday(s.exercises,shortDate(key));};
window.doImport = function(mode){
  if(!pendingImport)return;
  currentSession.exercises=mode==='replace'?pendingImport:[...currentSession.exercises,...pendingImport];
  pendingImport=null;
  scheduleSave();window.closeModal('import-modal-overlay');window.showPage('today');
  animateNextStats=true;
  render();
  staggerIn('exercise-list');
};
// Picker for templates and earlier trainings; onlyTrainings when the start
// panel already shows the templates
window.openLoadModal = function(onlyTrainings){
  const row=(onclick,title,sub)=>`<button class="pick-row" onclick="${onclick}"><span class="pick-main"><span class="pick-title">${title}</span><span class="pick-sub">${sub}</span></span><span class="chev">${ICONS.chevronRight}</span></button>`;
  const tpls=onlyTrainings?'':templates.map(t=>row(`startTemplate(${tplRef(t)})`,escapeHtml(t.name),namesPreview(t))).join('');
  // Date keys are validated (DATE_KEY), safe inside the handler
  const past=trainedKeysBefore(currentKey).map(k=>row(`copySessionToToday('${k}')`,shortDate(k)+' '+k.slice(0,4),namesPreview(sessions[k]))).join('');
  document.getElementById('load-modal-title').textContent=onlyTrainings?'Training kopieren':'Vorlage oder Training übernehmen';
  document.getElementById('load-options').innerHTML=
    (tpls?`<div class="muscle-label">Vorlagen</div>${tpls}`:'')+
    (past?`<div class="muscle-label">Frühere Trainings</div>${past}`:'')||
    '<div class="no-results">Noch keine Vorlagen oder Trainings.</div>';
  window.openModal('load-modal-overlay');
};

// ── BACKLOG / VERGANGENES TRAINING ERFASSEN ──
let backlogKey = null;
let backlogOriginalKey = null; // tracks original date when editing, to delete old entry if date changes
let backlogSession = {exercises:[], notes:''};
let backlogSeen = {}; // stamps of the stored trainings the editor started from, by date
let lostDrafts = {}; // by date: drafts rejected late while another training was open

function openBacklog(key, originalKey, session, seen={}){
  const lost=lostDrafts[key];
  delete lostDrafts[key];
  if(lost&&confirm('Dein letzter Entwurf für diesen Tag konnte nicht gespeichert werden.\n\nOK: Entwurf wiederherstellen\nAbbrechen: verwerfen')){originalKey=lost.from;session=lost.draft;seen=lost.seen;}
  backlogOriginalKey=originalKey;
  backlogSession=session;
  backlogSeen={...seen};
  if(originalKey&&!(originalKey in backlogSeen))backlogSeen[originalKey]=stamp(sessions[originalKey]);
  setBacklogDate(key);
  document.getElementById('backlog-notes').value=session.notes||'';
  document.getElementById('backlog-change-date').max=getTodayKey();
  renderBacklogExercises();
  window.showPage('backlog');
}
// Remembers the stored version of a date when first shown, so a save can tell
// if it changed elsewhere meanwhile
function setBacklogDate(key){
  backlogKey=key;
  if(!(key in backlogSeen))backlogSeen[key]=stamp(sessions[key]);
  const d=new Date(key+'T12:00:00');
  const dayIdx=(d.getDay()+6)%7;
  document.getElementById('backlog-eyebrow').textContent=(backlogOriginalKey?'Training bearbeiten':'Training nachtragen')+' · '+DAYS_FULL[dayIdx];
  document.getElementById('backlog-date-label').textContent=d.getDate()+'. '+monthsFull[d.getMonth()]+' '+d.getFullYear();
}

window.openBacklogDateModal = function(){
  const input = document.getElementById('backlog-date-input');
  input.max = getTodayKey();
  input.value = '';
  window.openModal('backlog-date-modal-overlay');
};

window.confirmBacklogDate = function(){
  const dateStr = document.getElementById('backlog-date-input').value;
  if(!dateStr){alert('Bitte ein Datum auswählen.');return;}
  if(dateStr>getTodayKey()){alert('Datum darf nicht in der Zukunft liegen.');return;}
  window.closeModal('backlog-date-modal-overlay');
  // Track an existing entry so a later date change deletes the original instead of duplicating it
  if(sessions[dateStr])openBacklog(dateStr,dateStr,structuredClone(sessions[dateStr]));
  else openBacklog(dateStr,null,{exercises:[],notes:''});
};

window.cancelBacklog = function(){
  backlogKey=null;
  backlogOriginalKey=null;
  backlogSession={exercises:[],notes:''};
  window.showPage('today');
};

window.changeBacklogDate = function(dateStr){
  if(!dateStr)return;
  if(dateStr>getTodayKey()){alert('Datum darf nicht in der Zukunft liegen.');return;}
  // Refuse to silently overwrite a different existing training on the target date
  if(sessions[dateStr]&&dateStr!==backlogOriginalKey){
    const td=new Date(dateStr+'T12:00:00');
    const label=td.getDate()+'. '+monthsFull[td.getMonth()]+' '+td.getFullYear();
    if(!confirm(`Am ${label} existiert bereits ein Training. Wenn du fortfährst, wird es durch das aktuelle ersetzt.`)){
      document.getElementById('backlog-change-date').value='';
      return;
    }
  }
  setBacklogDate(dateStr);
  document.getElementById('backlog-change-date').value='';
};

window.saveBacklog = async function(){
  if(!backlogKey||!activeUid)return;
  if(!backlogSession.exercises.length){alert('Bitte mindestens eine Übung hinzufügen.');return;}
  const notes=document.getElementById('backlog-notes');
  backlogSession.notes=notes.value||'';
  const gen=authGen,editor=backlogSession,seen=backlogSeen,from=backlogOriginalKey,to=backlogKey,draft=structuredClone(backlogSession);
  const moved=from&&from!==to;
  if([from,to].some(k=>k&&stamp(sessions[k])!==seen[k])&&!confirm('Dieses Training wurde inzwischen auf einem anderen Gerät geändert.\n\nOK: deine Version speichern (überschreibt die andere)\nAbbrechen: nicht speichern'))return;
  // One atomic batch: a date change can never delete the original without
  // also writing the target.
  const batch=writeBatch(db);
  batch.set(doc(db,'users',activeUid,'sessions',to),{...draft,writer:CLIENT_ID});
  if(moved)batch.delete(doc(db,'users',activeUid,'sessions',from));
  const tracked=trackWrite(()=>batch.commit(),'Speichern');
  // The sent version is the editor's new base, so saving again meanwhile (double
  // tap, edits made while waiting) isn't taken for a change on another device
  backlogOriginalKey=to;backlogSeen={[to]:stamp(draft)};
  // Rejected — also later, after the editor was closed
  // ponytail: lost drafts live in memory only, a reload before a late rejection
  // loses them (toast only); persist pending drafts if rejections become real.
  const recover=()=>{
    if(gen!==authGen)return;
    // Still open: back to the base before this save
    if(backlogSession===editor){backlogOriginalKey=from;backlogSeen={...backlogSeen,...seen};}
    // Closed: the draft goes back into the editor for a retry
    else if(!backlogKey)openBacklog(to,from,structuredClone(draft),seen);
    // Another training is open: offered again when its date is opened
    else{
      lostDrafts[to]={from,draft:structuredClone(draft),seen};
      const d=new Date(to+'T12:00:00');
      setSyncStatus('error',`Training vom ${d.getDate()}. ${monthsFull[d.getMonth()]} nicht gespeichert – öffne den Tag erneut für deinen Entwurf`,3000);
    }
  };
  const ok=await settleWrite(tracked);
  if(gen!==authGen)return;
  if(ok===false)return recover();
  if(ok===null)tracked.then(saved=>{if(!saved)recover();});
  if(moved)delete sessions[from];
  sessions[to]=draft;
  invalidatePRCache();
  syncTemplatesWithBests();
  // Keep the open training in sync when it was the source or target
  if(to===currentKey)setCurrentSession(draft);
  else if(moved&&from===currentKey)setCurrentSession(null);
  render();
  // Only close the editor this save came from, and only while it still shows
  // what was saved — a newer editor or newer edits stay open
  if(backlogSession!==editor||backlogKey!==to||stamp({...editor,notes:notes.value})!==stamp(draft))return;
  backlogKey=null;backlogOriginalKey=null;backlogSession={exercises:[],notes:''};
  window.showPage('history');
};

function renderBacklogExercises(){
  const list=document.getElementById('backlog-exercise-list');
  list.innerHTML='';
  backlogSession.exercises.forEach((ex,ei)=>{
    const card=renderExerciseCard(ex,{
      idx:ei,
      showDelete:true,
      namespace:'backlog',
      ghost:lastSets(ex.name,backlogKey),
    });
    list.appendChild(card);
  });
  if(!backlogSession.exercises.length){
    list.innerHTML=renderEmpty('calendar','Noch keine Übungen','Füge die Übungen dieses Trainings hinzu.');
  }
}

window.toggleBacklogEx=function(i){backlogSession.exercises[i].open=!backlogSession.exercises[i].open;renderBacklogExercises();};
window.updateBacklogSet=function(ei,si,field,input){
  const val=clampSetValue(field, input.value);
  if(val!==input.value)input.value=val;
  const ex=backlogSession.exercises[ei];
  ex.sets[si][field]=val;
  const vol=document.querySelectorAll('#backlog-exercise-list .exercise-card')[ei]?.querySelector('.ex-vol b');
  if(vol)vol.textContent=Math.round(calcExVol(ex)).toLocaleString('de')+' kg';
};
window.addBacklogSet=function(ei){backlogSession.exercises[ei].sets.push({kg:'',reps:''});renderBacklogExercises();};
window.removeBacklogSet=function(ei,si){backlogSession.exercises[ei].sets.splice(si,1);renderBacklogExercises();};
window.removeBacklogEx=function(ei){backlogSession.exercises.splice(ei,1);renderBacklogExercises();};

// Backlog exercise modal
window.openBacklogExModal=function(){
  window.openModal('backlog-ex-modal-overlay');
  document.getElementById('backlog-search').value='';
  document.getElementById('backlog-custom-btn').classList.remove('visible');
  filterBacklogExercises();
  setTimeout(()=>document.getElementById('backlog-search').focus(),300);
};
window.addBacklogCustomExercise=function(){
  const name=ensureCustomExercise(document.getElementById('backlog-search').value);
  if(!name)return;
  window.addBacklogExercise(name);
};
window.addBacklogExercise=function(name){
  backlogSession.exercises.push({name,open:true,sets:newSets(name,backlogKey)});
  window.closeModal('backlog-ex-modal-overlay');renderBacklogExercises();
  popInLast('backlog-exercise-list');
};

// ── PROGRESS ──
function renderProgress(){
  renderGoals();
  renderHeatmap();
  populateExSelect();
  renderProgressChart();
}

function getStandingPRs(){
  // Per-exercise standing PR — single source of truth used by the heatmap
  // (via getPRDays) and the session detail view (to highlight PR sets).
  // Returns Map<normalizedName, {dateKey, kg, reps, displayName}>.
  //
  // "Standing PR" = the FIRST session where the all-time best kg×reps was
  // achieved. A later session that TIES the standing best is NOT a PR
  // (strict > comparison only). First date wins on ties.
  //
  // Names are normalized (trim + lowercase) so casing/whitespace variants
  // count as one exercise.
  const exMap={}; // normalized name -> {displayName, maxKg, maxReps, prDate}
  // Walk sessions in chronological order (ISO date keys sort lex-= chrono).
  // Only update the PR date when a set STRICTLY beats the running all-time
  // max — equal kg×reps leaves the existing prDate (= first occurrence) in
  // place.
  const sortedKeys=Object.keys(sessions).sort();
  for(const key of sortedKeys){
    const s=sessions[key];
    (s.exercises||[]).forEach(ex=>{
      const display=(ex.name||'').trim();
      const name=display.toLowerCase();
      if(!name)return;
      if(!exMap[name])exMap[name]={displayName:display,maxKg:0,maxReps:0,prDate:null};
      const entry=exMap[name];
      (ex.sets||[]).forEach(set=>{
        const kg=parseFloat(set.kg)||0;
        const reps=parseInt(set.reps)||0;
        if(kg<=0)return;
        if(kg>entry.maxKg||(kg===entry.maxKg&&reps>entry.maxReps)){
          entry.maxKg=kg;entry.maxReps=reps;entry.prDate=key;
        }
      });
    });
  }
  const result=new Map();
  Object.entries(exMap).forEach(([name,entry])=>{
    if(entry.prDate){
      result.set(name,{dateKey:entry.prDate,kg:entry.maxKg,reps:entry.maxReps,displayName:entry.displayName});
    }
  });
  return result;
}

function getPRDays(){
  // Derived from getStandingPRs: Map<dateKey, displayName[]> for heatmap labels.
  // .has(key) works identically to Set.has(key) so existing call sites are
  // unaffected; .get(key) gives the list of exercise display names.
  const prMap=new Map();
  getStandingPRs().forEach(entry=>{
    if(!prMap.has(entry.dateKey))prMap.set(entry.dateKey,[]);
    prMap.get(entry.dateKey).push(entry.displayName);
  });
  prMap.forEach(names=>names.sort((a,b)=>a.localeCompare(b,'de')));
  return prMap;
}

function getPRLabel(names){
  if(!names||names.length===0)return '';
  const first=(names[0]||'').trim().substring(0,3).toUpperCase();
  return names.length===1?first:first+'+'+(names.length-1);
}

// Heatmap view state
let heatmapView='month';
let heatmapFocus=new Date();

window.setHeatmapView=function(view){
  if(view!=='month'&&view!=='year')return;
  heatmapView=view;
  document.getElementById('hm-view-month').classList.toggle('active',view==='month');
  document.getElementById('hm-view-year').classList.toggle('active',view==='year');
  renderHeatmap();
};

window.navHeatmap=function(delta){
  if(heatmapView==='month'){
    heatmapFocus=new Date(heatmapFocus.getFullYear(),heatmapFocus.getMonth()+delta,1);
  }else{
    heatmapFocus=new Date(heatmapFocus.getFullYear()+delta,heatmapFocus.getMonth(),1);
  }
  renderHeatmap();
};

function renderHeatmap(){
  const container=document.getElementById('heatmap');
  const label=document.getElementById('hm-nav-label');
  if(!container||!label)return;
  container.innerHTML='';
  const prDays=getPRDays();
  const todayKey=getTodayKey();
  if(heatmapView==='month'){
    label.textContent=monthsFull[heatmapFocus.getMonth()]+' '+heatmapFocus.getFullYear();
    renderHeatmapMonth(heatmapFocus.getFullYear(),heatmapFocus.getMonth(),container,prDays,todayKey);
  }else{
    label.textContent=String(heatmapFocus.getFullYear());
    renderHeatmapYear(heatmapFocus.getFullYear(),container,prDays,todayKey);
  }
}

function renderHeatmapMonth(year,month,container,prDays,todayKey){
  const labels=document.createElement('div');
  labels.className='heatmap-labels';
  DAYS.forEach(d=>{
    const span=document.createElement('span');
    span.textContent=d;
    labels.appendChild(span);
  });
  container.appendChild(labels);
  const grid=document.createElement('div');
  grid.className='heatmap-grid';
  container.appendChild(grid);
  const firstDay=new Date(year,month,1);
  const firstWeekday=(firstDay.getDay()+6)%7; // Monday=0
  const daysInMonth=new Date(year,month+1,0).getDate();
  for(let i=0;i<firstWeekday;i++){
    const cell=document.createElement('div');
    cell.className='heatmap-cell empty';
    grid.appendChild(cell);
  }
  for(let day=1;day<=daysInMonth;day++){
    const date=new Date(year,month,day);
    const key=localDateKey(date);
    const s=sessions[key];
    const exCount=s&&s.exercises?s.exercises.length:0;
    const hasPR=prDays.has(key);
    const prNames=hasPR?prDays.get(key):null;
    const isToday=key===todayKey;
    let cellClass='heatmap-cell';
    if(hasPR)cellClass+=' pr';
    else if(exCount>0)cellClass+=' trained';
    if(isToday)cellClass+=' today';
    const cell=document.createElement('div');
    cell.className=cellClass;
    if(hasPR){
      const dayDiv=document.createElement('div');
      dayDiv.className='heatmap-cell-day';
      dayDiv.textContent=day;
      cell.appendChild(dayDiv);
      const labelDiv=document.createElement('div');
      labelDiv.className='heatmap-cell-pr-label';
      labelDiv.textContent=getPRLabel(prNames);
      cell.appendChild(labelDiv);
    }else{
      cell.textContent=day;
    }
    const prSuffix=hasPR&&prNames&&prNames.length?' · PR ('+prNames.join(', ')+')':'';
    cell.title=day+'. '+months[month]+' '+year+(exCount?' — '+exCount+' Übungen'+prSuffix:' — kein Training');
    if(hasPR||exCount>0){
      cell.setAttribute('role','button');cell.tabIndex=0;
      cell.addEventListener('click',()=>showDetail(key));
    }
    // Staggered cell entrance (month view only — the year view has 365+ cells)
    if(!REDUCED_MOTION)cell.style.animationDelay=Math.min((firstWeekday+day-1)*12,500)+'ms';
    grid.appendChild(cell);
  }
}

function renderHeatmapYear(year,container,prDays,todayKey){
  const yearGrid=document.createElement('div');
  yearGrid.className='heatmap-year';
  container.appendChild(yearGrid);
  for(let m=0;m<12;m++){
    const monthWrap=document.createElement('div');
    monthWrap.className='heatmap-year-month';
    const monthLabel=document.createElement('div');
    monthLabel.className='heatmap-year-month-label';
    monthLabel.textContent=months[m];
    monthWrap.appendChild(monthLabel);
    const dayLabels=document.createElement('div');
    dayLabels.className='heatmap-year-day-labels';
    DAYS.forEach(d=>{
      const span=document.createElement('span');
      span.textContent=d;
      dayLabels.appendChild(span);
    });
    monthWrap.appendChild(dayLabels);
    const monthGrid=document.createElement('div');
    monthGrid.className='heatmap-year-grid';
    const firstDay=new Date(year,m,1);
    const firstWeekday=(firstDay.getDay()+6)%7;
    const daysInMonth=new Date(year,m+1,0).getDate();
    for(let i=0;i<firstWeekday;i++){
      const cell=document.createElement('div');
      cell.className='heatmap-year-cell empty';
      monthGrid.appendChild(cell);
    }
    for(let day=1;day<=daysInMonth;day++){
      const date=new Date(year,m,day);
      const key=localDateKey(date);
      const s=sessions[key];
      const exCount=s&&s.exercises?s.exercises.length:0;
      const hasPR=prDays.has(key);
      const isToday=key===todayKey;
      let cellClass='heatmap-year-cell';
      if(hasPR)cellClass+=' pr';
      else if(exCount>0)cellClass+=' trained';
      if(isToday)cellClass+=' today';
      const cell=document.createElement('div');
      cell.className=cellClass;
      cell.title=day+'. '+months[m]+' '+year+(exCount?' — '+exCount+' Übungen'+(hasPR?' · PR':''):'');
      monthGrid.appendChild(cell);
    }
    monthWrap.appendChild(monthGrid);
    yearGrid.appendChild(monthWrap);
  }
}

function populateExSelect(){
  const sel=document.getElementById('progress-ex-select');
  const exNames=new Set();
  Object.values(sessions).forEach(s=>{
    (s.exercises||[]).forEach(ex=>{
      if(ex.sets.some(set=>parseFloat(set.kg)>0))exNames.add(ex.name);
    });
  });
  const prev=sel.value;
  sel.innerHTML='<option value="">— Übung wählen —</option>';
  [...exNames].sort().forEach(n=>{
    const opt=document.createElement('option');
    opt.value=n;opt.textContent=n;
    sel.appendChild(opt);
  });
  if(prev&&exNames.has(prev))sel.value=prev;
}

// Chart colors come from the CSS custom properties so the canvas follows
// the active theme (light/dark) instead of hardcoded dark-theme hex values.
function getChartColors(){
  const cs=getComputedStyle(document.documentElement);
  const v=name=>cs.getPropertyValue(name).trim();
  return {grid:v('--line'),text:v('--muted'),line:v('--ink'),fillTop:v('--soft'),last:v('--text')};
}

// In-flight reveal animation — cancelled on re-entry (theme toggle, resize, select change)
let chartAnimFrame=null;
window.renderProgressChart = function(){
  if(chartAnimFrame){cancelAnimationFrame(chartAnimFrame);chartAnimFrame=null;}
  const canvas=document.getElementById('progress-chart');
  const ctx=canvas.getContext('2d');
  const name=document.getElementById('progress-ex-select').value;
  const emptyMsg=document.getElementById('progress-empty');
  const col=getChartColors();
  if(!name){canvas.style.display='none';emptyMsg.style.display='block';return;}
  // Show the canvas BEFORE measuring — a display:none canvas measures 0 × 0
  canvas.style.display='block';emptyMsg.style.display='none';
  const dpr=window.devicePixelRatio||1;
  canvas.width=canvas.offsetWidth*dpr;
  canvas.height=canvas.offsetHeight*dpr;
  ctx.scale(dpr,dpr);
  const W=canvas.offsetWidth,H=canvas.offsetHeight;
  ctx.clearRect(0,0,W,H);

  // Gather data points
  const points=[];
  Object.entries(sessions).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([key,s])=>{
    let bestKg=0;
    (s.exercises||[]).forEach(ex=>{
      if(ex.name===name)ex.sets.forEach(set=>{
        const kg=parseFloat(set.kg)||0;
        if(kg>bestKg)bestKg=kg;
      });
    });
    if(bestKg>0)points.push({date:key,kg:bestKg});
  });

  if(points.length<2){
    ctx.fillStyle=col.text;ctx.font='13px Inter, sans-serif';
    ctx.textAlign='center';ctx.fillText('Mindestens 2 Einträge nötig',W/2,H/2);
    return;
  }

  const pad={top:20,right:16,bottom:30,left:44};
  const cW=W-pad.left-pad.right,cH=H-pad.top-pad.bottom;
  const minKg=Math.floor(Math.min(...points.map(p=>p.kg))*0.9);
  const maxKg=Math.ceil(Math.max(...points.map(p=>p.kg))*1.05);
  const rangeKg=maxKg-minKg||1;

  // progress 0→1 reveals the series left-to-right via a clip rect
  function draw(progress){
    ctx.clearRect(0,0,W,H);

    // Grid lines
    ctx.strokeStyle=col.grid;ctx.lineWidth=1;
    const gridSteps=4;
    for(let i=0;i<=gridSteps;i++){
      const y=pad.top+cH-(cH/gridSteps)*i;
      ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(W-pad.right,y);ctx.stroke();
      const val=Math.round(minKg+(rangeKg/gridSteps)*i);
      ctx.fillStyle=col.text;ctx.font='11px Inter, sans-serif';ctx.textAlign='right';
      ctx.fillText(val+'kg',pad.left-8,y+4);
    }

    // X-labels
    const labelCount=Math.min(points.length,5);
    const step=Math.floor(points.length/labelCount);
    for(let i=0;i<points.length;i+=step){
      const x=pad.left+(cW/(points.length-1))*i;
      const d=points[i].date.slice(8)+'.'+points[i].date.slice(5,7)+'.';
      ctx.fillStyle=col.text;ctx.font='10px Inter, sans-serif';ctx.textAlign='center';
      ctx.fillText(d,x,H-8);
    }

    ctx.save();
    ctx.beginPath();ctx.rect(0,0,W*progress,H);ctx.clip();

    // Area fill
    ctx.beginPath();
    points.forEach((p,i)=>{
      const x=pad.left+(cW/(points.length-1))*i;
      const y=pad.top+cH-((p.kg-minKg)/rangeKg)*cH;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    });
    ctx.lineTo(pad.left+cW,pad.top+cH);
    ctx.lineTo(pad.left,pad.top+cH);
    ctx.closePath();
    const grad=ctx.createLinearGradient(0,pad.top,0,pad.top+cH);
    grad.addColorStop(0,col.fillTop);
    grad.addColorStop(1,'transparent');
    ctx.fillStyle=grad;ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach((p,i)=>{
      const x=pad.left+(cW/(points.length-1))*i;
      const y=pad.top+cH-((p.kg-minKg)/rangeKg)*cH;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    });
    ctx.strokeStyle=col.line;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();

    // Dots — the most recent entry is highlighted
    points.forEach((p,i)=>{
      const x=pad.left+(cW/(points.length-1))*i;
      const y=pad.top+cH-((p.kg-minKg)/rangeKg)*cH;
      const dotColor=i===points.length-1?col.last:col.line;
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fillStyle=dotColor;ctx.fill();
      ctx.strokeStyle=dotColor;ctx.lineWidth=2;ctx.stroke();
    });

    ctx.restore();
  }

  if(REDUCED_MOTION){draw(1);return;}
  const t0=performance.now(),dur=600;
  function tick(t){
    const p=Math.min(1,(t-t0)/dur);
    draw(1-Math.pow(1-p,3));
    chartAnimFrame=p<1?requestAnimationFrame(tick):null;
  }
  chartAnimFrame=requestAnimationFrame(tick);
}

// ── KEYBOARD HANDLING ──
// Shrink open modals when the on-screen keyboard reduces the visual viewport.
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',()=>{
    document.querySelectorAll('.modal-overlay.open .modal').forEach(m=>{
      m.style.maxHeight=Math.floor(window.visualViewport.height*0.82)+'px';
    });
  });
}

