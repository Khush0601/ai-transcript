import {
  AudioTranscriptionConfigMode,
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
} from '@google/genai'

import { requestSttToken } from '../api/client'
import { pcm16ToBase64 } from '../audio/pcm'
import type { LanguageMode } from '../api/client'
import { uiConfig } from '../config/ui'
import type { ProviderState, TranscriptionProvider } from './types'

type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>

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
        httpOptions: { apiVersion: uiConfig.live.apiVersion },
      })
      this.session = await ai.live.connect({
        model: tokenResponse.model,
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {
            languageCodes: [
              ...uiConfig.recorder.languages[languageMode].languageCodes,
            ],
            mode: AudioTranscriptionConfigMode.VERBATIM,
          },
        },
        callbacks: {
          onopen: () => this.setState('connected'),
          onmessage: (message) => this.handleMessage(message),
          onerror: (event) => {
            const error = new Error(
              event.message || uiConfig.errors.transcriptionConnectionFailed,
            )
            this.setState('error')
            this.onError(error)
          },
          onclose: () => {
            if (!this.stopping) {
              this.setState('error')
              this.onError(new Error(uiConfig.errors.transcriptionInterrupted))
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
          : new Error(uiConfig.errors.transcriptionStartFailed)
      this.onError(normalizedError)
      throw normalizedError
    }
  }

  sendAudioChunk(samples: Int16Array): void {
    if (!this.session || this.stopping) {
      throw new Error(uiConfig.errors.transcriptionSessionNotReady)
    }
    this.session.sendRealtimeInput({
      audio: {
        data: pcm16ToBase64(samples),
        mimeType: uiConfig.audio.mimeType,
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
        uiConfig.recorder.finalSegmentTimeoutMs,
      )
      this.resolveFinal = () => {
        sawFinal = true
        if (quietTimeoutId !== undefined) {
          window.clearTimeout(quietTimeoutId)
        }
        quietTimeoutId = window.setTimeout(
          () => resolve(true),
          uiConfig.recorder.finalSegmentQuietMs,
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
