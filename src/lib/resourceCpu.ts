export const cpuOptions = ['10m', '25m', '50m', '100m', '250m', '500m', '1', '2']

export function cpuMillicores(value: string) {
  const match = /^(\d+(?:\.\d+)?)(n|u|m)?$/.exec(value)
  if (!match) return NaN
  const factors = { n: 1e-6, u: 1e-3, m: 1, '': 1000 }
  return Number(match[1]) * factors[match[2] as keyof typeof factors]
}
