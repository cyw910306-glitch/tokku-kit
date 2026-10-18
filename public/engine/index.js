// 엔진 공개 API (SPEC 2절). UI 는 이 파일만 import 한다.
export { IMAGES, CSS_TEMPLATE } from './spec.js';
export { DEFAULTS, PRESETS, TEMPLATES, LAYOUTS, CHAR_SIZES, SHAPES, OUTLINES, OUTLINE_COLORS, DECOS, FILL_TONES, GROUP_CHARS, PEEK_POS, TEXT_TONES, KEYPAD_TONES, HAZES, GRIDS, BUBBLES, PATTERNS, PATTERN_ALPHA, PATTERN_SIZES, CORNERS, CORNER_SIZES, PHOTO_FITS, resolveBackground, patternLayers, cornerBox, bubbleGeometry, bubbleSpec, charBox, decoBox, checkInvariants } from './presets.js';
export * as palette from './palette.js';
export { contrast } from './palette.js';
export { pixelize } from './pixelize.js';
export { prepareCharacter, removeEdgeBackground, transparentRatio } from './keying.js';
export * as keying from './keying.js';
export { bubbleRules, capFor } from './bubble.js';
export { buildCss, themeId, themeName } from './css.js';
export { makeCanvas, applyFillTone, applyTextTone, checkAssets, buildTheme, buildCouple, decodeImage, imgToBlob, normalizeOptions, partnerId, themeFileName } from './render.js';
export { packTheme } from './pack.js';
