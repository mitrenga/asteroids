const { VectorPlatform } = await import('./svision/js/platform/vector/vectorPlatform.js?ver='+window.srcVersion);
// begin code

/**
 * The XY monitor of Asteroids: the DVG addresses 0..1023 in both axes and
 * the game draws in X 0..1023, Y 128..895 (sources/docs/disasm_notes.md
 * 2.1: the self-test frame `VEC:TEST1`, objects at +128 in Y) — 1024x768,
 * 4:3, landscape. The desktop is that space in model units with the origin
 * at the top left: desktop y = 895 - DVG y (the DVG's Y goes up). Black and
 * white, no cellophane, no overlay (ZADANI chap. 2). Black around the
 * screen, at least 16 model units of it (1.5 % of the width) on every side
 * — the minimal border is in the desktop's units, as on the raster
 * platforms, not in per cent.
 */
export function appPlatform() {
  return new VectorPlatform({
    width: 1024,
    height: 768,
    defaultColor: false,
    border: {minimal: 16, defaultColor: '#000000'},
    background: '#000000'
  });
} // appPlatform
