---
'@yapaia/core': minor
'@yapaia/addon-sdk': minor
---

Add-on-Marktplatz (docs/marktplatz.md): Release-Signaturen (ysig1), Lizenzen
pro Installation und Sperrliste. Neu im SDK: `license.get()` und
`verifyLicense()`; neu im Core: `GET /addons/:id/license`. Unsignierte Pakete
installiert der Core nur noch im Entwicklermodus.
