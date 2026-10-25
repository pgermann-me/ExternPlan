# Sicherheitswartung

## Prüfung vom 25.10.2026

ExternPlan läuft mit **Node.js in Docker**, nicht mit PHP. Die im Render-Hinweis genannten Node.js- und Zertifikatsthemen sind relevant. Die Version des bereits bei Render laufenden Containers ist aus dem Repository nicht feststellbar.

- Das Image ist auf `node:24.22.1-bookworm-slim` festgelegt. Diese Node.js-Sicherheitsversion adressiert unter anderem die TLS-Hostname-Prüfung, den Brotli-Decoder und die eMudhra-Zertifikatsthematik. Für lokale Ausführung geben `.node-version` und `package.json` dieselbe Node.js-Hauptversion und Mindestpatchversion vor.
- Beim Image-Bau werden Debian-Pakete und `ca-certificates` aktualisiert; der System-Zertifikatsspeicher wird neu erzeugt. Node.js verwendet zusätzlich seinen eigenen, mit der Laufzeit aktualisierten Zertifikatsbestand. TLS-Prüfungen werden nicht deaktiviert. Die optionale Cloud-Proxy-CA wird nur während `npm ci` über ein BuildKit-Secret bereitgestellt.
- `body-parser` wurde im Lockfile von 2.3.0 auf 2.4.0 aktualisiert. Damit wird die gemeldete DoS-Schwachstelle durch nachgestellte Bytes bei komprimierten Anfragekörpern behoben ([GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)).
- Die JSON-API entpackt keine komprimierten Anfragekörper mehr (`inflate: false`). `gzip`, `deflate` und `br` werden mit HTTP 415 abgewiesen, auch vor der Anmeldung. Die Weboberfläche sendet unkomprimiertes JSON; XML-/GeoJSON-Importe werden weiterhin über diesen normalen JSON-Pfad übertragen. Das bestehende Größenlimit von 10 MB bleibt bestehen.
- Serverseitige ELS-Übermittlung ist weiterhin simuliert; es wurde kein produktiver HTTPS-Transport konfiguriert. OpenStreetMap-Kacheln lädt der Browser über HTTPS und dessen Zertifikatsprüfung.

Die Prüfung meldete nach der Aktualisierung **0 bekannte Schwachstellen bei `npm audit --omit=dev`**. Dies ist eine Prüfung der npm-Produktionsabhängigkeiten, kein Nachweis für die Abwesenheit aller Schwachstellen. Das neu gebaute Image wurde auf Node.js 24.22.1, Body-Parser 2.4.0 und aktualisierte Debian-Zertifikatspakete kontrolliert. Alle 225 automatisierten Tests liefen mit der gepatchten Laufzeit erfolgreich; darunter Ablehnung gültiger und beschädigter komprimierter Anfragen ohne Serverabsturz sowie normale Anmeldung/JSON-Verarbeitung.

## Bei Render anwenden

Im betroffenen Service **Manual Deploy → Clear build cache & deploy** wählen. Dadurch werden Basisimage und Betriebssystempakete neu eingelesen. Ein bloßer Neustart des alten Containers aktualisiert dessen Laufzeit und Zertifikate nicht. Der persistente Datenträger `/app/data` bleibt bestehen.

Für eine Versionskontrolle in der Render-Shell:

```sh
node --version
npm ls body-parser
```

Erwartet: `v24.22.1` und `body-parser@2.4.0` (oder später aktualisierte und geprüfte Sicherheitsversionen).

## Weitere Updates

Neue Node.js-Sicherheitsreleases und Betriebssystemupdates regelmäßig prüfen. Bei einer neuen Sicherheitsversion den Docker-Tag, `.node-version` und die Mindestversion in `package.json` samt Lockfile aktualisieren, neu bauen und testen. Bei Änderungen an npm-Abhängigkeiten `npm ci`, `npm audit --omit=dev` und `npm test` ausführen. Danach bei Render erneut ohne Build-Cache bereitstellen. Geheimnisse und personenbezogene Daten gehören nicht ins Repository.

Quellen:

- [Node.js: Sicherheitsreleases Oktober 2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Node.js 24.22.1](https://nodejs.org/en/blog/release/v24.22.1)
- [Render: eMudhra-Hinweis](https://render.com/docs/advisory-emudhra) – vom Benutzer bereitgestellte E-Mail; die Webseite war aus der Arbeitsumgebung mit HTTP 403 nicht abrufbar.
