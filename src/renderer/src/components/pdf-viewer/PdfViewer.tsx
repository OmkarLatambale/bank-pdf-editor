import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import './pdf-viewer.css'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface PdfViewerProps {
  document: {
    data: Uint8Array
    name: string
    size: number
  }
  onDocumentLoaded: (pageCount: number) => void
}

interface SearchMatch {
  itemIndex: number
  pageNumber: number
}

export function PdfViewer({ document, onDocumentLoaded }: PdfViewerProps): React.JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [searchTerm, setSearchTerm] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadingTask = getDocument({ data: new Uint8Array(document.data) })

    void loadingTask.promise
      .then((loadedPdf) => {
        if (cancelled) return
        setPdf(loadedPdf)
        onDocumentLoaded(loadedPdf.numPages)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setViewerError(reason instanceof Error ? reason.message : 'Unable to render this PDF.')
        }
      })

    return () => {
      cancelled = true
      void loadingTask.destroy()
    }
  }, [document, onDocumentLoaded])

  useEffect(() => {
    if (!pdf) return

    let cancelled = false

    const findMatches = async (): Promise<void> => {
      await Promise.resolve()

      const query = searchTerm.trim().toLocaleLowerCase()
      if (!query) {
        if (!cancelled) {
          setMatches([])
          setCurrentMatchIndex(0)
          setIsSearching(false)
        }
        return
      }

      if (!cancelled) setIsSearching(true)

      const nextMatches: SearchMatch[] = []
      for (let currentPage = 1; currentPage <= pdf.numPages; currentPage += 1) {
        const page = await pdf.getPage(currentPage)
        const textContent = await page.getTextContent()

        textContent.items.forEach((item, itemIndex) => {
          if ('str' in item && item.str.toLocaleLowerCase().includes(query)) {
            nextMatches.push({ itemIndex, pageNumber: currentPage })
          }
        })
      }

      if (!cancelled) {
        setMatches(nextMatches)
        setCurrentMatchIndex(0)
        setIsSearching(false)
        if (nextMatches[0]) setPageNumber(nextMatches[0].pageNumber)
      }
    }

    void findMatches()

    return () => {
      cancelled = true
    }
  }, [pdf, searchTerm])

  const matchesOnCurrentPage = useMemo(
    () => matches.filter((match) => match.pageNumber === pageNumber),
    [matches, pageNumber]
  )

  const currentMatch = matches[currentMatchIndex]

  const moveToMatch = (direction: 1 | -1): void => {
    if (matches.length === 0) return

    const nextIndex = (currentMatchIndex + direction + matches.length) % matches.length
    setCurrentMatchIndex(nextIndex)
    setPageNumber(matches[nextIndex].pageNumber)
  }

  if (viewerError) {
    return <section className="viewer-message error-banner">{viewerError}</section>
  }

  if (!pdf) {
    return <section className="viewer-message">Loading {document.name}…</section>
  }

  return (
    <section className="pdf-viewer" aria-label={`PDF viewer for ${document.name}`}>
      <div className="viewer-toolbar">
        <div className="page-controls">
          <button
            type="button"
            disabled={pageNumber === 1}
            onClick={() => setPageNumber((current) => current - 1)}
          >
            Previous
          </button>
          <span>
            Page {pageNumber} of {pdf.numPages}
          </span>
          <button
            type="button"
            disabled={pageNumber === pdf.numPages}
            onClick={() => setPageNumber((current) => current + 1)}
          >
            Next
          </button>
        </div>

        <div className="search-controls">
          <label className="visually-hidden" htmlFor="pdf-search">
            Search this PDF
          </label>
          <input
            id="pdf-search"
            type="search"
            value={searchTerm}
            placeholder="Search PDF"
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <span className="search-count">
            {isSearching
              ? 'Searching…'
              : searchTerm.trim()
                ? `${matches.length === 0 ? 0 : currentMatchIndex + 1}/${matches.length}`
                : ''}
          </span>
          <button type="button" disabled={matches.length === 0} onClick={() => moveToMatch(-1)}>
            ↑
          </button>
          <button type="button" disabled={matches.length === 0} onClick={() => moveToMatch(1)}>
            ↓
          </button>
        </div>

        <div className="zoom-controls">
          <button
            type="button"
            disabled={scale <= 0.6}
            onClick={() => setScale((current) => Math.max(0.6, current - 0.2))}
          >
            −
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale((current) => Math.min(2.4, current + 0.2))}>
            +
          </button>
        </div>
      </div>

      <div className="viewer-content">
        <ThumbnailSidebar pdf={pdf} pageNumber={pageNumber} onSelectPage={setPageNumber} />
        <RenderedPage
          pdf={pdf}
          pageNumber={pageNumber}
          scale={scale}
          matches={matchesOnCurrentPage}
          currentMatch={currentMatch}
        />
      </div>
    </section>
  )
}

interface ThumbnailSidebarProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  onSelectPage: (pageNumber: number) => void
}

function ThumbnailSidebar({
  pdf,
  pageNumber,
  onSelectPage
}: ThumbnailSidebarProps): React.JSX.Element {
  return (
    <aside className="thumbnail-sidebar" aria-label="Page thumbnails">
      {Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((thumbnailPage) => (
        <PageThumbnail
          key={thumbnailPage}
          pdf={pdf}
          pageNumber={thumbnailPage}
          selected={thumbnailPage === pageNumber}
          onSelectPage={onSelectPage}
        />
      ))}
    </aside>
  )
}

interface PageThumbnailProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  selected: boolean
  onSelectPage: (pageNumber: number) => void
}

function PageThumbnail({
  pdf,
  pageNumber,
  selected,
  onSelectPage
}: PageThumbnailProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    let renderTask: { cancel: () => void } | null = null

    const render = async (): Promise<void> => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return

        const viewport = page.getViewport({ scale: 0.2 })
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)

        const currentRenderTask = page.render({ canvas, canvasContext: context, viewport })
        renderTask = currentRenderTask
        await currentRenderTask.promise
      } catch {
        // The main page still remains usable if one thumbnail cannot render.
      }
    }

    void render()

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pageNumber, pdf])

  return (
    <button
      className={`thumbnail-button${selected ? ' selected' : ''}`}
      type="button"
      aria-label={`Go to page ${pageNumber}`}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onSelectPage(pageNumber)}
    >
      <canvas ref={canvasRef} />
      <span>{pageNumber}</span>
    </button>
  )
}

interface RenderedPageProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  matches: SearchMatch[]
  currentMatch: SearchMatch | undefined
}

function RenderedPage({
  pdf,
  pageNumber,
  scale,
  matches,
  currentMatch
}: RenderedPageProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const textLayerContainer = textLayerRef.current
    if (!canvas || !textLayerContainer) return

    let cancelled = false
    let pageRenderTask: { cancel: () => void } | null = null
    let textLayer: TextLayer | null = null

    const render = async (): Promise<void> => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return

        const viewport = page.getViewport({ scale })
        const outputScale = window.devicePixelRatio || 1
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas rendering is not available.')

        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        textLayerContainer.replaceChildren()
        textLayerContainer.style.width = `${Math.floor(viewport.width)}px`
        textLayerContainer.style.height = `${Math.floor(viewport.height)}px`

        const currentPageRenderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        })
        pageRenderTask = currentPageRenderTask

        const textContent = await page.getTextContent()
        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerContainer,
          viewport
        })

        await Promise.all([currentPageRenderTask.promise, textLayer.render()])
        if (cancelled) return

        textLayer.textDivs.forEach((textDiv, itemIndex) => {
          const match = matches.find((candidate) => candidate.itemIndex === itemIndex)
          if (!match) return

          textDiv.classList.add('search-match')
          if (
            match.itemIndex === currentMatch?.itemIndex &&
            pageNumber === currentMatch.pageNumber
          ) {
            textDiv.classList.add('current-search-match')
          }
        })

        setRenderError(null)
      } catch (reason) {
        if (!cancelled) {
          setRenderError(reason instanceof Error ? reason.message : 'Unable to render this page.')
        }
      }
    }

    void render()

    return () => {
      cancelled = true
      pageRenderTask?.cancel()
      textLayer?.cancel()
    }
  }, [currentMatch, matches, pageNumber, pdf, scale])

  return (
    <div className="page-stage">
      {renderError && <p className="error-banner">{renderError}</p>}
      <div className="page-canvas-wrapper">
        <canvas ref={canvasRef} className="pdf-canvas" aria-label={`Page ${pageNumber}`} />
        <div ref={textLayerRef} className="text-layer" aria-hidden="true" />
      </div>
    </div>
  )
}
