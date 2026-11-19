interface OpenedPdf {
  data: Uint8Array
  name: string
  size: number
}

interface DocumentApi {
  openPdf: () => Promise<OpenedPdf | null>
  createBlankPdf: () => Promise<OpenedPdf | null>
}

declare global {
  interface Window {
    documentApi: DocumentApi
  }
}

export {}
