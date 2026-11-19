import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { createBlankPdf } from '../services/pdf-document.service'

const MAX_INPUT_BYTES = 50 * 1024 * 1024

interface OpenedPdf {
  data: Uint8Array
  name: string
  size: number
}

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  getMainWindow: () => BrowserWindow | null
): BrowserWindow {
  const window = getMainWindow()

  if (!window || event.sender.id !== window.webContents.id) {
    throw new Error('Blocked an IPC request from an untrusted renderer.')
  }

  return window
}

function ensurePdfHeader(contents: Buffer): void {
  const header = contents.subarray(0, 1024)
  if (header.indexOf('%PDF-') === -1) {
    throw new Error('The selected file is not a valid PDF.')
  }
}

async function openPdf(window: BrowserWindow): Promise<OpenedPdf | null> {
  const selection = await dialog.showOpenDialog(window, {
    title: 'Open PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
  })

  if (selection.canceled || selection.filePaths.length !== 1) return null

  const filePath = selection.filePaths[0]
  if (extname(filePath).toLowerCase() !== '.pdf') {
    throw new Error('Only PDF files can be opened.')
  }

  const details = await stat(filePath)
  if (details.size > MAX_INPUT_BYTES) {
    throw new Error('This initial build supports PDF files up to 50 MB.')
  }

  const contents = await readFile(filePath)
  ensurePdfHeader(contents)

  return { data: new Uint8Array(contents), name: basename(filePath), size: details.size }
}

async function createAndSaveBlankPdf(window: BrowserWindow): Promise<OpenedPdf | null> {
  const contents = await createBlankPdf()
  const saveLocation = await dialog.showSaveDialog(window, {
    title: 'Create PDF',
    defaultPath: 'Untitled.pdf',
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
  })

  if (saveLocation.canceled || !saveLocation.filePath) return null

  const outputPath = saveLocation.filePath.toLowerCase().endsWith('.pdf')
    ? saveLocation.filePath
    : `${saveLocation.filePath}.pdf`

  await writeFile(outputPath, contents)

  return { data: contents, name: basename(outputPath), size: contents.byteLength }
}

export function registerDocumentIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('document:open-pdf', async (event): Promise<OpenedPdf | null> => {
    return openPdf(assertTrustedSender(event, getMainWindow))
  })

  ipcMain.handle('document:create-blank-pdf', async (event): Promise<OpenedPdf | null> => {
    return createAndSaveBlankPdf(assertTrustedSender(event, getMainWindow))
  })
}
