import { Fragment } from 'react'

// Source HTML is escaped by React; links and images remain inert text.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : <Fragment key={index}>{part}</Fragment>)
}
export function AnalysisContent({ text }: { text: string }) {
  return <article className="space-y-3 break-words text-sm leading-relaxed text-secondary" aria-label="Contenu de l’analyse">
    {text.split(/\r?\n/).map((line, index) => {
      const heading = line.match(/^\s*#{1,6}\s+(.+)$/)
      if (heading) return <h3 key={index} className="border-b border-line pb-2 pt-4 text-base font-semibold text-ink">{inline(heading[1])}</h3>
      if (/^\s*[-*_]{3,}\s*$/.test(line)) return <hr key={index} className="border-line" />
      if (/^\s*[-*+]\s+/.test(line)) return <ul key={index} className="list-disc pl-5"><li>{inline(line.replace(/^\s*[-*+]\s+/, ''))}</li></ul>
      return line.trim() ? <p key={index}>{inline(line)}</p> : null
    })}
  </article>
}
