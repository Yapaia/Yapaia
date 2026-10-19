/**
 * 007_addon_licensing -- what the marketplace signature said about an
 * installed add-on (`docs/marktplatz.md`). Additive.
 *
 * `licensing` is `free`/`paid` from a verified `addon-release` signature, or
 * `unsigned` for a package installed in developer mode -- which is also the
 * value every add-on installed before this migration gets. `publisher` is the
 * signed publisher name, `NULL` when unsigned.
 */

import type { Migration } from './types.js';

export const addonLicensing: Migration = {
  version: 7,
  name: '007_addon_licensing',
  up(db) {
    db.exec(`ALTER TABLE addons ADD COLUMN licensing TEXT NOT NULL DEFAULT 'unsigned'`);
    db.exec(`ALTER TABLE addons ADD COLUMN publisher TEXT`);
  },
};
