import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { uiConfig } from './config/ui'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { retry: uiConfig.queryDefaults.mutationRetry },
    queries: { retry: uiConfig.queryDefaults.queryRetry },
  },
})

document.title = uiConfig.app.documentTitle
document.documentElement.lang = uiConfig.app.documentLanguage
document
  .querySelector('meta[name="description"]')
  ?.setAttribute('content', uiConfig.app.metaDescription)

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(uiConfig.errors.applicationRootMissing)
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
