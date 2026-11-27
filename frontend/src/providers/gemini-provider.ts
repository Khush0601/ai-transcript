import {
  AudioTranscriptionConfigMode,
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
} from '@google/genai'

import { requestSttToken } from '../api/client'
import { pcm16ToBase64 } from '../audio/pcm'
import type { LanguageMode } from '../api/client'
import type { ProviderState, TranscriptionProvider } from './types'

type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>

const FINAL_SEGMENT_TIMEOUT_MS = 4_000
const FINAL_SEGMENT_QUIET_MS = 300

export class GeminiProvider implements TranscriptionProvider {
  onInterim: (text: string) => void = () => undefined
  onFinal: (text: string) => void = () => undefined
  onError: (error: Error) => void = () => undefined
  onStateChange: (state: ProviderState) => void = () => undefined

  private session: LiveSession | undefined
  private stopping = false
  private resolveFinal: (() => void) | undefined

  async start(languageMode: LanguageMode): Promise<void> {
    this.setState('connecting')
    try {
      const tokenResponse = await requestSttToken(languageMode)
      const ai = new GoogleGenAI({
        apiKey: tokenResponse.token,
        httpOptions: { apiVersion: 'v1beta' },
      })
      this.session = await ai.live.connect({
        model: tokenResponse.model,
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {
            languageCodes:
              languageMode === 'hindi_english' ? ['hi-IN', 'en-IN'] : [],
            mode: AudioTranscriptionConfigMode.VERBATIM,
          },
        },
        callbacks: {
          onopen: () => this.setState('connected'),
          onmessage: (message) => this.handleMessage(message),
          onerror: (event) => {
            const error = new Error(
              event.message || 'The transcription connection failed.',
            )
            this.setState('error')
            this.onError(error)
          },
          onclose: () => {
            if (!this.stopping) {
              this.setState('error')
              this.onError(
                new Error('The transcription connection was interrupted.'),
              )
            }
          },
        },
      })
      this.setState('connected')
    } catch (error) {
      this.setState('error')
      const normalizedError =
        error instanceof Error
          ? error
          : new Error('Could not start transcription.')
      this.onError(normalizedError)
      throw normalizedError
    }
  }

  sendAudioChunk(samples: Int16Array): void {
    if (!this.session || this.stopping) {
      throw new Error('The transcription session is not ready for audio.')
    }
    this.session.sendRealtimeInput({
      audio: {
        data: pcm16ToBase64(samples),
        mimeType: 'audio/pcm;rate=16000',
      },
    })
  }

  async stop(): Promise<boolean> {
    const session = this.session
    if (!session) return false

    this.stopping = true
    this.setState('stopping')
    let timeoutId: number | undefined
    let quietTimeoutId: number | undefined
    let sawFinal = false
    const finalReceived = new Promise<boolean>((resolve) => {
      timeoutId = window.setTimeout(
        () => resolve(sawFinal),
        FINAL_SEGMENT_TIMEOUT_MS,
      )
      this.resolveFinal = () => {
        sawFinal = true
        if (quietTimeoutId !== undefined) {
          window.clearTimeout(quietTimeoutId)
        }
        quietTimeoutId = window.setTimeout(
          () => resolve(true),
          FINAL_SEGMENT_QUIET_MS,
        )
      }
    })
    try {
      session.sendRealtimeInput({ audioStreamEnd: true })
      return await finalReceived
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      if (quietTimeoutId !== undefined) window.clearTimeout(quietTimeoutId)
      this.resolveFinal = undefined
      session.close()
      this.session = undefined
      this.setState('closed')
    }
  }

  dispose(): void {
    this.stopping = true
    this.session?.close()
    this.session = undefined
  }

  private handleMessage(message: LiveServerMessage): void {
    const content = message.serverContent
    if (content?.interimInputTranscription) {
      this.onInterim(content.interimInputTranscription.text ?? '')
    }
    if (content?.inputTranscription) {
      this.onFinal(content.inputTranscription.text ?? '')
      this.resolveFinal?.()
    }
  }

  private setState(state: ProviderState): void {
    this.onStateChange(state)
  }
}
