import type { LanguageMode } from '../api/client'

export type ProviderState =
  'connecting' | 'connected' | 'stopping' | 'closed' | 'error'

export interface TranscriptionProvider {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError: (error: Error) => void
  onStateChange: (state: ProviderState) => void
  start(languageMode: LanguageMode): Promise<void>
  sendAudioChunk(samples: Int16Array): void
  stop(): Promise<boolean>
  dispose(): void
}
