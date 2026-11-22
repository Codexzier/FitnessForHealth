# FitnessForHealth

Selbst gehostete Webanwendung zum Einrichten und Durchführen von Workouts und Stretching-Einheiten.
Läuft als ein einziger Docker-Container im Heimnetz und wird im Browser auf Smartphone und PC genutzt.

- **Backend:** Node.js + TypeScript (Fastify), REST-API, SQLite (better-sqlite3)
- **Frontend:** React + Vite + TypeScript, wird vom Backend als statische Dateien ausgeliefert
- **Daten:** Datenbank und Bilder liegen unter `/data` im Container (per Volume nach `./data` gemappt)

> **ESP32-C6-Variante:** Eine schlanke Version für einen Benutzer ohne Bilder läuft direkt auf einem
> ESP32-C6 im WLAN, ganz ohne Server. Anleitung: [esp32/README.md](esp32/README.md).

## Schnellstart

Voraussetzung: Docker mit Compose-Plugin.

```bash
git clone <repo-url> FitnessForHealth
cd FitnessForHealth
docker compose up -d --build
```

Danach im Browser öffnen: `http://<IP-des-Servers>:8095`

Beim ersten Start wird die Datenbank automatisch angelegt. Auf der Startseite legst du mit
„Benutzer hinzufügen“ den ersten Benutzer an.

### Port ändern

Der Port ist über die Umgebungsvariable `PORT` einstellbar (Standard `8095`), z. B. per `.env`-Datei
neben der `docker-compose.yml`:

```dotenv
PORT=9000
```

oder einmalig:

```bash
PORT=9000 docker compose up -d
```

### Weitere Umgebungsvariablen

| Variable     | Standard               | Bedeutung                                           |
| ------------ | ---------------------- | --------------------------------------------------- |
| `PORT`       | `8095`                 | Port des Webservers                                 |
| `DATA_DIR`   | `/data`                | Ablage von Datenbank (`fitness.db`) und `images/`   |
| `TZ`         | `Europe/Berlin`        | Zeitzone des Containers (nur für Logs relevant)     |
| `LOG_LEVEL`  | `warn`                 | `info` protokolliert zusätzlich jede Anfrage        |

## Aktualisieren

```bash
git pull
docker compose up -d --build
```

Die Daten in `./data` bleiben erhalten. Datenbank-Migrationen laufen beim Start automatisch.

## Daten sichern

Alle Daten liegen im Ordner `./data` neben der `docker-compose.yml`:

- `fitness.db` (+ `fitness.db-wal`, `fitness.db-shm`) – die SQLite-Datenbank
- `images/` – die verkleinerten Übungsbilder

**Sicherung (empfohlen, konsistent):** Container kurz stoppen, Ordner archivieren, wieder starten.

```bash
docker compose stop
tar czf fitness-backup-$(date +%F).tar.gz data
docker compose start
```

**Wiederherstellen:**

```bash
docker compose down
rm -rf data
tar xzf fitness-backup-JJJJ-MM-TT.tar.gz
docker compose up -d
```

Zusätzlich kann jeder Benutzer in der App über das Menü seine Workouts & Stretchings sowie seinen
Fortschritt als JSON-Datei exportieren und wieder importieren.

## Bedienung

- **Startseite:** Benutzer auswählen und Passwort eingeben, oder „Benutzer hinzufügen“.
- **Übersicht:** alle Workouts und Stretchings mit „Starten“ und „Bearbeiten“. Oben rechts „+“ für
  „Neues Workout“ / „Neues Stretching“, oben links das Menü.
- **Editoren:** Übungen können direkt aus der Liste ausgewählt oder neu angelegt werden. Die
  Reihenfolge ändert sich am PC per Drag & Drop (Griff ⋮⋮) oder überall mit den Pfeil-Buttons.

### Teilen

Im Workout- bzw. Stretching-Editor legt „Für alle Benutzer verfügbar“ fest, ob andere Benutzer die
Einheit sehen. Sie können sie starten und mit „Kopieren“ als eigene Kopie übernehmen (inklusive
der Übungen und Bilder). Bearbeiten kann nur der Besitzer.

### Einstellungen

Über das Menü → „Einstellungen“: Name ändern, Profilbild (wird in der Benutzerauswahl angezeigt),
Farbschema (Grün ist Standard, dazu Ozean, Sonnenuntergang, Lavendel, Kirsche) und
Hell/Dunkel/Wie System, Passwort ändern (andere angemeldete Geräte werden dabei abgemeldet) sowie
eigene Aktivitäten (z. B. Radfahren, Schwimmen) verwalten. „Laufen“ ist für jeden Benutzer
bereits angelegt.

### Trainingsplan

Über das Menü → „Trainingspläne“ oder „+“ → „Neuer Trainingsplan“:

- **Name, Anzahl Wochen, Startdatum.** Genau ein Plan ist „aktiv“; sein heutiger Tag erscheint
  oben in der Übersicht.
- **Plan empfehlen:** Trainingstage pro Woche, Schwerpunkt (Ausgewogen, Ausdauer, Kraft,
  Beweglichkeit) und Dauer fürs Laufen wählen. Die App verteilt Laufen, deine Workouts und
  Stretchings gleichmäßig auf die Woche. Danach ist alles frei anpassbar.
- **Wochenmuster:** Für jeden Wochentag beliebig viele Einträge: Aktivität (mit optionalem Ziel
  als Dauer oder Strecke), Workout oder Stretching, jeweils fest oder „nach Wahl“. Tage ohne
  Eintrag sind Ruhetage.
- **Abweichungen:** Im Reiter einer Woche lässt sich jeder Tag „für diese Woche anpassen“.
- **Am Trainingstag:** Aktivitäten werden mit „Bestätigen“ abgehakt (optional mit Dauer, Strecke
  und Bewertung; der Eintrag erscheint im Fitness-Verlauf). Workouts und Stretchings werden mit
  „Starten“ durchgeführt und nach dem Abschluss automatisch abgehakt. Erledigtes zeigt einen
  grünen Haken; vergangene Tage lassen sich nachtragen, ein Haken kann rückgängig gemacht werden.

Trainingspläne sind (noch) nicht Teil des JSON-Exports; die Sicherung des `data`-Ordners enthält
sie.

### Ablauf eines Workouts

Für jede Runde werden die Einträge der Reihe nach abgearbeitet, jeder Eintrag mit all seinen
Sätzen direkt hintereinander (Zirkel):

1. 5-Sekunden-Countdown „Gleich geht's los“ (Piepton jede Sekunde, höherer langer Ton zum Start)
2. Übung: Zeit läuft herunter (Piepton in den letzten 5 Sekunden) bzw. Wiederholungen + „Next“
3. Pause zwischen Übungen (auch zwischen den Sätzen eines Eintrags); am Rundenende stattdessen
   die Pause zwischen Runden. Pausen mit 0 Sekunden entfallen, nach dem letzten Satz gibt es keine.

„Überspringen“ springt während Countdown oder Übung zur nächsten Pause bzw. Übung, während einer
Pause direkt zum nächsten Countdown. Die angezeigte Gesamtdauer zählt Pausen über den
„Pause“-Button nicht mit.

### Hinweise zu Ton und Bildschirm

- Pieptöne werden per Web Audio API erzeugt. Sie werden beim Tippen auf „Start“ freigeschaltet.
  Auf dem iPhone muss der Stummschalter aus sein.
- Die **Screen Wake Lock API** funktioniert nur in sicheren Kontexten (**HTTPS** oder `localhost`).
  Wird die App im Heimnetz über `http://` geöffnet, nutzt sie eine Ausweichlösung (stummes Video)
  und zeigt einen Hinweis. Für zuverlässiges Wachhalten die App hinter einen Reverse-Proxy mit
  HTTPS stellen (z. B. Caddy, Traefik, Nginx Proxy Manager) oder die automatische Bildschirmsperre
  am Gerät abschalten.
- Der Timer rechnet mit Zeitstempeln. War der Tab kurz im Hintergrund, stimmt die Zeit danach
  trotzdem; verpasste Pieptöne werden nicht nachgeholt.

## Import / Export

Das Format ist JSON mit Versionsnummer (`"version": 1`):

- **Workouts & Stretching** (`"format": "fitnessforhealth-plans"`): Übungen, Stretching-Übungen
  (Bilder als Base64-Data-URL), Workouts und Stretchings. Verweise laufen über `key`.
- **Fortschritt** (`"format": "fitnessforhealth-progress"`): alle Ausführungen des Benutzers.

Beim Import wird die Datei geprüft und eine Vorschau angezeigt. Bei gleichnamigen Einträgen wählst
du „Überschreiben“ oder „Als Kopie“ (Name wird zu „Name (Kopie)“). Fortschritts-Einträge mit
gleichem Typ, Namen und Startzeitpunkt werden übersprungen.

## Entwicklung

Voraussetzung: Node.js 22.

```bash
cd server && npm install
```

```bash
cd client && npm install
```

Backend starten (Port 8095, Daten in `./data` im Projektordner):

```bash
cd server && npm run dev
```

Frontend mit Hot-Reload starten (leitet `/api` an Port 8095 weiter):

```bash
cd client && npm run dev
```

Tests:

```bash
cd client && npm test
```

```bash
cd server && npm test
```

- `client/src/timer/engine.test.ts` – Ablauf-Logik: Reihenfolge von Runden, Sätzen, Pausen und
  Countdowns, Zeitstempel-Rechnung, Pause/Überspringen, Pieptöne
- `client/src/plan/plan.test.ts` – Trainingsplan: Wochen/Wochentage, Abweichungen, Fortschritt,
  Empfehlung
- `server/src/api.test.ts` – Anmeldung, Datentrennung zwischen Benutzern, Bildverkleinerung,
  Import/Export
- `server/src/features.test.ts` – Teilen und Kopieren, Einstellungen, Profilbild,
  Trainingsplan-API, Migration einer bestehenden Datenbank

## Projektstruktur

```
server/src/
  app.ts          Fastify-App, Routen, Sitzungen
  db.ts           SQLite + Migrationen (PRAGMA user_version)
  repo.ts         Datenzugriff
  planRepo.ts     Trainingspläne und eigene Aktivitäten
  schemas.ts      Validierung (zod) inkl. Import-Format
  transfer.ts     Import/Export
  images.ts       Bild-Upload, Verkleinerung (sharp → WebP, max. 800 px)
client/src/
  timer/engine.ts Ablauf-Logik des Timers (rein, getestet)
  plan/           Trainingsplan: Kalenderlogik und Empfehlung (rein, getestet)
  theme.ts        Farbschema und Hell/Dunkel pro Benutzer
  pages/          Seiten (Übersicht, Editoren, Durchführung, Verlauf, Import)
  audio.ts        Pieptöne (Web Audio API)
  wakeLock.ts     Bildschirm wachhalten
```

## Sicherheit

Gedacht für das Heimnetz. Passwörter werden mit bcrypt gehasht, Sitzungen laufen über ein
HttpOnly-Cookie (30 Tage). Die App nicht ungeschützt ins Internet stellen.
