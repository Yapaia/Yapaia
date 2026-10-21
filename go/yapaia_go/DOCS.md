# Yapaia Go — Home Assistant Add-on

Offline-capable motorhome navigation (maps, truck/RV-aware routing, GPS,
search) running as a Home Assistant add-on. It connects to Home Assistant
through the **Yapaia** integration, which the add-on brings along (see "Home
Assistant: the Yapaia integration" below); MQTT is optional.

## Installation

1. Settings → Add-ons → Add-on Store → ⋮ → Repositories → add
   `https://github.com/Yapaia/yapaia`.
2. Find "Yapaia Go" in the store section "Yapaia" and click Install. The
   Supervisor downloads a ready-made image for your architecture; nothing is
   built on your device.
3. Optional: read "RAM recommendation" below before the first start if your
   Home Assistant VM is short on memory. Setting `region` beforehand is not
   necessary — with it empty, the setup wizard inside Yapaia lets you choose
   and install a map region.
4. Start the add-on, then open it from the HA sidebar (Ingress — no
   separate login, HA's own auth/session covers it, including over Nabu
   Casa remote access).

## RAM recommendation (IMPORTANT — read before installing on a shared HAOS-VM)

Home Assistant itself, Mosquitto, and any other add-ons you run all share
the SAME HAOS-VM's RAM budget as Yapaia Go. The reference "Mini-PC" budget
from the main repo (docs/01-architecture.md §4) is per-*service*, not
per-VM:

| Component | Typical RAM |
|---|---|
| Core (Node/Fastify) | ≤ 300 MB |
| Valhalla (routing, DE-scale map) | ≤ 1.5 GB |
| Photon (search, DE-scale index, default `-Xmx1g`) | ~600 MB – 1 GB RSS (`Xmx` + 150–300 MB JVM overhead) |
| gpsd | negligible (a few MB) |
| **Yapaia subtotal** | **~2.4 – 2.9 GB** |

Add Home Assistant Core + Supervisor + Mosquitto + whatever else you run
(commonly another 1–1.5 GB+) and a comfortable **HAOS-VM should have ≥ 6 GB
RAM** if you intend to install a Germany-scale (or similarly large) map
region with Photon search enabled.

**If you're tighter on RAM:**

- Turn `photon_enabled` **off** in the add-on options (group **Search**). Search automatically
  falls back to the built-in offline lite-search index (place names +
  street names, no house numbers, "vereinfachte Suche" — see the main
  repo's `services/photon/README.md` "Abschalt-Option W-12" for exactly
  what you lose/keep). This alone removes the single biggest RAM consumer.
- Lower `photon_xmx_mb` instead of disabling it entirely, if you want
  search but with a smaller heap (smaller/regional map extracts need much
  less than the DE-scale numbers above — see `services/photon/README.md`'s
  RAM table for smaller-region estimates).
- Install a smaller region (a single country/state) instead of all of
  Germany — Valhalla's own RAM footprint scales with graph size.
- If even that doesn't fit: run the **standalone `docker-compose.yml`**
  variant instead, in its own LXC/VM alongside (not inside) your HAOS-VM —
  see the main repo's root `README.md` / `docker-compose.yml`. This is also
  the repo's own CI/development reference environment, so it's a
  well-exercised path, not a second-class one.

## USB-GPS passthrough

Set `gps_source: usb` in the add-on's Configuration tab (as of 0.3.1 the
default is `none`, because a USB receiver is an accessory most installs don't
have — with `usb` set on a machine without one, the preflight warned forever
about a device that was never there).
`config.yaml` declares **`uart: true`** plus `usb: true` + `udev: true`.

**`uart` is the one that matters**, and it was missing until 0.8.10. `usb` and
`udev` make the receiver *visible* — it shows up under `/dev/serial/by-id/`,
the health check lists it, the device selection picks it. But the container may
not *open* it, and gpsd says so:

```
gpsd:ERROR: SER: device open of /dev/serial/by-id/… failed: Operation not permitted(1)
gpsd:ERROR: can't run with neither control socket nor devices open
```

`uart: true` maps the host's serial devices into the container **with the
permission to open them**. For comparison: the ESPHome add-on, which flashes
over USB serial, declares `uart: true` and no `usb` at all — whether `usb` is
still needed here is an open question, kept for now because `udev` supplies the
events that make a later-plugged receiver noticed.

Device permissions are granted when the container starts, so **restart the
add-on** after changing anything here.

### If Home Assistant runs in a VM (Proxmox, ESXi, …)

Then the receiver has to be handed through **twice**, and the two stages fail
differently:

| Stage | Who does it | What it looks like when it is missing |
|---|---|---|
| 1. Host → VM | the hypervisor (e.g. Proxmox: *Hardware → Add → USB Device*) | the device does not appear at all; the health check's device list is empty |
| 2. VM → add-on container | this add-on's `uart: true` | the device **is** listed, but gpsd reports `Operation not permitted` |

So the `Operation not permitted` error is always stage 2. If stage 1 were the
problem, there would be nothing to name.

On Proxmox, **"Use USB Vendor/Device ID"** and **"Use USB Port"** both work.
For a GPS dongle the vendor/device ID (a u-blox receiver reports `1546:01a7`)
is usually the better one: it follows the receiver if you move it to another
socket. The port variant binds to the physical socket instead. USB3 does not
need to be ticked — these receivers are USB 2 serial devices.

1. Plug in a USB GPS receiver (most USB-CDC-ACM "GPS mice" show up as
   `/dev/ttyACM0`; USB-serial-adapter-based ones as `/dev/ttyUSB0`).
2. Restart the add-on (device passthrough is evaluated at container start).
3. Check the add-on log: the internal `gpsd` service logs which device it
   picked and why, or why it picked none (retried every 15 s, never crashes
   the add-on).
4. In Yapaia Go, **⚙ → 🩺 Installation prüfen** shows under *Position*
   whether gpsd delivers a fix.

### Which device gets used

You normally do not have to say. Yapaia decides in this order:

1. **`gps_device` is set** → exactly that path, and nothing else. If it is not
   there, no other device is used: naming a device and silently getting a
   different one would be worse than an error message.
2. **A device identifies itself as a GNSS receiver** under
   `/dev/serial/by-id/` (u-blox, SiRF, MediaTek, Garmin, or a name containing
   GPS/GNSS). The VK-162 and similar "G-Mouse" dongles carry a u-blox chip and
   are recognised this way.
3. **There is exactly one serial device** → that one. It cannot be confused
   with anything.
4. **Several devices, none of which says GPS** → Yapaia touches none of them
   and asks you to set `gps_device`.

Step 4 matters on a Home Assistant machine, because a Zigbee coordinator
(SkyConnect, Sonoff, ConBee) or a Z-Wave stick appears under exactly the same
`/dev/ttyACM*` / `/dev/ttyUSB*` names, and `usb: true` passes all of them into
the container. gpsd writes probe strings to a device to identify the receiver
type — pointing it at a radio coordinator that belongs to another add-on is
not harmless. Up to and including 0.8.1 Yapaia simply took the first match.

**Use the `/dev/serial/by-id/…` path, not `/dev/ttyACM0`.** The number shifts
as soon as another USB stick is added or removed; the `by-id` name does not.
You do not need a terminal to find it: with `gps_source: usb` set and gpsd not
answering, the health check inside Yapaia lists every serial device it can see,
with the full path to copy.

**Start the path with a slash.** Copying it out of the health-check message
drops the leading `/` easily, and the input field does not show it. Without it
the path is *relative* — what it resolves to then depends on the service's
working directory, and it points at nothing. Since 0.8.7 Yapaia adds the slash
back and says that it did, so a missing one is no longer a dead receiver; fix
it in the configuration anyway.

### When gpsd does not come up

The health check reports the reason, not just the symptom. `find-gps-device.sh`
writes what it chose — or why it chose nothing — to `/run/yapaia/gps-status`
(first line `suchend`/`bereit`, then the plain-text reason), and the position
check puts that text at the **top** of its remedy:

> Der gpsd-Dienst meldet: gps_device ist auf '/dev/ttyUSB9' gesetzt, aber dort
> liegt nichts. …

Up to 0.8.6 that reason existed but only reached the add-on log, while the
health check showed a generic "gpsd is on but does not answer" plus a list of
possible causes. The file lives under `/run` on purpose: it is runtime state
that **should** vanish on restart — under `/share` a stale reason would survive
a reboot and be worse than none.

#### When gpsd starts but dies immediately

This looks like a healthy service and is not one:

```
[23:51:37] INFO: gpsd: benutze /dev/serial/by-id/usb-u-blox_AG_-…
[23:51:38] INFO: gpsd: benutze /dev/serial/by-id/usb-u-blox_AG_-…
[23:51:39] INFO: gpsd: benutze /dev/serial/by-id/usb-u-blox_AG_-…
```

One line per second means the device **is** being found and gpsd is dying right
after launch; s6 restarts the service, the device search runs again, and the
log reports success again. Nothing on that screen says anything failed.

Since 0.8.9 the service handles this itself:

- it does **not** `exec` gpsd any more, so gpsd's exit code reaches the log —
  with an explicit note that the device selection is *not* the problem;
- it keeps a start marker under `/run/yapaia/gpsd-letzter-start`; a run less
  than 8 seconds after the previous one is reported as a restart loop and
  **throttled** to one message every 30 seconds (`GPSD_MIN_LAUFZEIT_S` /
  `GPSD_BREMSE_S` override both, for tests);
- it starts gpsd with `-D 2` so gpsd itself can say what went wrong;
- it checks `command -v gpsd` first and reports the `PATH` it searched if the
  binary is missing.

The image build checks this too, since 0.8.9: `yapaia_go/test/gpsd-im-container.sh`
starts gpsd inside the built image (no device, control socket only) and verifies
something is listening on 2947. `command -v` alone only proves a file exists —
`osmium` was once missing from this image entirely and the search-index build
broke on the device while CI stayed green.

If you don't have (or don't yet have) a GPS receiver connected, leave
`gps_source` at `none` (the default): the app remains fully usable, and the
position then comes from the browser — or, if the browser won't hand over its
sensor, from the Home Assistant Companion App (see below).

## Position from the Home Assistant Companion App

The browser only releases its GPS sensor over HTTPS. If Home Assistant runs
over plain `http://`, no phone, tablet or car radio will give Yapaia a
position, and no add-on setting can change that. The Companion App reports to
Home Assistant instead of to the browser, and keeps reporting with the screen
locked.

Set `gps_source: companion_app`. That is normally all: if exactly one
`device_tracker` entity in Home Assistant carries coordinates, Yapaia picks it
itself. If there are several, none is guessed — the second one could be
someone else's phone, and a navigation that silently follows it is worse than
one that asks.

**Since 0.7.1 you pick it in the app, not in a text field.** Open Yapaia Go →
**⚙ → 🩺 Installation prüfen**; below the checks is a drop-down listing the
`device_tracker` entities your Home Assistant actually has. Picking one
**takes effect immediately** — no add-on restart. The `ha_device_tracker`
option below still works and acts as the default; the pick in the UI wins.

Source priority is `gpsd > browser > Companion App > simulator`: the app reports
at intervals, so it is the source that *exists* when the browser gives none —
not a replacement for a live browser fix.

## Configuration options

The rarely-touched options sit in **collapsible groups** (the same shape the
"Terminal & SSH" add-on uses for its "Server" block); what you actually set
stays open at the top. This needs **Home Assistant 2025.10 or newer** — nested
add-on configuration does not exist before that, and `config.yaml` declares the
minimum so the Supervisor says so plainly instead of drawing half a page.

> **Upgrading from 0.8.3 or earlier:** the keys move inside the stored
> configuration. `init-yapaia-config.sh` reads both shapes (new path first,
> then the old flat key), but note your values down before updating and check
> them afterwards.

| Group | Option | Type | Default | Meaning |
|---|---|---|---|---|
| (open) | `region` | string (optional) | *(empty)* | Which map region to use, e.g. `germany`. Empty = the setup wizard inside Yapaia lets you choose one. Regions are downloaded and built inside Yapaia (**⚙ → 🗺️ Karten verwalten**), not here. |
|  | `gps_source` | `usb` \| `network` \| `companion_app` \| `none` | `none` | Where the Core's position service gets a GPS fix from. `usb`/`network` start gpsd; `companion_app` reads a Home Assistant `device_tracker` fed by the Companion App; `none` leaves the browser as the source. Browser positions are accepted at **every** value. The old value `ha_tracker` was removed in 0.8.8 — pick `companion_app` once if you had it. (`Position.source` in the API still says `ha_tracker`; that is the wire format, not a setting.) |
|  | `gps_device` | string (optional) | *(empty)* | Which serial device is the GPS receiver, e.g. `/dev/serial/by-id/usb-u-blox_AG_…-if00` — **with** the leading slash. Only needed when several serial devices are present and none identifies itself as a GNSS receiver — see "Which device gets used" above. |
|  | `ha_device_tracker` | string (optional) | *(empty)* | Which `device_tracker` entity to read, e.g. `device_tracker.my_phone`. Only needed with `gps_source: companion_app` **and** more than one candidate. With exactly one, Yapaia picks it itself; with several you can also choose in the app's health check, which takes effect immediately. |
| `search` | `photon_enabled` | bool | `true` | Full-text search via Photon. `false` = RAM-saver, falls back to the offline lite-search index (W-12). |
|  | `photon_xmx_mb` | int 256–4096 | `1024` | Photon JVM heap cap (`-Xmx`). See the RAM table above. |
| `routing` | `valhalla_memory_mb` | int 512–8192 | `2048` | Documented RAM budget for Valhalla; informational only (Valhalla's actual runtime cache size is set at graph-build time, not per start — see the comment in `yapaia_go/rootfs/etc/s6-overlay/s6-rc.d/valhalla/run`). |
| `display` | `theme` | `light` \| `dark` \| `system` \| `sun` | `light` | Light/dark for the interface **and** the map. `system` follows the device's own light/dark setting; `sun` follows sunrise/sunset at the current position — usually the better one in a vehicle. This is a **default**, not a remote control: it applies only to devices that have not picked a mode in the app under "Design". See "How the theme default works" below. |
| `online` | `enabled` | bool | `false` | Allows optional online services while a connection exists: roadworks, closures and warnings from the German motorway authority (Autobahn GmbH), and details from OpenStreetMap, Wikipedia and Wikimedia Commons for a place you tap. Only the request goes out (for a place: its coordinates and name) — never your position, route or a device identifier. Navigation itself stays fully offline. |
|  | `tankerkoenig_api_key` | password (optional) | *(empty)* | Free key from creativecommons.tankerkoenig.de: the fuel station search then shows current prices for the active profile's fuel type (German stations). Sends the area of the stations found, rounded to about 5 km, to Tankerkönig. Only with `online.enabled`. |
| `bord` | `grauwasser`, `frischwasser`, `batterie`, `aussentemperatur` | entity ID (optional) | *(empty)* | Home Assistant sensors for grey water, fresh water and house battery (percent) and outside temperature (°C). Empty = that note is off. See "On-board sensors" in the user manual. |
|  | `grauwasser_ab`, `frischwasser_bis`, `batterie_bis`, `frost_bis` | int | `80`, `20`, `30`, `1` | Thresholds: grey water at or above, fresh water and battery at or below (percent), frost at or below (°C). |
| `home_assistant` | `mqtt_enabled` | bool | `false` | Additionally publishes the values over MQTT (Mosquitto add-on). Not needed — Home Assistant gets everything through the Yapaia integration. |
|  | `mqtt_prefix` | string | `yapaia` | MQTT topic prefix (docs/03-api-spec.md §4). |
| `advanced` | `gps_simulator` | bool | `false` | Unlocks the built-in test driver (see below). **Off by default on purpose** — it can inject arbitrary positions and displaces the real receiver. |
|  | `log_level` | `debug` \| `info` \| `warn` \| `error` | `info` | Core log verbosity (pino). |

## How the theme default works

`display.theme` is a **default for devices that have not chosen**, not an
override. The precedence a browser applies on load is:

1. **the choice made in Yapaia** (Design panel) — stored server-side under the
   `theme` settings key, shared across devices;
2. **`display.theme`** — this add-on option;
3. the device's own localStorage cache, so a reload is correct even with the
   Core unreachable;
4. the built-in default, `light`.

The add-on default deliberately outranks the device cache. The cache also holds
mere boot *results*, not only decisions — were it to win, opening Yapaia once
on a tablet would immunise it against the option forever.

Two consequences worth knowing:

- Changing the option takes effect on the next load of every device that never
  picked a mode — including ones that have opened Yapaia before.
- A device that *did* pick keeps its choice. That is how the dashboard tablet
  can follow the sun while a phone stays light.

The default is **not** written into the settings store. If it were, it would be
indistinguishable from an operator's choice, and changing the option later
would silently do nothing. It is served separately by
`GET /api/v1/settings/defaults`, which reports `{ "theme": null }` when no
add-on supplies one (standalone operation).

The option offers `sun` because "follow the sun" is what it does; the Core has
known that mode as `auto` since E07-T3. `init-yapaia-config.sh` translates the
one into the other at exactly one place — without it the web UI would reject
`sun` as an unknown mode and the option would fail silently.

## Test drive (GPS simulator)

Yapaia can drive a planned route by itself, at each section's own speed
limit, with a fast-forward slider (1× to 32×). Useful for checking a route,
the turn instructions and the announcements without moving the vehicle.

**It is locked by default.** The simulator replaces the real GPS position for
the whole add-on process, which must never happen by accident while driving.
To unlock it:

1. Settings → Add-ons → Yapaia Go → **Configuration**
2. Tick `gps_simulator`, save
3. **Restart** the add-on

The entry **🧪 Testfahrt** then appears in the ⚙ menu. Without the tick it
is not shown at all — a button that always fails is worse than no button.

Plan a route first, then press **▶ Route abfahren**. The panel shows how many
sections are being driven with a *substitute* speed because no limit is known
for them (`3/120 Abschnitte ohne Limit`) — a partly guessed run must not look
like a fully known one.

Turn the tick back off when you are done. The real position source takes over
again after the next restart.

## Home Assistant: the Yapaia integration

Yapaia Go registers with the central Home Assistant integration **"Yapaia"**
(the same one Yapaia Beat uses). The add-on brings it along:

1. Start or update the add-on. It places the integration in
   `custom_components/yapaia` (only if missing or older) and shows a
   notification: **restart Home Assistant** once.
2. After the restart, *Settings → Devices & Services* shows
   **"Yapaia Go discovered"**. Confirm — done. No address, no token to type.

You then get a real **device "Yapaia Go"** with entities that can be renamed,
have history, survive an HA restart and can be operated:

| Entity | What it shows / does |
|---|---|
| `sensor.yapaia_go_anweisung` | next instruction (icon follows the turn) |
| `sensor.yapaia_go_anweisung_entfernung` | metres to that turn |
| `sensor.yapaia_go_ankunft`, `…_restweg`, `…_ziel`, `…_zustand` | arrival time, distance remaining, destination, navigation state |
| `sensor.yapaia_go_tempo`, `…_tempolimit`, `…_tempolimit_fahrzeug`, `…_hoehe` | speed, posted limit, limit for this vehicle, altitude |
| `binary_sensor.yapaia_go_zu_schnell` | speeding (sign or vehicle limit, whichever is lower) |
| `device_tracker.yapaia_go_standort` | the vehicle on the map |
| `select.yapaia_go_profil` | vehicle profile |
| `text.yapaia_go_ziel_eingabe` | type a destination → route and go |
| `button.yapaia_go_pausieren`, `…_fortsetzen`, `…_beenden` | pause, resume, stop |

**Actions** (automations, scripts, voice): `yapaia.go_ziel_setzen` (address,
place or coordinates), `yapaia.go_navigation_pausieren` / `…_fortsetzen` /
`…_beenden`, `yapaia.go_profil_waehlen`, and `yapaia.go_befehl` — a sentence
like "Fahre mich nach Magdeburg", the answer comes back as the result.

**Triggers** (device triggers in the automation editor, and the event
`yapaia_ereignis`): *Ziel erreicht*, *Zu schnell*, *GPS verloren*,
*Neuberechnung fehlgeschlagen*.

The generated dashboard (below) uses these entities. **MQTT** is available in
addition (`mqtt_enabled`, off by default) for anyone who wants the values on a
broker as well; the integration does not need it.

The interface (`/yapaia/v1/…`) is protected by its own token, created on first
start and stored in the add-on's private `/data`. See
`docs/integration-protokoll.md` in the repository.

## Your own Lovelace dashboard

Two files are placed under Home Assistant's `www/yapaia/` on every add-on
start, i.e. reachable at `/local/yapaia/…`:

| File | What it is |
|---|---|
| `yapaia-map-card.js` | The custom card that shows the map **with the route and your own position** (it frames the add-on's own `embed.html`, so offline tiles and route styling are identical to the app). |
| `dashboard.yaml` (and the identical `dashboard.txt`) | A ready-made dashboard: map, next instruction with arrow + distance, speed gauge, speeding warning, destination / remaining distance / ETA / speed limit / state, vehicle profile and pause/resume/stop buttons. The `.txt` twin exists so the browser *shows* the text instead of downloading it. |

Setup, all from the GUI:

1. **Settings → Dashboards → ⋮ → Resources → Add resource**
   URL `/local/yapaia/yapaia-map-card.js`, type **JavaScript module**.
   Without this step the map tile stays empty — this is the single most
   common reason the dashboard "doesn't work".
2. Open `http://<your-ha>:8123/local/yapaia/dashboard.txt` and copy it.
3. **Settings → Dashboards → Add dashboard → New dashboard from scratch**.
4. In the new dashboard: pencil → ⋮ → **Raw configuration editor**, replace
   everything with the copied text, save.

**Why `dashboard.yaml` is generated rather than shipped:** the entity IDs
can be renamed in Home Assistant. The add-on looks up, 30 s after start,
which entities actually exist (`apps/core/src/ha/dashboard.ts`) and writes
those IDs into the file — first the ones of the Yapaia integration
(`…yapaia_go_…`), otherwise MQTT ones if you use MQTT. Entities it cannot
find get the documented name, and the file says which ones at the top.

**If every card says "Entity not found":** "Yapaia Go" is not set up in the
Yapaia integration yet (*Settings → Devices & Services*, confirm "Yapaia Go
discovered"; if it does not appear, restart Home Assistant once after the
first add-on start). The map card works regardless — it comes straight from
the add-on.

**And the numbers only live while the add-on receives positions.** With
`gps_source: none` the position comes from the BROWSER — close Yapaia and the
dashboard freezes. A dashboard that keeps running without Yapaia open needs a
source inside the add-on: `usb` (GPS receiver) or `companion_app` (Companion
app). The built-in test driver also keeps running, it lives in the add-on.

If the map card reports that no add-on was found, the Supervisor gave this
add-on a different slug than expected (it prefixes the repository, e.g.
`abc12345_yapaia_go`). The card searches for it; you can also pin it:

```yaml
type: custom:yapaia-map-card
addon: abc12345_yapaia_go
```

## Maps from your own map server

Building routing for a large country on a Home Assistant box takes hours.
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
   swaps them in. If anything fails, your current data stays untouched.

The routing graph from a package **replaces** the current one (there is
only one graph). Valhalla picks it up within 30 seconds, no restart needed.
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
on. Add-ons installed before 0.56.0 keep running.

**Entwicklermodus** (same section) allows unsigned packages and a marketplace
without `https` — for developing your own add-ons or testing a marketplace on
your LAN. Leave it off otherwise.

## Data & updates (W-16)

All map/routing/search/database data lives under `/share/yapaia/` on the
host (via `config.yaml`'s `map: [share:rw]`), **not** inside the add-on
container's own filesystem. Updating the add-on to a new version replaces
the container image only — everything under `/share/yapaia/` (your
installed map region, Valhalla graph, Photon/lite-search index, profiles/
favorites database) survives untouched. See "VM test protocol" below for
how this is actually verified.

## Manual / nightly VM test protocol

A real HAOS install can't run inside this repo's per-PR CI (needs a real
Supervisor, a real Mosquitto add-on, a real VM/hardware). The following is
the checklist an operator (or a nightly job against a HAOS test VM) runs
instead, covering the acceptance criteria from `tasks/E08-home-assistant.md`
E08-T4 that per-PR CI structurally cannot:

### 1. Flow 9 — Add-on install + Ingress UI (acceptance #1)

1. Fresh HAOS VM, add this repository under Add-ons → Repositories.
2. Install "Yapaia Go", set a small `region` (e.g. Liechtenstein, for a
   fast test cycle — see the main repo's `services/valhalla/build-tiles.sh`
   for how a region's tiles get built; for this manual protocol, pre-stage
   a built region's data under `/share/yapaia/` before starting the
   add-on, or install the region through the setup wizard).
3. Start the add-on. Confirm the add-on log shows, in order: valhalla
   ready → core listening on :8099 → (if configured) MQTT connected.
4. Open the add-on from the HA sidebar. Confirm:
   - The map renders (canvas visible, tiles load).
   - The browser's network tab shows every asset/API/WS request scoped
     under the Ingress path (`/api/hassio_ingress/<token>/...`) — this is
     the SAME thing `apps/core/src/static.test.ts`'s "Flow 9 simulation"
     unit-tests server-side (base-href injection); this step is the
     real-Ingress-proxy end-to-end confirmation of it.
   - The WS connection (nav state / position updates) is alive (e.g.
     nudge the simulator source and watch the map marker move).

### 2. MQTT auto-configuration (acceptance #2)

1. With the Mosquitto add-on installed and running, switch on
   `mqtt_enabled` (group `home_assistant`) and start Yapaia Go.
2. In HA: Settings → Devices & Services → MQTT → confirm a "Yapaia Go"
   device appears with the full entity table from
   `docs/04-home-assistant.md` §1, populated with live values during a
   simulator drive.
3. Restart Mosquitto (or the whole HAOS VM) → confirm entities reappear
   (Discovery replay, W-07) without any manual reconfiguration.

### 3. Update preserves data (acceptance #3, W-16)

1. Note the installed add-on version, the current map region, and create a
   test favorite + vehicle profile in the UI.
2. Record a checksum/listing of `/share/yapaia/` (tiles, db, index files).
3. Upgrade the add-on to a newer version (or, for a repeatable nightly
   test, reinstall the SAME version to simulate an update cycle).
4. Confirm: `/share/yapaia/` contents are byte-identical (except any
   expected new files from a real schema migration, see E08-T6), the test
   favorite/profile are still present, and the map/search still work
   without re-downloading anything.

### 4. USB-GPS (acceptance #4)

1. Plug a USB GPS receiver into the HAOS host before starting the add-on.
2. Confirm the add-on log's `gpsd` service line reports the found device
   (see "USB-GPS passthrough" above).
3. Confirm the Yapaia Go UI's GPS status shows a live fix (outdoors / with
   a view of the sky, or using a GPS signal simulator/replay device).
4. Unplug it while the add-on is running → confirm gpsd logs the loss and
   the Core degrades to its documented "GPS lost" behavior (dead-reckoning
   pause per the main repo's navigation/deadreckoning.ts) rather than
   crashing.

Record the outcome of each numbered step (pass/fail + log excerpt) in the
nightly job's summary, or in the PR description if run manually for a
release.
