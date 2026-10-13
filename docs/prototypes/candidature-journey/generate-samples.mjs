// Generate fixed synthetic download specimens using the existing document renderers.
import { mkdir, writeFile } from 'node:fs/promises'
import { renderDocument } from '../../../server/document-export.mjs'
import { cv, defaultLetter } from './fixtures.mjs'

const directory = new URL('./samples/', import.meta.url)
await mkdir(directory, { recursive: true })
const layout = { fontSize: 11, marginMm: 20, hidden: [] }
const original = {
  title: 'Synthetic CV — Alex Martin', templateVersion: 'single-column-cv-v1', layout: { ...layout, order: ['identity', 'summary', 'experiences', 'education', 'skills', 'languages', 'links'] },
  content: { name: 'Alex Martin', contact: 'alex.martin@example.com · Paris', title: cv.title, summary: cv.summary,
    experiences: [], education: [{ title: cv.education, organization: 'Établissement fictif', period: '2026', description: 'Exemple synthétique pour validation du parcours.' }],
    skills: cv.skills, languages: ['Français'], links: [],
  },
}
const letter = {
  title: 'Synthetic letter — Atelier Numérique', templateVersion: 'classic-letter-v1', layout,
  content: { sender: 'Alex Martin\nalex.martin@example.com\nParis', recipient: 'Atelier Numérique\nÉquipe recrutement', placeDate: 'Paris, le 13 octobre 2026',
    subject: 'Candidature — Développeur backend Python', greeting: '', body: defaultLetter, closing: '', signature: '' },
}
for (const [name, version, format] of [['CV_Alex_Martin.pdf', original, 'pdf'], ['Lettre_Atelier_Numerique.pdf', letter, 'pdf'], ['Lettre_Atelier_Numerique.docx', letter, 'docx']]) {
  const bytes = await renderDocument(version, format)
  await writeFile(new URL(name, directory), bytes)
  console.log(`${name}: ${bytes.length} bytes`)
}
