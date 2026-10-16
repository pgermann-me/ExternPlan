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

Die Hostbindung bleibt lokal. Für einen Browserzugang einen HTTPS-Reverse-Proxy mit vorgeschalteter Anmeldung einrichten. Für Hosting steht jetzt ein einfacher gemeinsamer Passwortschutz über `APP_USERNAME` und `APP_PASSWORD` zur Verfügung. `REQUIRE_AUTH=true` verhindert den Start ohne vollständige Zugangsdaten (Passwort mindestens 16 Zeichen). Dieser Testzugang ersetzt noch keine produktive SSO-/Rollenverwaltung. Vor öffentlicher Erreichbarkeit ist deshalb ein Zugriffsschutz am Hosting/Proxy erforderlich; auch Testdaten und Planungsänderungen sollen vor fremdem Zugriff geschützt werden.

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
5. Render erzeugt `APP_PASSWORD` automatisch. Im Dienst unter **Environment** sicher einsehen; Benutzername ist `planer`. Keine Zugangsdaten in Chat, Quellcode oder Buildlogs kopieren.
6. Die von Render angezeigte HTTPS-URL öffnen und den Browser-Anmeldedialog verwenden. Der Healthcheck `/api/health` ist öffentlich, Oberfläche und fachliche API sind geschützt.
7. Testperson/Zuteilung anlegen, Dienst neu starten und Datenerhalt prüfen. Der Datenpfad ist `/app/data`, nicht das kurzlebige Containerdateisystem.

`TRUST_PROXY=1` berücksichtigt den vorgeschalteten HTTPS-Proxy von Render bei der Prüfung des Ursprungs von Schreibanfragen. Für andere Hostings diese Einstellung nur bei einem vertrauenswürdigen Proxy verwenden. Nach Änderungen ist wegen `autoDeploy: false` eine manuelle Bereitstellung des neuesten Branch-Commits erforderlich. Für echten Polizeibetrieb sind SSO/Rollen, individuelle Auditidentität, Betriebskonzept und echte Adapter weiterhin Voraussetzung.
