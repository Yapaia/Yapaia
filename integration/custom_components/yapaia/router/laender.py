"""Mobilfunk-Ländercodes (MCC, ITU-T E.212) → Land.

Der MCC des eingebuchten Netzes sagt, in welchem Land das Wohnmobil steht --
genau das, was es an der Grenze braucht. Die Liste deckt Europa vollständig ab
und die häufigsten Reiseziele darüber hinaus; ein unbekannter Code bleibt als
Zahl sichtbar.
"""

from __future__ import annotations

# MCC: (ISO 3166-1 alpha-2, deutscher Name)
LAENDER: dict[str, tuple[str, str]] = {
    "202": ("GR", "Griechenland"),
    "204": ("NL", "Niederlande"),
    "206": ("BE", "Belgien"),
    "208": ("FR", "Frankreich"),
    "212": ("MC", "Monaco"),
    "213": ("AD", "Andorra"),
    "214": ("ES", "Spanien"),
    "216": ("HU", "Ungarn"),
    "218": ("BA", "Bosnien und Herzegowina"),
    "219": ("HR", "Kroatien"),
    "220": ("RS", "Serbien"),
    "221": ("XK", "Kosovo"),
    "222": ("IT", "Italien"),
    "225": ("VA", "Vatikanstadt"),
    "226": ("RO", "Rumänien"),
    "228": ("CH", "Schweiz"),
    "230": ("CZ", "Tschechien"),
    "231": ("SK", "Slowakei"),
    "232": ("AT", "Österreich"),
    "234": ("GB", "Vereinigtes Königreich"),
    "235": ("GB", "Vereinigtes Königreich"),
    "238": ("DK", "Dänemark"),
    "240": ("SE", "Schweden"),
    "242": ("NO", "Norwegen"),
    "244": ("FI", "Finnland"),
    "246": ("LT", "Litauen"),
    "247": ("LV", "Lettland"),
    "248": ("EE", "Estland"),
    "250": ("RU", "Russland"),
    "255": ("UA", "Ukraine"),
    "257": ("BY", "Belarus"),
    "259": ("MD", "Moldau"),
    "260": ("PL", "Polen"),
    "262": ("DE", "Deutschland"),
    "266": ("GI", "Gibraltar"),
    "268": ("PT", "Portugal"),
    "270": ("LU", "Luxemburg"),
    "272": ("IE", "Irland"),
    "274": ("IS", "Island"),
    "276": ("AL", "Albanien"),
    "278": ("MT", "Malta"),
    "280": ("CY", "Zypern"),
    "282": ("GE", "Georgien"),
    "283": ("AM", "Armenien"),
    "284": ("BG", "Bulgarien"),
    "286": ("TR", "Türkei"),
    "288": ("FO", "Färöer"),
    "290": ("GL", "Grönland"),
    "292": ("SM", "San Marino"),
    "293": ("SI", "Slowenien"),
    "294": ("MK", "Nordmazedonien"),
    "295": ("LI", "Liechtenstein"),
    "297": ("ME", "Montenegro"),
    "302": ("CA", "Kanada"),
    "310": ("US", "Vereinigte Staaten"),
    "311": ("US", "Vereinigte Staaten"),
    "312": ("US", "Vereinigte Staaten"),
    "313": ("US", "Vereinigte Staaten"),
    "314": ("US", "Vereinigte Staaten"),
    "315": ("US", "Vereinigte Staaten"),
    "316": ("US", "Vereinigte Staaten"),
    "334": ("MX", "Mexiko"),
    "400": ("AZ", "Aserbaidschan"),
    "401": ("KZ", "Kasachstan"),
    "425": ("IL", "Israel"),
    "505": ("AU", "Australien"),
    "530": ("NZ", "Neuseeland"),
    "602": ("EG", "Ägypten"),
    "603": ("DZ", "Algerien"),
    "604": ("MA", "Marokko"),
    "605": ("TN", "Tunesien"),
    "655": ("ZA", "Südafrika"),
}


def land(mcc: str | None) -> tuple[str | None, str | None]:
    """(ISO-Code, Name) zum MCC; unbekannt: (None, None)."""
    if not mcc:
        return None, None
    return LAENDER.get(mcc, (None, None))


def codes(text: str | None) -> set[str]:
    """`"DE, at ch"` → `{"DE", "AT", "CH"}`."""
    if not text:
        return set()
    return {t.strip().upper() for t in text.replace(";", ",").replace(" ", ",").split(",") if t.strip()}
