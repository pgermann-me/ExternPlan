# ELS JSON-Vertrag 1.0

Maschinenlesbares Schema: [els-schema.json](els-schema.json).

UTF-8 JSON. `schema_version: "1.0"`, `export_id` ist UUID, `timezone: "Europe/Zurich"`. Ein Export wird unverändert gespeichert; erneutes Herunterladen liefert dieselbe Datei. Erneutes Erzeugen erhält eine neue export_id und enthält weiterhin unbestätigte Änderungen. Datei erzeugt ≠ Import bestätigt.

## Delta

`export_mode: "delta"`, `changes` als chronologisch geordnetes Array. **Fehlende IDs bedeuten niemals Löschung.** Mehrere Revisionen derselben ID dürfen im Export enthalten sein; keine Zusammenführung regionaler Zuteilungen oder mehrfach geplanter Personen.

Create/update enthalten vollständig:

```json
{
  "action": "create",
  "assignment_id": "9df6ad1c-8cd6-4b6c-a6a0-687c3b6012be",
  "revision": 1,
  "employee_id": "DEMO-001",
  "function_id": "DEMO-KTD",
  "start_on": "2026-10-07T07:00:00+02:00",
  "end_on": "2026-10-08T07:00:00+02:00",
  "geodependency": "NORD",
  "priority": 1
}
```

`assignment_id` ist dauerhafte UUID, Revision steigt bei jeder Bearbeitung und Löschung. `employee_id` ist exakt die Personenkennung/persID als String, keine automatisch neu generierte alternative Kennung. `function_id` identifiziert Stammdaten; Priorität wird nie in den Funktionsnamen eingebaut. Beginn eingeschlossen, Ende ausgeschlossen. Zeitstrings haben immer den am jeweiligen Zeitpunkt gültigen Schweizer UTC-Offset (Start und Ende können unterschiedliche Offsets haben). `geodependency: null` ausschliesslich bei ortsunabhängiger Funktion. Priorität >= 1, ganzzahlig.

Delete enthält nur `action: "delete"`, `assignment_id`, `revision`. Der ELS-Simulator speichert Tombstones inklusive Revision. Eine alte create/update-Nachricht darf eine neuere Löschung nicht reaktivieren.

## Bestätigung und Reihenfolge

1. Personen über den getrennten Personenadapter erfolgreich anlegen/aktualisieren.
2. Nur danach Zuteilungen mit dieser employee_id verknüpfen.
3. Jede Zuteilung über `(assignment_id, revision)` idempotent verarbeiten: gleiche/ältere Revisionen sind bereits verarbeitet und überschreiben nichts.
4. Nur tatsächlich bestätigte Revisionen aus dem lokalen Ausgang entfernen; neuere Revisionen bleiben ausstehend. Fehler sichtbar speichern und später erneut versuchen.

`POST /api/exports/:export_id/confirm` führt diese Schritte **lokal simuliert** aus und gibt `status`, `errors`, `confirmed_at` zurück. Der Personenstatus ist separat von Zuteilungsstatus. `POST /api/els/people` simuliert nur Personenanlage. Ein Dateidownload führt keine Übertragung oder Bestätigung aus. Der Adaptervertrag liegt in `adapters/els.js`; echte ELS-Antworten sind noch anzubinden.

## Snapshot

`export_mode: "snapshot"`; `scope` ist verbindlich:

```json
{
  "type": "all_assignments",
  "replacement": false,
  "description": "Alle Zuteilungen; Abwesenheit bewirkt keine Löschung. Löschungen nur als explizite Delta-Tombstones."
}
```

Der Snapshot enthält alle aktiven Zuteilungen als vollständige create/upsert-Änderungen mit aktueller Revision. Geeignet zur Erstübernahme und zum erneuten Abgleich vorhandener Datensätze. Keine Begrenzung nach Monat/Abteilung. Abwesende IDs werden nicht gelöscht; für einen vollständigen Neuabgleich müssen auch noch ausstehende Delta-Tombstones verarbeitet werden. Eine destruktive Ersetzung des ELS-Bestandes wird nicht implementiert.

Der ELS-Simulator ist keine ELS-Suche. Regionale Zuteilungen werden unverändert exportiert und haben dort fachlich Vorrang vor Ganzgebietsbesetzung. Such-/Sortier-/Zusammenführungslogik liegt beim echten ELS.
