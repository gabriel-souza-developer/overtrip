import { inflateRawSync } from 'node:zlib';

// Leitor mínimo de .xlsx (zip + XML da planilha), sem dependência nova:
// usado só pelo importador local do banco de destinos. Lê valores de texto e
// números das células; ignora fórmulas, estilos e imagens. Não é exposto em
// nenhuma rota.

export type SheetRow = { row: number; cells: Record<string, string> };

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo .xlsx inválido (zip sem diretório central).');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Arquivo .xlsx inválido (entrada corrompida).');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    if (method === 0) entries.set(name, Buffer.from(data));
    else if (method === 8) entries.set(name, inflateRawSync(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const decode = (text: string) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, '&');

const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, value]) => decode(value)).join('');

export function readXlsxSheets(buffer: Buffer): Map<string, SheetRow[]> {
  const entries = readZipEntries(buffer);
  const read = (name: string) => entries.get(name)?.toString('utf8') ?? '';
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, si]) => textOf(si));
  const rels = new Map([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [
    /Id="([^"]+)"/.exec(tag)?.[1] ?? '', (/Target="([^"]+)"/.exec(tag)?.[1] ?? '').replace(/^\/?(xl\/)?/, 'xl/'),
  ]));
  const sheets = new Map<string, SheetRow[]>();
  for (const [tag] of read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]+)"/.exec(tag)?.[1] ?? '');
    const target = rels.get(/r:id="([^"]+)"/.exec(tag)?.[1] ?? '');
    if (!name || !target) continue;
    const rows: SheetRow[] = [];
    for (const [, attrs, body] of read(target).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(/\br="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const cells: Record<string, string> = {};
      for (const [, cellAttrs, cellBody] of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(cellAttrs)?.[1];
        if (!ref || !cellBody) continue;
        const type = /\bt="([^"]+)"/.exec(cellAttrs)?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/.exec(cellBody)?.[1];
        const value = type === 's' && raw !== undefined ? shared[Number(raw)] ?? ''
          : type === 'inlineStr' ? textOf(cellBody)
            : raw !== undefined ? decode(raw) : '';
        if (value.trim()) cells[ref] = value;
      }
      if (Object.keys(cells).length) rows.push({ row: rowNumber, cells });
    }
    sheets.set(name, rows);
  }
  return sheets;
}
