// Extraction du texte d'un CV déposé (PDF, DOCX ou TXT).
// Tout se passe dans le navigateur : le fichier ne quitte jamais la machine.
// Les librairies sont chargées en import dynamique (uniquement au dépôt).

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: buffer })
  const doc = await task.promise
  try {
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    )
  }
  return pages.join('\n\n').trim()
  } finally { await task.destroy() }
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
  return value.trim()
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return extractPdf(await file.arrayBuffer())
  if (name.endsWith('.docx')) return extractDocx(await file.arrayBuffer())
  if (name.endsWith('.txt') || name.endsWith('.md')) return (await file.text()).trim()
  throw new Error('Format non supporté — dépose un PDF, DOCX ou TXT.')
}
