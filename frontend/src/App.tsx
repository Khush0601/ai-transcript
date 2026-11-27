import { useState } from 'react'

import { Recorder } from './features/recorder/Recorder'
import { TranscriptionHistory } from './features/history/TranscriptionHistory'
import './App.css'

function App() {
  const [view, setView] = useState<'record' | 'history'>('record')

  return (
    <main className="app-shell">
      <header className="app-header">
        <span className="brand" aria-label="Speech to Text">
          <span className="brand-mark" aria-hidden="true">
            s
          </span>
          <span>voicely</span>
        </span>
        <nav className="app-nav" aria-label="Main navigation">
          <button
            type="button"
            className={
              view === 'record'
                ? 'app-nav-button app-nav-button-active'
                : 'app-nav-button'
            }
            aria-pressed={view === 'record'}
            onClick={() => setView('record')}
          >
            Recorder
          </button>
          <button
            type="button"
            className={
              view === 'history'
                ? 'app-nav-button app-nav-button-active'
                : 'app-nav-button'
            }
            aria-pressed={view === 'history'}
            onClick={() => setView('history')}
          >
            History
          </button>
        </nav>
      </header>

      <div hidden={view !== 'record'}>
        <section className="hero-copy">
          <p className="eyebrow">YOUR THOUGHTS, TRANSCRIBED</p>
          <h1>
            Speak naturally.
            <br />
            Keep every word.
          </h1>
          <p>
            Live transcription that follows you across languages. Your
            microphone audio streams securely and is never stored.
          </p>
        </section>

        <Recorder />
      </div>
      <div hidden={view !== 'history'}>
        <TranscriptionHistory
          active={view === 'history'}
          onRecord={() => setView('record')}
        />
      </div>

      <footer className="app-footer">
        <span>Private by design</span>
        <span aria-hidden="true">·</span>
        <span>Audio is never stored</span>
      </footer>
    </main>
  )
}

export default App
