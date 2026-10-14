export function readPitch(samples: Float32Array, rate: number): number | null {
  if (!Number.isFinite(rate) || rate < 8000 || samples.length < 2048) return null
  let mean = 0
  for (const value of samples) { if (!Number.isFinite(value)) return null; mean += value }
  mean /= samples.length
  let energy = 0
  for (const value of samples) energy += (value - mean) ** 2
  if (Math.sqrt(energy / samples.length) < 0.006) return null
  const max = Math.min(Math.floor(rate / 65), Math.floor(samples.length / 2) - 1)
  const size = samples.length - max
  const differences = new Float64Array(max + 1)
  let sum = 0
  for (let lag = 1; lag <= max; lag++) {
    let difference = 0
    for (let i = 0; i < size; i++) difference += (samples[i] - samples[i + lag]) ** 2
    sum += difference
    differences[lag] = sum ? difference * lag / sum : 1
  }
  for (let lag = Math.floor(rate / 1400); lag < max - 1; lag++) {
    if (differences[lag] >= 0.12) continue
    while (lag + 1 < max && differences[lag + 1] < differences[lag]) lag++
    const a = differences[lag - 1], b = differences[lag], c = differences[lag + 1]
    const denominator = a - 2 * b + c
    return rate / (lag + (denominator ? (a - c) / (2 * denominator) : 0))
  }
  return null
}

export function centsFrom(frequency: number, target: number) {
  return 1200 * Math.log2(frequency / target)
}
