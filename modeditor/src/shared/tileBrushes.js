/**
 * Brush emitters for the Uplifter map writer. Every brush is an
 * axis-aligned 6-face box — qbsp accepts them cleanly and we don't need
 * wedges or ramps for milestone 1 (smoothing terrain comes later).
 *
 * Valve 220 .map face syntax:
 *   ( p1 ) ( p2 ) ( p3 ) tex [ uAxis uOff ] [ vAxis vOff ] rot uScale vScale
 */

function face(p1, p2, p3, tex, uAxis, vAxis, uOff, vOff, uScale, vScale) {
  return (
    `( ${p1[0]} ${p1[1]} ${p1[2]} ) ` +
    `( ${p2[0]} ${p2[1]} ${p2[2]} ) ` +
    `( ${p3[0]} ${p3[1]} ${p3[2]} ) ` +
    `${tex} ` +
    `[ ${uAxis[0]} ${uAxis[1]} ${uAxis[2]} ${uOff} ] ` +
    `[ ${vAxis[0]} ${vAxis[1]} ${vAxis[2]} ${vOff} ] ` +
    `0 ${uScale} ${vScale}`
  );
}

/**
 * Axis-aligned box brush. Each face can carry its own texture.
 * UV defaults are world-anchored 1:1 — fine for milestone 1.
 *
 * @param {{minX,minY,minZ,maxX,maxY,maxZ}} bb
 * @param {string} tex   default texture for every face
 * @param {Object} [opts] { topTex, sideTex, bottomTex }
 */
function boxBrush({ minX, minY, minZ, maxX, maxY, maxZ }, tex, opts = {}) {
  const topTex    = opts.topTex    ?? tex;
  const sideTex   = opts.sideTex   ?? tex;
  const bottomTex = opts.bottomTex ?? tex;

  const xy = { u: [1, 0, 0], v: [0, -1, 0] };
  const xz = { u: [1, 0, 0], v: [0, 0, -1] };
  const yz = { u: [0, 1, 0], v: [0, 0, -1] };

  const lines = [
    // +Z (top)
    face([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, minY, maxZ],
         topTex, xy.u, xy.v, 0, 0, 1, 1),
    // -Z (bottom)
    face([minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ],
         bottomTex, xy.u, xy.v, 0, 0, 1, 1),
    // +X (east)
    face([maxX, minY, minZ], [maxX, minY, maxZ], [maxX, maxY, maxZ],
         sideTex, yz.u, yz.v, 0, 0, 1, 1),
    // -X (west)
    face([minX, maxY, minZ], [minX, maxY, maxZ], [minX, minY, maxZ],
         sideTex, yz.u, yz.v, 0, 0, 1, 1),
    // +Y (north)
    face([minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ],
         sideTex, xz.u, xz.v, 0, 0, 1, 1),
    // -Y (south)
    face([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ],
         sideTex, xz.u, xz.v, 0, 0, 1, 1),
  ];
  return '{\n' + lines.join('\n') + '\n}';
}

module.exports = { boxBrush, face };
