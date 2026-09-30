export const memoryOptions = ['16Mi', '32Mi', '64Mi', '128Mi', '256Mi', '512Mi', '1Gi']

// The API accepts Kubernetes quantities, including saved values outside the
// dropdown presets (for example 100M or 32768Ki).
export function memoryMi(value: string) {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([eE][+-]?\d+|[KMGTPE]i|[numkKMGTPE]?)$/.exec(value)
  if (!match) return NaN
  const suffix = match[2]
  const factors: Record<string, number> = {
    '': 1, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6,
    G: 1e9, T: 1e12, P: 1e15, E: 1e18,
    Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, Pi: 2 ** 50, Ei: 2 ** 60,
  }
  const factor = /^[eE][+-]?\d+$/.test(suffix) ? 10 ** Number(suffix.slice(1)) : factors[suffix]
  return Number(match[1]) * factor / 2 ** 20
}
