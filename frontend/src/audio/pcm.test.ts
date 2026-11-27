import { describe, expect, it } from 'vitest'

import {
  PCM_CHUNK_FRAMES,
  Pcm16kChunker,
  floatSamplesToPcm16,
  pcm16ToBase64,
} from './pcm'

describe('floatSamplesToPcm16', () => {
  it('clamps floats and maps the signed PCM16 range', () => {
    expect(
      floatSamplesToPcm16(new Float32Array([-1, -0.5, 0, 0.5, 1, 2])),
    ).toEqual(new Int16Array([-32768, -16384, 0, 16384, 32767, 32767]))
  })
})

describe('Pcm16kChunker', () => {
  it('resamples 48 kHz input into 100 ms 16 kHz chunks', () => {
    const chunker = new Pcm16kChunker(48_000)
    const input = new Float32Array(4_800).fill(0.25)
    const chunks = [...chunker.push(input), ...chunker.flush()]

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(PCM_CHUNK_FRAMES)
    expect(chunks[0]?.[0]).toBe(8192)
  })

  it('preserves sample continuity across input blocks', () => {
    const input = Float32Array.from(
      { length: 4_800 },
      (_, index) => index / 4_800,
    )
    const wholeChunker = new Pcm16kChunker(48_000)
    const splitChunker = new Pcm16kChunker(48_000)
    const whole = [...wholeChunker.push(input), ...wholeChunker.flush()]
    const split = [
      ...splitChunker.push(input.slice(0, 127)),
      ...splitChunker.push(input.slice(127, 2_500)),
      ...splitChunker.push(input.slice(2_500)),
      ...splitChunker.flush(),
    ]

    expect(split).toHaveLength(whole.length)
    expect(Array.from(split[0] ?? [])).toEqual(Array.from(whole[0] ?? []))
  })
})

describe('pcm16ToBase64', () => {
  it('encodes signed PCM in little-endian order', () => {
    expect(pcm16ToBase64(new Int16Array([0x1234, -2]))).toBe('NBL+/w==')
  })
})
