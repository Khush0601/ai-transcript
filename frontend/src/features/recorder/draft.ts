import type { LanguageMode, TranscriptionCreate } from '../../api/client'
import { uiConfig } from '../../config/ui'

export interface PendingDraft {
  client_request_id: string
  title: string
  final_text: string
  interim_text: string
  language_mode: LanguageMode
  duration_ms: number
}

export function draftToTranscription(draft: PendingDraft): TranscriptionCreate {
  const finalText = draft.final_text.trimEnd()
  const interimText = draft.interim_text.trim()
  const content =
    finalText && interimText
      ? `${finalText} ${interimText}`
      : finalText || interimText
  return {
    client_request_id: draft.client_request_id,
    title: draft.title,
    content,
    duration_ms: draft.duration_ms,
    language_mode: draft.language_mode,
    provider: uiConfig.providers.gemini.value,
  }
}

function isPendingDraft(value: unknown): value is PendingDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Record<string, unknown>
  return (
    typeof draft.client_request_id === 'string' &&
    typeof draft.title === 'string' &&
    typeof draft.final_text === 'string' &&
    typeof draft.interim_text === 'string' &&
    isLanguageMode(draft.language_mode) &&
    typeof draft.duration_ms === 'number' &&
    Number.isFinite(draft.duration_ms) &&
    draft.duration_ms >= 0
  )
}

function isLanguageMode(value: unknown): value is LanguageMode {
  return Object.values(uiConfig.recorder.languages).some(
    (language) => language.value === value,
  )
}

export function readPendingDraft():
  { draft: PendingDraft; error: null } | { draft: null; error: string | null } {
  try {
    const stored = localStorage.getItem(uiConfig.draft.storageKey)
    if (stored === null) return { draft: null, error: null }
    const parsed: unknown = JSON.parse(stored)
    if (isPendingDraft(parsed)) return { draft: parsed, error: null }
    return {
      draft: null,
      error: uiConfig.draft.invalidDraft,
    }
  } catch {
    return {
      draft: null,
      error: uiConfig.draft.storageUnavailable,
    }
  }
}

export function writePendingDraft(draft: PendingDraft): boolean {
  try {
    localStorage.setItem(uiConfig.draft.storageKey, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function clearPendingDraft(): boolean {
  try {
    localStorage.removeItem(uiConfig.draft.storageKey)
    return true
  } catch {
    return false
  }
}
