import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

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
  const [pendingDelete, setPendingDelete] =
    useState<TranscriptionResponse | null>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)

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

  useEffect(() => {
    const dialog = deleteDialogRef.current
    if (!dialog) return
    if (pendingDelete && !dialog.open) {
      dialog.showModal()
    } else if (!pendingDelete && dialog.open) {
      dialog.close()
    }
  }, [pendingDelete])

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
    deleteMutation.reset()
    setPendingDelete(transcription)
  }

  function deletePendingTranscript(): void {
    if (!pendingDelete || deleteMutation.isPending) return
    const transcriptionId = pendingDelete.id
    setPendingDelete(null)
    deleteMutation.mutate(transcriptionId)
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
    <section
      className="mx-auto max-w-7xl text-ink"
      aria-labelledby="history-heading"
    >
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.22em] text-brand">
            {uiConfig.history.labels.eyebrow}
          </p>
          <h1
            id="history-heading"
            className="text-3xl font-semibold tracking-tight text-white sm:text-4xl"
          >
            {uiConfig.history.labels.heading}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {uiConfig.history.labels.description}
          </p>
        </div>
        <button
          className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          type="button"
          onClick={startRecording}
        >
          <span className="text-lg leading-none" aria-hidden="true">
            {uiConfig.history.emptyStateIcons.newRecording}
          </span>
          {uiConfig.history.labels.newRecording}
        </button>
      </header>

      <label className="mb-4 flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-4 transition focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/20">
        <svg
          className="size-4 flex-none text-zinc-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 4 4" strokeLinecap="round" />
        </svg>
        <span className="sr-only">{uiConfig.history.labels.search}</span>
        <input
          className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-zinc-600"
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
            className="flex-none px-2 py-1 text-xs font-medium text-zinc-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={uiConfig.history.labels.clearSearch}
            onClick={() => setSearchInput('')}
          >
            {uiConfig.history.labels.clearSearchButton}
          </button>
        )}
      </label>

      {listQuery.error && data && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-200 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          {uiConfig.history.messages.refreshFailed}{' '}
          {messageFromError(listQuery.error)}
          <button
            className="w-fit font-semibold text-amber-100 underline-offset-4 hover:underline"
            type="button"
            onClick={() => void listQuery.refetch()}
          >
            {uiConfig.history.labels.tryAgain}
          </button>
        </div>
      )}

      <div
        className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(15rem,0.88fr)_minmax(0,1.45fr)]"
        aria-busy={listQuery.isFetching}
      >
        <section
          className="flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface"
          aria-label={uiConfig.history.labels.savedTranscriptions}
        >
          <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              {search
                ? uiConfig.history.labels.searchResults
                : uiConfig.history.labels.allTranscripts}
            </h2>
            <span className="text-xs text-zinc-500">
              {listQuery.isFetching && data
                ? uiConfig.history.labels.updating
                : data
                  ? data.total
                  : ''}
            </span>
          </div>

          {listQuery.isPending && active ? (
            <div
              className="flex min-h-60 flex-1 flex-col items-center justify-center gap-3 text-sm text-zinc-500"
              role="status"
            >
              <span
                className="size-5 animate-spin rounded-full border-2 border-zinc-700 border-t-brand"
                aria-hidden="true"
              />
              {uiConfig.history.labels.loadingList}
            </div>
          ) : listQuery.error && !data ? (
            <div
              className="flex min-h-60 flex-1 flex-col items-center justify-center p-6 text-center text-zinc-400"
              role="alert"
            >
              <strong className="text-sm font-semibold text-red-300">
                {uiConfig.history.labels.couldNotLoadHistory}
              </strong>
              <p className="mt-2 max-w-xs text-sm leading-6">
                {messageFromError(listQuery.error)}
              </p>
              <button
                className="mt-4 rounded-lg border border-brand/40 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                type="button"
                onClick={() => void listQuery.refetch()}
              >
                {uiConfig.history.labels.tryAgain}
              </button>
            </div>
          ) : data?.items.length ? (
            <div className="flex-1">
              {data.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`flex w-full flex-col gap-2 border-b border-line border-l-2 px-4 py-4 text-left transition hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 ${
                    selectedId === item.id
                      ? 'border-l-brand bg-red-950/20'
                      : 'border-l-transparent bg-surface'
                  }`}
                  aria-pressed={selectedId === item.id}
                  disabled={
                    updateMutation.isPending || deleteMutation.isPending
                  }
                  onClick={() => selectTranscription(item)}
                >
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-zinc-200">
                    {item.title}
                  </span>
                  <span className="line-clamp-2 text-xs leading-5 text-zinc-500">
                    {excerpt(item.content) ||
                      uiConfig.history.labels.noTranscriptText}
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-[0.68rem] text-zinc-600">
                    <span>{formatDate(item.created_at)}</span>
                    <span>{formatDuration(item.duration_ms)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-60 flex-1 flex-col items-center justify-center p-6 text-center text-zinc-400">
              <span
                className="mb-3 grid size-11 place-items-center rounded-xl border border-line bg-black text-xl text-brand"
                aria-hidden="true"
              >
                {search
                  ? uiConfig.history.emptyStateIcons.search
                  : uiConfig.history.emptyStateIcons.history}
              </span>
              <strong className="text-sm font-semibold text-zinc-200">
                {search
                  ? uiConfig.history.labels.noMatchingTranscripts
                  : uiConfig.history.labels.emptyHistory}
              </strong>
              <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-500">
                {search
                  ? uiConfig.history.labels.emptySearchDescription
                  : uiConfig.history.labels.emptyHistoryDescription}
              </p>
              {!search && (
                <button
                  type="button"
                  className="mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-brand/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  onClick={startRecording}
                >
                  {uiConfig.history.labels.startRecording}
                </button>
              )}
            </div>
          )}

          {data && data.total > 0 && (
            <footer className="mt-auto flex min-h-14 items-center justify-between gap-2 border-t border-line px-3 text-xs text-zinc-500 sm:px-4">
              <span className="truncate">
                {uiConfig.history.messages.resultRange(
                  firstResult,
                  lastResult,
                  data.total,
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="min-h-8 rounded-md border border-line px-2 text-xs font-medium text-zinc-300 transition hover:border-brand/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                <span className="tabular-nums text-zinc-400">
                  {data.page} / {totalPages}
                </span>
                <button
                  className="min-h-8 rounded-md border border-line px-2 text-xs font-medium text-zinc-300 transition hover:border-brand/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
          className="min-h-[30rem] min-w-0 overflow-hidden rounded-xl border border-line bg-surface p-5 sm:p-7"
          aria-label={uiConfig.history.labels.transcriptDetails}
        >
          {!selectedId ? (
            <div className="flex min-h-[26rem] flex-col items-center justify-center text-center text-zinc-500">
              <span
                className="mb-4 grid size-11 place-items-center rounded-full border border-line bg-black text-xl text-brand"
                aria-hidden="true"
              >
                {uiConfig.history.emptyStateIcons.detail}
              </span>
              <strong className="text-sm font-semibold text-zinc-200">
                {uiConfig.history.labels.selectTranscript}
              </strong>
              <p className="mt-2 max-w-xs text-sm leading-6">
                {uiConfig.history.labels.selectTranscriptDescription}
              </p>
            </div>
          ) : detailQuery.isPending ? (
            <div
              className="flex min-h-[26rem] flex-col items-center justify-center gap-3 text-sm text-zinc-500"
              role="status"
            >
              <span
                className="size-5 animate-spin rounded-full border-2 border-zinc-700 border-t-brand"
                aria-hidden="true"
              />
              {uiConfig.history.labels.loadingTranscript}
            </div>
          ) : detailQuery.error ? (
            <div
              className="flex min-h-[26rem] flex-col items-center justify-center text-center text-zinc-400"
              role="alert"
            >
              <strong className="text-sm font-semibold text-red-300">
                {uiConfig.history.messages.couldNotLoadTranscript}
              </strong>
              <p className="mt-2 max-w-xs text-sm leading-6">
                {messageFromError(detailQuery.error)}
              </p>
              <button
                className="mt-4 rounded-lg border border-brand/40 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                type="button"
                onClick={() => void detailQuery.refetch()}
              >
                {uiConfig.history.labels.tryAgain}
              </button>
            </div>
          ) : transcription ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-[0.65rem] font-semibold tracking-[0.2em] text-brand">
                    {uiConfig.history.labels.transcriptEyebrow}
                  </p>
                  <span className="text-xs text-zinc-500">
                    {formatDate(transcription.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <>
                      <button
                        type="button"
                        className="grid size-9 place-items-center rounded-lg border border-line bg-black text-zinc-400 transition hover:border-brand/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        aria-label={uiConfig.history.labels.copyTranscript}
                        title={uiConfig.history.labels.copyTranscript}
                        disabled={!transcription.content}
                        onClick={() => void copyTranscript()}
                      >
                        <svg
                          className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <rect x="8" y="8" width="12" height="13" rx="2" />
                          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="grid size-9 place-items-center rounded-lg border border-line bg-black text-zinc-400 transition hover:border-brand/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        aria-label={uiConfig.history.labels.editTranscript}
                        title={uiConfig.history.labels.editTranscript}
                        onClick={() => beginEditing(transcription)}
                      >
                        <svg
                          className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="m15 5 4 4M4 20l4-.8L20 7.2 16.8 4 4.8 16 4 20Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="grid size-9 place-items-center rounded-lg border border-line bg-black text-zinc-400 transition hover:border-red-500/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        aria-label={uiConfig.history.labels.deleteTranscript}
                        title={uiConfig.history.labels.deleteTranscript}
                        disabled={deleteMutation.isPending}
                        onClick={confirmDelete}
                      >
                        <svg
                          className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="mt-6 flex flex-col gap-4">
                  <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <span>{uiConfig.history.labels.title}</span>
                    <input
                      className="min-h-11 w-full rounded-lg border border-line bg-black px-3 text-sm normal-case tracking-normal text-ink outline-none focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/20"
                      type="text"
                      value={editTitle}
                      maxLength={uiConfig.history.maxTitleLength}
                      onChange={(event) => {
                        setEditTitle(event.currentTarget.value)
                        setEditValidationError(null)
                      }}
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <span>{uiConfig.history.labels.transcript}</span>
                    <textarea
                      className="min-h-56 w-full resize-y rounded-lg border border-line bg-black px-3 py-2 text-sm normal-case leading-6 tracking-normal text-ink outline-none focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/20"
                      value={editContent}
                      maxLength={uiConfig.history.maxTranscriptLength}
                      rows={uiConfig.history.transcriptEditorRows}
                      onChange={(event) =>
                        setEditContent(event.currentTarget.value)
                      }
                    />
                  </label>
                  <div className="text-right text-xs text-zinc-600">
                    {uiConfig.history.messages.characterCount(
                      editContent.length.toLocaleString(),
                      uiConfig.history.maxTranscriptLength,
                    )}
                  </div>
                  {editValidationError && (
                    <p className="text-sm leading-6 text-red-300" role="alert">
                      {editValidationError}
                    </p>
                  )}
                  {updateMutation.error && (
                    <p className="text-sm leading-6 text-red-300" role="alert">
                      {uiConfig.history.messages.saveFailed}{' '}
                      {messageFromError(updateMutation.error)}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-3">
                    <button
                      type="button"
                      className="min-h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      disabled={updateMutation.isPending}
                      onClick={saveEdit}
                    >
                      {updateMutation.isPending
                        ? uiConfig.history.labels.saving
                        : uiConfig.history.labels.saveChanges}
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg border border-line px-4 text-sm font-medium text-zinc-300 transition hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      disabled={updateMutation.isPending}
                      onClick={discardEdit}
                    >
                      {uiConfig.history.labels.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="mt-6 break-words text-2xl font-semibold tracking-tight text-white">
                    {transcription.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-line bg-black px-2.5 py-1 text-xs text-zinc-400">
                      {transcription.language_mode ===
                      uiConfig.recorder.languages.auto.value
                        ? uiConfig.history.languageLabels.auto
                        : uiConfig.history.languageLabels.hindi_english}
                    </span>
                    <span className="rounded-full border border-line bg-black px-2.5 py-1 text-xs text-zinc-400">
                      {transcription.provider ===
                      uiConfig.providers.gemini.value
                        ? uiConfig.providers.gemini.label
                        : uiConfig.providers.self_hosted.label}
                    </span>
                    <span className="rounded-full border border-line bg-black px-2.5 py-1 text-xs text-zinc-400">
                      {formatDuration(transcription.duration_ms)}
                    </span>
                  </div>
                  <div className="mt-5 min-h-56 whitespace-pre-wrap break-words rounded-lg border border-line bg-black p-4 text-sm leading-7 text-zinc-300">
                    {transcription.content || (
                      <span className="italic text-zinc-600">
                        {uiConfig.history.labels.transcriptNoText}
                      </span>
                    )}
                  </div>
                  {copyMessage && (
                    <p className="mt-3 text-sm text-emerald-400" role="status">
                      {copyMessage}
                    </p>
                  )}
                  {deleteMutation.error && (
                    <p
                      className="mt-3 text-sm leading-6 text-red-300"
                      role="alert"
                    >
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

      <dialog
        ref={deleteDialogRef}
        className="fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/75"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onCancel={(event) => {
          event.preventDefault()
          setPendingDelete(null)
        }}
        onClose={() => setPendingDelete(null)}
      >
        <div className="p-6 sm:p-7">
          <div className="mb-5 grid size-11 place-items-center rounded-full border border-brand/40 bg-brand/10 text-brand">
            <svg
              className="size-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 8v5m0 3h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <h2
            id="delete-dialog-title"
            className="text-xl font-semibold tracking-tight text-white"
          >
            {uiConfig.history.labels.deleteDialogHeading}
          </h2>
          <p
            id="delete-dialog-description"
            className="mt-2 break-words text-sm leading-6 text-zinc-400"
          >
            {pendingDelete
              ? uiConfig.history.messages.deleteConfirmation(
                  pendingDelete.title,
                )
              : ''}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              autoFocus
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-zinc-300 transition hover:bg-surface-raised hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              onClick={() => setPendingDelete(null)}
            >
              {uiConfig.history.labels.cancel}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              onClick={deletePendingTranscript}
            >
              {uiConfig.history.labels.deleteTranscript}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  )
}
