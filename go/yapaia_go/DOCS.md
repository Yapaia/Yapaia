# Yapaia Go — Home Assistant Add-on

Offline-capable motorhome navigation (maps, truck/RV-aware routing, GPS,
search) running as a Home Assistant add-on. It connects to Home Assistant
through the **Yapaia** integration, which the add-on brings along (see "Home
Assistant: the Yapaia integration" below); MQTT is optional.

The add-on supports `amd64` and `aarch64` machines. The user manual with every
feature of the app itself is in the repository: `go/docs/manual.md`.

## Installation

1. Settings → Add-ons → Add-on Store → ⋮ → Repositories → add
   `https://github.com/Yapaia/yapaia`.
2. Find "Yapaia Go" in the store section "Yapaia" and click Install. The
   Supervisor downloads a ready-made image for your architecture; nothing is
   built on your device. Home Assistant 2025.10 or newer is required.
3. Optional: read "RAM recommendation" below before the first start if your
   Home Assistant machine is short on memory. Setting `region` beforehand is not
   necessary — with it empty, the setup wizard inside Yapaia lets you choose
   and install a map region.
4. Start the add-on, then open it from the HA sidebar (Ingress — no
   separate login, HA's own auth/session covers it, including over Nabu
   Casa remote access).

## RAM recommendation

Home Assistant itself, Mosquitto and any other add-ons you run share the same
machine's RAM with Yapaia Go. The figures are per service, not per machine:

| Component | Typical RAM |
|---|---|
| Core (Node/Fastify) | ≤ 300 MB |
| Valhalla (routing, Germany-sized map) | ≤ 1.5 GB |
| Photon (search, Germany-sized index, default `-Xmx1g`) | ~600 MB – 1 GB (`Xmx` + 150–300 MB JVM overhead) |
| gpsd | a few MB |
| **Yapaia subtotal** | **~2.4 – 2.9 GB** |

Add Home Assistant Core, Supervisor, Mosquitto and whatever else you run
(commonly another 1–1.5 GB or more) and a comfortable machine has **6 GB RAM
or more** if you install a Germany-sized (or similarly large) map region with
Photon search enabled.

**If you are tighter on RAM:**

- Turn `photon_enabled` **off** in the add-on options (group **Search**).
  Search falls back to the built-in lightweight index: place names and street
  names, no house numbers. This alone removes the single biggest RAM consumer.
- Lower `photon_xmx_mb` instead of disabling Photon entirely, if you want
  search with a smaller heap. Smaller regions need much less than the
  Germany-sized figures above.
- Install a smaller region (a single country or state) instead of all of
  Germany — Valhalla's RAM footprint scales with the size of the routing graph.
- If even that does not fit, run Yapaia Go standalone with Docker Compose on
  its own machine (see `go/docs/installation.md`).

## USB GPS receiver

Set `gps_source: usb` in the add-on's Configuration tab. The default is `none`,
because most installations have no USB receiver.

1. Plug in a USB GPS receiver (most "GPS mice" show up as `/dev/ttyACM0`;
   USB-serial-adapter-based ones as `/dev/ttyUSB0`).
2. Set `gps_source: usb` and **restart the add-on** — device access is granted
   when the container starts.
3. Check the add-on log: the internal `gpsd` service logs which device it
   picked and why, or why it picked none (it retries every 15 s and never
   crashes the add-on).
4. In Yapaia Go, **⚙ → 🩺 Installation prüfen** shows under *Position*
   whether gpsd delivers a fix.

### If Home Assistant runs in a VM (Proxmox, ESXi, …)

The receiver has to be handed through **twice**, and the two stages fail
differently:

| Stage | Who does it | What it looks like when it is missing |
|---|---|---|
| 1. Host → VM | the hypervisor (e.g. Proxmox: *Hardware → Add → USB Device*) | the device does not appear at all; the health check's device list is empty |
| 2. VM → add-on container | the add-on itself | the device **is** listed, but gpsd reports `Operation not permitted` — restart the add-on |

On Proxmox, **"Use USB Vendor/Device ID"** and **"Use USB Port"** both work.
For a GPS dongle the vendor/device ID (a u-blox receiver reports `1546:01a7`)
is usually the better one: it follows the receiver if you move it to another
socket. The port variant binds to the physical socket instead. USB3 does not
need to be ticked — these receivers are USB 2 serial devices.

### Which device gets used

You normally do not have to say. Yapaia decides in this order:

1. **`gps_device` is set** → exactly that path, and nothing else. If it is not
   there, no other device is used.
2. **A device identifies itself as a GNSS receiver** under
   `/dev/serial/by-id/` (u-blox, SiRF, MediaTek, Garmin, or a name containing
   GPS/GNSS). The VK-162 and similar "G-Mouse" dongles carry a u-blox chip and
   are recognised this way.
3. **There is exactly one serial device** → that one.
4. **Several devices, none of which says GPS** → Yapaia touches none of them
   and asks you to set `gps_device`.

Step 4 matters on a Home Assistant machine, because a Zigbee coordinator
(SkyConnect, Sonoff, ConBee) or a Z-Wave stick appears under exactly the same
`/dev/ttyACM*` / `/dev/ttyUSB*` names. gpsd writes probe strings to a device to
identify the receiver type — pointing it at a radio coordinator that belongs to
another add-on is not harmless.

**Use the `/dev/serial/by-id/…` path, not `/dev/ttyACM0`.** The number shifts
as soon as another USB stick is added or removed; the `by-id` name does not.
You do not need a terminal to find it: with `gps_source: usb` set and gpsd not
answering, the health check inside Yapaia lists every serial device it can see,
with the full path to copy. Start the path with a slash; Yapaia adds a missing
one and says so, but fix it in the configuration anyway.

### When gpsd does not come up

The health check reports the reason, not just the symptom: the first line of
its remedy says what the gpsd service found, for example "gps_device ist auf
'/dev/ttyUSB9' gesetzt, aber dort liegt nichts."

If the add-on log shows `gpsd: benutze /dev/serial/by-id/…` once per second,
the device is found but gpsd dies right after launch. Yapaia reports such a
restart loop (throttled to one message every 30 seconds) together with gpsd's
own exit message.

If you do not have a GPS receiver connected, leave `gps_source` at `none`: the
app remains fully usable, and the position then comes from the browser — or,
if the browser will not hand over its sensor, from the Home Assistant
Companion App (see below).

## Position from the Home Assistant Companion App

The browser only releases its GPS sensor over HTTPS. If Home Assistant runs
over plain `http://`, no phone, tablet or car radio will give Yapaia a
position, and no add-on setting can change that. The Companion App reports to
Home Assistant instead of to the browser, and keeps reporting with the screen
locked.

Set `gps_source: companion_app`. That is normally all: if exactly one
`device_tracker` entity in Home Assistant carries coordinates, Yapaia picks it
itself. If there are several, none is guessed — the second one could be
someone else's phone.

You pick the device in the app: **⚙ → 🩺 Installation prüfen**; below the
checks is a drop-down ("Gerät der Companion App") listing the `device_tracker`
entities your Home Assistant has. Picking one **takes effect immediately** — no
add-on restart. The `ha_device_tracker` option works as the default; the pick in
the app wins.

Source priority is `gpsd > browser > Companion App > simulator`: the app reports
at intervals, so it is the source that *exists* when the browser gives none —
not a replacement for a live browser fix.

## Position from a Teltonika router (RUT50)

Many motorhomes already carry an LTE router with a GNSS receiver and a roof
antenna. Yapaia reads its position over **Modbus TCP** — no second USB
receiver needed. Works with the RUT50 and other RutOS routers with GPS that
share the same register map (RUTX50, RUTM50, RUT955 …).

1. On the router (RutOS web UI): **Services → GPS** — enable GPS, antenna
   connected.
2. **Services → Modbus → Modbus TCP Server** — enable it, port `502`,
   device ID `1`, and allow access from the LAN.
3. In the add-on configuration: `gps_source: rut50`. If the router is not at
   the factory address `192.168.1.1`, put its address into `rut50_host`
   (`192.168.2.1` or `192.168.2.1:502`). Restart the add-on.

Yapaia reads the router's registers once per second (latitude, longitude, fix
time, speed, satellites). The router reports no heading; Yapaia derives it
from two consecutive fixes. When the router loses reception it keeps reporting
its last coordinates — Yapaia only passes a fix on when the fix time changes,
so a lost signal shows up as GPS loss instead of a frozen position.
The health check (**⚙ → 🩺**) tells you whether the router answers on Modbus.

Source priority is `gpsd > RUT50 > browser > Companion App > simulator`.

## Configuration options

The rarely-touched options sit in **collapsible groups**; what you set most
often stays open at the top. This needs **Home Assistant 2025.10 or newer**.

| Group | Option | Type | Default | Meaning |
|---|---|---|---|---|
| (open) | `region` | string (optional) | *(empty)* | Which map region to use, e.g. `germany`. Empty = the setup wizard inside Yapaia lets you choose one. Regions are downloaded and built inside Yapaia (**⚙ → 🗺️ Karten verwalten**), not here. |
|  | `gps_source` | `usb` \| `network` \| `rut50` \| `companion_app` \| `none` | `none` | Where the position comes from. `usb` starts gpsd for a receiver on a USB port; `rut50` reads the GPS of a Teltonika router over Modbus TCP; `companion_app` reads a Home Assistant `device_tracker` fed by the Companion App; `none` leaves the browser as the source. Browser positions are accepted at **every** value. |
|  | `gps_device` | string (optional) | *(empty)* | Which serial device is the GPS receiver, e.g. `/dev/serial/by-id/usb-u-blox_AG_…-if00` — **with** the leading slash. Only needed when several serial devices are present and none identifies itself as a GNSS receiver — see "Which device gets used" above. |
|  | `rut50_host` | string (optional) | *(empty)* | Only with `gps_source: rut50`: the router's address, `host` or `host:port`. Empty = `192.168.1.1:502`. |
|  | `ha_device_tracker` | string (optional) | *(empty)* | Which `device_tracker` entity to read, e.g. `device_tracker.my_phone`. Only needed with `gps_source: companion_app` **and** more than one candidate. |
| `search` | `photon_enabled` | bool | `true` | Full address search via Photon, including house numbers. `false` = RAM-saver: falls back to the built-in lightweight index (places and streets, no house numbers). |
|  | `photon_xmx_mb` | int 256–4096 | `1024` | Photon memory cap (JVM `-Xmx`). See the RAM table above. |
| `routing` | `valhalla_memory_mb` | int 512–8192 | `2048` | A planning figure for Valhalla's memory need. Yapaia does not enforce it; Valhalla's cache size is fixed when the routing graph is built. |
| `display` | `theme` | `light` \| `dark` \| `system` \| `sun` | `light` | Light/dark for the interface **and** the map. `system` follows the device's own light/dark setting; `sun` follows sunrise/sunset at the current position — usually the better one in a vehicle. This is a **default**: it applies only to devices that have not picked a mode in the app under "Design". See "How the theme default works". |
| `online` | `enabled` | bool | `false` | Allows optional online services while a connection exists: roadworks, closures and warnings from the German motorway authority (Autobahn GmbH), and details from OpenStreetMap, Wikipedia and Wikimedia Commons for a place you tap. Only the request goes out (for a place: its coordinates and name) — never your position, route or a device identifier. Navigation itself stays fully offline. |
|  | `tankerkoenig_api_key` | password (optional) | *(empty)* | Free key from creativecommons.tankerkoenig.de: the fuel station search then shows current prices for the active profile's fuel type (German stations). Sends the area of the stations found, rounded to about 5 km, to Tankerkönig. Only with `online.enabled`. |
| `bord` | `grauwasser`, `frischwasser`, `batterie`, `aussentemperatur` | entity ID (optional) | *(empty)* | Home Assistant sensors for grey water, fresh water and house battery (percent) and outside temperature (°C). Empty = that note is off. See "On-board sensors" in the user manual. |
|  | `grauwasser_ab`, `frischwasser_bis`, `batterie_bis`, `frost_bis` | int | `80`, `20`, `30`, `1` | Thresholds: grey water at or above, fresh water and battery at or below (percent), frost at or below (°C). |
| `home_assistant` | `mqtt_enabled` | bool | `false` | Additionally publishes the values over MQTT (Mosquitto add-on). Not needed — Home Assistant gets everything through the Yapaia integration. |
|  | `mqtt_prefix` | string | `yapaia` | MQTT topic prefix. |
| `advanced` | `gps_simulator` | bool | `false` | Unlocks the built-in test driver (see below). **Off by default on purpose** — it can inject arbitrary positions and displaces the real receiver. |
|  | `log_level` | `debug` \| `info` \| `warn` \| `error` | `info` | Add-on log verbosity. |

The language of the app, of spoken announcements and of these option labels
follows Home Assistant (German, otherwise English); there is no option for it.

## How the theme default works

`display.theme` is a **default for devices that have not chosen**, not an
override. The precedence a browser applies on load is:

1. **the choice made in Yapaia** (⚙ → "Karte & Darstellung" → "Design") —
   stored on the add-on, shared across devices;
2. **`display.theme`** — this add-on option;
3. the device's own cached value, so a reload is correct even when the add-on
   is unreachable;
4. the built-in default, `light`.

Two consequences worth knowing:

- Changing the option takes effect on the next load of every device that never
  picked a mode.
- A device that *did* pick keeps its choice. That is how the dashboard tablet
  can follow the sun while a phone stays light.

Besides light and dark, the colours, fonts and shapes of Yapaia Go can follow a
**design scheme** shared by all Yapaia modules. The scheme is chosen in Home
Assistant, on the device "Yapaia Design" (one scheme for everything) or with the
"Design" selection of the device "Yapaia Go". See `docs/design-schemata.md` in
the repository.

## Test drive (GPS simulator)

Yapaia can drive a planned route by itself, at each section's own speed
limit, with a fast-forward slider (1× to 32×). Useful for checking a route,
the turn instructions and the announcements without moving the vehicle.

**It is locked by default.** The simulator replaces the real GPS position for
the whole add-on, which must never happen by accident while driving.
To unlock it:

1. Settings → Add-ons → Yapaia Go → **Configuration**, group **Advanced**
2. Switch on "Testfahrer freischalten" (`gps_simulator`), save
3. **Restart** the add-on

The entry **🧪 Testfahrt** then appears in the ⚙ menu. Without it the entry is
not shown at all.

Plan a route first, then press **▶ Route abfahren**. The panel shows how many
sections are being driven with a *substitute* speed because no limit is known
for them (`3/120 Abschnitte ohne Limit`).

Switch the option off again when you are done. The real position source takes
over after the next restart.

## Home Assistant: the Yapaia integration

Yapaia Go registers with the central Home Assistant integration **"Yapaia"**
(the same one Yapaia Beat and Yapaia Vision use). The add-on brings it along:

1. Start or update the add-on. It places the integration in
   `custom_components/yapaia` (only if missing or older) and shows a
   notification: **restart Home Assistant** once (Settings → System → Restart).
2. After the restart, *Settings → Devices & Services* offers **Yapaia Go**
   ("Yapaia Go was found. Set it up?"). Confirm — done. No address, no token to
   type.

You then get a **device "Yapaia Go"** with entities that can be renamed, have
history, survive an HA restart and can be operated. The entity IDs are fixed
(the display names follow the Home Assistant language):

| Entity | What it shows / does |
|---|---|
| `sensor.yapaia_go_anweisung` | next instruction (icon follows the turn) |
| `sensor.yapaia_go_anweisung_entfernung` | metres to that turn |
| `sensor.yapaia_go_ankunft`, `…_restweg`, `…_ziel`, `…_zustand` | arrival time, distance remaining, destination, navigation state |
| `sensor.yapaia_go_tempo`, `…_tempolimit`, `…_tempolimit_fahrzeug`, `…_hoehe` | speed, posted limit, limit for this vehicle, altitude |
| `binary_sensor.yapaia_go_zu_schnell` | speeding (sign or vehicle limit, whichever is lower) |
| `device_tracker.yapaia_go_standort` | the vehicle on the map |
| `sensor.yapaia_go_ort` | the place (town/village) where the vehicle is, offline from the search index; attributes `land`, `land_code` |
| `sensor.yapaia_go_adresse` | the address at the vehicle (e.g. “Hauptstraße 1, 12345 Musterstadt”); attributes `strasse`, `hausnummer`, `plz`, `ort`, `land`, `land_code`, `entfernung_m` |
| `sensor.yapaia_go_sprache` | the language Yapaia Go uses (`de` / `en`) |
| `select.yapaia_go_profil` | vehicle profile |
| `select.yapaia_go_design` | design scheme of this module |
| `text.yapaia_go_ziel_eingabe` | type a destination → route and go |
| `button.yapaia_go_pausieren`, `…_fortsetzen`, `…_beenden` | pause, resume, stop |

**Actions** (automations, scripts, voice): `yapaia.go_ziel_setzen` (address,
place or coordinates), `yapaia.go_zwischenziel_einfuegen`,
`yapaia.go_navigation_pausieren` / `…_fortsetzen` / `…_beenden`,
`yapaia.go_profil_waehlen`, and `yapaia.go_befehl` — a sentence like
"Fahre mich nach Magdeburg" or "Take me to Magdeburg"; the answer comes back as
the result.

**Triggers** (device triggers in the automation editor, and the event
`yapaia_ereignis`): *Ziel erreicht*, *Zu schnell*, *GPS verloren*,
*Neuberechnung fehlgeschlagen*.

The generated dashboard (below) uses these entities. **MQTT** is available in
addition (`mqtt_enabled`, off by default) for anyone who wants the values on a
broker as well; the integration does not need it.

The interface between add-on and integration is protected by its own token,
created on first start and stored in the add-on's private `/data`. See
`docs/integration-protokoll.md` in the repository.

## Your own Lovelace dashboard

Two files are placed under Home Assistant's `www/yapaia/` on every add-on
start, i.e. reachable at `/local/yapaia/…`:

| File | What it is |
|---|---|
| `yapaia-map-card.js` | The custom card that shows the map **with the route and your own position** (it frames the add-on's own map page, so offline tiles and route styling are identical to the app). |
| `dashboard.yaml` (and the identical `dashboard.txt`) | A ready-made dashboard: map, next instruction with arrow + distance, speed gauge, speeding warning, destination / remaining distance / ETA / speed limit / state, vehicle profile and pause/resume/stop buttons. The `.txt` twin exists so the browser *shows* the text instead of downloading it. |

Setup, all from the GUI:

1. **Settings → Dashboards → ⋮ → Resources → Add resource**
   URL `/local/yapaia/yapaia-map-card.js`, type **JavaScript module**.
   Without this step the map tile stays empty.
2. Open `http://<your-ha>:8123/local/yapaia/dashboard.txt` and copy it.
3. **Settings → Dashboards → Add dashboard → New dashboard from scratch**.
4. In the new dashboard: pencil → ⋮ → **Raw configuration editor**, replace
   everything with the copied text, save.

The file is generated rather than shipped: entity IDs can be renamed in Home
Assistant, so 30 seconds after start the add-on looks up which entities
actually exist and writes those IDs into the file — first the ones of the
Yapaia integration (`…yapaia_go_…`), otherwise MQTT ones if you use MQTT.
Entities it cannot find get the documented name, and the file says which ones
at the top.

Further ready-made dashboards for the other Yapaia modules (Cockpit Sport,
Rangieren, Stellplatz) are in the repository folder `dashboards/`.

**If every card says "Entity not found":** "Yapaia Go" is not set up in the
Yapaia integration yet (*Settings → Devices & Services*, confirm "Yapaia Go";
if it does not appear, restart Home Assistant once after the first add-on
start). The map card works regardless — it comes straight from the add-on.

**The numbers only live while the add-on receives positions.** With
`gps_source: none` the position comes from the BROWSER — close Yapaia and the
dashboard freezes. A dashboard that keeps running without Yapaia open needs a
source inside the add-on: `usb` (GPS receiver), `rut50` (router) or
`companion_app` (Companion App). The built-in test driver also keeps running,
it lives in the add-on.

If the map card reports that no add-on was found, the Supervisor gave this
add-on a different slug than expected (it prefixes the repository, e.g.
`abc12345_yapaia_go`). The card searches for it; you can also pin it:

```yaml
type: custom:yapaia-map-card
addon: abc12345_yapaia_go
```

## Maps from your own map server

Building routing for a large country on a Home Assistant machine takes hours.
A **Yapaia map server** (repository `Yapaia/map-server`, a Docker container
for a VPS) downloads Geofabrik extracts, combines the ones you pick and
builds map tiles, search index and routing graph exactly like Go does.

1. Install the map server (see its README), build a package and copy the
   **download token** shown in its web interface.
2. In Go: **⚙ → 🗺️ Karten verwalten → Kartenserver**, enter the address (e.g.
   `https://maps.example.org`) and the token, tap **Verbinden**. Go checks
   the connection right away.
3. The packages appear in the map list. **Installieren** / **Update**
   downloads map, search and routing, verifies the checksums and only then
   swaps them in. Search and routing may come zstd-compressed (about half
   the download); Go unpacks them after the check. If anything fails, your
   current data stays untouched.

Country packages from one Europe-wide build (e.g. Germany, Switzerland,
France) **add up**: their routing tiles are combined into one graph, and
routes across the borders work as with a single big graph. A routing package
from a different build, or any other routing package, **replaces** the
current graph – the job message then names the countries whose routing has
to be downloaded again. Deleting a map also removes that country's routing
tiles (border tiles needed by a neighbour stay). Valhalla reloads right away.
The token is never shown again; leave the field empty to keep it.

## Add-on marketplace

Go installs add-ons from the official **Yapaia marketplace**
(`https://addons.yapaia.cloud`). Every package there is signed; Go refuses
packages without a valid signature. Paid add-ons also need a license, which is
bound to this Go installation.

1. Free add-ons need no setup: **⚙ → 🧩 Add-on-Store → Registry
   aktualisieren** loads the official catalog.
2. For purchased add-ons: under **Marktplatz** enter
   `https://addons.yapaia.cloud` and the **Konto-Token** from your
   marketplace account, then tap **Verbinden**.

Entries show **✓ Geprüft** when their signature is valid, otherwise
**Unsigniert**.

**Installieren** downloads and checks the package, then shows the
permissions it asks for — confirm with **Bestätigen & installieren**. For a
paid add-on Go activates its license during installation; if that fails, the
add-on is installed but stays disabled until you tap **Lizenz aktivieren**
under *Updates → Installierte Add-ons*.

Versions the marketplace has revoked are disabled at the next sync and can no
longer be installed or enabled.

The marketplace address must use `https`. Go itself and Home Assistant keep
working over plain `http` on your local network — `https` only applies to the
connection from Go to the marketplace.

**Installing from a file** (*Add-on-Datei installieren*, a `.tar.gz` from a
USB stick or download) works without a marketplace, but such a package
carries no signature: it is accepted only with **Entwicklermodus** switched
on.

**Entwicklermodus** (same section) allows unsigned packages and a marketplace
without `https` — for developing your own add-ons or testing a marketplace on
your LAN. Leave it off otherwise.

## Data & updates

All map, routing, search and database data lives under `/share/yapaia/` on the
host, **not** inside the add-on container. Updating the add-on replaces the
container image only — everything under `/share/yapaia/` (your installed map
regions, Valhalla graph, search index, profiles and favorites database)
survives untouched.
