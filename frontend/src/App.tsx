import { Fragment, useState } from 'react'

import { Recorder } from './features/recorder/Recorder'
import { TranscriptionHistory } from './features/history/TranscriptionHistory'
import { uiConfig, type AppView } from './config/ui'
import './App.css'

function App() {
  const [view, setView] = useState<AppView>(uiConfig.app.views.record.value)

  return (
    <main className="app-shell">
      <header className="app-header">
        <span className="brand" aria-label={uiConfig.app.brand.accessibleLabel}>
          <span className="brand-mark" aria-hidden="true">
            {uiConfig.app.brand.mark}
          </span>
          <span>{uiConfig.app.brand.name}</span>
        </span>
        <nav className="app-nav" aria-label={uiConfig.app.navigationLabel}>
          {Object.values(uiConfig.app.views).map((item) => (
            <button
              key={item.value}
              type="button"
              className={
                view === item.value
                  ? 'app-nav-button app-nav-button-active'
                  : 'app-nav-button'
              }
              aria-pressed={view === item.value}
              onClick={() => setView(item.value)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div hidden={view !== uiConfig.app.views.record.value}>
        <section className="hero-copy">
          <p className="eyebrow">{uiConfig.app.hero.eyebrow}</p>
          <h1>
            {uiConfig.app.hero.heading[0]}
            <br />
            {uiConfig.app.hero.heading[1]}
          </h1>
          <p>{uiConfig.app.hero.description}</p>
        </section>

        <Recorder />
      </div>
      <div hidden={view !== uiConfig.app.views.history.value}>
        <TranscriptionHistory
          active={view === uiConfig.app.views.history.value}
          onRecord={() => setView(uiConfig.app.views.record.value)}
        />
      </div>

      <footer className="app-footer">
        {uiConfig.app.footer.items.map((item, index) => (
          <Fragment key={item}>
            {index > 0 && (
              <span aria-hidden="true">{uiConfig.app.footer.separator}</span>
            )}
            <span>{item}</span>
          </Fragment>
        ))}
      </footer>
    </main>
  )
}

export default App
