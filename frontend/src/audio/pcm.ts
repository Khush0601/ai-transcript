export const TARGET_SAMPLE_RATE = 16_000
export const PCM_CHUNK_FRAMES = TARGET_SAMPLE_RATE / 10

export function floatSamplesToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    pcm[index] =
      sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767)
  }
  return pcm
}

export function pcm16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(index * 2, samples[index] ?? 0, true)
  }

  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export class Pcm16kChunker {
  private readonly inputStep: number
  private sourceSamples = new Float32Array(0)
  private sourcePosition = 0
  private outputSamples = new Int16Array(PCM_CHUNK_FRAMES)
  private outputLength = 0

  constructor(inputSampleRate: number) {
    if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
      throw new RangeError('The input sample rate must be a positive number.')
    }
    this.inputStep = inputSampleRate / TARGET_SAMPLE_RATE
  }

  push(samples: Float32Array): Int16Array[] {
    if (samples.length === 0) return []

    const combined = new Float32Array(
      this.sourceSamples.length + samples.length,
    )
    combined.set(this.sourceSamples)
    combined.set(samples, this.sourceSamples.length)
    this.sourceSamples = combined

    const chunks: Int16Array[] = []
    while (this.sourcePosition + 1 < this.sourceSamples.length) {
      const left = Math.floor(this.sourcePosition)
      const fraction = this.sourcePosition - left
      const first = this.sourceSamples[left] ?? 0
      const second = this.sourceSamples[left + 1] ?? first
      this.appendSample(first + (second - first) * fraction, chunks)
      this.sourcePosition += this.inputStep
    }

    const consumedSamples = Math.floor(this.sourcePosition)
    this.sourceSamples = this.sourceSamples.slice(consumedSamples)
    this.sourcePosition -= consumedSamples
    return chunks
  }

  flush(): Int16Array[] {
    const chunks: Int16Array[] = []
    while (this.sourcePosition < this.sourceSamples.length) {
      const left = Math.floor(this.sourcePosition)
      const fraction = this.sourcePosition - left
      const first = this.sourceSamples[left] ?? 0
      const second = this.sourceSamples[left + 1] ?? first
      this.appendSample(first + (second - first) * fraction, chunks)
      this.sourcePosition += this.inputStep
    }

    this.sourceSamples = new Float32Array(0)
    this.sourcePosition = 0
    if (this.outputLength > 0) {
      chunks.push(this.outputSamples.slice(0, this.outputLength))
      this.outputSamples = new Int16Array(PCM_CHUNK_FRAMES)
      this.outputLength = 0
    }
    return chunks
  }

  private appendSample(sample: number, chunks: Int16Array[]): void {
    const boundedSample = Math.max(-1, Math.min(1, sample))
    this.outputSamples[this.outputLength] =
      boundedSample < 0
        ? Math.round(boundedSample * 32_768)
        : Math.round(boundedSample * 32_767)
    this.outputLength += 1

    if (this.outputLength === PCM_CHUNK_FRAMES) {
      chunks.push(this.outputSamples)
      this.outputSamples = new Int16Array(PCM_CHUNK_FRAMES)
      this.outputLength = 0
    }
  }
}
