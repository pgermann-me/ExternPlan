# OnCall-Personenbeispiel

ExternPlan bleibt autonom. Unter ELS-Schnittstelle erzeugt „Personen-Beispielexport erzeugen“ eine Datei für die Formatprüfung anhand der gelieferten `E3_OnCall_Person_23052025.json`. Die Originaldatei wird nicht importiert oder ins Repository kopiert. Der Beispielexport ist noch kein durch OnCall validierter produktiver Import.

Eine Datei mit ausschliesslich fiktiven Personen und Kontaktdaten liegt unter [E3_OnCall_Person_Beispiel.json](examples/E3_OnCall_Person_Beispiel.json). Sie dient zur Strukturprüfung und wird nicht in den Anwendungsbestand übernommen.

## Ziel und Abgrenzung

ExternPlan soll künftig alle externen Personen und deren Pikettdienste liefern, parallel zu E3 für interne Personen/Dienste. Geplant sind Personen und Organisation alle 12 Stunden, Planning alle 30 Minuten. Es gibt keinen Rückimport von OnCall nach ExternPlan. Der Übertragungsweg und die Trennung der Lieferungen sind noch zu klären. Aktuell werden keine Daten automatisch versendet. Für Personen und Organisationen können Beispieldateien erzeugt werden; Planning-Dateien im E3-OnCall-Format werden weiterhin nicht erzeugt. Die bisherigen Delta-/Snapshot-Dateien und Importbestätigungen gehören zum separaten lokalen Simulator.

## Ausgabe

- POST `/api/oncall/person-exports`: erzeugt einen gespeicherten Snapshot; Antwort enthält Kennung, Dateiname, Zeitpunkt, Anzahl, Hinweise und Payload.
- GET `/api/oncall/person-exports/:id`: lädt genau diesen Snapshot herunter.
- UTF-8 JSON, oberste Ebene ein Personen-Array ohne zusätzlichen Wrapper.
- Dateiname `E3_OnCall_Person_DDMMYYYY.json`, Datum in Europe/Zurich. Mehrere Exporte am selben Tag haben denselben vorgeschlagenen Dateinamen, aber unterschiedliche Exportkennungen und bleiben getrennt gespeichert.
- Enthält alle aktiven Personen des ExternPlan-Bestands, unabhängig von UI-Filtern und Herkunftskennzeichnung; archivierte/gelöschte Personen fehlen. Es werden nur vorhandene Daten exportiert, keine Beispielpersonen hinzugefügt.
- Vorschau und Download enthalten dieselben Werte. Weder ein Export noch ein Download bestätigt einen Import, ändert Zuteilungen oder leert deren Ausgang.

| Feld | Beispielzuordnung |
| --- | --- |
| `persID` | unveränderte `employee_id` aus ExternPlan; dieselbe Kennung wird für Dienste verwendet |
| `firstName`, `lastName` | getrennt erfasste Namensfelder; ein alter Gesamtname wird nicht aufgeteilt |
| `department` | gewählte bzw. eindeutig aus Funktionszuordnungen ermittelte ELS-Stelle (`els_org_id`, sonst interne Stellenkennung mit Hinweis); ohne Stellenzuordnung wie bisher die primäre Abteilung oder die einzige aus Gruppen ableitbare Abteilung; bei mehreren Stellen ohne ausdrückliche Auswahl leer |
| `contacts` | Kontaktwerte mit unveränderter Priorität, einschliesslich 0, und Feldern `priority`, `type`, `kind`, `value`, `description` |
| `organisation`, `position`, `shortSign` | leere Zeichenfolgen, da OnCall-Zuordnungen bzw. Attribute nicht erfasst sind |
| `externalAD_ID1`, `externalAD_ID2`, `externalAD_Role`, `sex`, `birthdate` | `null`; keine erfundenen AD-Kennungen, Geschlechter oder Geburtsdaten |
| `qualifications` | leeres Array; keine Ableitung von Qualifikationen aus historischen Diensten |
| `addresses` | erfasste geschäftliche Adresse, sonst leeres Array; siehe unten |

Geburtsdatum, Geschlecht und Kürzel sind laut Nutzer nicht erforderlich. Sie werden nicht abgefragt und bleiben im Aufbau der Beispieldatei leer; daraus entstehen keine Warnungen.

Die geschäftliche Adresse wird unter Organisation & Personen beim Anlegen/Bearbeiten in einzelnen Feldern erfasst: Strasse, Hausnummer, Adresszusatz, PLZ, Ort und optional Land. Als Adressart stehen `BusinessStandort` (Geschäftsstandort, Standard) und `BusinessPostal` (geschäftliche Postadresse) zur Verfügung; diese Werte stammen aus der gelieferten Personendatei. Im Export enthält `addresses` die Felder `type`, `street`, `streetNumber`, `additionalInfo`, `zipCode`, `city`, `country`. Nicht erfasste optionale Angaben werden als `null` ausgegeben. PLZ bleibt Text, damit führende Nullen erhalten bleiben. Eine fehlende oder unvollständige Adresse erzeugt einen Hinweis, verhindert aber den Beispielexport nicht.

Kontakte: Telefon Geschäft → `Phone` / `business`; Telefon Privat → `Phone` / `private`; Mobil → `Mobile`; E-Mail → `Email`. Bei Mobil/E-Mail erfasst die aktuelle Maske keine Geschäft/Privat-Zuordnung: `kind` bleibt leer. Eine bereits explizit vorhandene Zuordnung (`business` oder `private`) wird beibehalten. Unbekannte Kontaktarten behalten Wert/Priorität, erhalten einen leeren Typ und einen Hinweis. Es werden keine Kontakte still verworfen oder Prioritäten umnummeriert.

## Vor einer produktiven Anbindung klären

Die fachliche Importprüfung mit OnCall steht noch aus. Bereits vorhandene `persID` und Organisation-/Abteilungskennungen müssen explizit zugeordnet werden; keine automatische Zusammenführung nach Personennamen. Generierte `EXT-…`-Kennungen und interne Abteilungskennungen sind nicht automatisch als bestehende OnCall-Kennungen bestätigt. Das optionale Feld `shortSign` bleibt leer und wird nicht mit `persID` gleichgesetzt.

Die Beispieldateien belegen keinen Lösch- oder Ersetzungsvertrag. Insbesondere darf eine externe Lieferung nicht den E3-Bestand interner Personen entfernen. „Datei erzeugt“, technische Übergabe und fachlich bestätigte Übernahme müssen getrennt behandelt werden.

## Stellen und Organisationsbeispiel

Kontaktstellen sind eigenständige Einträge in `offices`, keine Personen. Personen verweisen in ihren `function_regions` mit `office_id` auf die übergeordnete Stelle; optional wählt `els_office_id` die für den Personenexport massgebende Stelle. Stellen gehören zu einer Gemeindegruppe und einem Gebiet, können einer anderen Stelle untergeordnet sein und eigene Kontakte führen.

POST `/api/oncall/organisation-exports` erzeugt einen getrennten Snapshot, GET `/api/oncall/organisation-exports/:id` liefert ihn. Das Array folgt den Feldern der gelieferten Organisationsdatei: `orgID`, `description`, `name`, `organisation`, `addresses`, `contacts`. Der Beispielexport verwendet `organisation` als Elternreferenz und enthält die benötigten Abteilungen/Gemeindegruppen mit den Stellen. Die gelieferten Beispieldaten haben dort nur `null`; diese Interpretation und die Kennungen müssen mit OnCall bestätigt werden. Es wird kein produktiver Transport oder validierter Import behauptet. Telefon Pikett wird als `Phone` / `business` mit Beschreibung Pikett abgebildet.
