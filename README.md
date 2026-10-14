# ExternPlan

Startbare erste Version der Pikettplanung für die Kantonspolizei St. Gallen: zwei Planungsansichten, Personen/Organisation, konfigurierbare Funktionen und Gebiete, Soll-Abdeckung, Import, ELS-Delta/Snapshot, Änderungshistorie und dauerhafte SQLite-Speicherung.

## Start

Voraussetzung: Node.js **24 LTS** (wegen `node:sqlite`).

```sh
cd /workspace/ExternPlan
npm ci --cache /workspace/.npm-cache
npm start
```

Der Server bindet standardmässig an `127.0.0.1`, Port 3000. Mit `HOST`/`PORT` kann die Bindung geändert werden. Keine öffentliche Freigabe ohne Authentifizierung. `DATA_DIR` ist standardmässig `data` relativ zum Arbeitsverzeichnis. SQLite wird beim ersten Start initialisiert. Die Datei `data/externplan.sqlite` enthält den persistenten Zustand. WAL/SHM gehören zu einer laufenden Datenbank; Backups nur mit SQLite-Backupverfahren oder bei gestopptem Server erstellen.

```sh
npm test
npm run test:ui
```

Die Browserprüfung benötigt Chromium unter `/usr/bin/chromium` oder `CHROMIUM_PATH`. Sie verwendet eine separate temporäre Datenbank, verändert keine Anwendungsdaten und prüft tatsächliche Formulare, Planung und ELS-Bestätigung. Fach-/HTTP-Tests benötigen keinen Browser. Node kann für `node:sqlite` eine Experimental-Warnung ausgeben.

## Bedienung

- **Funktion / Gebiet:** Monat, Funktion und Gruppe filtern, Zelle anklicken, Lücken einsehen, Zuteilung anlegen/bearbeiten/löschen. Zeilen und Überschriften sind beim Scrollen fixiert. Eine Ganzgebietsbesetzung erscheint auch in den ausdrücklich abgedeckten Teilgebieten. Bei Gruppenfilter werden nur Zuteilungen der ausgewählten Gruppe angezeigt und für deren Besetzungsstatus/Lücken berücksichtigt; die gespeicherte Gesamtplanung wird nicht verändert.
- **Personen-Pikettübersicht:** Monat, eine Funktion und eine oder mehrere Regionen wählen. Es werden Personen mit passenden Zuteilungen im gewählten Monat angezeigt; Pikettdienste stehen je Tag im Gitter. Gesamtgebiets-Dienste zählen bei ausdrücklich abgedeckten Teilregionen einmal. Bei ortsunabhängigen Funktionen ist keine Region erforderlich. Zellen lassen sich direkt bearbeiten; Filter bleiben erhalten.
- **Organisation / Personen:** Abteilung oder Gruppe wählen. Mit **+ Abteilung** eine Abteilung direkt anlegen. Externe Personen mit getrennten Feldern für Vorname und Name manuell pflegen; ihre `employee_id` wird beim Speichern serverseitig als eindeutige `EXT-…`-Kennung erzeugt und bei Bearbeitung beibehalten. Kommunikation wird über Telefon Mobil, Telefon Geschäft, Telefon Privat und E-Mail mit jeweils eigener Priorität (Standard 0, ganze Zahl ≥ 0) erfasst. Bestehende weitere Kontakte bleiben erhalten. SAP-Personen werden über den simulierten Import aktualisiert. Jede Person darf jede Funktion übernehmen.
- **Stammdaten & Soll-Abdeckung:** Datensätze über einzelne Formularfelder und Auswahllisten konfigurieren. Mehrere Wochenzeitfenster und Gesamtgebietsbeziehungen lassen sich zeilenweise hinzufügen oder entfernen. ID bleibt bei Bearbeitung unverändert. Referenzierte Datensätze sind vor Löschung geschützt. Funktionsfelder: `geo_ids`, `covers`. Abdeckungsfelder: `mode`, `windows`, `valid_from`, `valid_until`, `geo_id`.
- **Import:** Datei wählen, Vorschau prüfen, tatsächliche Spalten ausdrücklich zuordnen, dann atomar übernehmen. Importfehler rollen die gesamte Übernahme zurück.
- **ELS-Schnittstelle:** Delta oder Snapshot erzeugen, JSON herunterladen, im lokalen Simulator separat bestätigen. Offene Löschungen bleiben erhalten. Personen- und Zuteilungsstatus werden separat angezeigt.
- **Protokoll:** Änderungen mit Vorher-/Nachher-Zustand. Aktuell ist die Identität „Lokaler Planer (Simulation)“.

## Quelldaten und Import

Die angefragten Dateien **Funktionen(1).xlsx**, **Regionen.xlsx**, **Personen.json** und **E3_Planning_23052025x.json** wurden nicht mitgeliefert. Daher wurde keine Prüfung mit Originaldaten behauptet. Die Startdaten sind ausdrücklich Beispiele, keine fachlich freigegebenen Daten. Die Beispielbeziehung `GANZ → NORD, SÜD` muss anhand der Quelldateien/fachlichen Freigabe überprüft werden. Keine reale Geo_ID wird aus Namen abgeleitet. UA_SG wird nicht als gesamter Kanton behandelt.

XLSX: erstes Arbeitsblatt, erste Zeile als Überschriften. Reihenfolge: Regionen, Funktionen, Personen. Das Format wird in der Vorschau sichtbar; Zuordnung erfolgt manuell. Eine Funktionszeile enthält alle Geo_IDs als Array oder kommagetrennt/semikolongetrennt. Mehrere Zeilen derselben ID aktualisieren denselben Datensatz; sie werden **nicht automatisch vereinigt**. Vor Übernahme solche Quellen zu einer Zeile pro Funktion zusammenführen. Leere Geo-Zuordnung ist ortsunabhängig. Ganzgebietsbeziehungen werden anschliessend explizit in `covers` konfiguriert und beim erneuten Funktionsimport erhalten.

JSON-Personen: Array oder Objekt mit `people` bzw. `persons` als Array. `employee_id` auf die tatsächliche `persID`-Spalte abbilden. Optional `first_name` und `last_name` explizit zuordnen; sonst bleibt der bisherige vollständige Name unverändert. SAP-Import benötigt auch Name und Abteilung. Herkunft und externe Kennung werden gespeichert. Bereits vorhandene manuelle Personen mit derselben Kennung bleiben unverändert; wiederholte Importe erzeugen keine Duplikate. `contacts` ist ein Array aus `{type, value, priority}` (oder dessen JSON-String); diese Prioritäten gehören nur zum Personenstamm und dürfen 0 sein (Standard bei fehlender Angabe). Zuteilungsprioritäten bleiben positive Ganzzahlen ab 1. Abweichende/nestierte Originalstrukturen benötigen nach Einsicht einen angepassten Normalisierer in `adapters/sap.js`. Keine echten SAP-Zugangsdaten nötig.

Die E3-Referenz kann im Import-Reiter separat als JSON eingesehen werden. Sie wird nicht als gültige neue Planung importiert. Der versionierte Vertrag liegt in [docs/els-contract.md](docs/els-contract.md), Beispielimporte/-exporte in [examples](examples).

## Fachliche Regeln und Annahmen

- Intervalle sind `[Beginn, Ende)`; Priorität ist positive Ganzzahl je Zuteilung, nicht je Person/Funktion. Identische Person/Funktion/Gebiet/Zeitintervalle werden unabhängig von Priorität abgelehnt. Andere zeitliche Überschneidungen derselben Kombination und regional/Ganzgebiet warnen, blockieren aber nicht.
- KTD Pikett benötigt exakt NORD, SÜD, GANZ. Geo_IDs werden in dieser ersten Version als Strings geführt. Notfallarzt/Notfallzahnarzt sind unabhängig, müssen bei Anlage dieselbe Gebietsauswahl besitzen.
- Alle Zeitdarstellungen und Eingaben der Oberfläche verwenden Schweizer Zeit als `TT.MM.JJJJ HH:mm`, reine Datumsfelder `TT.MM.JJJJ`. API und ELS-Export behalten ISO-Zeitangaben. Doppelte Herbst-Uhrzeiten können im Formular als Sommer- oder Winterzeit ausgewählt werden; unveränderte bestehende Zeitpunkte behalten ihren ursprünglichen Offset und gegebenenfalls gespeicherte Sekunden, auch wenn die Anzeige auf Minuten beschränkt ist. Alle Zeitberechnungen verwenden Europe/Zurich. Eine explizite ISO-Zeit mit Offset bezeichnet einen eindeutigen Zeitpunkt. Ohne Offset werden nicht existente bzw. mehrdeutige lokale Zuteilungszeiten abgelehnt. Tagesgrenzen werden kalendarisch gebildet, nicht durch Addition von 24 Stunden.
- Soll-Abdeckung ohne Regel bedeutet „kein Pikett erforderlich“. `continuous` fordert durchgehende Besetzung. `weekly` vereinigt mehrere Wochenzeitfenster, einschliesslich Wochenübergang. Montag=1, Sonntag=7. Gleiches Start-/Ende-Wochentag+Uhrzeit bedeutet eine volle Woche. `valid_from` inklusive, `valid_until` exklusiv, jeweils lokaler Tagesbeginn.
- Eine gebietsspezifische Regel ersetzt die allgemeinen Regeln für dieses Gebiet. Mehrere passende Regeln werden vereinigt. Eine Person genügt; Prioritätsstufen erhöhen keinen Bedarf. Angrenzende Dienste schliessen Lücken gemeinsam. GANZ wird selbst nur durch GANZ besetzt; einzelne Regionen werden nicht implizit als GANZ zusammengefasst.
- Bei wiederkehrenden Sollfenstern in der DST-Sprungstunde normalisiert Luxon nicht existente Zeiten nach vorne und wählt einen gültigen Offset für doppelte Uhrzeiten. Für produktive Regeln in dieser Stunde ist die gewünschte fachliche Strategie noch festzulegen; 07:00-Fenster sind eindeutig.
- Snapshot ist ein vollständiger **Upsert-Abgleich** aller aktiven Zuteilungen, kein Löschauftrag durch Abwesenheit. Löschungen werden ausschliesslich über explizite Delta-Tombstones bestätigt.

## Architektur und Grenzen

Express-API, Browser-JavaScript ohne Buildschritt, Luxon, ExcelJS, SQLite. Eine SQLite-Transaktion speichert den konsistenten Gesamtdatenbestand; Zuteilungsbearbeitung verwendet eine Revision zur Erkennung veralteter Änderungen. ELS-Adapter und SAP-Normalisierer sind separate Module. Der echte ELS-Transport muss bestätigte Ergebnisse liefern; ein Netzwerkadapter sollte später asynchron und ohne lange SQLite-Transaktionen implementiert werden. Kein Dienstoptimierer, keine Zeitwirtschaft/Zulagen-/Ferienberechnung.

Diese Version ist eine lokale funktionale Entwicklungsanwendung. **Für den produktiven Einsatz mit etwa 1’200 Personen noch offen:** SSO/Rollen, echte Akteuridentitäten im Audit, Datenschutz-/Betriebskonzept, Backups/Retention, Transportauthentifizierung, getestete Adapter gegen echte Systeme, Skalierungs- und Mehrbenutzerlasttests. Der Gesamtdatenbestand wird derzeit transaktional als JSON in SQLite gespeichert; für grosse Historien und viele gleichzeitige Nutzer ist eine normalisierte, indizierte Datenbank mit Paging vorgesehen. ELS-Simulation und Demo-Daten sind kein Produktivitätsnachweis.

## API

`GET /api/state`, `GET /api/month?month=YYYY-MM`, `GET /api/person-month?month=YYYY-MM&function_id=ID&region_id=NORD&region_id=SÜD`, `POST/PUT/DELETE /api/assignments`, `POST/PUT /api/people`, `POST/DELETE /api/master/:type`, `POST /api/import/preview`, `POST /api/import/commit`, `POST /api/exports`, `GET /api/exports/:id`, `POST /api/exports/:id/confirm`, `POST /api/els/people`, `GET /api/health`.

PUT-Zuteilung enthält die aktuelle `revision`; DELETE verwendet `?revision=N`. Fehler antworten mit HTTP 400 und `{error}`. Die Anwendung benötigt für lokale Simulation keine Secrets. `npm audit` ist ohne gemeldete Schwachstellen; der ExcelJS-transitive UUID-Baustein wird über ein getestetes Override auf Version 11 aktualisiert.


## Hosting

Siehe [Bereitstellung / Render](docs/deployment.md). `render.yaml` konfiguriert dauerhaftes SQLite-Volume und einen gemeinsamen Testzugang. Hosting benötigt `APP_USERNAME`, `APP_PASSWORD` (mindestens 16 Zeichen) und `REQUIRE_AUTH=true`. Der Healthcheck ist öffentlich; Planungsoberfläche und Daten benötigen Anmeldung. Ein gemeinsamer Testzugang ersetzt keine individuellen Benutzerrollen.
