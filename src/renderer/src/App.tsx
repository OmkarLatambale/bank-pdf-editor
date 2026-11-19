import { useState } from 'react'
import { PdfViewer } from './components/pdf-viewer/PdfViewer'

function App(): React.JSX.Element {
  type ActiveDocument = NonNullable<Awaited<ReturnType<typeof window.documentApi.openPdf>>>

  const [activeDocument, setActiveDocument] = useState<ActiveDocument | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runDocumentAction = async (action: () => Promise<ActiveDocument | null>): Promise<void> => {
    setIsWorking(true)
    setError(null)

    try {
      const document = await action()
      if (document) {
        setActiveDocument(document)
        setPageCount(null)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The document operation failed.')
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">BANK PDF EDITOR</p>
          <h1>{activeDocument?.name ?? 'No document open'}</h1>
          {activeDocument && (
            <p className="document-meta">
              {pageCount ? `${pageCount} pages` : 'Loading pages'} ·{' '}
              {formatFileSize(activeDocument.size)}
            </p>
          )}
        </div>
        <div className="top-bar-actions">
          <button
            type="button"
            disabled={isWorking}
            onClick={() => runDocumentAction(window.documentApi.createBlankPdf)}
          >
            Create PDF
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={isWorking}
            onClick={() => runDocumentAction(window.documentApi.openPdf)}
          >
            {isWorking ? 'Working…' : 'Open PDF'}
          </button>
          {activeDocument && (
            <button type="button" disabled={isWorking} onClick={() => setActiveDocument(null)}>
              Close
            </button>
          )}
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}

      {activeDocument ? (
        <PdfViewer
          key={`${activeDocument.name}-${activeDocument.size}`}
          document={activeDocument}
          onDocumentLoaded={setPageCount}
        />
      ) : (
        <section className="empty-state" aria-live="polite">
          <h2>Open a local PDF to begin</h2>
          <p>The application reads the selected PDF through Electron’s secure main process.</p>
        </section>
      )}
    </main>
  )
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default App
