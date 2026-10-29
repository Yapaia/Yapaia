// Tests sehen die deutsche Oberfläche; ohne das gälte die Sprache von Node (meist en-US).
import { useSprache } from './apps/web/src/i18n/index.js';

useSprache.getState().setzen('de');
