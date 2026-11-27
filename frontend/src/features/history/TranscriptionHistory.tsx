import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  deleteTranscription,
  getTranscription,
  listTranscriptions,
  updateTranscription,
  type TranscriptionResponse,
  type TranscriptionListResponse,
  type TranscriptionUpdate,
} from '../../api/client'
import { uiConfig } from '../../config/ui'
import './history.css'

const LIST_QUERY_KEY = ['transcriptions', 'list'] as const

const dateFormatter = new Intl.DateTimeFormat(
  undefined,
  uiConfig.history.dateFormat,
)

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : uiConfig.history.messages.genericError
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? uiConfig.history.messages.dateUnavailable
    : dateFormatter.format(date)
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0
    ? `${minutes}${uiConfig.history.duration.minuteSuffix} ${seconds % 60}${uiConfig.history.duration.secondSuffix}`
    : `${seconds}${uiConfig.history.duration.secondSuffix}`
}

function excerpt(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > uiConfig.history.excerptMaxLength
    ? `${normalized.slice(0, uiConfig.history.excerptMaxLength)}${uiConfig.history.excerptSuffix}`
    : normalized
}

interface TranscriptionHistoryProps {
  active: boolean
  onRecord: () => void
}

export function TranscriptionHistory({
  active,
  onRecord,
}: TranscriptionHistoryProps) {
  const queryClient = useQueryClient()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editValidationError, setEditValidationError] = useState<string | null>(
    null,
  )
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: [
      ...LIST_QUERY_KEY,
      { search, page, limit: uiConfig.history.pageSize },
    ],
    queryFn: () =>
      listTranscriptions({
        search,
        page,
        limit: uiConfig.history.pageSize,
      }),
    enabled: active,
    placeholderData: keepPreviousData,
  })

  const detailQuery = useQuery({
    queryKey: ['transcription', selectedId],
    queryFn: () => {
      if (selectedId === null) {
        throw new Error(uiConfig.history.messages.selectBeforeDetails)
      }
      return getTranscription(selectedId)
    },
    enabled: active && selectedId !== null,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: TranscriptionUpdate }) =>
      updateTranscription(id, update),
    onSuccess: (updated) => {
      queryClient.setQueryData(['transcription', updated.id], updated)
      setIsEditing(false)
      setEditValidationError(null)
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTranscription,
    onSuccess: (_, id) => {
      const currentPage = queryClient.getQueryData<TranscriptionListResponse>([
        ...LIST_QUERY_KEY,
        { search, page, limit: uiConfig.history.pageSize },
      ])
      queryClient.removeQueries({ queryKey: ['transcription', id] })
      setSelectedId(null)
      setIsEditing(false)
      if (page > 1 && currentPage?.items.length === 1) {
        setPage(page - 1)
      }
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY })
    },
  })

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, uiConfig.history.searchDelayMs)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const data = listQuery.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const firstResult = data?.total ? (data.page - 1) * data.limit + 1 : 0
  const lastResult = data ? Math.min(data.page * data.limit, data.total) : 0
  const transcription = detailQuery.data

  function canLeaveEdit(): boolean {
    const hasChanges =
      isEditing &&
      transcription !== undefined &&
      (editTitle !== transcription.title ||
        editContent !== transcription.content)
    return (
      !hasChanges ||
      window.confirm(uiConfig.history.messages.discardUnsavedChanges)
    )
  }

  function selectTranscription(item: TranscriptionResponse): void {
    if (item.id === selectedId || !canLeaveEdit()) return
    setSelectedId(item.id)
    setIsEditing(false)
    setEditValidationError(null)
    setCopyMessage(null)
    updateMutation.reset()
    deleteMutation.reset()
  }

  function beginEditing(item: TranscriptionResponse): void {
    setEditTitle(item.title)
    setEditContent(item.content)
    setEditValidationError(null)
    updateMutation.reset()
    setIsEditing(true)
  }

  function saveEdit(): void {
    if (!transcription) return
    const title = editTitle.trim()
    if (!title) {
      setEditValidationError(uiConfig.history.messages.titleRequired)
      return
    }

    setEditValidationError(null)
    updateMutation.mutate({
      id: transcription.id,
      update: { title, content: editContent },
    })
  }

  function discardEdit(): void {
    setIsEditing(false)
    setEditValidationError(null)
    updateMutation.reset()
  }

  function confirmDelete(): void {
    if (!transcription) return
    const confirmed = window.confirm(
      uiConfig.history.messages.deleteConfirmation(transcription.title),
    )
    if (!confirmed) return
    deleteMutation.reset()
    deleteMutation.mutate(transcription.id)
  }

  async function copyTranscript(): Promise<void> {
    if (!transcription) return
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error(uiConfig.history.messages.clipboardUnavailable)
      }
      await navigator.clipboard.writeText(transcription.content)
      setCopyMessage(uiConfig.history.messages.copied)
    } catch {
      setCopyMessage(uiConfig.history.messages.copyFailed)
    }
  }

  function moveToPage(nextPage: number): void {
    if (!canLeaveEdit()) return
    setPage(nextPage)
    setSelectedId(null)
    setIsEditing(false)
    setCopyMessage(null)
  }

  function startRecording(): void {
    onRecord()
  }

  return (
    <section className="history-view" aria-labelledby="history-heading">
      <header className="history-header">
        <div>
          <p className="eyebrow">{uiConfig.history.labels.eyebrow}</p>
          <h1 id="history-heading">{uiConfig.history.labels.heading}</h1>
          <p>{uiConfig.history.labels.description}</p>
        </div>
        <button
          className="history-new-button"
          type="button"
          onClick={startRecording}
        >
          <span aria-hidden="true">
            {uiConfig.history.emptyStateIcons.newRecording}
          </span>
          {uiConfig.history.labels.newRecording}
        </button>
      </header>

      <label className="history-search">
        <span className="search-icon" aria-hidden="true" />
        <span className="visually-hidden">
          {uiConfig.history.labels.search}
        </span>
        <input
          type="search"
          value={searchInput}
          maxLength={uiConfig.history.maxSearchLength}
          placeholder={uiConfig.history.labels.searchPlaceholder}
          onChange={(event) => {
            if (!canLeaveEdit()) return
            setSearchInput(event.currentTarget.value)
            setSelectedId(null)
            setIsEditing(false)
          }}
          disabled={updateMutation.isPending || deleteMutation.isPending}
        />
        {searchInput && (
          <button
            type="button"
            className="search-clear"
            aria-label={uiConfig.history.labels.clearSearch}
            onClick={() => setSearchInput('')}
          >
            {uiConfig.history.labels.clearSearchButton}
          </button>
        )}
      </label>

      {listQuery.error && data && (
        <div className="history-notice history-error" role="alert">
          {uiConfig.history.messages.refreshFailed}{' '}
          {messageFromError(listQuery.error)}
          <button type="button" onClick={() => void listQuery.refetch()}>
            {uiConfig.history.labels.tryAgain}
          </button>
        </div>
      )}

      <div className="history-layout" aria-busy={listQuery.isFetching}>
        <section
          className="history-list-panel"
          aria-label={uiConfig.history.labels.savedTranscriptions}
        >
          <div className="history-list-heading">
            <h2>
              {search
                ? uiConfig.history.labels.searchResults
                : uiConfig.history.labels.allTranscripts}
            </h2>
            <span>
              {listQuery.isFetching && data
                ? uiConfig.history.labels.updating
                : data
                  ? data.total
                  : ''}
            </span>
          </div>

          {listQuery.isPending && active ? (
            <div className="history-loading" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              {uiConfig.history.labels.loadingList}
            </div>
          ) : listQuery.error && !data ? (
            <div className="history-state history-state-error" role="alert">
              <strong>{uiConfig.history.labels.couldNotLoadHistory}</strong>
              <p>{messageFromError(listQuery.error)}</p>
              <button type="button" onClick={() => void listQuery.refetch()}>
                {uiConfig.history.labels.tryAgain}
              </button>
            </div>
          ) : data?.items.length ? (
            <div className="history-items">
              {data.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`history-item${selectedId === item.id ? ' history-item-selected' : ''}`}
                  aria-pressed={selectedId === item.id}
                  disabled={
                    updateMutation.isPending || deleteMutation.isPending
                  }
                  onClick={() => selectTranscription(item)}
                >
                  <span className="history-item-title">{item.title}</span>
                  <span className="history-item-excerpt">
                    {excerpt(item.content) ||
                      uiConfig.history.labels.noTranscriptText}
                  </span>
                  <span className="history-item-meta">
                    <span>{formatDate(item.created_at)}</span>
                    <span>{formatDuration(item.duration_ms)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="history-state">
              <span className="history-empty-mark" aria-hidden="true">
                {search
                  ? uiConfig.history.emptyStateIcons.search
                  : uiConfig.history.emptyStateIcons.history}
              </span>
              <strong>
                {search
                  ? uiConfig.history.labels.noMatchingTranscripts
                  : uiConfig.history.labels.emptyHistory}
              </strong>
              <p>
                {search
                  ? uiConfig.history.labels.emptySearchDescription
                  : uiConfig.history.labels.emptyHistoryDescription}
              </p>
              {!search && (
                <button
                  type="button"
                  className="history-inline-action"
                  onClick={startRecording}
                >
                  {uiConfig.history.labels.startRecording}
                </button>
              )}
            </div>
          )}

          {data && data.total > 0 && (
            <footer className="history-pagination">
              <span>
                {uiConfig.history.messages.resultRange(
                  firstResult,
                  lastResult,
                  data.total,
                )}
              </span>
              <div>
                <button
                  type="button"
                  aria-label={uiConfig.history.labels.previousPage}
                  disabled={
                    page <= 1 ||
                    listQuery.isFetching ||
                    updateMutation.isPending ||
                    deleteMutation.isPending
                  }
                  onClick={() => moveToPage(page - 1)}
                >
                  {uiConfig.history.labels.previous}
                </button>
                <span>
                  {data.page} / {totalPages}
                </span>
                <button
                  type="button"
                  aria-label={uiConfig.history.labels.nextPage}
                  disabled={
                    page >= totalPages ||
                    listQuery.isFetching ||
                    updateMutation.isPending ||
                    deleteMutation.isPending
                  }
                  onClick={() => moveToPage(page + 1)}
                >
                  {uiConfig.history.labels.next}
                </button>
              </div>
            </footer>
          )}
        </section>

        <section
          className="history-detail-panel"
          aria-label={uiConfig.history.labels.transcriptDetails}
        >
          {!selectedId ? (
            <div className="history-detail-empty">
              <span aria-hidden="true">
                {uiConfig.history.emptyStateIcons.detail}
              </span>
              <strong>{uiConfig.history.labels.selectTranscript}</strong>
              <p>{uiConfig.history.labels.selectTranscriptDescription}</p>
            </div>
          ) : detailQuery.isPending ? (
            <div className="history-loading" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              {uiConfig.history.labels.loadingTranscript}
            </div>
          ) : detailQuery.error ? (
            <div className="history-state history-state-error" role="alert">
              <strong>
                {uiConfig.history.messages.couldNotLoadTranscript}
              </strong>
              <p>{messageFromError(detailQuery.error)}</p>
              <button type="button" onClick={() => void detailQuery.refetch()}>
                {uiConfig.history.labels.tryAgain}
              </button>
            </div>
          ) : transcription ? (
            <>
              <div className="detail-topline">
                <div>
                  <p className="eyebrow">
                    {uiConfig.history.labels.transcriptEyebrow}
                  </p>
                  <span className="detail-date">
                    {formatDate(transcription.created_at)}
                  </span>
                </div>
                <div className="detail-actions">
                  {!isEditing && (
                    <>
                      <button
                        type="button"
                        className="detail-icon-button"
                        aria-label={uiConfig.history.labels.copyTranscript}
                        title={uiConfig.history.labels.copyTranscript}
                        disabled={!transcription.content}
                        onClick={() => void copyTranscript()}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="8" y="8" width="12" height="13" rx="2" />
                          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="detail-icon-button"
                        aria-label={uiConfig.history.labels.editTranscript}
                        title={uiConfig.history.labels.editTranscript}
                        onClick={() => beginEditing(transcription)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m15 5 4 4M4 20l4-.8L20 7.2 16.8 4 4.8 16 4 20Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="detail-icon-button detail-delete-button"
                        aria-label={uiConfig.history.labels.deleteTranscript}
                        title={uiConfig.history.labels.deleteTranscript}
                        disabled={deleteMutation.isPending}
                        onClick={confirmDelete}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="transcript-edit-form">
                  <label>
                    <span>{uiConfig.history.labels.title}</span>
                    <input
                      type="text"
                      value={editTitle}
                      maxLength={uiConfig.history.maxTitleLength}
                      onChange={(event) => {
                        setEditTitle(event.currentTarget.value)
                        setEditValidationError(null)
                      }}
                    />
                  </label>
                  <label>
                    <span>{uiConfig.history.labels.transcript}</span>
                    <textarea
                      value={editContent}
                      maxLength={uiConfig.history.maxTranscriptLength}
                      rows={uiConfig.history.transcriptEditorRows}
                      onChange={(event) =>
                        setEditContent(event.currentTarget.value)
                      }
                    />
                  </label>
                  <div className="edit-character-count">
                    {uiConfig.history.messages.characterCount(
                      editContent.length.toLocaleString(),
                      uiConfig.history.maxTranscriptLength,
                    )}
                  </div>
                  {editValidationError && (
                    <p className="detail-error" role="alert">
                      {editValidationError}
                    </p>
                  )}
                  {updateMutation.error && (
                    <p className="detail-error" role="alert">
                      {uiConfig.history.messages.saveFailed}{' '}
                      {messageFromError(updateMutation.error)}
                    </p>
                  )}
                  <div className="edit-actions">
                    <button
                      type="button"
                      className="history-save-button"
                      disabled={updateMutation.isPending}
                      onClick={saveEdit}
                    >
                      {updateMutation.isPending
                        ? uiConfig.history.labels.saving
                        : uiConfig.history.labels.saveChanges}
                    </button>
                    <button
                      type="button"
                      className="history-cancel-button"
                      disabled={updateMutation.isPending}
                      onClick={discardEdit}
                    >
                      {uiConfig.history.labels.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="detail-title">{transcription.title}</h2>
                  <div className="detail-metadata">
                    <span>
                      {transcription.language_mode ===
                      uiConfig.recorder.languages.auto.value
                        ? uiConfig.history.languageLabels.auto
                        : uiConfig.history.languageLabels.hindi_english}
                    </span>
                    <span>
                      {transcription.provider ===
                      uiConfig.providers.gemini.value
                        ? uiConfig.providers.gemini.label
                        : uiConfig.providers.self_hosted.label}
                    </span>
                    <span>{formatDuration(transcription.duration_ms)}</span>
                  </div>
                  <div className="detail-transcript">
                    {transcription.content || (
                      <span className="detail-no-content">
                        {uiConfig.history.labels.transcriptNoText}
                      </span>
                    )}
                  </div>
                  {copyMessage && (
                    <p className="copy-feedback" role="status">
                      {copyMessage}
                    </p>
                  )}
                  {deleteMutation.error && (
                    <p className="detail-error" role="alert">
                      {uiConfig.history.messages.couldNotDeleteTranscript}{' '}
                      {messageFromError(deleteMutation.error)}
                    </p>
                  )}
                </>
              )}
            </>
          ) : null}
        </section>
      </div>
    </section>
  )
}
