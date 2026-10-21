# Add-on-Marktplatz — Protokoll v1

Dieses Dokument ist der Vertrag zwischen Yapaia Go (öffentlich, GPL-3.0-or-later) und
dem Marktplatz-Server (`Yapaia/Addon-server`, privat). Beide Seiten
implementieren genau das, was hier steht. Ändert sich etwas, ändert sich
zuerst dieses Dokument.

## Wer prüft was

| Ebene | Wo | Schützt gegen |
|---|---|---|
| Release-Signatur (`addon-release`) | Go-Core, bei jeder Installation | manipulierte oder fremde Pakete, Umgehung des Marktplatzes |
| Download nur mit Berechtigung | Marktplatz-Server | Herunterladen kostenpflichtiger Add-ons ohne Kauf |
| Lizenz (`addon-license`) | Go-Core beim Aktivieren **und** das Add-on selbst | Nutzung auf Installationen ohne Lizenz |
| Sperrliste (`revocations`) | Go-Core beim Abgleich | bekannt schädliche oder zurückgezogene Versionen |

Was auf dem Gerät des Nutzers läuft, kann der Nutzer verändern — auch Go
selbst. Die Prüfungen in Go sind deshalb die Regel für den offiziellen Build,
kein Kopierschutz. Ein kostenpflichtiges Add-on prüft seine Lizenz zusätzlich
**selbst** gegen die fest eingebauten offiziellen Schlüssel
(`verifyLicense()` aus `@yapaia/addon-sdk`). Was gar nicht kopierbar sein darf,
gehört auf einen Server, den das Add-on mit seiner Lizenz aufruft.

## Signierte Token (`ysig1`)

Ein Token ist ein String aus drei Teilen:

```
ysig1.<payload>.<signatur>
```

- `<payload>`: base64url (ohne `=`) eines UTF-8-JSON-Objekts.
- `<signatur>`: base64url (ohne `=`) der Ed25519-Signatur über die ASCII-Bytes
  `ysig1.<payload>`.
- Jedes Payload hat `typ`, `kid` (Schlüssel-Id) und `iat` (Unix-Sekunden).

### Schlüssel

- Ed25519. Öffentlicher Schlüssel als base64url der 32 Rohbytes
  (entspricht `x` eines JWK mit `kty: "OKP", crv: "Ed25519"`).
- `kid` = die ersten 16 Hex-Zeichen von `sha256(<32 Rohbytes>)`.
- Go vertraut:
  1. den **offiziellen Schlüsseln** in
     `packages/shared/src/marketplace/officialKeys.ts` (fest eingebaut),
  2. den Schlüsseln des in Go eingetragenen Marktplatzes. Sie werden beim
     Speichern von `GET /v1/meta` geholt und festgehalten; ändert der Server
     seine Schlüssel, muss der Marktplatz in Go neu gespeichert werden.
- `verifyLicense()` im SDK kennt nur die offiziellen Schlüssel.

### `typ: "addon-release"` — signierte Version

```json
{
  "typ": "addon-release", "kid": "…", "iat": 1760000000,
  "id": "com.yapaia.fahrtenbuch", "version": "1.0.0",
  "sha256": "<64 hex, Tarball>", "licensing": "free" | "paid",
  "publisher": "yapaia"
}
```

Go installiert ein Paket nur, wenn `sha256` den Bytes entspricht und `id` und
`version` mit `yapaia-addon.json` übereinstimmen. `licensing` bestimmt, ob zum
Aktivieren eine Lizenz nötig ist; es steht nur in der Signatur, nicht im
Manifest, und lässt sich daher nicht abstreifen.

### `typ: "addon-license"` — Lizenz für eine Installation

```json
{
  "typ": "addon-license", "kid": "…", "iat": 1760000000,
  "license_id": "lic_…", "addon_id": "com.yapaia.fahrtenbuch",
  "installation_id": "<uuid aus Go>", "account": "acc_…",
  "exp": null
}
```

`exp` ist `null` (unbefristet) oder ein Unix-Zeitpunkt. Gültig nur für genau
diese `addon_id` und `installation_id`.

### `typ: "revocations"` — Sperrliste

```json
{
  "typ": "revocations", "kid": "…", "iat": 1760000000,
  "entries": [{ "id": "com.example.x", "version": "1.2.0" | null, "reason": "…" }]
}
```

`version: null` sperrt alle Versionen. Go deaktiviert gesperrte, installierte
Add-ons und lässt sie nicht wieder aktivieren.

## HTTP-API des Marktplatzes

Basis-Adresse `B` (z. B. `https://addons.yapaia.cloud`). Go verlangt `https`,
außer im Entwicklermodus. Fehler haben die Form
`{"error":{"code":"…","message":"…"}}`.

### Öffentlich

| Methode und Pfad | Antwort |
|---|---|
| `GET B/v1/meta` | `{"name":"…","api":1,"keys":[{"kid":"…","public_key":"…"}]}` |
| `GET B/v1/index.json` | JSON-**Array** von Einträgen (siehe unten) |
| `GET B/v1/revocations` | `{"token":"ysig1.…"}` |
| `GET B/v1/addons/{id}/{version}/download` | Tarball (`application/gzip`), nur bei `licensing: "free"` ohne Anmeldung |

Ein Eintrag in `index.json` ist rückwärtskompatibel zu
`apps/core/src/addons/registry.ts`:

```json
{
  "id": "…", "name": "…", "version": "1.0.0", "description": "…",
  "icon": "https://…" , "screenshots": [],
  "download_url": "B/v1/addons/{id}/{version}/download",
  "sha256": "…", "scopes": ["pos.read"], "core_api": "*",
  "signature": "ysig1.…",
  "licensing": "free" | "paid", "publisher": "yapaia", "price_label": "4,99 €"
}
```

Ist ein Marktplatz eingetragen, lädt Go den Store-Katalog von
`B/v1/index.json` (Vorrang hat nur die Umgebungsvariable `ADDONS_REGISTRY_URL`)
und holt bei jedem Katalog-Abgleich auch `B/v1/revocations`.

### Mit Konto (`Authorization: Bearer <Konto-Token>`)

Der Konto-Token wird auf dem Marktplatz erzeugt und in Go eingetragen. Go
schickt ihn nur an die Adresse des eingetragenen Marktplatzes.

| Methode und Pfad | Antwort |
|---|---|
| `GET B/v1/account` | `{"account":"acc_…","name":"…","entitlements":["<addon-id>",…]}` |
| `GET B/v1/addons/{id}/{version}/download` + Header `X-Yapaia-Installation: <uuid>` | Tarball, wenn das Konto das Add-on besitzt |
| `POST B/v1/licenses/activate` `{"addon_id","installation_id"}` | `{"license":"ysig1.…"}`; `403 NOT_ENTITLED`, `409 ACTIVATION_LIMIT` |

### Veröffentlichen (`Authorization: Bearer <Publisher-Token>`)

`POST B/v1/publish?licensing=free|paid` mit dem Tarball als Body
(`application/gzip`). Der Server prüft das Manifest, rechnet `sha256`,
signiert und antwortet mit dem Index-Eintrag. Ein Publisher darf nur Ids mit
seinem Präfix veröffentlichen; eine schon veröffentlichte Version ist
unveränderlich (`409 VERSION_EXISTS`).

## Was Go speichert

| Einstellung | Inhalt |
|---|---|
| `addons.marketplace` | `{url, token, name, keys}`; der Token wird nie zurückgegeben |
| `addons.developer_mode` | `true` erlaubt unsignierte Pakete und `http` zum Marktplatz |
| `addons.installation_id` | zufällige UUID, einmal erzeugt |
| `addons.licenses` | `{<addon-id>: "ysig1.…"}` |
| `addons.revocations` | letzte gültige Sperrliste |

Die Nutzung von Yapaia selbst bleibt davon unberührt: Go und Home Assistant
laufen weiter über `http` im lokalen Netz. `https` gilt nur für die
Verbindung von Go zum Marktplatz.

## Fehlercodes in Go

Die Add-on-Routen von Go (`/api/v1/addons/…`) melden Ablehnungen durch diese
Regeln mit folgenden Codes (`apps/core/src/addons/routes.ts#statusForAddonError`):

| HTTP | Code | Bedeutung |
|---|---|---|
| 403 | `SIGNATURE_REQUIRED` | Paket ohne Signatur, Entwicklermodus aus |
| 403 | `SIGNATURE_INVALID` | Signatur ungültig, unbekannter Schlüssel oder für andere Bytes/Id/Version |
| 403 | `ADDON_REVOKED` | Version steht auf der Sperrliste |
| 403 | `NOT_ENTITLED`, `MARKETPLACE_TOKEN_REJECTED`, `DOWNLOAD_FORBIDDEN` | Konto besitzt das Add-on nicht bzw. Token abgelehnt |
| 409 | `LICENSE_REQUIRED`, `MARKETPLACE_NO_ACCOUNT`, `ACTIVATION_LIMIT` | erst Lizenz bzw. Konto-Token nötig, oder Aktivierungsgrenze erreicht |
| 409 | `INCOMPATIBLE_CORE_API` | `core_api` passt nicht zur Version von `@yapaia/core` |
| 400 | `MARKETPLACE_URL_INVALID`, `MARKETPLACE_NOT_CONFIGURED` | Adresse ungültig (ohne Entwicklermodus nur `https`) bzw. kein Marktplatz eingetragen |
| 502 | `MARKETPLACE_UNREACHABLE`, `MARKETPLACE_ERROR`, `MARKETPLACE_INVALID`, `LICENSE_INVALID`, `REVOCATIONS_INVALID` | Marktplatz nicht erreichbar oder Antwort unbrauchbar |

Abgelehnte Installationen (Signatur, Sperrliste) und Add-ons, die beim
Abgleich deaktiviert werden (Sperrliste, fehlende Lizenz), protokolliert Go
zusätzlich als Sicherheitsereignis (`addon.signature`, `addon.revoked`,
`addon.license`; abrufbar über `GET /api/v1/security/events`).

## Lizenzen der Bausteine

| Teil | Lizenz | Warum |
|---|---|---|
| Yapaia (Repo, außer den folgenden Ausnahmen) | GPL-3.0-or-later | Open-Source-Kern |
| `@yapaia/addon-sdk`, `packages/shared/src/marketplace` | Apache-2.0 | werden in Add-ons gebündelt; erlaubt Closed-Source-Add-ons (siehe `DRITTLIZENZEN.md` in der Monorepo-Wurzel) |
| Beispiel-Add-ons `addons-examples/poi-campsites`, `addons-examples/track-recorder` | Apache-2.0 | Vorlagen zum Weiterverwenden, auch in Closed-Source-Add-ons |
| Marktplatz-Server | proprietär | privates Repo |
| Add-ons | Sache des Herausgebers | z. B. proprietär |

Add-ons sprechen mit Go nur über das SDK (postMessage bzw. REST/WS) und laufen
als eigener Prozess oder im iframe — sie sind keine abgeleiteten Werke des
GPL-Kerns.

> **`core_api`** bezieht sich auf die Version der Add-on-API (`@yapaia/core`,
> per Changesets versioniert), nicht auf die Add-on-Version von Yapaia Go in
> Home Assistant (z. B. 0.56.0). Bis zum ersten Release steht die API auf
> 0.0.x; Add-ons verwenden bis dahin `"*"` (eine Range wie `"^0.1"` passt
> nicht auf 0.0.x; unterstützt sind exakte Versionen, `^`, `~` und x-Ranges,
> siehe `packages/shared/src/semver.ts`).
