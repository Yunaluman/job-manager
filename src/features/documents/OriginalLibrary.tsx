import { Button } from '../../shared/ui/Button'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { FileUp, FileText, Download, Eye } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useData } from '../../data'
import { uploadOriginal, originalBytes, downloadOriginal, type CvOriginal } from '../../originals'
export function OriginalPreview({ value }: { value: CvOriginal }) {
  const target = useRef<HTMLDivElement>(null), [error, setError] = useState('')
  useEffect(() => {
    if (value.format === 'txt') return
    let disposed = false, task: import('pdfjs-dist').PDFDocumentLoadingTask | undefined
    void (async () => {
      if (value.format === 'docx') {
        const mammoth = await import('mammoth')
        const result = await mammoth.convertToHtml({ arrayBuffer: await (await originalBytes(value.id)).arrayBuffer() }, { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) })
        const parsed = new DOMParser().parseFromString(result.value, 'text/html')
        const allowed = new Set(['P','H1','H2','H3','H4','STRONG','EM','UL','OL','LI','TABLE','TBODY','TR','TD','TH','BR'])
        const copy = (node: Node): Node => {
          if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '')
          const element = document.createElement(allowed.has(node.nodeName) ? node.nodeName.toLowerCase() : 'span')
          node.childNodes.forEach(child => element.append(copy(child))); return element
        }
        if (!disposed) parsed.body.childNodes.forEach(node => target.current?.append(copy(node)))
        return
      }
      const pdf = await import('pdfjs-dist'); pdf.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      const blob = await originalBytes(value.id); if (disposed) return
      task = pdf.getDocument({ data: await blob.arrayBuffer() }); const doc = await task.promise
      for (let number = 1; number <= doc.numPages && !disposed; number++) {
        const page = await doc.getPage(number), viewport = page.getViewport({ scale: 1 }), canvas = document.createElement('canvas')
        canvas.width = viewport.width; canvas.height = viewport.height; canvas.className = 'mb-4 h-auto w-full'; canvas.setAttribute('aria-label', `Page originale ${number}`)
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
        if (!disposed) target.current?.append(canvas); page.cleanup()
      }
    })().catch(reason => { if (!disposed) setError(reason.message) })
    return () => { disposed = true; void task?.destroy(); target.current?.replaceChildren() }
  }, [value])
  return <div className="my-4 rounded-lg border border-line p-3"><h3 className="font-semibold">Aperçu de l’original : {value.name}</h3>{error && <p role="alert">{error}</p>}{value.format !== 'txt' ? <><p className="my-2 text-xs text-muted">{value.format === 'docx' ? 'Aperçu DOCX local : mise en page approximative, images et liens désactivés.' : 'Pages du PDF original.'}</p><div className="space-y-3 break-words [&_table]:w-full [&_td]:border [&_td]:p-2" ref={target} /></> : <><p className="my-2 text-xs text-muted">Texte du fichier original.</p><pre className="whitespace-pre-wrap break-words text-sm">{value.text}</pre></>}</div>
}
export function OriginalLibrary({ onSelect }: { onSelect?: (value: CvOriginal) => void }) {
  const { cvOriginals } = useData(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState<CvOriginal>(), [success, setSuccess] = useState('')
  return <section className="app-panel p-5"><p className="app-eyebrow">Importer · Conserver · Vérifier</p><h2 className="text-xl font-semibold">Ta bibliothèque de CV</h2><p className="my-2 text-sm text-muted">PDF, DOCX ou TXT · 5 Mio maximum. Fichier conservé localement ; aucun appel IA à l’import.</p><label className="app-import mt-5 block"><FileUp size={24} className="mb-3 text-[#148268]" aria-hidden="true" /><span className="block font-semibold">Importer un CV</span><span className="mt-1 block text-sm text-muted">Le fichier original reste disponible, avec son aperçu et son texte.</span><input aria-label="Importer un fichier CV original" type="file" accept=".pdf,.docx,.txt" disabled={busy} onChange={event => {
    const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(''); setSuccess('')
    void uploadOriginal(file).then(value => { setPreview(value); setSuccess('Original enregistré. Le profil et les versions structurées restent à confirmer.') }).catch(reason => setError(reason.message)).finally(() => { setBusy(false); event.target.value = '' })
  }} /></label>{busy && <p role="status">Lecture et conservation…</p>}{success && <p role="status" className="my-2 text-sm text-emerald-700">{success}</p>}{error && <p role="alert" className="my-2 text-rose-700">{error}</p>}
    {!cvOriginals.length && <p className="my-3 text-sm text-muted">Aucun original conservé. Les anciens textes ne permettent pas de reconstruire le fichier.</p>}
    {cvOriginals.map(value => <div className="app-file-card mt-4" key={value.id}><p className="flex items-center gap-2 break-words font-medium"><FileText size={18} className="shrink-0 text-muted" aria-hidden="true" />{value.name} · {Math.ceil(value.size / 1024)} Kio</p><p className="text-xs text-muted">{new Date(value.createdAt).toLocaleString('fr-FR')}</p><details className="text-xs"><summary>Empreinte SHA-256</summary><p className="break-all">{value.sha256}</p></details><div className="mt-2 flex flex-wrap gap-2"><Button type="button" className="app-button" onClick={() => setPreview(preview?.id === value.id ? undefined : value)}><Eye size={15} aria-hidden="true" />Aperçu original</Button><Button type="button" className="app-button" onClick={() => void downloadOriginal(value).catch(reason => setError(reason.message))}><Download size={15} aria-hidden="true" />Télécharger l’original</Button>{onSelect && <Button type="button" className="app-button" onClick={() => onSelect(value)}>Utiliser ce texte source</Button>}</div></div>)}
    {preview && <OriginalPreview key={preview.id} value={preview} />}
  </section>
}
