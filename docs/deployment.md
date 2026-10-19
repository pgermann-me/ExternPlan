# Bereitstellung

Die Anwendung ist noch nicht auf einem Hostingdienst veröffentlicht. Diese Anleitung bereitet eine Bereitstellung mit dauerhaftem Datenträger vor. Node.js 24 und ein Serverprozess sind erforderlich; ein reines statisches Hosting reicht nicht aus.

## Container auf einem vorhandenen Server

Im Projektverzeichnis:

```sh
docker build -t externplan:local .
docker volume create externplan-data
docker run -d --name externplan --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v externplan-data:/app/data externplan:local
curl --fail http://127.0.0.1:3000/api/health
```

Die Hostbindung bleibt lokal. Für Browserzugang einen HTTPS-Reverse-Proxy verwenden. Die Anwendung hat persönliche Konten mit E-Mail-Adresse, Passwort und Rollen. Beim ersten Start den ersten Admin auf der Anmeldeseite einrichten: Auf Render dient das bisherige `APP_PASSWORD` als einmaliger Einrichtungsschlüssel. Ohne konfiguriertes `APP_PASSWORD` legt die lokale Anwendung einen privaten Schlüssel in `DATA_DIR/setup-token.txt` an und nennt dessen Dateipfad im Startprotokoll. `REQUIRE_AUTH=true` verlangt bei leerer Benutzerverwaltung ein `APP_PASSWORD` mit mindestens 16 Zeichen. Nach der Einrichtung erfolgt jede Anmeldung mit der persönlichen E-Mail-Adresse und dem persönlichen Passwort; der bisherige gemeinsame Benutzername wird nicht mehr verwendet.

Das Volume enthält die SQLite-Datei und bleibt bei Containerwechsel erhalten. Eine einzelne Instanz betreiben; mehrere Instanzen mit unabhängigen SQLite-Dateien teilen keine Daten. Backups mit SQLite-Backupverfahren oder bei gestoppter Anwendung durchführen. Das Image enthält keine Cloud-Anwendungsdaten: Beim ersten Start entstehen ausdrücklich gekennzeichnete Beispieldaten. Für eine Übernahme des bestehenden Datenbestands einen konsistenten SQLite-Backup verwenden.

## Node-Hosting mit persistentem Datenträger

- Laufzeit: Node.js 24.
- Installation: `npm ci --omit=dev`.
- Start: `npm start`.
- Laufzeitvariable: `HOST=0.0.0.0` innerhalb des Hostings.
- `PORT`: vom Anbieter vorgegeben oder 3000.
- `DATA_DIR`: absoluter Pfad eines dauerhaft eingebundenen, beschreibbaren Datenträgers.
- Healthcheck: `/api/health`.
- HTTPS und Zugriffsschutz über den Anbieter oder Reverse-Proxy.

Kosten und Zugang richten sich nach dem gewählten Anbieter. Hosting mit kurzlebigem Dateisystem ohne persistenten Datenträger ist für diese Anwendung ungeeignet.

## Prüfstatus

Die Anwendung wurde mit Fach-, HTTP- und Browserprüfungen validiert. Docker ist in der aktuellen Cloud verfügbar. Der vollständige Image-Build konnte hier wegen ausbleibender Paketabrufe im Build nicht abgeschlossen werden; Paketabruf mit eingebundener Cloud-CA wurde separat bei aktiver TLS-Prüfung bestätigt. Der Cloud-Proxy benötigt sein CA-Zertifikat; optional wird dieses beim Build über `--secret id=cloud_ca,src=/etc/ssl/certs/ca-certificates.crt` eingebunden und nicht im Image gespeichert. Die Container-Laufzeit wurde separat mit dem Node-24-Basisimage und den bereits installierten Abhängigkeiten geprüft: Start als node-Benutzer, Passwortschutz, SQLite-Schreibzugriff und Datenerhalt nach Neustart bestanden. Das ersetzt keinen vollständigen Image-Build. Vor tatsächlicher Freigabe am Zielserver Build, Healthcheck, SQLite-Schreibzugriff, Neustart/Persistenz und Zugriffsschutz prüfen. Ein Hostingziel und berechtigter Bereitstellungszugang sind noch erforderlich; es gibt derzeit keine veröffentlichte URL.


## Render (Testbetrieb)

`render.yaml` beschreibt einen Docker-Webdienst mit persistentem 1-GB-Datenträger in Frankfurt und deaktivierter automatischer Bereitstellung. Der konfigurierte Starter-Tarif und der Datenträger sind kostenpflichtig; Render zeigt die Kosten vor der Einrichtung an. Es werden keine bestehenden Cloud-Daten übertragen.

1. Im Render-Dashboard **New → Blueprint** wählen.
2. Das GitHub-Repository `pgermann-me/ExternPlan` verbinden. Falls es nicht angezeigt wird, der Render-GitHub-App Zugriff auf dieses Repository geben.
3. Den Branch `codex/externplan-render` mit der Datei `render.yaml` auswählen. Diese Anleitung setzt voraus, dass der Branch erfolgreich nach GitHub übertragen wurde.
4. Die vorgeschlagenen Ressourcen und Kosten prüfen, dann den Blueprint bereitstellen.
5. Bei einer neuen Bereitstellung erzeugt Render `APP_PASSWORD` automatisch; bei einem bestehenden Dienst bleibt das bisherige Passwort verwendbar. Es dient ausschliesslich der einmaligen Einrichtung des ersten Admins. Keine Zugangsdaten in Chat, Quellcode oder Buildlogs kopieren.
6. Die HTTPS-URL öffnen, das bisherige Zugangspasswort sowie Vorname, Name, E-Mail und ein eigenes Passwort für den ersten Admin eingeben. Anschliessend unter **Benutzerverwaltung** weitere Zugänge erfassen. Der Healthcheck `/api/health` bleibt öffentlich; fachliche API und Oberfläche benötigen eine persönliche Anmeldung.
7. Testperson/Zuteilung anlegen, Dienst neu starten und Datenerhalt prüfen. Der Datenpfad ist `/app/data`, nicht das kurzlebige Containerdateisystem.

`TRUST_PROXY=1` berücksichtigt den vorgeschalteten HTTPS-Proxy von Render bei der Prüfung des Ursprungs von Schreibanfragen. Für andere Hostings diese Einstellung nur bei einem vertrauenswürdigen Proxy verwenden. Nach Änderungen ist wegen `autoDeploy: false` eine manuelle Bereitstellung des neuesten Branch-Commits erforderlich. Rollen und individuelle Auditidentität sind integriert. Betriebskonzept, Backups und echte Adapter müssen für den jeweiligen Einsatz eingerichtet werden.

## Persönliche Benutzerzugänge

| Rolle | Verfügbare Hauptreiter |
| --- | --- |
| Benutzer | Kontrollansicht, Planung, Pikettliste |
| Planer | zusätzlich Organisation & Personen und Favoritendienste |
| Admin | alle Reiter einschliesslich Benutzerverwaltung |

Benutzer können in der Planung Dienste anlegen, bearbeiten, übergeben, löschen und Favoriten anwenden. Planer dürfen zusätzlich Personen und Favoritendefinitionen pflegen. Stammdaten, Import, ELS-Export, Protokoll und Benutzerverwaltung sind Admins vorbehalten. Die API prüft die Rollen unabhängig von der Anzeige der Reiter. Nichtadministrative Zustandsabfragen enthalten kein Änderungsprotokoll und keine ELS-/Exporthistorie.

Admins können bei Planern und Benutzern zusätzlich Abteilung, Gruppe und Region wählen. „Alle“ lässt die jeweilige Dimension offen; mehrere Begrenzungen gelten gemeinsam. Die Gruppenauswahl folgt der Abteilung. Bestehende Konten behalten bei der automatischen Datenbankmigration uneingeschränkten Zugriff; Admins sind immer uneingeschränkt. Die Begrenzung gilt serverseitig für Zustandsdaten, Kontrollansicht, Planung, Pikettliste und Personen sowie Schreibaktionen einschliesslich Übergabe, Sammellöschung und Rückgängig. Gruppenmitgliedschaften ausserhalb der Berechtigung bleiben beim Bearbeiten einer gemeinsamen Person erhalten. Dienste für grössere Gesamtgebiete werden innerhalb berechtigter Teilregionen schreibgeschützt angezeigt.

Admins erfassen Vorname, Name, E-Mail, Rolle, Aktivstatus und ein vorläufiges Passwort. Neue und zurückgesetzte Passwörter müssen bei der ersten Anmeldung geändert werden. Jede Person kann ihr eigenes Passwort über **Passwort ändern** setzen. Passwörter benötigen mindestens 12 Zeichen und werden mit scrypt und individuellem zufälligem Salt gespeichert. Es erfolgt kein E-Mail-Versand; das vorläufige Passwort wird ausserhalb der Anwendung übergeben.

Anmeldungen verwenden zufällige, serverseitig gespeicherte Sitzungen mit zwölf Stunden Laufzeit und HttpOnly-/SameSite-Strict-Cookies, bei HTTPS zusätzlich Secure. Passwortwechsel, Rollen-/Profil-/Berechtigungsänderungen, Sperrung und Löschung widerrufen bestehende Sitzungen des betroffenen Kontos. Der letzte aktive Admin kann nicht gelöscht, gesperrt oder zurückgestuft werden. Fehlgeschlagene Anmeldungen werden pro Client für 15 Minuten begrenzt. Namen und E-Mail des angemeldeten Kontos erscheinen bei neuen Änderungen im Protokoll; ältere Einträge bleiben unverändert.

Konten und Sitzungen liegen in separaten Tabellen derselben SQLite-Datei auf dem persistenten Datenträger. Backups müssen die gesamte SQLite-Datenbank erfassen. Der Zugriff ohne Anmeldung ist ausschliesslich für automatisierte Tests mit `NODE_ENV=test`, leerer Benutzerverwaltung und ohne `APP_PASSWORD` möglich; `EXTERNPLAN_AUTH_TEST_BYPASS=0` deaktiviert auch diese Testausnahme. Das Docker-Image verwendet `NODE_ENV=production`.

Prüfungen: `npm test`, `npm run test:ui` und `npm run test:accounts-ui`.
