// SPDX-License-Identifier: Apache-2.0
/**
 * Eigener Einstiegspunkt `@yapaia/shared/marketplace` (docs/marktplatz.md).
 *
 * Das Add-on-SDK importiert NUR hierüber: so baut ein Add-on ausschließlich
 * diesen Apache-lizenzierten Ordner ein und nicht das ganze `@yapaia/shared`
 * (GPL, mit AJV) -- siehe DRITTLIZENZEN.md.
 */

export * from './ysig';
export { OFFICIAL_MARKETPLACE_KEYS } from './officialKeys';
