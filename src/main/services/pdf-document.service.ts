import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export async function createBlankPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  pdf.setTitle('Untitled document')
  pdf.setCreator('Bank PDF Editor')
  page.drawText('Bank PDF Editor', {
    x: 56,
    y: 785,
    size: 20,
    font,
    color: rgb(0.05, 0.2, 0.42)
  })

  const contents = await pdf.save()
  await PDFDocument.load(contents)

  return contents
}
