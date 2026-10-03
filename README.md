# Fitness Tracker

Ein mobiler Fitness-/Krafttraining-Tracker als Progressive Web App: Trainings­einheiten mit Übungen, Sätzen (kg × Wiederholungen) und Notizen erfassen, Vorlagen verwalten, Wochenziele verfolgen und Fortschritt (PRs, Heatmap, Gewichtsentwicklung) auswerten. Anmeldung per Google-Konto, Daten liegen in Firebase.

**Bedienung in Kürze:** Ein leerer Tag zeigt auf „Heute“ den Wochenfortschritt und die Startoptionen: Vorlage starten, letztes Training wiederholen, ein früheres Training aus dem Verlauf kopieren oder leer starten. Vorlagen und Kopien übernehmen die Werte (kg/Wdh); ist der Tag schon befüllt, fragt die App „Hinzufügen“ oder „Ersetzen“. Eine einzeln hinzugefügte Übung startet mit so vielen Sätzen wie beim letzten Mal (nur Sätze mit Werten zählen, sonst 2), die alten Werte stehen als Platzhalter in den leeren Feldern. Jeder Satz lässt sich per × löschen. Ein Tipp auf eine Vorlage zeigt sie an; Starten, Bearbeiten und Löschen gehen von dort. Gespeichert wird automatisch; die Leiste unten zeigt den Status, „Speichern“ sichert sofort. Darstellung: Auto (System), Hell oder Dunkel im Profilmenü.

## Architektur

Bewusst minimal gehalten — **kein Build-Schritt, keine Abhängigkeiten außer Firebase** (per CDN als ES-Module):

| Datei | Inhalt |
|---|---|
| `index.html` | Markup aller Seiten und Modals, lädt Fonts und `app.js` |
| `app.js` | Gesamte Anwendungslogik (Auth, Firestore, Rendering, Seiten) |
| `styles.css` | Alle Styles inkl. Light-/Dark-Theme über CSS-Variablen |
| `sw.js` | Service Worker: App-Shell-Cache für Offline-Neustarts |
| `icon.png` | App-Icon (Homescreen, Login) |
| `favicon.svg`, `favicon.png` | Browser-Favicon (PNG für Browser ohne SVG-Favicons) |
| `tests/regression.cjs` | Regressionstests (Node, ohne Abhängigkeiten) |

Die App ist eine klassische Single-Page-App: Seiten sind `<div class="page">`-Container, `showPage(name)` blendet sie um. Interaktive Elemente rufen globale `window.*`-Funktionen über Inline-Handler auf.

### Datenmodell (Firestore)

```
users/{uid}/
├── sessions/{YYYY-MM-DD}     # eine Trainingseinheit pro Tag
│     { exercises: [{name, open, sets: [{kg, reps}]}], notes, writer }
└── data/
    ├── templates             # { list: [{id, name, exercises}], writer }
    ├── custom                # { list: ["Eigene Übung", …], writer }
    └── goals                 # { trainDays, writer }
```

`writer` ist eine zufällige ID pro Tab (`CLIENT_ID`) und kennzeichnet, wer zuletzt geschrieben hat.

Datums-Keys werden immer in **lokaler Zeitzone** gebildet (`localDateKey`), um UTC-Verschiebungen zu vermeiden. Offline-Persistenz (`persistentLocalCache`) ist aktiviert: Die App funktioniert ohne Netz weiter und synchronisiert, sobald wieder Verbindung besteht. Die Oberfläche wartet nie auf die Serverbestätigung: Der lokale Zustand wird sofort aktualisiert, die Sync-Leiste zeigt „ausstehend / gespeichert / fehlgeschlagen“, und Fehler erscheinen zusätzlich als Toast auf jeder Seite. Nur die Editoren (Vorlage, vergangenes Training) warten kurz (`ACK_WAIT_MS`), damit eine sofortige Ablehnung den Entwurf offen lässt. Wird in dieser Zeit weiter eingegeben, bleibt der Editor danach mit den neueren Werten offen; erneutes Speichern (auch ein Doppeltipp) gilt nicht als Konflikt. Kommt die Ablehnung erst, nachdem der Editor geschlossen wurde, öffnet er sich wieder mit dem Entwurf. Ist bei einem vergangenen Training inzwischen ein anderes offen, wird der abgelehnte Entwurf beim nächsten Öffnen seines Datums angeboten; für Vorlagen gibt es diese Ablage nicht. Diese Entwürfe liegen nur im Speicher: Ein Reload vor einer späten Ablehnung verliert sie.

**Live-Sync:** Nach dem initialen Laden halten Snapshot-Listener den Speicher aktuell, wenn ein anderer Tab oder ein anderes Gerät schreibt — auch der erste Snapshot zählt, er kann Änderungen seit dem Laden enthalten. Eigene Echos werden über `writer` erkannt, echte Inhaltsänderungen über einen Fingerabdruck (`stamp`). Hat der Tab ungespeicherte Änderungen am offenen Training, fragt die App, welche Version gewinnt. Die Editoren für Vorlagen und vergangene Trainings merken sich beim Öffnen den gespeicherten Stand und fragen vor dem Speichern nach, falls er sich inzwischen anderswo geändert hat. Die Prüfung kennt nur Änderungen, die schon angekommen sind: Bleiben zwei Geräte gleichzeitig offline, oder speichern beide online innerhalb der kurzen Zustellverzögerung, gewinnt der zuletzt synchronisierte Stand. Ein echter Schutz bräuchte eine serverseitige Revisionsprüfung (Transaktion, die offline nicht funktioniert, oder Security Rules) und ist bewusst nicht umgesetzt.

**Offenes Training und Mitternacht:** Das offene Training bleibt an seinen Starttag gebunden (`currentKey`), auch wenn es über Mitternacht läuft. Der neue Tag beginnt, wenn die App an einem späteren Tag wieder in den Vordergrund kommt und das Training seit `ROLLOVER_IDLE_MS` (2 h) nicht bearbeitet wurde.

**Kontowechsel:** Bei jedem Auth-Wechsel wird der gesamte kontobezogene Zustand verworfen und die Oberfläche sofort ausgeblendet (auch beim direkten Wechsel A → B). Schlägt das initiale Laden fehl, bleibt die App mit „Erneut versuchen / Abmelden“ gesperrt. Geschrieben wird nur, wenn die Daten des aktuellen Kontos geladen sind (`activeUid`).

**Vorlagen spiegeln automatisch den Allzeit-Bestwert:** Nach jedem gespeicherten Training (auch nachgetragenen) werden alle Sätze jeder Vorlagen-Übung mit dem schwersten je geloggten Satz dieser Übung überschrieben (kg + dessen Wiederholungen, `syncTemplatesWithBests` in `app.js`). Der Bestwert gewinnt dabei immer — auch über manuell in der Vorlage eingetragene Werte. Übungen ohne Trainingshistorie behalten ihre gespeicherten Werte.

### Sicherheit

Der Firebase-Web-API-Key in `app.js` ist **kein Geheimnis** — er identifiziert nur das Projekt. Der Zugriffsschutz läuft über Firebase Authentication plus Firestore Security Rules, die in der Firebase-Konsole so konfiguriert sein müssen, dass jeder Nutzer ausschließlich `users/{eigene uid}/**` lesen/schreiben darf. Alle nutzergenerierten Werte (auch Zahlenfelder) werden vor dem Einfügen in `innerHTML` mit `escapeHtml` maskiert. Zusätzlich werden Firestore-Dokumente beim Laden normalisiert (`cleanExercises`, `apply*`): Arrays werden geprüft, kg/Wdh werden auf reine Zahlen-Strings reduziert.

Offen bzw. nur in der Firebase-Konsole lösbar: Die Security Rules sind nicht im Repo versioniert, und der lokale Firestore-Cache wird beim Abmelden nicht gelöscht (relevant auf geteilten Geräten).

## Entwicklung

Lokal genügt ein statischer Server (ES-Module funktionieren nicht über `file://`):

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Tests (laden das echte `app.js` in eine Node-VM, Firebase und Browser-APIs sind gemockt):

```bash
node tests/regression.cjs
```

Google-Login erfordert, dass die Domain in Firebase Auth unter „Authorized domains" eingetragen ist (`localhost` ist standardmäßig erlaubt).

### Versionierung / Cache-Busting

Bei **jeder Änderung an `app.js` oder `styles.css`** muss die Version an drei Stellen in `index.html` erhöht werden, sonst liefern Browser-Caches alte Assets aus:

1. `var APP_VERSION='vX.Y.Z'` im `<head>`
2. `<link rel="stylesheet" href="styles.css?v=vX.Y.Z">`
3. `<script type="module" src="app.js?v=vX.Y.Z">`

Der Service Worker (`sw.js`) lädt App-Dateien **network-first**: Online kommt immer der aktuelle Stand, der Cache dient nur als Offline-Fallback. Ein Offline-Neustart klappt ab dem zweiten Online-Start nach der Installation.

Konvention der Commit-Historie: `fix`/`feat`/`refactor vX.Y.Z — Beschreibung`.

## Deployment

Beliebiges statisches Hosting (z.B. Firebase Hosting, GitHub Pages, Netlify) — einfach den Repo-Inhalt ausliefern. Danach die Hosting-Domain in Firebase Auth autorisieren.
