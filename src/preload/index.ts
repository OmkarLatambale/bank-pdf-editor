import { contextBridge, ipcRenderer } from 'electron'

const documentApi = {
  openPdf: () => ipcRenderer.invoke('document:open-pdf'),
  createBlankPdf: () => ipcRenderer.invoke('document:create-blank-pdf')
}

contextBridge.exposeInMainWorld('documentApi', documentApi)
