import { Pcm16kChunker } from './pcm'

export interface AudioCapture {
  start(
    onChunk: (samples: Int16Array) => void,
    onError: (error: Error) => void,
  ): Promise<void>
  stop(): Promise<Int16Array[]>
}

class BrowserAudioCapture implements AudioCapture {
  private readonly stream: MediaStream
  private readonly context: AudioContext
  private readonly source: MediaStreamAudioSourceNode
  private readonly processor: AudioWorkletNode
  private readonly mutedOutput: GainNode
  private readonly chunker: Pcm16kChunker
  private stopped = false

  constructor(
    stream: MediaStream,
    context: AudioContext,
    source: MediaStreamAudioSourceNode,
    processor: AudioWorkletNode,
    mutedOutput: GainNode,
  ) {
    this.stream = stream
    this.context = context
    this.source = source
    this.processor = processor
    this.mutedOutput = mutedOutput
    this.chunker = new Pcm16kChunker(context.sampleRate)
  }

  async start(
    onChunk: (samples: Int16Array) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    if (this.stopped) {
      throw new Error('The microphone capture has already stopped.')
    }
    await this.context.resume()
    this.processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!(event.data instanceof Float32Array)) return
      try {
        for (const chunk of this.chunker.push(event.data)) {
          onChunk(chunk)
        }
      } catch (error) {
        onError(
          error instanceof Error
            ? error
            : new Error('Audio processing failed.'),
        )
      }
    }
    this.processor.port.onmessageerror = () => {
      onError(new Error('The microphone audio stream could not be processed.'))
    }
    this.source.connect(this.processor)
    this.processor.connect(this.mutedOutput)
    this.mutedOutput.connect(this.context.destination)
  }

  async stop(): Promise<Int16Array[]> {
    if (this.stopped) return []
    this.stopped = true
    this.processor.port.onmessage = null
    this.processor.port.onmessageerror = null
    this.source.disconnect()
    this.processor.disconnect()
    this.mutedOutput.disconnect()
    const remainingChunks = this.chunker.flush()
    for (const track of this.stream.getTracks()) {
      track.stop()
    }
    await this.context.close()
    return remainingChunks
  }
}

export async function createAudioCapture(): Promise<AudioCapture> {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
    throw new Error('This browser does not support microphone audio worklets.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: false,
  })

  let context: AudioContext | undefined
  try {
    context = new AudioContext()
    if (!context.audioWorklet) {
      throw new Error(
        'This browser does not support microphone audio worklets.',
      )
    }
    await context.audioWorklet.addModule('/worklets/pcm-worklet.js')
    const source = context.createMediaStreamSource(stream)
    const processor = new AudioWorkletNode(context, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    const mutedOutput = context.createGain()
    mutedOutput.gain.value = 0
    return new BrowserAudioCapture(
      stream,
      context,
      source,
      processor,
      mutedOutput,
    )
  } catch (error) {
    for (const track of stream.getTracks()) {
      track.stop()
    }
    if (context && context.state !== 'closed') {
      await context.close()
    }
    throw error
  }
}
