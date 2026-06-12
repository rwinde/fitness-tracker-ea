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
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙';
}
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
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('app-controls').style.display = 'flex';
    await loadAllData();
    initUI();
  } else {
    currentUser = null;
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('app-controls').style.display = 'none';
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

// ── UI INIT ──
function initUI() {
  const today = new Date();
  const firstName = (currentUser.displayName||currentUser.email||'').split('@')[0];
  document.getElementById('user-name').textContent = firstName;
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
  render();
}

// ── PAGE NAV ──
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const navId = name==='detail'?'nav-history':('nav-'+name);
  const navEl = document.getElementById(navId);
  if(navEl) navEl.classList.add('active');
  if(name==='history') renderHistory();
  if(name==='templates') renderTemplates();
  if(name==='goals') renderGoals();
  if(name==='progress') renderProgress();
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

function updateStats(){
  let totalSets=0,totalVol=0;
  currentSession.exercises.forEach(ex=>ex.sets.forEach(s=>{
    const kg=parseFloat(s.kg)||0,r=parseFloat(s.reps)||0;
    if(kg>0||r>0){totalSets++;totalVol+=kg*r;}
  }));
  document.getElementById('stat-ex').textContent=currentSession.exercises.length;
  document.getElementById('stat-sets').textContent=totalSets;
  document.getElementById('stat-vol').textContent=Math.round(totalVol).toLocaleString('de');
  const fb=document.getElementById('finish-btn');
  if(fb){
    const hasExercises=currentSession.exercises.length>0;
    fb.disabled=!hasExercises;
    fb.classList.toggle('disabled',!hasExercises);
  }
}

// Shared empty-state HTML — emoji + title + optional subtitle.
function renderEmpty(emoji,title,sub){
  return `<div class="empty-state">
    <div class="empty-state-icon">${emoji}</div>
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
  const dragHandle=draggable?`<span class="drag-handle" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation()">⠿</span>`:'';
  card.innerHTML=`
    <div class="exercise-header" onclick="${toggleFn}(${idx})">
      ${dragHandle}
      <div class="exercise-name">${escapeHtml(ex.name)}</div>${badgeHtml}
      <span class="exercise-toggle${ex.open?' open':''}">▾</span>
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
    if(isNewPR)badgeHtml=`<span class="pr-badge new-pr">🏆 Neuer PR!</span>`;
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
    list.innerHTML=renderEmpty('💪','Bereit zum Training?','Füge deine erste Übung hinzu<br>und leg los.');
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
        rows[si].querySelectorAll('.set-input')[0].className='set-input'+(isPR?' pr-value':'');
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
window.filterExercises = function(){
  const q=document.getElementById('search').value.trim(),ql=q.toLowerCase();
  const all=allExercises();
  const filtered=q?all.filter(e=>e.name.toLowerCase().includes(ql)||e.muscle.toLowerCase().includes(ql)):all;
  const exactMatch=all.some(e=>e.name.toLowerCase()===ql);
  const btn=document.getElementById('custom-btn');
  if(q&&!exactMatch){btn.textContent=`"${q}" neu`;btn.classList.add('visible');}
  else btn.classList.remove('visible');
  const opts=document.getElementById('exercise-options');
  if(!filtered.length){opts.innerHTML=`<div class="no-results">Keine Übung gefunden — oben als neue hinzufügen.</div>`;return;}
  const grouped={};
  filtered.forEach(e=>{if(!grouped[e.muscle])grouped[e.muscle]=[];grouped[e.muscle].push(e);});
  let html='';
  Object.entries(grouped).forEach(([muscle,exs])=>{
    if(Object.keys(grouped).length>1)html+=`<div class="muscle-label">${muscle}</div>`;
    exs.forEach(e=>{
      const pr=getExPR(e.name);
      const isCustom=e.muscle==='Eigene';
      const prText=pr?`PR: <span>${pr.kg}kg × ${pr.reps} Wdh</span>`:`<span style="color:var(--text-muted)">Noch kein Eintrag</span>`;
      html+=`<div class="exercise-option${isCustom?' custom':''}" data-name="${escapeHtml(e.name)}">
        <div class="exercise-option-name">${escapeHtml(e.name)}${isCustom?' <span style="font-size:10px;color:var(--accent)">✓ eigene</span>':''}</div>
        <div class="exercise-option-pr">${prText}</div>
      </div>`;
    });
  });
  opts.innerHTML=html;
};
window.addCustomExercise = async function(){
  const name=await ensureCustomExercise(document.getElementById('search').value);
  if(!name)return;
  window.addExercise(name);
};
window.addExercise = function(name){
  currentSession.exercises.push({name,open:true,sets:[{kg:'',reps:''},{kg:'',reps:''},{kg:'',reps:''}]});
  scheduleSave();render();window.closeModal('modal-overlay');
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
  if(!keys.length){list.innerHTML=renderEmpty('🕘','Noch keine vergangenen Trainings','Trag heute dein erstes Training ein!');return;}
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
  const exEl=document.getElementById('detail-exercises');exEl.innerHTML='';
  const standingPRs=getStandingPRs();
  (s.exercises||[]).forEach(ex=>{
    const exNameLower=(ex.name||'').trim().toLowerCase();
    const standing=standingPRs.get(exNameLower);
    const isExPR=!!(standing&&standing.dateKey===key);
    // Find the FIRST set that matches the standing PR + count total matches.
    // Only the first match gets .pr-row; the 🏆 badge appears only when the
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
      badgeHtml:showExPRBadge?`<span class="pr-badge new-pr">🏆 PR</span>`:'',
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
  const dayNames=['Mo','Di','Mi','Do','Fr','Sa','So'];
  const weekDotsHtml=weekDays.map((k,i)=>{
    const t=sessions[k]&&sessions[k].exercises&&sessions[k].exercises.length>0;
    const isToday=k===getTodayKey();
    return `<div style="flex:1;text-align:center"><div class="week-dot${t?' trained':''}${isToday?' today':''}" style="margin:0 auto;width:100%;max-width:38px">${dayNames[i]}</div></div>`;
  }).join('');
  document.getElementById('goals-content').innerHTML=`
    <div class="week-goal-card">
      <div class="week-goal-header">
        <div class="week-goal-icon">⚡</div>
        <div class="week-goal-info">
          <div class="week-goal-title">Trainingstage diese Woche</div>
          <div class="week-goal-sub">${done?'✓ Ziel erreicht!':((goal-trained)+' Tag'+(goal-trained===1?'':'e')+' noch nötig')}</div>
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
  const goal=goals.trainDays||3;const dayNames=['Mo','Di','Mi','Do','Fr','Sa','So'];
  if(!result.length){list.innerHTML=renderEmpty('🎯','Noch keine Daten','aus vergangenen Wochen.');return;}
  list.innerHTML=result.map(({monday,weekDays,trained})=>{
    const label=monday.getDate()+'.'+(monday.getMonth()+1)+'.';
    const dots=weekDays.map((k,i)=>{const t=sessions[k]&&sessions[k].exercises&&sessions[k].exercises.length>0;return `<div class="week-dot${t?' trained':''}">${dayNames[i]}</div>`;}).join('');
    const hit=trained>=goal;
    return `<div class="week-row"><div class="week-row-label">Ab ${label}</div><div class="week-row-dots">${dots}</div><div class="week-row-result ${hit?'hit':'miss'}">${trained}/${goal}</div></div>`;
  }).join('');
}

// ── TEMPLATES ──
function renderTemplates(){
  const list=document.getElementById('template-list');
  if(!templates.length){list.innerHTML=renderEmpty('📋','Noch keine Vorlagen','Erstelle deine erste Vorlage!');return;}
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
        <button class="tpl-btn import" onclick="openImportModal(${ti})">▶ Import</button>
        <button class="tpl-btn edit" onclick="openTemplateEditor(${ti})">✎ Edit</button>
        <button class="tpl-btn del" onclick="deleteTemplate(${ti})">✕</button>
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
      <div class="tpl-ex-row-header"><div class="tpl-ex-row-name">${escapeHtml(ex.name)}</div><button class="tpl-ex-remove" onclick="removeTplEx(${ei})">✕</button></div>
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
window.filterTplExercises = function(){
  const q=document.getElementById('tpl-search').value.trim(),ql=q.toLowerCase();
  const all=allExercises();const filtered=q?all.filter(e=>e.name.toLowerCase().includes(ql)):all;
  const exactMatch=all.some(e=>e.name.toLowerCase()===ql);
  const btn=document.getElementById('tpl-custom-btn');
  if(q&&!exactMatch){btn.textContent=`"${q}" neu`;btn.classList.add('visible');}
  else btn.classList.remove('visible');
  const opts=document.getElementById('tpl-exercise-options');
  if(!filtered.length){opts.innerHTML=`<div class="no-results">Keine Übung gefunden.</div>`;return;}
  const grouped={};filtered.forEach(e=>{if(!grouped[e.muscle])grouped[e.muscle]=[];grouped[e.muscle].push(e);});
  let html='';
  Object.entries(grouped).forEach(([muscle,exs])=>{
    if(Object.keys(grouped).length>1)html+=`<div class="muscle-label">${muscle}</div>`;
    exs.forEach(e=>{html+=`<div class="exercise-option" data-name="${escapeHtml(e.name)}"><div class="exercise-option-name">${escapeHtml(e.name)}</div></div>`;});
  });
  opts.innerHTML=html;
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
  scheduleSave();importingTemplateId=null;window.closeModal('import-modal-overlay');window.showPage('today');render();
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
    list.innerHTML=renderEmpty('📅','Training hinzufügen','Füge Übungen für dieses<br>vergangene Training hinzu.');
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
window.filterBacklogExercises=function(){
  const q=document.getElementById('backlog-search').value.trim(),ql=q.toLowerCase();
  const all=allExercises();
  const filtered=q?all.filter(e=>e.name.toLowerCase().includes(ql)||e.muscle.toLowerCase().includes(ql)):all;
  const exactMatch=all.some(e=>e.name.toLowerCase()===ql);
  const btn=document.getElementById('backlog-custom-btn');
  if(q&&!exactMatch){btn.textContent=`"${q}" neu`;btn.classList.add('visible');}
  else btn.classList.remove('visible');
  const opts=document.getElementById('backlog-exercise-options');
  if(!filtered.length){opts.innerHTML=`<div class="no-results">Keine Übung gefunden — oben als neue hinzufügen.</div>`;return;}
  const grouped={};
  filtered.forEach(e=>{if(!grouped[e.muscle])grouped[e.muscle]=[];grouped[e.muscle].push(e);});
  let html='';
  Object.entries(grouped).forEach(([muscle,exs])=>{
    if(Object.keys(grouped).length>1)html+=`<div class="muscle-label">${muscle}</div>`;
    exs.forEach(e=>{
      const isCustom=e.muscle==='Eigene';
      html+=`<div class="exercise-option${isCustom?' custom':''}" data-name="${escapeHtml(e.name)}">
        <div class="exercise-option-name">${escapeHtml(e.name)}${isCustom?' <span style="font-size:10px;color:var(--accent)">✓ eigene</span>':''}</div>
      </div>`;
    });
  });
  opts.innerHTML=html;
};
window.addBacklogCustomExercise=async function(){
  const name=await ensureCustomExercise(document.getElementById('backlog-search').value);
  if(!name)return;
  window.addBacklogExercise(name);
};
window.addBacklogExercise=function(name){
  backlogSession.exercises.push({name,open:true,sets:[{kg:'',reps:''},{kg:'',reps:''},{kg:'',reps:''}]});
  window.closeModal('backlog-ex-modal-overlay');renderBacklogExercises();
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
    const prSuffix=hasPR&&prNames&&prNames.length?' · 🏆 PR ('+prNames.join(', ')+')':'';
    cell.title=day+'. '+months[month]+' '+year+(exCount?' — '+exCount+' Übungen'+prSuffix:' — kein Training');
    if(hasPR||exCount>0){
      cell.addEventListener('click',()=>showDetail(key));
    }
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
      cell.title=day+'. '+months[m]+' '+year+(exCount?' — '+exCount+' Übungen'+(hasPR?' · 🏆 PR':''):'');
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

window.renderProgressChart = function(){
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

