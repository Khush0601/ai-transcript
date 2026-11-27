export interface TranscriptUpdate {
  interimText: string
  finalText: string
}

export function mergeTranscriptUpdate(
  current: TranscriptUpdate,
  update: { interim?: string; final?: string },
): TranscriptUpdate {
  if (update.final !== undefined) {
    const segment = update.final.trim()
    const separator =
      current.finalText.length > 0 && !/\s$/.test(current.finalText) ? ' ' : ''
    return {
      finalText: segment
        ? `${current.finalText}${separator}${segment}`
        : current.finalText,
      interimText: '',
    }
  }
  return {
    ...current,
    interimText: update.interim ?? current.interimText,
  }
}

export function transcriptText(transcript: TranscriptUpdate): string {
  if (!transcript.interimText) return transcript.finalText
  const separator =
    transcript.finalText.length > 0 && !/\s$/.test(transcript.finalText)
      ? ' '
      : ''
  return `${transcript.finalText}${separator}${transcript.interimText}`
}
