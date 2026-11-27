import { Fragment, useState } from 'react'

import { Recorder } from './features/recorder/Recorder'
import { TranscriptionHistory } from './features/history/TranscriptionHistory'
import { uiConfig, type AppView } from './config/ui'

function App() {
  const [view, setView] = useState<AppView>(uiConfig.app.views.record.value)

  return (
    <main className="min-h-screen min-w-[320px] bg-canvas px-4 pb-8 pt-4 font-sans text-ink antialiased sm:px-8">
      <header className="mx-auto mb-10 flex min-h-14 max-w-7xl items-center justify-between border-b border-line pb-4 sm:mb-14">
        <span
          className="inline-flex items-center gap-3 text-lg font-semibold tracking-tight"
          aria-label={uiConfig.app.brand.accessibleLabel}
        >
          <span
            className="grid size-9 place-items-center rounded-full border border-brand/50 bg-brand/10 text-lg font-bold text-brand"
            aria-hidden="true"
          >
            {uiConfig.app.brand.mark}
          </span>
          <span>{uiConfig.app.brand.name}</span>
        </span>
        <nav
          className="flex items-center gap-1"
          aria-label={uiConfig.app.navigationLabel}
        >
          {Object.values(uiConfig.app.views).map((item) => (
            <button
              key={item.value}
              type="button"
              className={
                view === item.value
                  ? 'rounded-md border-b-2 border-brand px-3 py-2 text-sm font-medium text-ink sm:px-4'
                  : 'rounded-md px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:px-4'
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
        <section className="mx-auto mb-10 max-w-7xl text-left">
          <p className="mb-3 text-xs font-semibold tracking-[0.24em] text-brand">
            {uiConfig.app.hero.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-6xl">
            {uiConfig.app.hero.heading[0]}
            <br />
            {uiConfig.app.hero.heading[1]}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            {uiConfig.app.hero.description}
          </p>
        </section>

        <Recorder />
      </div>
      <div hidden={view !== uiConfig.app.views.history.value}>
        <TranscriptionHistory
          active={view === uiConfig.app.views.history.value}
          onRecord={() => setView(uiConfig.app.views.record.value)}
        />
      </div>

      <footer className="mx-auto mt-8 flex max-w-7xl flex-wrap justify-center gap-2 border-t border-line pt-5 text-xs text-zinc-500">
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
