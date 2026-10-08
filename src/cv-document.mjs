export const CV_SECTIONS = ['identity', 'summary', 'experiences', 'education', 'skills', 'languages', 'links']
export const CV_LABELS = { identity: 'Identité et titre', summary: 'Présentation', experiences: 'Expériences', education: 'Formations', skills: 'Compétences', languages: 'Langues', links: 'Liens' }
const fail = () => { throw Object.assign(new Error('CV ou présentation invalide.'), { status: 400 }) }
const text = (value, max = 10000) => typeof value === 'string' && value.length <= max && !value.includes('\0')
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key))
export function validateCv(content, layout) {
  if (!exact(content, ['name', 'contact', 'title', 'summary', 'experiences', 'education', 'skills', 'languages', 'links']) || !text(content.name, 300) || !content.name.trim() || !text(content.contact, 5000) || !text(content.title, 300) || !text(content.summary)) fail()
  for (const key of ['experiences', 'education']) if (!Array.isArray(content[key]) || content[key].length > 100 || content[key].some((entry) => !exact(entry, ['title', 'organization', 'period', 'description']) || !text(entry.title, 300) || !text(entry.organization, 300) || !text(entry.period, 300) || !text(entry.description))) fail()
  for (const key of ['skills', 'languages', 'links']) if (!Array.isArray(content[key]) || content[key].length > 100 || content[key].some((entry) => !text(entry, 1000))) fail()
  if (!exact(layout, ['fontSize', 'marginMm', 'hidden', 'order']) || !Number.isInteger(layout.fontSize) || layout.fontSize < 10 || layout.fontSize > 12 || !Number.isInteger(layout.marginMm) || layout.marginMm < 15 || layout.marginMm > 25 || !Array.isArray(layout.hidden) || layout.hidden.some((key) => !CV_SECTIONS.includes(key)) || new Set(layout.hidden).size !== layout.hidden.length || !Array.isArray(layout.order) || layout.order.length !== CV_SECTIONS.length || new Set(layout.order).size !== CV_SECTIONS.length || layout.order.some((key) => !CV_SECTIONS.includes(key))) fail()
  if (JSON.stringify(content).length > 100000) fail()
}
export function cvBlocks(content, layout) {
  const blocks = []
  for (const section of layout.order) {
    if (layout.hidden.includes(section)) continue
    if (section === 'identity') { for (const entry of [content.name, content.title, content.contact]) if (entry.trim()) blocks.push({ text: entry, bold: entry !== content.contact, after: 8 }); continue }
    const value = content[section]; if (!value.length) continue
    blocks.push({ text: CV_LABELS[section], bold: true, after: 8 })
    if (typeof value === 'string') blocks.push({ text: value, after: 8 })
    else for (const entry of value) {
      if (typeof entry === 'string') blocks.push({ text: `• ${entry}`, after: 5 })
      else { blocks.push({ text: [entry.title, entry.organization, entry.period].filter(Boolean).join(' — '), bold: true, after: 5 }); for (const line of entry.description.split('\n')) blocks.push({ text: line, after: 5 }) }
    }
  }
  return blocks.flatMap((block) => block.text.split('\n').map((line) => ({ ...block, text: line })))
}
export const cvText = (content, layout) => cvBlocks(content, layout).map((block) => block.text).join('\n')
