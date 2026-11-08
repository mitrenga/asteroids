const { AbstractVectorFont } = await import('./svision/js/platform/vector/abstractVectorFont.js?ver='+window.srcVersion);
// begin code
// begin generated glyphs (tools/svg2font.mjs) — grid: cap height 12 units, y 0 = cap top,
// baseline y 12; every stroke is a closed outline of one slice of the letter
// (x, y, …, back to the start), `width` is the ink width, the font adds the gap
const SLICED_FONT_METRICS = {height: 12, ascent: 2.84, descent: 1.02, gap: 2};
const SLICED_FONT_GLYPHS = {
  'A': {width: 14.81, strokes: [
    [5.94, 2.24, 3.68, -0.38, 5.72, 2.7, 11.34, 12.01, 14.81, 12.01, 7.42, -0.2, 5.94, 2.24],
    [5.13, 3.57, 0, 12, 3.47, 12, 6.61, 6.83, 8.57, 9.23, 5.13, 3.57],
  ]},
  'D': {width: 14.48, strokes: [
    [5.49, 6.41, 5.49, 3.03, 8.48, 3.03, 10.54, 3.87, 11.44, 5.94, 10.68, 8.07, 8.69, 9.03, 5.49, 9.03, 5.49, 8.01, 6.72, 8.99, 2.51, 4.77, 2.51, 12.01, 8.48, 12.01, 12.7, 10.26, 14.48, 6.03, 12.7, 1.78, 8.48, 0.02, 2.51, 0.02, 2.51, 2.89, 0, 0.91, 5.49, 6.41],
  ]},
  'E': {width: 12.78, strokes: [
    [12.78, 9.05, 5.75, 9.03, 5.75, 8.3, 6.45, 8.9, 2.78, 5.22, 2.78, 12.01, 12.78, 12.01, 12.78, 9.05],
    [6.39, 7.53, 12.78, 7.51, 12.78, 4.54, 7.61, 4.54, 6.06, 2.99, 12.78, 2.99, 12.78, 0.02, 2.76, 0.02, 2.76, 3.27, 0, 1.13, 6.39, 7.53],
  ]},
  'I': {width: 6.96, strokes: [
    [5.57, 4.46, 5.57, 0.01, 2.6, 0.01, 2.6, 0.92, 0, -1.12, 5.57, 4.46],
    [2.6, 2.85, 2.6, 12, 5.57, 12, 5.57, 6.12, 6.96, 7.21, 2.6, 2.85],
  ]},
  'O': {width: 12.8, strokes: [
    [4.67, 3.53, 6.91, 3.01, 8.82, 4.15, 9.44, 6.25, 9.06, 7.35, 6.95, 5.8, 11.01, 9.87, 11.18, 9.66, 12.35, 4.95, 9.68, 0.94, 4.93, 0.19, 3, 1, 0, -1.14, 4.67, 3.53],
    [8.22, 8.44, 5.86, 8.92, 4.01, 7.74, 3.44, 5.64, 3.83, 4.58, 5.86, 6.08, 1.87, 2.08, 1.69, 2.29, 0.53, 7.02, 3.24, 11.05, 8.01, 11.77, 9.91, 10.95, 12.8, 13.02, 8.22, 8.44],
  ]},
  'R': {width: 15.09, strokes: [
    [2.86, 5.71, 2.86, 11.98, 5.83, 11.98, 5.83, 9.02, 7.31, 10.17, 2.86, 5.71],
    [6.02, 3.12, 11.22, 3.12, 11.91, 3.81, 11.22, 4.5, 7.43, 4.54, 6.02, 3.12],
    [10.68, 7.49, 13.34, 6.29, 14.33, 3.72, 13.36, 1.1, 10.84, 0.01, 2.82, 0.01, 2.82, 3.75, 0, 1.57, 10.47, 12.01, 15.09, 12.01, 10.49, 7.49, 10.68, 7.49],
  ]},
  'S': {width: 12.11, strokes: [
    [8.98, 4.69, 3.74, 4.69, 2.97, 3.93, 3.74, 3.16, 5.43, 3.16, 7.34, 4.53, 3.04, 0.24, 0.7, 1.73, 0, 4.33, 1.23, 6.73, 3.74, 7.7, 8.26, 7.7, 9.03, 8.47, 8.26, 9.24, 0, 9.24, 0, 12.21, 8.26, 12.21, 10.91, 11.12, 12, 8.39, 11.01, 5.52, 8.98, 4.69],
    [6.13, -0.01, 1.62, -2.84, 7.42, 2.96, 12.11, 2.96, 12.11, -0.01, 6.13, -0.01],
  ]},
  'T': {width: 12, strokes: [
    [0, 2.96, 4.51, 2.96, 4.51, 4.12, 3.17, 3.07, 7.48, 7.38, 7.48, 2.96, 12, 2.96, 12, -0.01, 0, -0.01, 0, 2.96],
    [4.51, 5.78, 4.51, 12, 7.48, 12, 7.48, 9.4, 10.29, 11.57, 4.51, 5.78],
  ]},
};
// end generated glyphs

/**
 * The vector font of the ASTEROIDS title: capitals sliced diagonally into
 * two or three parts with flourishes, drawn as closed outlines. Modelled on
 * the *Yellow and Black Modern Sports Sliced Gaming Font* by Patrick Santos
 * (vecteezy.com, see README.md § Licence); the glyph table below, between
 * the `generated glyphs` markers, is written by `tools/svg2font.mjs` from
 * `sources/fonts/sliced-gaming-font-outlines.svg` — do not edit it by hand.
 *
 * Unlike the machine fonts of the library the letters are proportional, so
 * `textWidth()` and `draw()` step by each glyph's own `width` plus the gap
 * (`metrics.gap`, enlarged by `style.spacing`) instead of a fixed advance.
 * Only the letters of ASTEROIDS (A D E I O R S T) are in the table — the
 * title is the font's only use; lower case falls back to the capital (the
 * base class does that), anything else draws the dim box of the base class.
 *
 * The font belongs to this game only — it is not a part of svision.
 */
export class SlicedFont extends AbstractVectorFont {

  constructor() {
    const m = SLICED_FONT_METRICS;
    // `width`/`advance` are the mean letter for the missing-glyph box and for callers
    // that still think in cells (line pitch of VectorTextEntity uses `height`/`descent`)
    super(SLICED_FONT_GLYPHS, {width: 13, height: m.height, advance: 13+m.gap, descent: m.descent, gap: m.gap, ascent: m.ascent});
  } // constructor

  /**
   * Width of one glyph in grid units (ink width, or the box of a missing one).
   * @param {string} ch
   * @returns {number}
   */
  glyphWidth(ch) {
    const glyph = this.glyph(ch);
    return glyph === false ? this.metrics.width : glyph.width;
  } // glyphWidth

  /**
   * Width of a text run in pixels: the glyph widths and the gaps between them.
   * @param {string} text
   * @param {number} [size] - Cap height in pixels (default 16).
   * @param {number} [spacing] - Extra gap between letters, in grid units.
   * @returns {number}
   */
  textWidth(text, size, spacing) {
    text = String(text);
    if (text.length == 0) {
      return 0;
    }
    const scale = (size === undefined ? 16 : size)/this.metrics.height;
    const gap = this.metrics.gap+(spacing || 0);
    let width = -gap;
    for (let i = 0; i < text.length; i++) {
      width += this.glyphWidth(text[i])+gap;
    }
    return width*scale;
  } // textWidth

  /**
   * Appends a text run to a display list; the parameters are those of
   * {@link AbstractVectorFont#draw}, `strokeWidth` defaults to size/40 so the
   * slice gaps stay open.
   */
  draw(list, x, y, text, style) {
    style = Object.assign({}, style || {});
    text = String(text);
    const size = 'size' in style ? style.size : 16;
    const scale = size/this.metrics.height;
    const gap = (this.metrics.gap+(style.spacing || 0))*scale;
    const width = this.textWidth(text, size, style.spacing);
    if (style.anchor == 'middle') {
      x -= width/2;
    } else if (style.anchor == 'end') {
      x -= width;
    }
    if (!('strokeWidth' in style)) {
      style.strokeWidth = size/40;
    }
    delete style.anchor;
    delete style.spacing;
    // one letter at a time through the base class: it has no advance to step by
    for (let i = 0; i < text.length; i++) {
      super.draw(list, x, y, text[i], style);
      x += this.glyphWidth(text[i])*scale+gap;
    }
    return x-gap;
  } // draw

} // SlicedFont
