import type { components } from './schema'
import { uiConfig } from '../config/ui'

export type LanguageMode =
  components['schemas']['TranscriptionCreate']['language_mode']
export type TranscriptionCreate = components['schemas']['TranscriptionCreate']
export type TranscriptionListResponse =
  components['schemas']['TranscriptionListResponse']
export type TranscriptionResponse =
  components['schemas']['TranscriptionResponse']
export type TranscriptionUpdate = components['schemas']['TranscriptionUpdate']
export type TranscriptionDeleteResponse =
  components['schemas']['TranscriptionDeleteResponse']
export type SttTokenResponse = components['schemas']['SttTokenResponse']

export interface TranscriptionListParams {
  search: string
  page: number
  limit: number
}

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.message === 'string'
    ) {
      return body.error.message
    }
  } catch {
    return uiConfig.errors.requestFailed(response.status)
  }
  return uiConfig.errors.requestFailed(response.status)
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiRequestError(await getErrorMessage(response), response.status)
  }
  return (await response.json()) as T
}

export async function requestSttToken(
  languageMode: LanguageMode,
): Promise<SttTokenResponse> {
  const response = await fetch('/api/stt/token', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language_mode: languageMode }),
  })
  return parseResponse<SttTokenResponse>(response)
}

export async function createTranscription(
  transcription: TranscriptionCreate,
): Promise<components['schemas']['TranscriptionResponse']> {
  const response = await fetch('/api/transcriptions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transcription),
  })
  return parseResponse<components['schemas']['TranscriptionResponse']>(response)
}

export async function listTranscriptions(
  params: TranscriptionListParams,
): Promise<TranscriptionListResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  })
  if (params.search) query.set('search', params.search)

  const response = await fetch(`/api/transcriptions?${query}`, {
    credentials: 'same-origin',
  })
  return parseResponse<TranscriptionListResponse>(response)
}

export async function getTranscription(
  id: string,
): Promise<TranscriptionResponse> {
  const response = await fetch(
    `/api/transcriptions/${encodeURIComponent(id)}`,
    {
      credentials: 'same-origin',
    },
  )
  return parseResponse<TranscriptionResponse>(response)
}

export async function updateTranscription(
  id: string,
  update: TranscriptionUpdate,
): Promise<TranscriptionResponse> {
  const response = await fetch(
    `/api/transcriptions/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    },
  )
  return parseResponse<TranscriptionResponse>(response)
}

export async function deleteTranscription(
  id: string,
): Promise<TranscriptionDeleteResponse> {
  const response = await fetch(
    `/api/transcriptions/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      credentials: 'same-origin',
    },
  )
  return parseResponse<TranscriptionDeleteResponse>(response)
}
