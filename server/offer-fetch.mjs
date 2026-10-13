import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
const fail = message => { throw Object.assign(new Error(message + ' Colle le texte de l’annonce manuellement.'), { status: 400 }) }
export function publicAddress(address) {
  const family = isIP(address)
  if (family === 4) {
    const [a,b,c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  if (family !== 6) return false
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1,-1).toLowerCase()
  const second = parseInt(canonical.split(':')[1] || '0',16)
  return /^[23]/.test(canonical) && !(canonical.startsWith('2001:') && (second < 0x200 || second === 0xdb8)) && !/^2002:|^3fff:/.test(canonical)
}
function validUrl(value) {
  let url; try { url = new URL(value) } catch { fail('Lien invalide.') }
  if (typeof value !== 'string' || value.length > 2000 || !['http:','https:'].includes(url.protocol) || url.username || url.password || (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))) fail('Seules les annonces HTTP(S) publiques sont acceptées.')
  url.hash = ''; return url
}
const pageRequest = (url, address, signal) => new Promise((resolve, reject) => {
  const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, { signal, headers: { Accept: 'text/html,text/plain', 'User-Agent': 'JobPilot/1.0 (explicit offer retrieval)', 'Accept-Encoding': 'identity' }, lookup: (_hostname, options, callback) => options.all ? callback(null,[address]) : callback(null,address.address,address.family) }, res => {
    const chunks = []; let size = 0
    res.on('data', chunk => { size += chunk.length; if(size > 1024 * 1024) { res.destroy(); reject(new Error('Response too large')) } else chunks.push(chunk) })
    res.on('error',reject); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))
  })
  req.on('error',reject); req.end()
})
const decode = value => value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[entity]).replace(/&#(x[0-9a-f]+|\d+);/gi, (_match,value) => {const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1),16) : Number(value);return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''})
export function pageText(html, contentType) {
  if (/captcha|cf-chl-|verify you are human|access denied|connexion requise/i.test(html) || /<input[^>]+type\s*=\s*["']?password/i.test(html)) fail('Page protégée ou authentification nécessaire.')
  const text = contentType.includes('text/plain') ? html : decode(html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|nav|header|footer|noscript|svg)\b[^>]*>[^]*?<\/\1\s*>/gi,'').replace(/<\/(?:p|div|section|li|h[1-6]|article|tr)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' '))
  const clean = text.split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n')
  if (clean.length < 80 || clean.length > 100000) fail('Contenu incomplet ou trop volumineux.')
  return clean
}
export async function retrieveOffer(value, { resolve = host => lookup(host,{all:true,verbatim:true}), transport = pageRequest, timeoutMs = 10000 } = {}) {
  const initialUrl = validUrl(value).href, signal = AbortSignal.timeout(timeoutMs)
  let url = validUrl(value)
  const bounded = promise => new Promise((done,reject) => {
    if(signal.aborted) return reject(new Error('Timeout'))
    const abort=()=>reject(new Error('Timeout'));signal.addEventListener('abort',abort,{once:true});promise.then(done,reject).finally(()=>signal.removeEventListener('abort',abort))
  })
  try {
    for (let hop = 0; hop <= 4; hop++) {
      const host = url.hostname.replace(/^\[|\]$/g,''), literal = isIP(host)
      const addresses = literal ? [{address:host,family:literal}] : await bounded(resolve(host))
      if (!addresses.length || addresses.some(value=>!publicAddress(value.address))) fail('Destination locale, privée ou réservée refusée.')
      const result = await bounded(transport(url,addresses[0],signal))
      if ([301,302,303,307,308].includes(result.status)) {
        if(hop === 4 || !result.headers.location) fail('Trop de redirections ou redirection invalide.')
        url = validUrl(new URL(result.headers.location,url).href); continue
      }
      if (result.status !== 200 || !/^(?:text\/html|text\/plain)/i.test(result.headers['content-type'] ?? '') || !['identity',undefined].includes(result.headers['content-encoding'])) fail('Page indisponible ou format non pris en charge.')
      if(result.body.length > 1024 * 1024) fail('Page trop volumineuse.')
      return { initialUrl, finalUrl:url.href, retrievedAt:new Date().toISOString(), text:pageText(result.body.toString('utf8'),result.headers['content-type']) }
    }
  } catch(error) { if(error.status === 400) throw error; fail('Récupération interrompue, expirée ou page illisible.') }
}
