import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import {
  ApiRequestError,
  createTranscription,
  type LanguageMode,
  type TranscriptionCreate,
} from '../../api/client'
import { uiConfig, type RecorderStatus } from '../../config/ui'
import { createAudioCapture, type AudioCapture } from '../../audio/capture'
import type { GeminiProvider } from '../../providers/gemini-provider'
import type { ProviderState } from '../../providers/types'
import {
  clearPendingDraft,
  draftToTranscription,
  readPendingDraft,
  writePendingDraft,
  type PendingDraft,
} from './draft'
import {
  mergeTranscriptUpdate,
  transcriptText,
  type TranscriptUpdate,
} from './transcript'
import './Recorder.css'

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return uiConfig.recorder.messages.rateLimited
    if (error.status === 503) return uiConfig.recorder.messages.missingApiKey
    return error.message
  }
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return uiConfig.recorder.messages.microphoneDenied
    }
    if (
      error.name === 'NotFoundError' ||
      error.name === 'DevicesNotFoundError'
    ) {
      return uiConfig.recorder.messages.microphoneNotFound
    }
    if (error.name === 'NotReadableError') {
      return uiConfig.recorder.messages.microphoneUnavailable
    }
  }
  return error instanceof Error
    ? error.message
    : uiConfig.recorder.messages.recordingFailed
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}${uiConfig.recorder.clockSeparator}${String(seconds).padStart(2, '0')}`
}

function createDraft(languageMode: LanguageMode): PendingDraft {
  return {
    client_request_id: crypto.randomUUID(),
    title: uiConfig.recorder.defaultTitle,
    final_text: '',
    interim_text: '',
    language_mode: languageMode,
    duration_ms: 0,
  }
}

export function Recorder() {
  const [initialDraft] = useState(readPendingDraft)
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [connectionState, setConnectionState] =
    useState<ProviderState>('closed')
  const [languageMode, setLanguageMode] = useState<LanguageMode>(
    uiConfig.recorder.defaultLanguageMode,
  )
  const [transcript, setTranscript] = useState<TranscriptUpdate>({
    finalText: '',
    interimText: '',
  })
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState<string | null>(
    initialDraft.error,
  )
  const [savedId, setSavedId] = useState<string | null>(null)
  const [recoveryDraft, setRecoveryDraft] = useState<PendingDraft | null>(
    initialDraft.draft,
  )
  const [pendingSave, setPendingSave] = useState<TranscriptionCreate | null>(
    null,
  )
  const transcriptRef = useRef(transcript)
  const draftRef = useRef<PendingDraft | null>(recoveryDraft)
  const pendingSaveRef = useRef<TranscriptionCreate | null>(null)
  const captureRef = useRef<AudioCapture | null>(null)
  const providerRef = useRef<GeminiProvider | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const recordingActiveRef = useRef(false)
  const stoppingRef = useRef(false)
  const stopRecordingRef = useRef<() => Promise<void>>(async () => undefined)
  const saveMutation = useMutation({ mutationFn: createTranscription })

  function updateTranscript(next: TranscriptUpdate): void {
    transcriptRef.current = next
    setTranscript(next)
    const currentDraft = draftRef.current
    if (!currentDraft) return

    const updatedDraft: PendingDraft = {
      ...currentDraft,
      final_text: next.finalText,
      interim_text: next.interimText,
      duration_ms: startedAtRef.current
        ? Date.now() - startedAtRef.current
        : currentDraft.duration_ms,
    }
    draftRef.current = updatedDraft
    if (!writePendingDraft(updatedDraft)) {
      setStorageWarning(uiConfig.recorder.messages.draftStorageFailed)
    }
  }

  async function saveTranscript(payload: TranscriptionCreate): Promise<void> {
    if (!payload.content.trim()) {
      setError(uiConfig.recorder.messages.noFinalizedWords)
      setStatus('error')
      return
    }
    pendingSaveRef.current = payload
    setPendingSave(payload)
    setStatus('saving')
    setError(null)
    try {
      const saved = await saveMutation.mutateAsync(payload)
      setSavedId(saved.id)
      pendingSaveRef.current = null
      setPendingSave(null)
      draftRef.current = null
      setRecoveryDraft(null)
      if (!clearPendingDraft()) {
        setStorageWarning(
          uiConfig.recorder.messages.recoveryCopyCouldNotBeCleared,
        )
      }
      setStatus('saved')
    } catch (saveError) {
      setError(errorMessage(saveError))
      setStatus('save_failed')
    }
  }

  async function stopRecording(): Promise<void> {
    if (stoppingRef.current || !recordingActiveRef.current) return
    stoppingRef.current = true
    setStatus('stopping')

    const capture = captureRef.current
    const provider = providerRef.current
    const recordingStartedAt = startedAtRef.current
    let finalized = false
    let durationMs = elapsedMs
    try {
      if (capture) {
        const remainingChunks = await capture.stop()
        durationMs = Math.min(
          uiConfig.recorder.sessionLimitMs,
          Math.max(
            elapsedMs,
            recordingStartedAt === null ? 0 : Date.now() - recordingStartedAt,
          ),
        )
        captureRef.current = null
        for (const chunk of remainingChunks) {
          provider?.sendAudioChunk(chunk)
        }
      } else {
        durationMs = Math.min(
          uiConfig.recorder.sessionLimitMs,
          Math.max(
            elapsedMs,
            recordingStartedAt === null ? 0 : Date.now() - recordingStartedAt,
          ),
        )
      }
      if (provider) finalized = await provider.stop()
    } catch (stopError) {
      setError(errorMessage(stopError))
      provider?.dispose()
    } finally {
      captureRef.current = null
      providerRef.current = null
      recordingActiveRef.current = false
      setIsRecording(false)
      startedAtRef.current = null
      setConnectionState('closed')
    }

    const currentTranscript = transcriptRef.current
    const finalTranscript =
      !finalized && currentTranscript.interimText
        ? mergeTranscriptUpdate(currentTranscript, {
            final: currentTranscript.interimText,
          })
        : currentTranscript
    updateTranscript({ ...finalTranscript, interimText: '' })
    const currentDraft = draftRef.current
    if (currentDraft) {
      const completedDraft: PendingDraft = {
        ...currentDraft,
        final_text: finalTranscript.finalText,
        interim_text: '',
        duration_ms: durationMs,
      }
      draftRef.current = completedDraft
      if (!writePendingDraft(completedDraft)) {
        setStorageWarning(uiConfig.recorder.messages.draftStorageFailed)
      }
    }
    stoppingRef.current = false

    if (!finalTranscript.finalText.trim() || !currentDraft) {
      draftRef.current = null
      clearPendingDraft()
      setStatus('idle')
      return
    }
    await saveTranscript(
      draftToTranscription({
        ...currentDraft,
        final_text: finalTranscript.finalText,
        interim_text: '',
        duration_ms: durationMs,
      }),
    )
  }
  useEffect(() => {
    stopRecordingRef.current = stopRecording
  })

  async function startRecording(): Promise<void> {
    setError(null)
    setStorageWarning(null)
    setSavedId(null)
    setStatus('requesting_mic')
    let capture: AudioCapture | null = null
    let provider: GeminiProvider | null = null
    try {
      const [captureResult, providerModuleResult] = await Promise.allSettled([
        createAudioCapture(),
        import('../../providers/gemini-provider'),
      ])
      if (captureResult.status === 'rejected') throw captureResult.reason
      capture = captureResult.value
      captureRef.current = capture
      if (providerModuleResult.status === 'rejected') {
        throw providerModuleResult.reason
      }
      const { GeminiProvider } = providerModuleResult.value
      provider = new GeminiProvider()
      providerRef.current = provider
      provider.onInterim = (text) => {
        updateTranscript(
          mergeTranscriptUpdate(transcriptRef.current, {
            interim: text,
          }),
        )
      }
      provider.onFinal = (text) => {
        updateTranscript(
          mergeTranscriptUpdate(transcriptRef.current, {
            final: text,
          }),
        )
      }
      provider.onError = (providerError) => {
        setError(errorMessage(providerError))
        setStatus('error')
      }
      provider.onStateChange = setConnectionState
      setStatus('connecting')
      await provider.start(languageMode)

      const newDraft = createDraft(languageMode)
      draftRef.current = newDraft
      updateTranscript({ finalText: '', interimText: '' })
      if (!writePendingDraft(newDraft)) {
        setStorageWarning(uiConfig.recorder.messages.draftStorageFailed)
      }
      await capture.start(
        (chunk) => provider?.sendAudioChunk(chunk),
        (audioError) => {
          setError(errorMessage(audioError))
          setStatus('error')
        },
      )
      startedAtRef.current = Date.now()
      recordingActiveRef.current = true
      setIsRecording(true)
      setElapsedMs(0)
      setStatus('recording')
    } catch (startError) {
      recordingActiveRef.current = false
      setIsRecording(false)
      startedAtRef.current = null
      captureRef.current = null
      providerRef.current = null
      provider?.dispose()
      if (capture) {
        try {
          await capture.stop()
        } catch {
          setStorageWarning(uiConfig.recorder.messages.microphoneReleaseFailed)
        }
      }
      const currentDraft = draftRef.current
      if (
        currentDraft &&
        !currentDraft.final_text &&
        !currentDraft.interim_text
      ) {
        draftRef.current = null
        clearPendingDraft()
      }
      setError(errorMessage(startError))
      setStatus('error')
    }
  }

  function restoreDraft(): void {
    if (!recoveryDraft) return
    draftRef.current = recoveryDraft
    updateTranscript({
      finalText: recoveryDraft.final_text,
      interimText: recoveryDraft.interim_text,
    })
    setLanguageMode(recoveryDraft.language_mode)
    const payload = draftToTranscription(recoveryDraft)
    pendingSaveRef.current = payload
    setPendingSave(payload)
    setStatus('draft')
    setError(null)
  }

  function discardDraft(): void {
    if (!window.confirm(uiConfig.recorder.messages.discardDraftConfirmation))
      return
    clearPendingDraft()
    draftRef.current = null
    pendingSaveRef.current = null
    setPendingSave(null)
    setRecoveryDraft(null)
    setTranscript({ finalText: '', interimText: '' })
    transcriptRef.current = { finalText: '', interimText: '' }
    setElapsedMs(0)
    setStatus('idle')
  }

  async function retrySave(): Promise<void> {
    const payload = pendingSaveRef.current
    if (payload) await saveTranscript(payload)
  }

  useEffect(() => {
    if (status !== 'recording' && status !== 'error') return
    const timerId = window.setInterval(() => {
      const startedAt = startedAtRef.current
      if (!recordingActiveRef.current || startedAt === null) return
      const duration = Date.now() - startedAt
      setElapsedMs(duration)
      if (duration >= uiConfig.recorder.sessionLimitMs) {
        void stopRecordingRef.current()
      }
    }, 250)
    return () => window.clearInterval(timerId)
  }, [status])

  useEffect(() => {
    const shouldWarn =
      status === 'recording' ||
      status === 'save_failed' ||
      status === 'draft' ||
      (status === 'error' && recordingActiveRef.current)
    if (!shouldWarn) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [status])

  const isActive = isRecording
  const isBusy =
    status === 'requesting_mic' ||
    status === 'connecting' ||
    status === 'stopping' ||
    status === 'saving'
  const fullTranscript = transcriptText(transcript)
  const nearSessionLimit = elapsedMs >= uiConfig.recorder.sessionWarningMs

  return (
    <section className="recorder-card" aria-labelledby="recorder-heading">
      <div className="recorder-topline">
        <div>
          <p className="eyebrow">{uiConfig.recorder.labels.eyebrow}</p>
          <h2 id="recorder-heading">{uiConfig.recorder.labels.heading}</h2>
        </div>
        <div className={`connection-pill connection-${connectionState}`}>
          <span aria-hidden="true" />
          {uiConfig.recorder.connectionStateLabels[connectionState]}
        </div>
      </div>

      <div className="recorder-controls">
        <label className="language-control">
          <span>{uiConfig.recorder.labels.language}</span>
          <select
            value={languageMode}
            onChange={(event) => {
              const value = event.currentTarget.value
              const language = Object.values(uiConfig.recorder.languages).find(
                (option) => option.value === value,
              )
              if (language) {
                setLanguageMode(language.value)
              }
            }}
            disabled={isBusy || isActive || recoveryDraft !== null}
          >
            {Object.values(uiConfig.recorder.languages).map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </label>

        <div className="recording-clock" aria-live="off">
          <span
            className={
              isActive ? 'recording-dot recording-dot-active' : 'recording-dot'
            }
          />
          {formatDuration(elapsedMs)}
        </div>

        {isActive ? (
          <button
            className="record-button stop-button"
            type="button"
            onClick={() => void stopRecording()}
            disabled={status === 'stopping' || status === 'saving'}
          >
            <span className="stop-square" aria-hidden="true" />
            {uiConfig.recorder.labels.stopAndSave}
          </button>
        ) : (
          <button
            className="record-button"
            type="button"
            onClick={() => void startRecording()}
            disabled={isBusy || pendingSave !== null || recoveryDraft !== null}
          >
            <svg className="mic-symbol" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
            </svg>
            {status === 'requesting_mic'
              ? uiConfig.recorder.labels.allowMicrophone
              : status === 'connecting'
                ? uiConfig.recorder.labels.connecting
                : uiConfig.recorder.labels.startRecording}
          </button>
        )}
      </div>

      {nearSessionLimit && isActive && (
        <p className="session-warning" role="status">
          {uiConfig.recorder.labels.sessionLimitWarning}
        </p>
      )}

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {storageWarning && (
        <p className="notice notice-warning" role="status">
          {storageWarning}
        </p>
      )}

      {recoveryDraft && (
        <div className="draft-recovery" role="status">
          <div>
            <strong>{uiConfig.recorder.labels.unsavedDraftFound}</strong>
            <p>{uiConfig.recorder.labels.restoreDraftDescription}</p>
          </div>
          <div className="draft-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={restoreDraft}
            >
              {uiConfig.recorder.labels.restoreDraft}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={discardDraft}
            >
              {uiConfig.recorder.labels.discard}
            </button>
          </div>
        </div>
      )}

      <div
        className="transcript-panel"
        aria-live="polite"
        aria-label={uiConfig.recorder.labels.liveTranscript}
      >
        {fullTranscript ? (
          <p className="transcript-text">
            {transcript.finalText}
            {transcript.interimText && (
              <span className="transcript-interim">
                {transcript.finalText && !/\s$/.test(transcript.finalText)
                  ? ' '
                  : ''}
                {transcript.interimText}
              </span>
            )}
          </p>
        ) : (
          <div className="transcript-placeholder">
            <span className="sound-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <p>{uiConfig.recorder.labels.transcriptPlaceholder}</p>
            <span>{uiConfig.recorder.labels.interimTranscriptHint}</span>
          </div>
        )}
      </div>

      <div className="recorder-footer">
        <span>{uiConfig.recorder.statusText[status]}</span>
        {status === 'save_failed' && pendingSave && (
          <button
            type="button"
            className="text-button retry-button"
            onClick={() => void retrySave()}
          >
            {uiConfig.recorder.labels.retrySave}
          </button>
        )}
        {status === 'draft' && pendingSave && (
          <button
            type="button"
            className="text-button retry-button"
            onClick={() => void retrySave()}
          >
            {uiConfig.recorder.labels.saveRecoveredTranscript}
          </button>
        )}
        {status === 'saved' && savedId && (
          <span className="saved-indicator">
            {uiConfig.recorder.labels.savedSecurely}
          </span>
        )}
      </div>
    </section>
  )
}
