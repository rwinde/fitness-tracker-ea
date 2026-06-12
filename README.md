# Fitness Tracker

Ein mobiler Fitness-/Krafttraining-Tracker als Progressive Web App: Trainings­einheiten mit Übungen, Sätzen (kg × Wiederholungen) und Notizen erfassen, Vorlagen verwalten, Wochenziele verfolgen und Fortschritt (PRs, Heatmap, Gewichtsentwicklung) auswerten. Anmeldung per Google-Konto, Daten liegen in Firebase.

## Architektur

Bewusst minimal gehalten — **kein Build-Schritt, keine Abhängigkeiten außer Firebase** (per CDN als ES-Module):

| Datei | Inhalt |
|---|---|
| `index.html` | Markup aller Seiten und Modals, lädt Fonts und `app.js` |
| `app.js` | Gesamte Anwendungslogik (Auth, Firestore, Rendering, Seiten) |
| `styles.css` | Alle Styles inkl. Light-/Dark-Theme über CSS-Variablen |
| `hero.jpg`, `icon.png` | Statische Assets |

Die App ist eine klassische Single-Page-App: Seiten sind `<div class="page">`-Container, `showPage(name)` blendet sie um. Interaktive Elemente rufen globale `window.*`-Funktionen über Inline-Handler auf.

### Datenmodell (Firestore)

```
users/{uid}/
├── sessions/{YYYY-MM-DD}     # eine Trainingseinheit pro Tag
│     { exercises: [{name, open, sets: [{kg, reps}]}], notes }
└── data/
    ├── templates             # { list: [{id, name, exercises}] }
    ├── custom                # { list: ["Eigene Übung", …] }
    └── goals                 # { trainDays }
```

Datums-Keys werden immer in **lokaler Zeitzone** gebildet (`localDateKey`), um UTC-Verschiebungen zu vermeiden. Offline-Persistenz (`persistentLocalCache`) ist aktiviert: Die App funktioniert ohne Netz weiter und synchronisiert, sobald wieder Verbindung besteht.

### Sicherheit

Der Firebase-Web-API-Key in `app.js` ist **kein Geheimnis** — er identifiziert nur das Projekt. Der Zugriffsschutz läuft über Firebase Authentication plus Firestore Security Rules, die in der Firebase-Konsole so konfiguriert sein müssen, dass jeder Nutzer ausschließlich `users/{eigene uid}/**` lesen/schreiben darf. Alle nutzergenerierten Strings werden vor dem Einfügen in `innerHTML` mit `escapeHtml` maskiert.

## Entwicklung

Lokal genügt ein statischer Server (ES-Module funktionieren nicht über `file://`):

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Google-Login erfordert, dass die Domain in Firebase Auth unter „Authorized domains" eingetragen ist (`localhost` ist standardmäßig erlaubt).

### Versionierung / Cache-Busting

Bei **jeder Änderung an `app.js` oder `styles.css`** muss die Version an drei Stellen in `index.html` erhöht werden, sonst liefern Browser-Caches alte Assets aus:

1. `var APP_VERSION='vX.Y.Z'` im `<head>`
2. `<link rel="stylesheet" href="styles.css?v=vX.Y.Z">`
3. `<script type="module" src="app.js?v=vX.Y.Z">`

Konvention der Commit-Historie: `fix`/`feat`/`refactor vX.Y.Z — Beschreibung`.

## Deployment

Beliebiges statisches Hosting (z.B. Firebase Hosting, GitHub Pages, Netlify) — einfach den Repo-Inhalt ausliefern. Danach die Hosting-Domain in Firebase Auth autorisieren.
