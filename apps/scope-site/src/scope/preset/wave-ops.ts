import { makeBurstDials, type BurstDials } from '../signal/burst-dials'
import { makeFundamentalDials, type FundamentalDials } from '../signal/fundamental-dials'
import type { WaveDials } from '../signal/wave-dials'

export function addFundamental(wave: WaveDials): FundamentalDials {
  const f = makeFundamentalDials()
  wave.fundamentals.push(f)
  return f
}

export function removeFundamental(wave: WaveDials, index: number): void {
  if (wave.fundamentals.length <= 1) return
  wave.fundamentals.splice(index, 1)
}

export function addBurst(wave: WaveDials): BurstDials {
  const seed = Math.floor(1 + Math.random() * 9998)
  const b = makeBurstDials(seed)
  wave.bursts.push(b)
  return b
}

export function removeBurst(wave: WaveDials, index: number): void {
  wave.bursts.splice(index, 1)
}
