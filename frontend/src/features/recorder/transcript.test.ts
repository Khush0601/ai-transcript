import { describe, expect, it } from 'vitest'

import { mergeTranscriptUpdate, transcriptText } from './transcript'

describe('transcript merging', () => {
  it('replaces interim text and appends each final exactly once', () => {
    const firstInterim = mergeTranscriptUpdate(
      { finalText: '', interimText: '' },
      { interim: 'Mujhe kal' },
    )
    expect(transcriptText(firstInterim)).toBe('Mujhe kal')

    const revisedInterim = mergeTranscriptUpdate(firstInterim, {
      interim: 'Mujhe kal ki meeting',
    })
    expect(transcriptText(revisedInterim)).toBe('Mujhe kal ki meeting')

    const finalized = mergeTranscriptUpdate(revisedInterim, {
      final: 'Mujhe kal ki meeting',
    })
    expect(finalized).toEqual({
      finalText: 'Mujhe kal ki meeting',
      interimText: '',
    })
  })

  it('joins final segments without dropping word boundaries', () => {
    const transcript = mergeTranscriptUpdate(
      { finalText: 'Namaste', interimText: '' },
      { final: 'how are you?' },
    )
    expect(transcript.finalText).toBe('Namaste how are you?')
  })
})
