import type { LanguageMode, TranscriptionCreate } from '../api/client'
import type { ProviderState } from '../providers/types'

const sampleRateHz = 16_000
const sessionLimitMinutes = 10
const audioNotStoredMessage = 'Audio is not stored'

type LanguageOption = {
  value: LanguageMode
  label: string
  languageCodes: readonly string[]
}

const languageModes = {
  auto: {
    value: 'auto',
    label: 'Auto detect',
    languageCodes: [],
  },
  hindi_english: {
    value: 'hindi_english',
    label: 'Hindi + English',
    languageCodes: ['hi-IN', 'en-IN'],
  },
} as const satisfies Record<LanguageMode, LanguageOption>

type ProviderOption = {
  value: TranscriptionCreate['provider']
  label: string
}

const transcriptionProviders = {
  gemini: { value: 'gemini', label: 'Gemini Live' },
  self_hosted: { value: 'self_hosted', label: 'Self-hosted' },
} as const satisfies Record<TranscriptionCreate['provider'], ProviderOption>

export type RecorderStatus =
  | 'idle'
  | 'requesting_mic'
  | 'connecting'
  | 'recording'
  | 'stopping'
  | 'saving'
  | 'saved'
  | 'error'
  | 'save_failed'
  | 'draft'

const recorderStatusText = {
  idle: 'Audio is not stored',
  requesting_mic: audioNotStoredMessage,
  connecting: 'Preparing secure live connection',
  recording: 'Listening now',
  stopping: 'Finalizing the last words…',
  saving: 'Saving transcript…',
  saved: 'Transcript saved',
  error: audioNotStoredMessage,
  save_failed: 'Transcript is still on this device',
  draft: 'Recovered draft is ready to save',
} satisfies Record<RecorderStatus, string>

export const uiConfig = {
  app: {
    documentTitle: 'Speech to Text',
    metaDescription: 'Real-time multilingual speech transcription.',
    documentLanguage: 'en',
    brand: {
      name: 'voicely',
      mark: 's',
      accessibleLabel: 'Speech to Text',
    },
    navigationLabel: 'Main navigation',
    views: {
      record: { value: 'record', label: 'Recorder' },
      history: { value: 'history', label: 'History' },
    },
    hero: {
      eyebrow: 'YOUR THOUGHTS, TRANSCRIBED',
      heading: ['Speak naturally.', 'Keep every word.'],
      description:
        'Live transcription that follows you across languages. Your microphone audio streams securely and is never stored.',
    },
    footer: {
      items: ['Private by design', 'Audio is never stored'],
      separator: '·',
    },
  },
  audio: {
    sampleRateHz,
    chunkDurationMs: 100,
    mimeType: `audio/pcm;rate=${sampleRateHz}`,
    workletModulePath: '/worklets/pcm-worklet.js',
    workletProcessorName: 'pcm-capture',
    outputChannelCount: 1,
    constraints: {
      autoGainControl: true,
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
    },
  },
  providers: transcriptionProviders,
  queryDefaults: {
    mutationRetry: false,
    queryRetry: 1,
  },
  errors: {
    applicationRootMissing: 'The application root element is missing.',
    requestFailed: (status: number) => `Request failed (${status}).`,
    audioProcessingFailed: 'Audio processing failed.',
    audioStreamProcessingFailed:
      'The microphone audio stream could not be processed.',
    microphoneWorkletsUnsupported:
      'This browser does not support microphone audio worklets.',
    inputSampleRateInvalid: 'The input sample rate must be a positive number.',
    microphoneAlreadyStopped: 'The microphone capture has already stopped.',
    transcriptionConnectionFailed: 'The transcription connection failed.',
    transcriptionInterrupted: 'The transcription connection was interrupted.',
    transcriptionStartFailed: 'Could not start transcription.',
    transcriptionSessionNotReady:
      'The transcription session is not ready for audio.',
  },
  recorder: {
    sessionLimitMs: sessionLimitMinutes * 60 * 1000,
    sessionWarningMs: (sessionLimitMinutes - 1) * 60 * 1000,
    finalSegmentTimeoutMs: 4_000,
    finalSegmentQuietMs: 300,
    clockSeparator: ':',
    defaultTitle: 'Untitled transcription',
    defaultLanguageMode: languageModes.auto.value,
    languages: languageModes,
    connectionStateLabels: {
      connected: 'Connected',
      connecting: 'Connecting',
      error: 'Connection lost',
      stopping: 'Ready',
      closed: 'Ready',
    } satisfies Record<ProviderState, string>,
    statusText: recorderStatusText,
    labels: {
      eyebrow: 'LIVE SPEECH CAPTURE',
      heading: 'Your voice, in text.',
      language: 'Language',
      stopAndSave: 'Stop & save',
      allowMicrophone: 'Allow microphone…',
      connecting: 'Connecting…',
      startRecording: 'Start recording',
      sessionLimitWarning: `This session will stop and save at ${sessionLimitMinutes} minutes to protect your transcript.`,
      unsavedDraftFound: 'Unsaved transcript found',
      restoreDraftDescription:
        'Restore it to review or retry saving. It stays in this browser until saved or discarded.',
      restoreDraft: 'Restore draft',
      discard: 'Discard',
      liveTranscript: 'Live transcript',
      transcriptPlaceholder: 'Your transcript will appear here as you speak.',
      interimTranscriptHint:
        'Interim text is shown in grey; confirmed words stay bright.',
      retrySave: 'Retry save',
      saveRecoveredTranscript: 'Save recovered transcript',
      savedSecurely: 'Saved securely',
    },
    messages: {
      rateLimited: 'Gemini is rate limited or out of quota. Try again later.',
      missingApiKey:
        'Add a Gemini API key to the server environment to enable recording.',
      microphoneDenied:
        'Microphone access was denied. Allow microphone access in your browser and try again.',
      microphoneNotFound:
        'No microphone was found. Connect a microphone and try again.',
      microphoneUnavailable:
        'The microphone is busy or unavailable. Close other apps using it and try again.',
      recordingFailed: 'Something went wrong while recording.',
      noFinalizedWords: 'There are no finalized words to save yet.',
      draftStorageFailed:
        'This browser could not preserve the unsaved transcript locally.',
      recoveryCopyCouldNotBeCleared:
        'The transcript was saved, but its local recovery copy could not be cleared.',
      microphoneReleaseFailed:
        'The microphone could not be released cleanly. Check browser permissions.',
      discardDraftConfirmation: 'Discard this unsaved transcript draft?',
    },
  },
  history: {
    pageSize: 10,
    searchDelayMs: 250,
    maxSearchLength: 200,
    maxTitleLength: 200,
    maxTranscriptLength: 100_000,
    transcriptEditorRows: 12,
    excerptMaxLength: 120,
    excerptSuffix: '...',
    dateFormat: {
      dateStyle: 'medium',
      timeStyle: 'short',
    } satisfies Intl.DateTimeFormatOptions,
    duration: {
      minuteSuffix: 'm',
      secondSuffix: 's',
    },
    languageLabels: {
      auto: languageModes.auto.label,
      hindi_english: languageModes.hindi_english.label,
    } satisfies Record<LanguageMode, string>,
    emptyStateIcons: {
      search: '⌕',
      history: '◷',
      detail: '↖',
      newRecording: '+',
    },
    labels: {
      eyebrow: 'YOUR LIBRARY',
      heading: 'Transcription history',
      description: 'Find, review, and edit transcripts saved in this browser.',
      newRecording: 'New recording',
      tryAgain: 'Try again',
      search: 'Search transcriptions',
      searchPlaceholder: 'Search titles and transcript text...',
      clearSearch: 'Clear search',
      clearSearchButton: 'Clear',
      savedTranscriptions: 'Saved transcriptions',
      searchResults: 'Search results',
      allTranscripts: 'All transcripts',
      updating: 'Updating...',
      loadingList: 'Loading transcripts...',
      couldNotLoadHistory: 'Could not load your history',
      noTranscriptText: 'No transcript text',
      noMatchingTranscripts: 'No matching transcripts',
      emptyHistory: 'Your history is empty',
      emptySearchDescription: 'Try another search term or clear your search.',
      emptyHistoryDescription:
        'When you stop a recording, the saved transcript will appear here.',
      startRecording: 'Start a recording',
      previousPage: 'Previous page',
      previous: 'Previous',
      nextPage: 'Next page',
      next: 'Next',
      transcriptDetails: 'Transcript details',
      selectTranscript: 'Select a transcript',
      selectTranscriptDescription:
        'Choose an item from your history to view or edit it.',
      loadingTranscript: 'Loading transcript...',
      transcriptEyebrow: 'TRANSCRIPT',
      copyTranscript: 'Copy transcript',
      editTranscript: 'Edit transcript',
      deleteTranscript: 'Delete transcript',
      title: 'Title',
      transcript: 'Transcript',
      saving: 'Saving...',
      saveChanges: 'Save changes',
      cancel: 'Cancel',
      transcriptNoText: 'This transcript has no text.',
    },
    messages: {
      genericError: 'Something went wrong. Please try again.',
      dateUnavailable: 'Date unavailable',
      selectBeforeDetails: 'Select a transcript before requesting its details.',
      discardUnsavedChanges: 'Discard your unsaved changes?',
      titleRequired: 'A title is required.',
      clipboardUnavailable: 'Clipboard access is unavailable in this browser.',
      copied: 'Transcript copied.',
      copyFailed:
        'Could not copy the transcript. Check clipboard permissions and try again.',
      refreshFailed: 'Could not refresh the list:',
      resultRange: (first: number, last: number, total: number) =>
        `${first}-${last} of ${total}`,
      deleteConfirmation: (title: string) =>
        `Delete "${title}"? This cannot be undone.`,
      characterCount: (count: string, maximum: number) =>
        `${count} / ${maximum.toLocaleString('en-US')} characters`,
      saveFailed: 'Could not save changes:',
      couldNotLoadTranscript: 'Could not load this transcript',
      couldNotDeleteTranscript: 'Could not delete this transcript:',
    },
  },
  draft: {
    storageKey: 'speech-to-text.pending-draft',
    invalidDraft:
      'A saved draft could not be read. It remains in this browser.',
    storageUnavailable: 'Draft storage is unavailable in this browser.',
  },
  live: {
    apiVersion: 'v1beta',
  },
} as const

export type AppView =
  (typeof uiConfig.app.views)[keyof typeof uiConfig.app.views]['value']
