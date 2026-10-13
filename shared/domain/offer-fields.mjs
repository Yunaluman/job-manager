export function detectOfferFields(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const company = text.match(/(?:^|\n)\s*(?:entreprise|société|employeur)\s*:\s*([^\n]{2,300})/i)?.[1]?.trim()
  const explicitTitle = text.match(/(?:^|\n)\s*(?:poste|intitulé|titre du poste)\s*:\s*([^\n]{2,300})/i)?.[1]?.trim()
  const candidate = lines.find(line => /développeur|développeuse|engineer|ingénieur|ingénieure|technicien|chef de projet|consultant|analyst|architecte|administrateur|data scientist/i.test(line) && line.length <= 160 && !/[.!?]$/.test(line))
  return { company, title:explicitTitle ?? candidate }
}
export function fillEmptyOfferFields(draft, text, protectedFields = []) {
  const proposals = detectOfferFields(text), next = {...draft,text}
  for(const field of ['company','title']) if(!draft[field]?.trim() && !protectedFields.includes(field) && proposals[field]) next[field]=proposals[field]
  return {draft:next,proposals}
}
