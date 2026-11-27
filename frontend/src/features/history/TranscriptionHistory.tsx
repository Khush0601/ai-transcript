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
import './history.css'

const PAGE_SIZE = 10
const SEARCH_DELAY_MS = 250
const LIST_QUERY_KEY = ['transcriptions', 'list'] as const

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.'
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : dateFormatter.format(date)
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

function excerpt(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
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
    queryKey: [...LIST_QUERY_KEY, { search, page, limit: PAGE_SIZE }],
    queryFn: () => listTranscriptions({ search, page, limit: PAGE_SIZE }),
    enabled: active,
    placeholderData: keepPreviousData,
  })

  const detailQuery = useQuery({
    queryKey: ['transcription', selectedId],
    queryFn: () => {
      if (selectedId === null) {
        throw new Error('Select a transcript before requesting its details.')
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
        { search, page, limit: PAGE_SIZE },
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
    }, SEARCH_DELAY_MS)
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
    return !hasChanges || window.confirm('Discard your unsaved changes?')
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
      setEditValidationError('A title is required.')
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
      `Delete "${transcription.title}"? This cannot be undone.`,
    )
    if (!confirmed) return
    deleteMutation.reset()
    deleteMutation.mutate(transcription.id)
  }

  async function copyTranscript(): Promise<void> {
    if (!transcription) return
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.')
      }
      await navigator.clipboard.writeText(transcription.content)
      setCopyMessage('Transcript copied.')
    } catch {
      setCopyMessage(
        'Could not copy the transcript. Check clipboard permissions and try again.',
      )
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
          <p className="eyebrow">YOUR LIBRARY</p>
          <h1 id="history-heading">Transcription history</h1>
          <p>Find, review, and edit transcripts saved in this browser.</p>
        </div>
        <button
          className="history-new-button"
          type="button"
          onClick={startRecording}
        >
          <span aria-hidden="true">+</span>
          New recording
        </button>
      </header>

      <label className="history-search">
        <span className="search-icon" aria-hidden="true" />
        <span className="visually-hidden">Search transcriptions</span>
        <input
          type="search"
          value={searchInput}
          maxLength={200}
          placeholder="Search titles and transcript text..."
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
            aria-label="Clear search"
            onClick={() => setSearchInput('')}
          >
            Clear
          </button>
        )}
      </label>

      {listQuery.error && data && (
        <div className="history-notice history-error" role="alert">
          Could not refresh the list: {messageFromError(listQuery.error)}
          <button type="button" onClick={() => void listQuery.refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="history-layout" aria-busy={listQuery.isFetching}>
        <section
          className="history-list-panel"
          aria-label="Saved transcriptions"
        >
          <div className="history-list-heading">
            <h2>{search ? 'Search results' : 'All transcripts'}</h2>
            <span>
              {listQuery.isFetching && data
                ? 'Updating...'
                : data
                  ? data.total
                  : ''}
            </span>
          </div>

          {listQuery.isPending && active ? (
            <div className="history-loading" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              Loading transcripts...
            </div>
          ) : listQuery.error && !data ? (
            <div className="history-state history-state-error" role="alert">
              <strong>Could not load your history</strong>
              <p>{messageFromError(listQuery.error)}</p>
              <button type="button" onClick={() => void listQuery.refetch()}>
                Try again
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
                    {excerpt(item.content) || 'No transcript text'}
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
                {search ? '⌕' : '◷'}
              </span>
              <strong>
                {search ? 'No matching transcripts' : 'Your history is empty'}
              </strong>
              <p>
                {search
                  ? 'Try another search term or clear your search.'
                  : 'When you stop a recording, the saved transcript will appear here.'}
              </p>
              {!search && (
                <button
                  type="button"
                  className="history-inline-action"
                  onClick={startRecording}
                >
                  Start a recording
                </button>
              )}
            </div>
          )}

          {data && data.total > 0 && (
            <footer className="history-pagination">
              <span>
                {firstResult}-{lastResult} of {data.total}
              </span>
              <div>
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={
                    page <= 1 ||
                    listQuery.isFetching ||
                    updateMutation.isPending ||
                    deleteMutation.isPending
                  }
                  onClick={() => moveToPage(page - 1)}
                >
                  Previous
                </button>
                <span>
                  {data.page} / {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={
                    page >= totalPages ||
                    listQuery.isFetching ||
                    updateMutation.isPending ||
                    deleteMutation.isPending
                  }
                  onClick={() => moveToPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </footer>
          )}
        </section>

        <section
          className="history-detail-panel"
          aria-label="Transcript details"
        >
          {!selectedId ? (
            <div className="history-detail-empty">
              <span aria-hidden="true">↖</span>
              <strong>Select a transcript</strong>
              <p>Choose an item from your history to view or edit it.</p>
            </div>
          ) : detailQuery.isPending ? (
            <div className="history-loading" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              Loading transcript...
            </div>
          ) : detailQuery.error ? (
            <div className="history-state history-state-error" role="alert">
              <strong>Could not load this transcript</strong>
              <p>{messageFromError(detailQuery.error)}</p>
              <button type="button" onClick={() => void detailQuery.refetch()}>
                Try again
              </button>
            </div>
          ) : transcription ? (
            <>
              <div className="detail-topline">
                <div>
                  <p className="eyebrow">TRANSCRIPT</p>
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
                        aria-label="Copy transcript"
                        title="Copy transcript"
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
                        aria-label="Edit transcript"
                        title="Edit transcript"
                        onClick={() => beginEditing(transcription)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m15 5 4 4M4 20l4-.8L20 7.2 16.8 4 4.8 16 4 20Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="detail-icon-button detail-delete-button"
                        aria-label="Delete transcript"
                        title="Delete transcript"
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
                    <span>Title</span>
                    <input
                      type="text"
                      value={editTitle}
                      maxLength={200}
                      onChange={(event) => {
                        setEditTitle(event.currentTarget.value)
                        setEditValidationError(null)
                      }}
                    />
                  </label>
                  <label>
                    <span>Transcript</span>
                    <textarea
                      value={editContent}
                      maxLength={100_000}
                      rows={12}
                      onChange={(event) =>
                        setEditContent(event.currentTarget.value)
                      }
                    />
                  </label>
                  <div className="edit-character-count">
                    {editContent.length.toLocaleString()} / 100,000 characters
                  </div>
                  {editValidationError && (
                    <p className="detail-error" role="alert">
                      {editValidationError}
                    </p>
                  )}
                  {updateMutation.error && (
                    <p className="detail-error" role="alert">
                      Could not save changes:{' '}
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
                      {updateMutation.isPending ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      className="history-cancel-button"
                      disabled={updateMutation.isPending}
                      onClick={discardEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="detail-title">{transcription.title}</h2>
                  <div className="detail-metadata">
                    <span>
                      {transcription.language_mode === 'auto'
                        ? 'Auto detect'
                        : 'Hindi + English'}
                    </span>
                    <span>
                      {transcription.provider === 'gemini'
                        ? 'Gemini Live'
                        : 'Self-hosted'}
                    </span>
                    <span>{formatDuration(transcription.duration_ms)}</span>
                  </div>
                  <div className="detail-transcript">
                    {transcription.content || (
                      <span className="detail-no-content">
                        This transcript has no text.
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
                      Could not delete this transcript:{' '}
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
