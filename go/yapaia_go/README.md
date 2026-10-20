# Yapaia Go (Home Assistant Add-on)

Packages Yapaia Go — offline motorhome navigation (`apps/core` + `apps/web`
in the parent repo) — as a Home Assistant add-on: single container, s6-overlay-
supervised, connected to Home Assistant through the "Yapaia" integration
(MQTT optional), served through HA Ingress.

For install steps, RAM sizing, USB-GPS setup, and the manual/nightly VM test
protocol, see [`DOCS.md`](./DOCS.md) (this is also what HA shows in the
add-on's own "Documentation" tab once installed).

For everything else, the parent repo has three entry points:
[`README.md`](../README.md) (what Yapaia Go is),
[`docs/manual.md`](../docs/manual.md) (how to use it) and
[`docs/developers.md`](../docs/developers.md) (how it is built).

## Layout

```
yapaia_go/
├── config.yaml   # HA add-on manifest: name/slug/version, prebuilt image,
│                 # arch, ingress, map (share:rw, W-16), services (mqtt:want),
│                 # uart+usb+udev, options/schema (see DOCS.md
│                 # "Configuration options")
├── build.yaml    # per-arch base image for the Supervisor's multi-arch builder
├── Dockerfile    # builds apps/core+web, bundles Valhalla/Photon/gpsd, s6-overlay
├── rootfs/
│   └── etc/
│       ├── yapaia/init-yapaia-config.sh   # bashio config + MQTT creds -> env
│       └── s6-overlay/s6-rc.d/            # service tree (see below)
├── DOCS.md       # operator docs (HA "Documentation" tab)
├── README.md     # this file
└── icon.png      # add-on store icon
```

## Service tree (`rootfs/etc/s6-overlay/s6-rc.d/`)

```
init-yapaia-config (oneshot)   -- bashio config + MQTT creds -> container env
        │
        ├── valhalla (longrun)  -- routing, :8002 (idles if no graph installed)
        │       │
        │       └── core (longrun) -- Fastify app, :8099 (Supervisor's default ingress port)
        ├── photon (longrun)    -- search, :2322 (idles if disabled/no index)
        └── gpsd (longrun)      -- USB-GPS bridge, :2947 (idles if gps_source != usb)
```

`core` declares `dependencies.d/valhalla` (starts after it, per docs/04 §3's
"Abhängigkeits-Reihenfolge") but NOT `photon`/`gpsd` — both degrade
gracefully on their own (Photon → lite-search fallback, W-12; gpsd → the
Core's existing GPS-source handling), so neither should be able to block
Core's own startup. See each `run` script's header comment for the full
reasoning, and `rootfs/etc/yapaia/init-yapaia-config.sh` for exactly which
env vars get set and why (cross-checked against the actual `process.env.*`
reads in `apps/core/src/index.ts`, `apps/core/src/mqtt/config.ts`, and
`apps/core/src/map/paths.ts`).

## How the image is built

The Supervisor does not build this add-on on the device: `config.yaml`
names a prebuilt image (`ghcr.io/yapaia/yapaia-go-{arch}`), which the
repository's `images.yml` workflow builds and publishes for every version
(base image per `build.yaml`: `ghcr.io/gis-ops/docker-valhalla/valhalla`).
The image is also built and checked inside the container in CI (tools,
build scripts, services, a running Core).

## Where this folder sits in the repository

The HA Supervisor recognizes a Git repository as an *add-on repository* when
a `repository.yaml` sits in its root, and then searches all subfolders for a
`config.yaml`. So this package can live at `go/yapaia_go/`, next to the other
Yapaia add-ons — that is what makes **Settings → Add-ons → Add-on Store → ⋮ →
Repositories → `https://github.com/Yapaia/yapaia`** list "Yapaia Go" in the
store section "Yapaia".

## CI strategy

See [`PACKAGING.md`](./PACKAGING.md) (next to this file) for why the
config-validity check runs per-PR (in-repo, deterministic) while
`frenck/action-addon-linter` and the full multi-arch Supervisor-builder
build run nightly/manual only.
