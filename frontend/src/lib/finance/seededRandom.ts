/**
 * Seeded random draws for simulations that must repeat exactly.
 *
 * `seededUniform(seed, stream)` gives each stream (one Monte Carlo run) its own
 * sfc32 generator, its state spread from (seed, stream) by SplitMix32, so runs
 * never share a sequence and adding runs leaves the earlier ones unchanged.
 * Both are small public-domain generators with no imports.
 */

/** SplitMix32: one word in, a stream of well-mixed 32-bit words out. */
function splitMix32(state: number): () => number {
  let s = state >>> 0
  return () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = Math.imul(s ^ (s >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
}

/** Uniform draws in [0, 1) from sfc32, one independent generator per (seed, stream). */
export function seededUniform(seed: number, stream: number): () => number {
  const mix = splitMix32(Math.imul(seed | 0, 0x2c1b3c6d) ^ Math.imul(stream + 1, 0x297a2d39))
  let [a, b, c, d] = [mix(), mix(), mix(), mix()]
  const next = () => {
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return (t >>> 0) / 4_294_967_296
  }
  // The first outputs still echo the seed words; skip them.
  for (let warm = 0; warm < 12; warm++) next()
  return next
}

/** Standard normal draws by Box-Muller, using both values of each pair. */
export function normalSampler(uniform: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const z = spare
      spare = null
      return z
    }
    const radius = Math.sqrt(-2 * Math.log(1 - uniform()))
    const angle = 2 * Math.PI * uniform()
    spare = radius * Math.sin(angle)
    return radius * Math.cos(angle)
  }
}
