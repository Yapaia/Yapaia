#!/usr/bin/env python3
"""
Zeichnet die Ansichten von `m5-dial.yaml` als PNG -- ohne Geraet.

Die Zeichenroutine der Konfiguration ist gewoehnliches C++. Dieses Skript
holt sie aus der YAML, setzt die `substitutions:` ein und schreibt `id(...)`
so um, wie ESPHome es tut (Komponenten sind Zeiger, Farben Werte, `globals`
der Wert dahinter). Uebersetzt wird sie gegen eine kleine Nachbildung der
ESPHome-Zeichen-API, die jeden Aufruf mitschreibt. Python malt die Aufrufe
dann mit der echten Roboto-Schrift in ein 240x240-Bild.

Damit faellt zweierlei VOR dem Flashen auf:
  * C++, das nicht uebersetzt (dann bricht dieses Skript ab);
  * Ansichten, die falsch aussehen.

Es ersetzt nicht den ESPHome-Build: Schriftbreiten, Kantenglaettung und
Farben des echten Panels weichen etwas ab.

Aufruf:
    python3 vorschau.py --schriften <ordner mit Roboto-{Regular,Medium,Bold}.ttf> --ziel <ordner> [--sprache de|en]

Braucht: g++, Python 3 mit Pillow und PyYAML.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

import yaml
from PIL import Image, ImageDraw, ImageFont

HIER = os.path.dirname(os.path.abspath(__file__))
YAML = os.path.join(HIER, '..', 'm5-dial.yaml')


# ─── DIE KONFIGURATION LESEN ────────────────────────────────────────────────
class _Lader(yaml.SafeLoader):
    pass


_Lader.add_constructor('!secret', lambda l, n: 'GEHEIM')
_Lader.add_constructor('!lambda', lambda l, n: l.construct_scalar(n))


def substitutionen(daten):
    return {k: str(v) for k, v in (daten.get('substitutions') or {}).items()}


def einsetzen(text, werte):
    def ersetze(m):
        name = m.group(1)
        if name not in werte:
            raise SystemExit(f'${{{name}}} hat keine Entsprechung unter substitutions:')
        return werte[name]
    return re.sub(r'\$\{([A-Za-z0-9_]+)\}', ersetze, text)


def ohne_kommentare(text):
    # Dasselbe Muster wie ESPHomes `Lambda.comment_remover`.
    return re.sub(r'//.*?$|/\*[\s\S]*?\*/|\'(?:\\.|[^\\\'])*\'|"(?:\\.|[^\\"])*"',
                  lambda m: ' ' if m.group(0).startswith('/') else m.group(0),
                  text, flags=re.M)


def kennungen(daten):
    """Welche id(...) Zeiger, Wert oder globale Variable sind."""
    werte = {c['id'] for c in daten.get('color', [])}
    globale = {g['id']: g for g in daten.get('globals', [])}
    zeiger = {}
    for s in daten.get('sensor', []):
        zeiger[s['id']] = 'sensor'
    for s in daten.get('text_sensor', []):
        zeiger[s['id']] = 'text'
    for s in daten.get('binary_sensor', []):
        zeiger[s['id']] = 'binaer'
    for s in daten.get('switch', []):
        zeiger[s['id']] = 'schalter'
    for f in daten.get('font', []):
        zeiger[f['id']] = 'schrift'
    for t in daten.get('time', []):
        zeiger[t['id']] = 'uhr'
    for l in daten.get('light', []):
        zeiger[l['id']] = 'licht'
    return werte, globale, zeiger


def ids_umschreiben(rumpf, werte, globale, zeiger):
    def ersetze(m):
        name, punkt = m.group(1), m.group(2)
        if name in zeiger:
            return f'{name}->' if punkt else name
        if name in werte:
            return f'{name}.' if punkt else name
        if name in globale:
            return f'(*{name})' + punkt
        raise SystemExit(f'id({name}) ist unbekannt -- weder Komponente, Farbe noch globale Variable')
    return re.sub(r'id\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)(\.?)', ersetze, rumpf)


# ─── DIE NACHBILDUNG DER ZEICHEN-API ────────────────────────────────────────
KOPF = r'''
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <cmath>
#include <cstdarg>
#include <ctime>
#include <string>
#include <vector>
#include <algorithm>
using std::isnan;
namespace esphome {
static uint32_t g_millis = 100000;
static uint32_t millis() { return g_millis; }
struct Color { uint8_t r = 0, g = 0, b = 0; };
struct BaseFont { int size; int gewicht; };
enum class TextAlign { TOP_LEFT, TOP_CENTER, TOP_RIGHT, CENTER_LEFT, CENTER, CENTER_RIGHT,
                       BASELINE_LEFT, BASELINE_CENTER, BASELINE_RIGHT,
                       BOTTOM_LEFT, BOTTOM_CENTER, BOTTOM_RIGHT };
namespace sensor { struct Sensor { bool da = false; float state = NAN;
  bool has_state() const { return da; } }; }
namespace text_sensor { struct TextSensor { std::string state; }; }
namespace binary_sensor { struct BinarySensor { bool state = false; }; }
namespace switch_ { struct Switch { bool state = false; }; }
namespace light {
struct LightColorValues { float b = 1.0f; float get_brightness() const { return b; } };
struct LightState { LightColorValues current_values; };
}
struct ESPTime {
  uint8_t second = 0, minute = 0, hour = 0, day_of_week = 0, day_of_month = 0;
  uint16_t day_of_year = 0; uint8_t month = 0; uint16_t year = 0;
  bool is_dst = false; time_t timestamp = 0;
  bool is_valid() const { return year >= 2019; }
  void recalc_timestamp_utc(bool = true) {
    struct tm t{}; t.tm_year = year - 1900; t.tm_mon = month - 1; t.tm_mday = day_of_month;
    t.tm_hour = hour; t.tm_min = minute; t.tm_sec = second; timestamp = timegm(&t);
  }
  static ESPTime from_epoch_local(time_t e) {
    struct tm l{}; localtime_r(&e, &l);
    ESPTime z; z.year = l.tm_year + 1900; z.month = l.tm_mon + 1; z.day_of_month = l.tm_mday;
    z.hour = l.tm_hour; z.minute = l.tm_min; z.second = l.tm_sec; z.day_of_week = l.tm_wday + 1;
    z.timestamp = e; return z;
  }
};
struct RealTimeClock { time_t jetzt = 0; ESPTime now() const {
  if (jetzt == 0) return ESPTime{}; return ESPTime::from_epoch_local(jetzt); } };

static FILE *aus = stdout;
static void farbe(Color c) { fprintf(aus, "[%d,%d,%d]", c.r, c.g, c.b); }
static std::string json(const char *t) {
  std::string o = "\"";
  for (const char *p = t; *p; p++) { if (*p == '"' || *p == '\\') o += '\\'; o += *p; }
  return o + "\"";
}
struct Display {
  int get_width() { return 240; } int get_height() { return 240; }
  void fill(Color c) { fprintf(aus, "{\"op\":\"fill\",\"c\":"); farbe(c); fprintf(aus, "}\n"); }
  void line(int a, int b, int c, int d, Color k) { fprintf(aus, "{\"op\":\"line\",\"p\":[%d,%d,%d,%d],\"c\":", a, b, c, d); farbe(k); fprintf(aus, "}\n"); }
  void rectangle(int x, int y, int w, int h, Color k) { fprintf(aus, "{\"op\":\"rect\",\"p\":[%d,%d,%d,%d],\"c\":", x, y, w, h); farbe(k); fprintf(aus, "}\n"); }
  void filled_rectangle(int x, int y, int w, int h, Color k) { fprintf(aus, "{\"op\":\"frect\",\"p\":[%d,%d,%d,%d],\"c\":", x, y, w, h); farbe(k); fprintf(aus, "}\n"); }
  void circle(int x, int y, int r, Color k) { fprintf(aus, "{\"op\":\"circle\",\"p\":[%d,%d,%d],\"c\":", x, y, r); farbe(k); fprintf(aus, "}\n"); }
  void filled_circle(int x, int y, int r, Color k) { fprintf(aus, "{\"op\":\"fcircle\",\"p\":[%d,%d,%d],\"c\":", x, y, r); farbe(k); fprintf(aus, "}\n"); }
  void filled_ring(int x, int y, int r1, int r2, Color k) { fprintf(aus, "{\"op\":\"ring\",\"p\":[%d,%d,%d,%d],\"c\":", x, y, r1, r2); farbe(k); fprintf(aus, "}\n"); }
  void filled_triangle(int a, int b, int c, int d, int e, int f, Color k) { fprintf(aus, "{\"op\":\"tri\",\"p\":[%d,%d,%d,%d,%d,%d],\"c\":", a, b, c, d, e, f); farbe(k); fprintf(aus, "}\n"); }
  void print(int x, int y, BaseFont *f, Color k, TextAlign a, const char *t) {
    fprintf(aus, "{\"op\":\"text\",\"p\":[%d,%d],\"size\":%d,\"w\":%d,\"a\":%d,\"t\":%s,\"c\":", x, y, f->size, f->gewicht, (int) a, json(t).c_str()); farbe(k); fprintf(aus, "}\n"); }
  void printf(int x, int y, BaseFont *f, Color k, TextAlign a, const char *fmt, ...) {
    char b[256]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap); print(x, y, f, k, a, b); }
};
}  // namespace esphome
using namespace esphome;
'''

TYPEN = {'sensor': 'sensor::Sensor', 'text': 'text_sensor::TextSensor',
         'binaer': 'binary_sensor::BinarySensor', 'schalter': 'switch_::Switch',
         'uhr': 'RealTimeClock', 'licht': 'light::LightState'}


def farbe_hex(h):
    h = str(h).lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def programm(daten, rumpf, szenen):
    werte, globale, zeiger = kennungen(daten)
    teile = [KOPF]
    for c in daten.get('color', []):
        r, g, b = farbe_hex(c['hex'])
        teile.append(f'static Color {c["id"]}{{{r},{g},{b}}};')
    for f in daten.get('font', []):
        gewicht = int(str(f['file']).rsplit('@', 1)[-1]) if '@' in str(f['file']) else 400
        teile.append(f'static BaseFont {f["id"]}_obj{{{f["size"]},{gewicht}}}; static BaseFont *{f["id"]} = &{f["id"]}_obj;')
    for name, art in zeiger.items():
        if art == 'schrift':
            continue
        t = TYPEN[art]
        teile.append(f'static {t} {name}_obj; static {t} *{name} = &{name}_obj;')
    for name, g in globale.items():
        init = g.get('initial_value', '0')
        teile.append(f'static {g["type"]} {name}_wert = {init}; static {g["type"]} *{name} = &{name}_wert;')

    # Ruecksetzen vor jeder Szene: alles unbekannt, Globale auf Anfang.
    zurueck = []
    for name, art in zeiger.items():
        if art == 'sensor':
            zurueck.append(f'{name}_obj = sensor::Sensor{{}};')
        elif art == 'text':
            zurueck.append(f'{name}_obj.state = "";')
        elif art in ('binaer', 'schalter'):
            zurueck.append(f'{name}_obj.state = false;')
        elif art == 'uhr':
            zurueck.append(f'{name}_obj.jetzt = 0;')
        elif art == 'licht':
            zurueck.append(f'{name}_obj.current_values.b = 1.0f;')
    for name, g in globale.items():
        zurueck.append(f'{name}_wert = {g.get("initial_value", "0")};')

    teile.append('static void zeichne(Display &it) {\n' + rumpf + '\n}')
    teile.append('static void zuruecksetzen() {\n' + '\n'.join(zurueck) + '\n}')
    haupt = ['int main() {', 'setenv("TZ", "Europe/Berlin", 1); tzset(); Display it;']
    for name, setzen in szenen:
        haupt.append('zuruecksetzen();')
        for anw in setzen:
            haupt.append(anw)
        haupt.append(f'printf("#SZENE %s\\n", {json.dumps(name)}); zeichne(it);')
    haupt.append('return 0; }')
    teile.append('\n'.join(haupt))
    return '\n'.join(teile)


# ─── DIE SZENEN ─────────────────────────────────────────────────────────────
def S(name, wert):
    return f'{name}_obj.da = true; {name}_obj.state = {float(wert)}f;'


def T(name, wert):
    return f'{name}_obj.state = {json.dumps(wert)};'


def B(name, wert=True):
    return f'{name}_obj.state = {"true" if wert else "false"};'


def G(name, wert):
    return f'{name}_wert = {wert};'


UHR = 'ha_zeit_obj.jetzt = 1792592520;'   # Mi 21.10.2026 16:22 (Berlin)


def szenen():
    navi = [UHR, T('yapaia_fahrzustand', 'navigating'), T('yapaia_anweisung', 'Rechts abbiegen auf B27'),
            S('yapaia_tempo', 47), S('yapaia_tempolimit', 50), S('yapaia_tempolimit_fahrzeug', 80),
            T('yapaia_ankunft', '2026-10-21T14:58:00Z'), G('ansicht', 0)]
    licht = [UHR, G('ansicht', 2), T('licht1_zustand', 'on'), S('licht1_hell', 191),
             T('licht2_zustand', 'off'), T('licht3_zustand', 'on'), S('licht3_hell', 40),
             T('licht4_zustand', 'off'), T('licht5_zustand', 'off'), T('licht6_zustand', 'on'),
             S('licht6_hell', 255), T('licht7_zustand', 'off'), T('licht8_zustand', 'off')]
    return [
        ('01-navi-rechts', navi + [T('yapaia_manoever_art', 'turn_right'), S('yapaia_manoever_entfernung', 240)]),
        ('02-navi-spuren', navi + [T('yapaia_manoever_art', 'ramp_right'), S('yapaia_manoever_entfernung', 850),
                                   T('yapaia_spuren', "[{'directions': 2}, {'directions': 2}, {'directions': 34, 'active': 32}]")]),
        ('03-navi-kreisel-zu-schnell', navi + [T('yapaia_manoever_art', 'roundabout_enter'), T('yapaia_kreisel', '2|0'),
                                               S('yapaia_manoever_entfernung', 120), S('yapaia_tempo', 58),
                                               B('yapaia_zu_schnell'), B('eta_als_restzeit')]),
        ('04-navi-ohne-route', [UHR, T('yapaia_fahrzustand', 'idle'), S('yapaia_tempo', 0), T('yapaia_anweisung', 'x'),
                                G('ansicht', 0), G('seitenwechsel', 'g_millis - 500')]),
        ('05-waage-libelle', [UHR, G('ansicht', 1), S('neigung_lr', 1.4), S('neigung_vh', -0.6),
                              G('seitenwechsel', 'g_millis - 500')]),
        ('06-waage-fahrzeug', [UHR, G('ansicht', 1), S('neigung_lr', 1.4), S('neigung_vh', -0.6), B('waage_fahrzeug')]),
        ('07-licht', licht),
        ('08-licht-gedreht', licht + [G('licht_wahl', 1), G('licht_soll', 35), G('licht_soll_bis', 'g_millis + 2000')]),
        ('09-heizung-raum', [UHR, G('ansicht', 3), S('heiz_raum_ist_wert', 18.4), S('heiz_raum_soll_wert', 21),
                             B('heiz_raum_aktiv_an')]),
        ('10-heizung-wasser', [UHR, G('ansicht', 3), G('heiz_wahl', 1), S('heiz_wasser_ist_wert', 42),
                               S('heiz_wasser_soll_wert', 60)]),
        ('11-batterie', [UHR, G('ansicht', 4), S('batt1_soc_wert', 78), S('batt1_spannung_wert', 13.2),
                         S('batt1_strom_wert', -4.3), S('batt1_rest_wert', 1290), S('solar_wert', 186)]),
        ('12-gas', [UHR, G('ansicht', 5), S('gas1_wert', 72), S('gas2_wert', 12)]),
        ('13-reifen', [UHR, G('ansicht', 6), S('reifen_vl', 4.4), S('reifen_vr', 4.5), S('reifen_hl', 5.1),
                       S('reifen_hr', 3.6), S('reifen_vl_t', 18), S('reifen_vr_t', 19), S('reifen_hl_t', 21),
                       S('reifen_hr_t', 20)]),
        ('14-uhr', [UHR, G('ansicht', 7), S('heiz_raum_ist_wert', 21.3), T('tuer_zustand', 'locked')]),
        ('15-uhr-tuer-bestaetigen', [UHR, G('ansicht', 7), S('heiz_raum_ist_wert', 21.3), T('tuer_zustand', 'locked'),
                                     G('tuer_bestaetigen_bis', 'g_millis + 3000')]),
    ]


# ─── MALEN ──────────────────────────────────────────────────────────────────
ANKER = ['la', 'ma', 'ra', 'lm', 'mm', 'rm', 'ls', 'ms', 'rs', 'ld', 'md', 'rd']


def rgb565(c):
    r, g, b = c
    return (r & 0xF8) | (r >> 5), (g & 0xFC) | (g >> 6), (b & 0xF8) | (b >> 5)


def malen(ops, schriften):
    bild = Image.new('RGB', (240, 240))
    px = bild.load()
    z = ImageDraw.Draw(bild)
    cache = {}

    def schrift(groesse, gewicht):
        datei = {400: 'Roboto-Regular.ttf', 500: 'Roboto-Medium.ttf', 700: 'Roboto-Bold.ttf'}[gewicht]
        key = (groesse, gewicht)
        if key not in cache:
            cache[key] = ImageFont.truetype(os.path.join(schriften, datei), groesse)
        return cache[key]

    def setz(x, y, c):
        if 0 <= x < 240 and 0 <= y < 240:
            px[x, y] = c

    for o in ops:
        c = rgb565(tuple(o['c']))
        p = o.get('p')
        if o['op'] == 'fill':
            z.rectangle([0, 0, 239, 239], fill=c)
        elif o['op'] == 'line':
            z.line(p, fill=c)
        elif o['op'] == 'rect':
            x, y, w, h = p
            if w > 0 and h > 0:
                z.rectangle([x, y, x + w - 1, y + h - 1], outline=c)
        elif o['op'] == 'frect':
            x, y, w, h = p
            if w > 0 and h > 0:
                z.rectangle([x, y, x + w - 1, y + h - 1], fill=c)
        elif o['op'] == 'circle':
            x, y, r = p
            z.ellipse([x - r, y - r, x + r, y + r], outline=c)
        elif o['op'] == 'fcircle':
            x, y, r = p
            for j in range(-r, r + 1):
                for i in range(-r, r + 1):
                    if i * i + j * j <= r * r:
                        setz(x + i, y + j, c)
        elif o['op'] == 'ring':
            x, y, r1, r2 = p
            ra, ri = max(r1, r2), min(r1, r2)
            for j in range(-ra, ra + 1):
                for i in range(-ra, ra + 1):
                    d = i * i + j * j
                    if ri * ri <= d <= ra * ra:
                        setz(x + i, y + j, c)
        elif o['op'] == 'tri':
            z.polygon([(p[0], p[1]), (p[2], p[3]), (p[4], p[5])], fill=c)
        elif o['op'] == 'text':
            z.text((p[0], p[1]), o['t'], font=schrift(o['size'], o['w']), fill=c, anchor=ANKER[o['a']])

    # Das runde Glas: ausserhalb des Kreises ist nichts, und der Rahmen des
    # Dial ist orange.
    gross = bild.resize((480, 480), Image.NEAREST)
    rahmen = Image.new('RGB', (560, 560), (238, 240, 242))
    maske = Image.new('L', (480, 480), 0)
    ImageDraw.Draw(maske).ellipse([0, 0, 479, 479], fill=255)
    rd = ImageDraw.Draw(rahmen)
    rd.ellipse([4, 4, 555, 555], fill=(255, 128, 32))
    rd.ellipse([30, 30, 529, 529], fill=(30, 30, 30))
    rahmen.paste(gross, (40, 40), maske)
    return rahmen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--schriften', required=True)
    ap.add_argument('--ziel', required=True)
    ap.add_argument('--sprache', choices=['de', 'en'], default='de', help='Anzeigesprache (Standard: de)')
    args = ap.parse_args()

    text = open(YAML, encoding='utf-8').read()
    daten = yaml.load(text, Loader=_Lader)
    rumpf = daten['display'][0]['lambda']
    werte, globale, zeiger = kennungen(daten)
    rumpf = ids_umschreiben(ohne_kommentare(einsetzen(rumpf, substitutionen(daten))), werte, globale, zeiger)

    bau = tempfile.mkdtemp(prefix='m5dial-')
    quelle = os.path.join(bau, 'vorschau.cpp')
    with open(quelle, 'w', encoding='utf-8') as f:
        f.write(programm(daten, rumpf, [(n, a + [T('yapaia_sprache', args.sprache)]) for n, a in szenen()]))
    prog = os.path.join(bau, 'vorschau')
    r = subprocess.run(['g++', '-std=c++17', '-O1', '-Wall', '-Wno-unused-variable', '-Wno-unused-but-set-variable',
                        quelle, '-o', prog])
    if r.returncode != 0:
        raise SystemExit('Die Zeichenroutine uebersetzt nicht -- auf dem Geraet waere das ein fehlgeschlagener Build.')
    aus = subprocess.run([prog], capture_output=True, text=True, check=True).stdout

    os.makedirs(args.ziel, exist_ok=True)
    name, ops = None, []
    bilder = []

    def fertig():
        if name:
            pfad = os.path.join(args.ziel, f'{name}.png')
            malen(ops, args.schriften).save(pfad)
            bilder.append(pfad)

    for zeile in aus.splitlines():
        if zeile.startswith('#SZENE '):
            fertig()
            name, ops = zeile[7:], []
        elif zeile.strip():
            ops.append(json.loads(zeile))
    fertig()
    for b in bilder:
        print(b)


if __name__ == '__main__':
    sys.exit(main())
