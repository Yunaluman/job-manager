import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'
import { fileURLToPath } from 'node:url'
import { letterBlocks } from './document-model.mjs'
import { cvBlocks } from '../shared/domain/cv-document.mjs'
const fonts = { regular: fileURLToPath(new URL('./fonts/carlito/Carlito-Regular.ttf', import.meta.url)), bold: fileURLToPath(new URL('./fonts/carlito/Carlito-Bold.ttf', import.meta.url)) }
export async function renderDocument(version, format) {
  const blocks = version.templateVersion === 'single-column-cv-v1' ? cvBlocks(version.content, version.layout) : letterBlocks(version), { fontSize, marginMm } = version.layout
  if (format === 'docx') {
    const margin = Math.round(marginMm * 1440 / 25.4)
    return Packer.toBuffer(new Document({ styles: { default: { document: { run: { font: 'Calibri', size: fontSize * 2 }, paragraph: { spacing: { after: 100 } } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: margin, right: margin, bottom: margin, left: margin } } }, children: blocks.map((block) => new Paragraph({ alignment: block.right ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: block.after * 20 }, children: [new TextRun({ text: block.text, bold: block.bold, font: 'Calibri', size: fontSize * 2 })] })) }] }))
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: marginMm * 72 / 25.4, font: fonts.regular, info: { Title: version.title } }), chunks = []
    doc.on('data', (chunk) => chunks.push(chunk)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)))
    try { for (const block of blocks) { doc.font(block.bold ? fonts.bold : fonts.regular).fontSize(fontSize).text(block.text || ' ', { align: block.right ? 'right' : 'left', paragraphGap: block.after }); if (!block.text) doc.moveDown(0.5) }; doc.end() } catch (error) { doc.destroy(); reject(error) }
  })
}
