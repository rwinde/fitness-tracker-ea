import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut as fbSignOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
  zap:`<svg ${ICON_ATTRS}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  trophy:`<svg ${ICON_ATTRS}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  dumbbell:`<svg ${ICON_ATTRS}><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l1.767-1.768a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/></svg>`,
  history:`<svg ${ICON_ATTRS}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
  target:`<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  clipboardList:`<svg ${ICON_ATTRS}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
  calendar:`<svg ${ICON_ATTRS}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  check:`<svg ${ICON_ATTRS}><path d="M20 6 9 17l-5-5"/></svg>`,
  checkCircle:`<svg ${ICON_ATTRS}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
  play:`<svg ${ICON_ATTRS}><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  pencil:`<svg ${ICON_ATTRS}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  x:`<svg ${ICON_ATTRS}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  sun:`<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon:`<svg ${ICON_ATTRS}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  gripVertical:`<svg ${ICON_ATTRS}><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`,
  chevronDown:`<svg ${ICON_ATTRS}><path d="m6 9 6 6 6-6"/></svg>`,
  chevronLeft:`<svg ${ICON_ATTRS}><path d="m15 18-6-6 6-6"/></svg>`,
  chevronRight:`<svg ${ICON_ATTRS}><path d="m9 18 6-6-6-6"/></svg>`,
  arrowLeft:`<svg ${ICON_ATTRS}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
  trash:`<svg ${ICON_ATTRS}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
  trendingUp:`<svg ${ICON_ATTRS}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  rotateCcw:`<svg ${ICON_ATTRS}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
  plus:`<svg ${ICON_ATTRS}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  logOut:`<svg ${ICON_ATTRS}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
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
let editingTemplate = null;
let importingTemplateId = null;
let saveTimer = null;
let dragSrcIdx = null;

// ── AUTH ──
window.signInWithGoogle = async () => {
  try { await signInWithPopup(auth, provider); }
  catch(e) { document.getElementById('login-error').textContent = 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.'; }
};
window.signOut = async () => { await fbSignOut(auth); };

window.toggleTheme = function() {
  const root = document.documentElement;
  const goingLight = root.getAttribute('data-theme') !== 'light';
  if (goingLight) root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  try { localStorage.setItem('theme', goingLight ? 'light' : 'dark'); } catch(e) {}
  updateThemeToggleIcon();
  // The canvas chart reads its colors from CSS variables at draw time,
  // so it must be redrawn when the theme changes while it is visible.
  const progressPage = document.getElementById('page-progress');
  if (progressPage && progressPage.classList.contains('active') && window.renderProgressChart) window.renderProgressChart();
};
function updateThemeToggleIcon() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const iconEl = document.getElementById('theme-toggle-icon');
  const switchEl = document.getElementById('theme-switch');
  const btn = document.getElementById('theme-toggle');
  // Static ICONS markup only — safe for innerHTML
  if (iconEl) iconEl.innerHTML = isLight ? ICONS.sun : ICONS.moon;
  if (switchEl) switchEl.classList.toggle('on', !isLight); // switch on = Dark Mode active
  if (btn) replayAnim(btn, 'spin');
}
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
function applyStoredTheme() {
  try {
    if (localStorage.getItem('theme') === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch(e) { /* localStorage unavailable — Safari private mode etc. */ }
  updateThemeToggleIcon();
}
applyStoredTheme();

onAuthStateChanged(auth, async (user) => {
  if(user) {
    currentUser = user;
    document.getElementById('login-screen').style.display = 'none';
    // Daten hinter dem Loading-Screen laden, damit die App in einem
    // einzigen Schritt fertig gerendert erscheint (kein "Doppel-Laden" in der PWA)
    await loadAllData();
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('profile').style.display = 'block';
    initUI();
  } else {
    currentUser = null;
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('profile').style.display = 'none';
  }
});

// ── FIRESTORE ──
function setSyncStatus(status, msg) {
  const bar = document.getElementById('sync-bar');
  bar.className = 'sync-bar ' + status;
  bar.textContent = msg;
}

async function loadAllData() {
  setSyncStatus('syncing', '↑↓ Wird synchronisiert…');
  try {
    const uid = currentUser.uid;
    // The four reads are independent — fetch them in parallel
    const [sessSnap, tplSnap, custSnap, goalsSnap] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'sessions')),
      getDoc(doc(db, 'users', uid, 'data', 'templates')),
      getDoc(doc(db, 'users', uid, 'data', 'custom')),
      getDoc(doc(db, 'users', uid, 'data', 'goals')),
    ]);
    sessions = {};
    sessSnap.forEach(d => { sessions[d.id] = d.data(); });
    invalidatePRCache();
    currentSession = sessions[getTodayKey()] ? structuredClone(sessions[getTodayKey()]) : {exercises:[], notes:''};
    document.getElementById('notes').value = currentSession.notes || '';
    templates = tplSnap.exists() ? (tplSnap.data().list || []) : [];
    customExercises = custSnap.exists() ? (custSnap.data().list || []) : [];
    goals = goalsSnap.exists() ? goalsSnap.data() : {trainDays: 3};
    // Catch up templates with records logged on another device
    syncTemplatesWithBests();
    setSyncStatus('synced', '✓ Synchronisiert');
    setTimeout(() => setSyncStatus('', 'Bereit'), 2000);
  } catch(e) {
    setSyncStatus('error', '✗ Sync-Fehler');
    console.error(e);
  }
}

// Returns true on success, false on failure — errors are handled here so
// callers (scheduleSave, finishTraining) never see a rejection.
async function saveSession() {
  if(!currentUser) return false;
  setSyncStatus('syncing', '↑ Wird gespeichert…');
  const key=getTodayKey();
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'sessions', key), currentSession);
    sessions[key] = structuredClone(currentSession);
    invalidatePRCache();
    syncTemplatesWithBests(); // fire-and-forget, handles its own errors
    setSyncStatus('synced', '✓ Gespeichert');
    setTimeout(() => setSyncStatus('', 'Bereit'), 1500);
    return true;
  } catch(e) {
    console.error('saveSession failed', e);
    setSyncStatus('error', '✗ Speichern fehlgeschlagen');
    // Reset to neutral after a moment so the user can retry; the error is logged
    setTimeout(() => setSyncStatus('', 'Bereit'), 3000);
    return false;
  }
}

// Shared helper so all background data saves report failure consistently
async function saveUserDoc(name, payload, label) {
  if(!currentUser) return;
  try { await setDoc(doc(db, 'users', currentUser.uid, 'data', name), payload); }
  catch(e) {
    console.error('save '+name+' failed', e);
    setSyncStatus('error', '✗ '+label+' fehlgeschlagen');
    setTimeout(()=>setSyncStatus('','Bereit'),3000);
  }
}
async function saveTemplates()       { return saveUserDoc('templates', {list: templates},        'Vorlagen speichern'); }
async function saveCustomExercises() { return saveUserDoc('custom',    {list: customExercises}, 'Übungen speichern'); }
async function saveGoals()           { return saveUserDoc('goals',     goals,                   'Ziele speichern'); }
function scheduleSave() {
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 1200);
}

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
  const today = new Date();
  const userLabel = (currentUser.displayName||currentUser.email||'').split('@')[0];
  document.getElementById('user-name').textContent = userLabel;
  document.getElementById('profile-initials').textContent = getInitials(currentUser);
  document.getElementById('datedisp').textContent = today.getDate();
  document.getElementById('monthdisp').textContent = months[today.getMonth()] + ' ' + today.getFullYear();
  const wdEl = document.getElementById('weekdays');
  wdEl.innerHTML = '';
  const moDay = (today.getDay()+6)%7;
  DAYS.forEach((d,i) => {
    const el = document.createElement('div');
    el.className = 'wd' + (i===moDay?' active':'');
    el.textContent = d;
    wdEl.appendChild(el);
  });
  document.getElementById('notes').addEventListener('input', e => {
    currentSession.notes = e.target.value;
    scheduleSave();
  });
  // Delegated picker handlers — read data-name to avoid building JS strings from user input
  const pickerHandlers=[
    ['exercise-options',n=>window.addExercise(n)],
    ['tpl-exercise-options',n=>window.addTplExercise(n)],
    ['backlog-exercise-options',n=>window.addBacklogExercise(n)],
  ];
  pickerHandlers.forEach(([id,fn])=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.addEventListener('click',e=>{
      const opt=e.target.closest('.exercise-option');
      if(opt&&opt.dataset.name)fn(opt.dataset.name);
    });
  });
  // Redraw the progress chart on rotation/resize while the progress page is visible
  let resizeTimer=null;
  window.addEventListener('resize',()=>{
    if(resizeTimer)clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      const page=document.getElementById('page-progress');
      if(page&&page.classList.contains('active'))window.renderProgressChart&&window.renderProgressChart();
    },150);
  });
  animateNextStats=true;
  render();
  staggerIn('exercise-list');
}

// ── PAGE NAV ──
// Containers whose children get a staggered entrance on page entry
const PAGE_STAGGER={today:['exercise-list'],history:['history-list'],templates:['template-list'],goals:['goals-content','week-history-list'],detail:['detail-exercises']};
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const page=document.getElementById('page-'+name);
  page.classList.add('active');
  const navId = name==='detail'?'nav-history':('nav-'+name);
  const navEl = document.getElementById(navId);
  if(navEl) navEl.classList.add('active');
  // Slide the gold indicator under the active tab
  const ind=document.getElementById('nav-indicator');
  if(ind&&navEl){
    const idx=[...document.querySelectorAll('.nav-btn')].indexOf(navEl);
    ind.style.transform='translateX('+(idx*100)+'%)';
  }
  if(name==='history') renderHistory();
  if(name==='templates') renderTemplates();
  if(name==='goals') renderGoals();
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
async function ensureCustomExercise(rawName){
  const q=(rawName||'').trim();
  if(!q)return null;
  if(q.length>EXERCISE_NAME_MAX){alert('Übungsname ist zu lang (max. '+EXERCISE_NAME_MAX+' Zeichen).');return null;}
  const existing=findExerciseName(q);
  if(existing)return existing;
  customExercises.push(q);
  await saveCustomExercises();
  return q;
}

// PR lookup cache. getExPR used to scan ALL sessions on every call — and it
// is called per exercise on each render(), per option in the picker and on
// every kg keystroke. The cache builds the map once per data state in a
// single pass; sessions mutations must call invalidatePRCache().
// Today is excluded (a PR is always measured against PAST sessions), so the
// cache also tracks which day it was built for and rebuilds after midnight.
let prCache=null, prCacheDay=null;
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
  const today=getTodayKey();
  if(!prCache||prCacheDay!==today){prCache=buildPRCache(today);prCacheDay=today;}
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
  let totalSets=0,totalVol=0;
  currentSession.exercises.forEach(ex=>ex.sets.forEach(s=>{
    const kg=parseFloat(s.kg)||0,r=parseFloat(s.reps)||0;
    if(kg>0||r>0){totalSets++;totalVol+=kg*r;}
  }));
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

// Shared exercise-card renderer used by today / backlog / detail views.
// opts: { idx, draggable, readonly, showDelete, namespace, badgeHtml, hasPRClass, flashAnimation, isPRSet }
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
  }=opts||{};
  const vol=ex.sets.reduce((sum,set)=>sum+(parseFloat(set.kg)||0)*(parseFloat(set.reps)||0),0);
  const card=document.createElement('div');
  if(readonly){
    const rows=ex.sets.map((set,i)=>{
      const setKg=parseFloat(set.kg)||0,setReps=parseFloat(set.reps)||0;
      const sv=setKg*setReps;
      const isPR=isPRSet(i,setKg,setReps);
      return `<tr${isPR?' class="pr-row"':''}><td style="color:var(--text-muted);font-family:'Space Grotesk',sans-serif;font-weight:600">${i+1}</td><td>${set.kg||'—'} kg</td><td>${set.reps||'—'}</td><td>${sv>0?Math.round(sv):'—'}</td></tr>`;
    }).join('');
    card.className='detail-ex-card'+(hasPRClass?' has-pr':'');
    const nameHtml=badgeHtml?`${escapeHtml(ex.name)} ${badgeHtml}`:escapeHtml(ex.name);
    card.innerHTML=`<div class="detail-ex-name">${nameHtml}</div>
      <table class="detail-sets-table"><thead><tr><th>#</th><th>KG</th><th>Wdh</th><th>Vol</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="detail-ex-vol">Volumen: <span>${Math.round(vol).toLocaleString('de')} kg</span></div>`;
    return card;
  }
  const updateFn=namespace==='backlog'?'updateBacklogSet':'updateSet';
  const toggleFn=namespace==='backlog'?'toggleBacklogEx':'toggleEx';
  const addSetFn=namespace==='backlog'?'addBacklogSet':'addSet';
  const removeFn=namespace==='backlog'?'removeBacklogEx':'removeEx';
  const setsRows=ex.sets.map((s,si)=>{
    const sKg=parseFloat(s.kg)||0,sR=parseFloat(s.reps)||0;
    const sv=sKg*sR;
    const isPR=isPRSet(si,sKg,sR);
    return `<tr>
      <td>${si+1}</td>
      <td><input class="set-input${isPR?' pr-value':''}" type="number" min="0" max="${KG_MAX}" step="0.5" inputmode="decimal" value="${s.kg||''}" placeholder="kg" oninput="${updateFn}(${idx},${si},'kg',this)"></td>
      <td><input class="set-input" type="number" min="0" max="${REPS_MAX}" step="1" inputmode="numeric" value="${s.reps||''}" placeholder="Wdh" oninput="${updateFn}(${idx},${si},'reps',this)"></td>
      <td class="set-vol">${sv>0?Math.round(sv):'—'}</td>
    </tr>`;
  }).join('');
  card.className='exercise-card'+(hasPRClass?' has-pr':'');
  if(draggable){card.draggable=true;card.dataset.idx=idx;}
  if(flashAnimation)card.classList.add('pr-flash');
  const dragHandle=draggable?`<span class="drag-handle" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation()">${ICONS.gripVertical}</span>`:'';
  card.innerHTML=`
    <div class="exercise-header" onclick="${toggleFn}(${idx})">
      ${dragHandle}
      <div class="exercise-name">${escapeHtml(ex.name)}</div>${badgeHtml}
      <span class="exercise-toggle${ex.open?' open':''}">${ICONS.chevronDown}</span>
    </div>
    ${ex.open?`<div class="exercise-body">
      <table class="sets-table"><thead><tr><th>#</th><th>KG</th><th>Wdh</th><th>Vol</th></tr></thead><tbody>${setsRows}</tbody></table>
      <button class="add-set-btn" onclick="${addSetFn}(${idx})">+ Satz hinzufügen</button>
      <div class="exercise-footer">
        <div><span class="vol-lbl">Volumen</span><span class="vol-val">${Math.round(vol).toLocaleString('de')} kg</span></div>
      ${showDelete?`<button class="remove-ex" onclick="${removeFn}(${idx})">Entfernen</button>`:''}
      </div>
    </div>`:''}`;
  return card;
}

function render(){
  const list=document.getElementById('exercise-list');
  list.innerHTML='';
  currentSession.exercises.forEach((ex,ei)=>{
    const pr=getExPR(ex.name);
    const todayBest=getTodayBest(ei);
    const isNewPR=todayBest&&(!pr||todayBest.kg>pr.kg||(todayBest.kg===pr.kg&&todayBest.reps>pr.reps));
    let badgeHtml;
    if(isNewPR)badgeHtml=`<span class="pr-badge new-pr">${ICONS.trophy} Neuer PR!</span>`;
    else if(pr)badgeHtml=`<span class="pr-badge has">PR: ${pr.kg}kg × ${pr.reps}</span>`;
    else badgeHtml=`<span class="pr-badge none">Kein PR</span>`;
    const card=renderExerciseCard(ex,{
      idx:ei,
      draggable:true,
      showDelete:true,
      namespace:'today',
      badgeHtml,
      hasPRClass:isNewPR,
      flashAnimation:isNewPR,
      isPRSet:(si,sKg,sR)=>sKg>0&&(!pr||sKg>pr.kg||(sKg===pr.kg&&sR>=pr.reps)),
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
  if(!currentSession.exercises.length){
    list.innerHTML=renderEmpty('dumbbell','Bereit zum Training?','Füge deine erste Übung hinzu<br>und leg los.');
  }
  updateStats();
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
  const setObj=currentSession.exercises[ei].sets[si];
  setObj[field]=val;
  scheduleSave();updateStats();
  const sv=(parseFloat(setObj.kg)||0)*(parseFloat(setObj.reps)||0);
  const cards=document.querySelectorAll('#exercise-list .exercise-card');
  if(cards[ei]){
    const rows=cards[ei].querySelectorAll('tbody tr');
    if(rows[si]){
      rows[si].querySelector('.set-vol').textContent=sv>0?Math.round(sv):'—';
      if(field==='kg'){
        const pr=getExPR(currentSession.exercises[ei].name);
        const kg=parseFloat(val)||0,reps=parseFloat(setObj.reps)||0;
        const isPR=kg>0&&(!pr||kg>pr.kg||(kg===pr.kg&&reps>=pr.reps));
        const kgInput=rows[si].querySelectorAll('.set-input')[0];
        const hadPR=kgInput.classList.contains('pr-value');
        kgInput.className='set-input'+(isPR?' pr-value':'');
        // Gold burst the moment a set first crosses the PR threshold
        if(isPR&&!hadPR&&!REDUCED_MOTION)replayAnim(cards[ei],'pr-burst');
      }
    }
  }
};
window.addSet = function(ei){currentSession.exercises[ei].sets.push({kg:'',reps:''});scheduleSave();render();}
window.removeEx = function(ei){currentSession.exercises.splice(ei,1);scheduleSave();render();}

// ── FINISH TRAINING ──
window.finishTraining = async function(){
  if(!currentSession.exercises.length)return;
  // Force immediate save
  if(saveTimer)clearTimeout(saveTimer);
  // saveSession never throws — it reports failure via return value and has
  // already set the error sync status, so just stop here on failure.
  if(!await saveSession())return;
  setSyncStatus('synced','✓ Training gespeichert!');
  setTimeout(()=>setSyncStatus('','Bereit'),3000);
  // Collapse all exercises
  currentSession.exercises.forEach(ex=>ex.open=false);
  render();
  window.scrollTo({top:0,behavior:'smooth'});
};

// ── SHARED MODAL HELPERS ──
window.openModal = function(id){document.getElementById(id).classList.add('open');};
window.closeModal = function(id){document.getElementById(id).classList.remove('open');};
window.closeModalOnOverlay = function(e,id){if(e.target===document.getElementById(id))window.closeModal(id);};

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
      const badge=isCustom?' <span style="font-size:10px;color:var(--accent)">✓ eigene</span>':'';
      let prHtml='';
      if(cfg.showPR){
        const pr=getExPR(e.name);
        const prText=pr?`PR: <span>${pr.kg}kg × ${pr.reps} Wdh</span>`:`<span style="color:var(--text-muted)">Noch kein Eintrag</span>`;
        prHtml=`<div class="exercise-option-pr">${prText}</div>`;
      }
      html+=`<div class="exercise-option${isCustom?' custom':''}" data-name="${escapeHtml(e.name)}">
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
window.addCustomExercise = async function(){
  const name=await ensureCustomExercise(document.getElementById('search').value);
  if(!name)return;
  window.addExercise(name);
};
window.addExercise = function(name){
  currentSession.exercises.push({name,open:true,sets:[{kg:'',reps:''},{kg:'',reps:''},{kg:'',reps:''}]});
  scheduleSave();render();window.closeModal('modal-overlay');
  popInLast('exercise-list');
};

// ── HISTORY ──
function renderHistory(){
  const list=document.getElementById('history-list');
  const keys=Object.keys(sessions).filter(k=>{
    if(k===getTodayKey()){
      // Show today in history only if it has exercises (training was done)
      const s=sessions[k];
      return s&&s.exercises&&s.exercises.length>0;
    }
    return true;
  }).sort((a,b)=>b.localeCompare(a));
  if(!keys.length){list.innerHTML=renderEmpty('history','Noch keine vergangenen Trainings','Trag heute dein erstes Training ein!');return;}
  list.innerHTML='';
  keys.forEach(key=>{
    const s=sessions[key];
    const d=new Date(key+'T12:00:00');
    const dayIdx=(d.getDay()+6)%7;
    let totalSets=0,totalVol=0;
    (s.exercises||[]).forEach(ex=>ex.sets.forEach(set=>{
      const kg=parseFloat(set.kg)||0,r=parseFloat(set.reps)||0;
      if(kg>0||r>0){totalSets++;totalVol+=kg*r;}
    }));
    const exNames=(s.exercises||[]).map(e=>`<span class="session-ex-pill">${escapeHtml(e.name)}</span>`).join('');
    const card=document.createElement('div');
    card.className='session-card';
    card.onclick=()=>showDetail(key);
    card.innerHTML=`
      <div class="session-card-header">
        <div class="session-date-big">${d.getDate()}</div>
        <div class="session-date-info">
          <div class="session-weekday">${DAYS_FULL[dayIdx]}</div>
          <div class="session-month">${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()} · ${months[d.getMonth()]} ${d.getFullYear()}</div>
        </div>
        <div class="session-stats">
          <div><div class="session-stat-num">${(s.exercises||[]).length}</div><div class="session-stat-lbl">Übungen</div></div>
          <div><div class="session-stat-num">${Math.round(totalVol/1000*10)/10}t</div><div class="session-stat-lbl">Volumen</div></div>
        </div>
      </div>
      ${exNames?`<div class="session-exercises-preview">${exNames}</div>`:''}`;
    list.appendChild(card);
  });
}

let currentDetailKey=null;

function showDetail(key){
  currentDetailKey=key;
  const s=sessions[key];if(!s)return;
  const d=new Date(key+'T12:00:00');
  const dayIdx=(d.getDay()+6)%7;
  document.getElementById('detail-title').textContent=DAYS_FULL[dayIdx]+', '+d.getDate()+'. '+monthsFull[d.getMonth()]+' '+d.getFullYear();
  let totalSets=0,totalVol=0;
  (s.exercises||[]).forEach(ex=>ex.sets.forEach(set=>{
    const kg=parseFloat(set.kg)||0,r=parseFloat(set.reps)||0;
    if(kg>0||r>0){totalSets++;totalVol+=kg*r;}
  }));
  document.getElementById('detail-sub').textContent=(s.exercises||[]).length+' Übungen · '+totalSets+' Sätze · '+Math.round(totalVol).toLocaleString('de')+' kg';
  document.getElementById('detail-stats').innerHTML=`
    <div class="stat-card"><div class="stat-num">${(s.exercises||[]).length}</div><div class="stat-lbl">Übungen</div></div>
    <div class="stat-card"><div class="stat-num">${totalSets}</div><div class="stat-lbl">Sätze</div></div>
    <div class="stat-card"><div class="stat-num">${Math.round(totalVol).toLocaleString('de')}</div><div class="stat-lbl">kg Total</div></div>`;
  if(!REDUCED_MOTION){
    const vals=[(s.exercises||[]).length,totalSets,Math.round(totalVol)];
    document.querySelectorAll('#detail-stats .stat-num').forEach((el,i)=>{el.dataset.val=0;countUp(el,vals[i],n=>n.toLocaleString('de'));});
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
      badgeHtml:showExPRBadge?`<span class="pr-badge new-pr">${ICONS.trophy} PR</span>`:'',
      hasPRClass:showExPRBadge,
      isPRSet:i=>i===firstMatchIndex,
    });
    exEl.appendChild(card);
  });
  document.getElementById('detail-notes-wrap').innerHTML=s.notes&&s.notes.trim()?`<div class="sec-label">Notizen</div><div class="detail-notes">${escapeHtml(s.notes)}</div>`:'';
  window.showPage('detail');
}

window.editSession = function(){
  if(!currentDetailKey||!sessions[currentDetailKey])return;
  backlogKey=currentDetailKey;
  backlogOriginalKey=currentDetailKey; // remember original date for potential date change
  backlogSession=structuredClone(sessions[currentDetailKey]);
  backlogSession.exercises.forEach(ex=>ex.open=true);
  const d=new Date(currentDetailKey+'T12:00:00');
  const dayIdx=(d.getDay()+6)%7;
  document.getElementById('backlog-date-label').textContent=DAYS_FULL[dayIdx]+', '+d.getDate()+'. '+monthsFull[d.getMonth()]+' '+d.getFullYear();
  document.getElementById('backlog-notes').value=backlogSession.notes||'';
  document.getElementById('backlog-change-date').max=getTodayKey();
  renderBacklogExercises();
  window.showPage('backlog');
};

window.deleteSession = async function(){
  if(!currentDetailKey)return;
  const d=new Date(currentDetailKey+'T12:00:00');
  const dayIdx=(d.getDay()+6)%7;
  const label=DAYS_FULL[dayIdx]+', '+d.getDate()+'. '+monthsFull[d.getMonth()]+' '+d.getFullYear();
  if(!confirm('Training vom '+label+' wirklich löschen?'))return;
  setSyncStatus('syncing','↑ Wird gelöscht…');
  try{
    await deleteDoc(doc(db,'users',currentUser.uid,'sessions',currentDetailKey));
    delete sessions[currentDetailKey];
    invalidatePRCache();
    syncTemplatesWithBests();
    // If deleting today's session, reset currentSession too
    if(currentDetailKey===getTodayKey()){
      currentSession={exercises:[],notes:''};
      document.getElementById('notes').value='';
      render();
    }
    setSyncStatus('synced','✓ Gelöscht');
    setTimeout(()=>setSyncStatus('','Bereit'),2000);
    currentDetailKey=null;
    window.showPage('history');
  }catch(e){
    console.error('deleteSession failed', e);
    setSyncStatus('error','✗ Löschen fehlgeschlagen');
    setTimeout(()=>setSyncStatus('','Bereit'),3000);
  }
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
  const today=new Date();
  const monday=getMondayOfWeek(today);const weekDays=getWeekDays(monday);
  const trained=countTrainedDays(weekDays);const goal=goals.trainDays||3;
  const pct=Math.min(100,Math.round((trained/goal)*100));const done=trained>=goal;
  const weekDotsHtml=weekDays.map((k,i)=>{
    const t=sessions[k]&&sessions[k].exercises&&sessions[k].exercises.length>0;
    const isToday=k===getTodayKey();
    return `<div style="flex:1;text-align:center"><div class="week-dot${t?' trained':''}${isToday?' today':''}" style="margin:0 auto;width:100%;max-width:38px">${DAYS[i]}</div></div>`;
  }).join('');
  document.getElementById('goals-content').innerHTML=`
    <div class="week-goal-card">
      <div class="week-goal-header">
        <div class="week-goal-icon">${ICONS.zap}</div>
        <div class="week-goal-info">
          <div class="week-goal-title">Trainingstage diese Woche</div>
          <div class="week-goal-sub">${done?ICONS.checkCircle+' Ziel erreicht!':((goal-trained)+' Tag'+(goal-trained===1?'':'e')+' noch nötig')}</div>
        </div>
        <div class="week-goal-count ${done?'done':trained>0?'progress':'zero'}">${trained}<span style="font-size:14px;color:var(--text-muted)">/${goal}</span></div>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-bg"><div class="progress-bar-fill${done?' done':''}" style="--progress:${pct}%"></div></div>
        <div class="progress-bar-label"><span>0</span><span>${goal} Tage</span></div>
      </div>
      <div class="goal-set-row">
        <div class="goal-set-label">Ziel anpassen</div>
        <div class="goal-stepper">
          <button class="goal-step-btn" onclick="changeGoal(-1)">−</button>
          <div class="goal-step-val">${goal}</div>
          <button class="goal-step-btn" onclick="changeGoal(1)">+</button>
        </div>
      </div>
    </div>
    <div class="goal-card-inner">
      <div class="goal-card-inner-label">Diese Woche</div>
      <div class="goal-card-inner-dots">${weekDotsHtml}</div>
    </div>`;
  renderWeekHistory();
}
window.changeGoal = async function(delta){
  goals.trainDays=Math.max(1,Math.min(7,(goals.trainDays||3)+delta));
  await saveGoals();renderGoals();
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
  if(!result.length){list.innerHTML=renderEmpty('target','Noch keine Daten','aus vergangenen Wochen.');return;}
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
async function syncTemplatesWithBests(){
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
  if(changed)await saveTemplates();
}

function renderTemplates(){
  const list=document.getElementById('template-list');
  if(!templates.length){list.innerHTML=renderEmpty('clipboardList','Noch keine Vorlagen','Erstelle deine erste Vorlage!');return;}
  list.innerHTML='';
  templates.forEach((tpl,ti)=>{
    const card=document.createElement('div');card.className='template-card';
    const pills=tpl.exercises.map(e=>`<span class="tpl-pill">${escapeHtml(e.name)}</span>`).join('');
    card.innerHTML=`
      <div class="template-header"><div>
        <div class="template-name">${escapeHtml(tpl.name)}</div>
        <div class="template-meta">${tpl.exercises.length} Übungen · ${tpl.exercises.reduce((s,e)=>s+e.sets.length,0)} Sätze</div>
      </div></div>
      <div class="template-ex-pills">${pills}</div>
      <div class="template-actions">
        <button class="tpl-btn import" onclick="openImportModal(${ti})">${ICONS.play} Import</button>
        <button class="tpl-btn edit" onclick="openTemplateEditor(${ti})">${ICONS.pencil} Edit</button>
        <button class="tpl-btn del" onclick="deleteTemplate(${ti})">${ICONS.x}</button>
      </div>`;
    list.appendChild(card);
  });
}
window.deleteTemplate = async function(ti){
  if(!confirm(`Vorlage "${templates[ti].name}" wirklich löschen?`))return;
  templates.splice(ti,1);await saveTemplates();renderTemplates();
};
window.openTemplateEditor = function(ti){
  if(ti===null){editingTemplate={id:Date.now(),name:'',exercises:[]};document.getElementById('tpl-editor-title').textContent='Neue Vorlage';document.getElementById('tpl-name-input').value='';}
  else{editingTemplate=structuredClone(templates[ti]);editingTemplate._editIdx=ti;document.getElementById('tpl-editor-title').textContent='Vorlage bearbeiten';document.getElementById('tpl-name-input').value=editingTemplate.name;}
  renderTplExList();window.openModal('tpl-editor-overlay');
};
function renderTplExList(){
  const list=document.getElementById('tpl-ex-list');list.innerHTML='';
  (editingTemplate.exercises||[]).forEach((ex,ei)=>{
    const div=document.createElement('div');div.className='tpl-ex-row';
    const setsHtml=ex.sets.map((s,si)=>`
      <div class="tpl-set-row">
        <div class="tpl-set-label">Satz ${si+1}</div>
        <div class="tpl-mini-inputs">
          <input class="tpl-mini-input" type="number" min="0" max="${KG_MAX}" step="0.5" inputmode="decimal" value="${s.kg||''}" placeholder="kg" oninput="updateTplSet(${ei},${si},'kg',this)">
          <input class="tpl-mini-input" type="number" min="0" max="${REPS_MAX}" step="1" inputmode="numeric" value="${s.reps||''}" placeholder="Wdh" oninput="updateTplSet(${ei},${si},'reps',this)">
        </div>
      </div>`).join('');
    div.innerHTML=`
      <div class="tpl-ex-row-header"><div class="tpl-ex-row-name">${escapeHtml(ex.name)}</div><button class="tpl-ex-remove" onclick="removeTplEx(${ei})">${ICONS.x}</button></div>
      <div class="tpl-sets-grid">${setsHtml}</div>
      <button class="tpl-add-set" onclick="addTplSet(${ei})">+ Satz</button>`;
    list.appendChild(div);
  });
}
window.updateTplSet = function(ei,si,field,input){
  const val=clampSetValue(field, input.value);
  if(val!==input.value)input.value=val;
  editingTemplate.exercises[ei].sets[si][field]=val;
}
window.addTplSet = function(ei){editingTemplate.exercises[ei].sets.push({kg:'',reps:''});renderTplExList();}
window.removeTplEx = function(ei){editingTemplate.exercises.splice(ei,1);renderTplExList();}
window.saveTemplate = async function(){
  const name=document.getElementById('tpl-name-input').value.trim();
  if(!name){alert('Bitte einen Namen eingeben.');return;}
  if(!editingTemplate.exercises.length){alert('Bitte mindestens eine Übung hinzufügen.');return;}
  editingTemplate.name=name;
  if(editingTemplate._editIdx!==undefined){templates[editingTemplate._editIdx]=editingTemplate;delete templates[editingTemplate._editIdx]._editIdx;}
  else templates.push(editingTemplate);
  await saveTemplates();editingTemplate=null;window.closeModal('tpl-editor-overlay');renderTemplates();
};
window.openTplExModal = function(){
  window.openModal('tpl-ex-modal-overlay');
  document.getElementById('tpl-search').value='';document.getElementById('tpl-custom-btn').classList.remove('visible');
  filterTplExercises();setTimeout(()=>document.getElementById('tpl-search').focus(),300);
};
window.addTplCustomExercise = async function(){
  const name=await ensureCustomExercise(document.getElementById('tpl-search').value);
  if(!name)return;
  window.addTplExercise(name);
};
window.addTplExercise = function(name){
  editingTemplate.exercises.push({name,sets:[{kg:'',reps:''},{kg:'',reps:''},{kg:'',reps:''}]});
  window.closeModal('tpl-ex-modal-overlay');renderTplExList();
};
window.openImportModal = function(ti){
  importingTemplateId=ti;
  document.getElementById('import-modal-title').textContent=`"${templates[ti].name}" importieren`;
  window.openModal('import-modal-overlay');
};
window.doImport = function(mode){
  const tpl=templates[importingTemplateId];if(!tpl)return;
  const newEx=tpl.exercises.map(e=>({name:e.name,open:true,sets:e.sets.map(s=>({kg:s.kg||'',reps:s.reps||''}))}));
  if(mode==='replace')currentSession.exercises=newEx;
  else currentSession.exercises=[...currentSession.exercises,...newEx];
  scheduleSave();importingTemplateId=null;window.closeModal('import-modal-overlay');window.showPage('today');
  animateNextStats=true;
  render();
  staggerIn('exercise-list');
};

// ── BACKLOG / VERGANGENES TRAINING ERFASSEN ──
let backlogKey = null;
let backlogOriginalKey = null; // tracks original date when editing, to delete old entry if date changes
let backlogSession = {exercises:[], notes:''};

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
  backlogKey = dateStr;
  // Track an existing entry so a later date change deletes the original instead of duplicating it
  backlogOriginalKey = sessions[dateStr] ? dateStr : null;
  backlogSession = sessions[dateStr] ? structuredClone(sessions[dateStr]) : {exercises:[], notes:''};
  const d=new Date(dateStr+'T12:00:00');
  const dayIdx=(d.getDay()+6)%7;
  document.getElementById('backlog-date-label').textContent=DAYS_FULL[dayIdx]+', '+d.getDate()+'. '+monthsFull[d.getMonth()]+' '+d.getFullYear();
  document.getElementById('backlog-notes').value=backlogSession.notes||'';
  renderBacklogExercises();
  window.showPage('backlog');
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
  backlogKey=dateStr;
  const d=new Date(dateStr+'T12:00:00');
  const dayIdx=(d.getDay()+6)%7;
  document.getElementById('backlog-date-label').textContent=DAYS_FULL[dayIdx]+', '+d.getDate()+'. '+monthsFull[d.getMonth()]+' '+d.getFullYear();
  document.getElementById('backlog-change-date').value='';
};

window.saveBacklog = async function(){
  if(!backlogKey)return;
  if(!backlogSession.exercises.length){alert('Bitte mindestens eine Übung hinzufügen.');return;}
  backlogSession.notes=document.getElementById('backlog-notes').value||'';
  setSyncStatus('syncing','↑ Wird gespeichert…');
  try{
    // If date was changed during edit, delete the old entry
    if(backlogOriginalKey&&backlogOriginalKey!==backlogKey){
      await deleteDoc(doc(db,'users',currentUser.uid,'sessions',backlogOriginalKey));
      delete sessions[backlogOriginalKey];
      if(backlogOriginalKey===getTodayKey()){
        currentSession={exercises:[],notes:''};
        document.getElementById('notes').value='';
      }
    }
    await setDoc(doc(db,'users',currentUser.uid,'sessions',backlogKey),backlogSession);
    sessions[backlogKey]=structuredClone(backlogSession);
    invalidatePRCache();
    syncTemplatesWithBests();
    // If saving to today, update currentSession too
    if(backlogKey===getTodayKey()){
      currentSession=structuredClone(backlogSession);
      document.getElementById('notes').value=currentSession.notes||'';
    }
    setSyncStatus('synced','✓ Gespeichert');
    setTimeout(()=>setSyncStatus('','Bereit'),1500);
    backlogKey=null;backlogOriginalKey=null;backlogSession={exercises:[],notes:''};
    render();
    window.showPage('history');
  }catch(e){
    console.error('saveBacklog failed', e);
    setSyncStatus('error','✗ Speichern fehlgeschlagen');
    setTimeout(()=>setSyncStatus('','Bereit'),3000);
  }
};

function renderBacklogExercises(){
  const list=document.getElementById('backlog-exercise-list');
  list.innerHTML='';
  backlogSession.exercises.forEach((ex,ei)=>{
    const card=renderExerciseCard(ex,{
      idx:ei,
      showDelete:true,
      namespace:'backlog',
    });
    list.appendChild(card);
  });
  if(!backlogSession.exercises.length){
    list.innerHTML=renderEmpty('calendar','Training hinzufügen','Füge Übungen für dieses<br>vergangene Training hinzu.');
  }
}

window.toggleBacklogEx=function(i){backlogSession.exercises[i].open=!backlogSession.exercises[i].open;renderBacklogExercises();};
window.updateBacklogSet=function(ei,si,field,input){
  const val=clampSetValue(field, input.value);
  if(val!==input.value)input.value=val;
  backlogSession.exercises[ei].sets[si][field]=val;
};
window.addBacklogSet=function(ei){backlogSession.exercises[ei].sets.push({kg:'',reps:''});renderBacklogExercises();};
window.removeBacklogEx=function(ei){backlogSession.exercises.splice(ei,1);renderBacklogExercises();};

// Backlog exercise modal
window.openBacklogExModal=function(){
  window.openModal('backlog-ex-modal-overlay');
  document.getElementById('backlog-search').value='';
  document.getElementById('backlog-custom-btn').classList.remove('visible');
  filterBacklogExercises();
  setTimeout(()=>document.getElementById('backlog-search').focus(),300);
};
window.addBacklogCustomExercise=async function(){
  const name=await ensureCustomExercise(document.getElementById('backlog-search').value);
  if(!name)return;
  window.addBacklogExercise(name);
};
window.addBacklogExercise=function(name){
  backlogSession.exercises.push({name,open:true,sets:[{kg:'',reps:''},{kg:'',reps:''},{kg:'',reps:''}]});
  window.closeModal('backlog-ex-modal-overlay');renderBacklogExercises();
  popInLast('backlog-exercise-list');
};

// ── PROGRESS ──
function renderProgress(){
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
  return {grid:v('--border'),text:v('--text-muted'),line:v('--accent'),fillTop:v('--accent-glow'),last:v('--gold')};
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
  const dpr=window.devicePixelRatio||1;
  canvas.width=canvas.offsetWidth*dpr;
  canvas.height=canvas.offsetHeight*dpr;
  ctx.scale(dpr,dpr);
  const W=canvas.offsetWidth,H=canvas.offsetHeight;
  ctx.clearRect(0,0,W,H);

  if(!name){canvas.style.display='none';emptyMsg.style.display='block';return;}
  canvas.style.display='block';emptyMsg.style.display='none';

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
    ctx.fillStyle=col.text;ctx.font='13px DM Sans';
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
      ctx.fillStyle=col.text;ctx.font='11px Space Grotesk';ctx.textAlign='right';
      ctx.fillText(val+'kg',pad.left-8,y+4);
    }

    // X-labels
    const labelCount=Math.min(points.length,5);
    const step=Math.floor(points.length/labelCount);
    for(let i=0;i<points.length;i+=step){
      const x=pad.left+(cW/(points.length-1))*i;
      const d=points[i].date.slice(5).replace('-','.');
      ctx.fillStyle=col.text;ctx.font='10px Space Grotesk';ctx.textAlign='center';
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

    // Dots — the most recent entry is highlighted in gold
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

