import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readXlsxSheets } from '../src/lib/xlsxReader.js';
import { applySheetCorrections, mapDestinationSheet, parseDestinationLabel } from '../src/services/destinationSheetImport.js';
import { destinationMatchKey, prettyPlaceName } from '../src/services/destinationNames.js';
import { labelForUrl, outingTotals, parseStoredLinks, summarizeOutings } from '../src/services/destinationBank.js';

// Dados sintéticos: a planilha real tem dados internos (fornecedores e
// resultado financeiro) e não entra no repositório.

function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(content));
    const nameBuffer = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(nameBuffer.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuffer, data);
    centrals.push(central, nameBuffer);
    offset += 30 + nameBuffer.length + data.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

describe('leitor de xlsx', () => {
  it('lê textos compartilhados, números e textos embutidos por aba', () => {
    const buffer = zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="DESTINOS VISITADOS" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Praia &amp; Rio - PB</t></si><si><r><t>Fá</t></r><r><t>cil</t></r></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="3"><c r="A3"><v>45319</v></c><c r="C3" t="s"><v>0</v></c><c r="E3" t="s"><v>1</v></c><c r="F3" t="inlineStr"><is><t>https://x.test</t></is></c><c r="G3"/></row></sheetData></worksheet>',
    });
    expect(readXlsxSheets(buffer).get('DESTINOS VISITADOS')).toEqual([{ row: 3, cells: { A: '45319', C: 'Praia & Rio - PB', E: 'Fácil', F: 'https://x.test' } }]);
  });
});

describe('nome do destino na planilha', () => {
  it.each([
    ['Cachoeira de Ouricuri - PB', { name: 'Cachoeira de Ouricuri', city: null, region: 'PB', camping: false }],
    ['Lagoa Azul, Santa Rita - PB', { name: 'Lagoa Azul', city: 'Santa Rita', region: 'PB', camping: false }],
    ['Cachoeira da Mijona - Serra da Raiz - PB', { name: 'Cachoeira da Mijona', city: 'Serra da Raiz', region: 'PB', camping: false }],
    ['Camping - Cachoeira da Manga - PB', { name: 'Cachoeira da Manga', city: null, region: 'PB', camping: true }],
    ['Camping Rio do Feijão - PB', { name: 'Rio do Feijão', city: null, region: 'PB', camping: true }],
    ['Camping no Rio do Feijão', { name: 'Rio do Feijão', city: null, region: null, camping: true }],
    ['OVER RIDERS: CACHOEIRA DO PINGA - PB', { name: 'CACHOEIRA DO PINGA', city: null, region: 'PB', camping: false }],
    ['EXPEDIÇÃO BONITO - PE', { name: 'BONITO', city: null, region: 'PE', camping: false }],
    ['Caraubas - Rio Paraíba', { name: 'Caraubas - Rio Paraíba', city: null, region: null, camping: false }],
    ['Barragem de Acauã, HC5Q+HP, Itatuba - PB, 58370-000', { name: 'Barragem de Acauã', city: 'Itatuba', region: 'PB', camping: false }],
  ])('%s', (label, expected) => {
    expect(parseDestinationLabel(label)).toEqual(expected);
  });
});

describe('mesmo lugar com nomes diferentes', () => {
  it('reconhece variações de nome do site, da planilha e das viagens', () => {
    expect(destinationMatchKey('OVER RIDERS: Cachoeira do Pinga - PB')).toBe(destinationMatchKey('Cachoeira do Pinga - PB'));
    expect(destinationMatchKey('Camping no Rio do Feijão')).toBe(destinationMatchKey('Rio do Feijão'));
    expect(destinationMatchKey('Olheiro de Pureza - RN')).toBe(destinationMatchKey("Olho D'água de Pureza - Pureza - RN"));
    expect(destinationMatchKey('TRILHA EM LUCENA - PB')).toBe(destinationMatchKey('Trilha em Lucena'));
    expect(destinationMatchKey('Praia de Tabatinga I')).not.toBe(destinationMatchKey('Praia de Tabatinga II'));
    expect(prettyPlaceName('PRAIA DE COQUEIRINHO')).toBe('Praia de Coqueirinho');
    expect(prettyPlaceName('Dique De Cabedelo')).toBe('Dique De Cabedelo');
  });
});

describe('correções confirmadas da planilha', () => {
  it('corrige Lagoa Azul, confirma Pureza, retira a saída de Caraúbas e corrige o balneário', () => {
    const { destinations } = mapDestinationSheet([
      { row: 3, cells: { A: '45711', C: 'Lagoa Azul, Santa Rita - PB', F: 'https://maps.app.goo.gl/errado', G: 'https://www.instagram.com/lagoa' } },
      { row: 4, cells: { A: 'Maio', C: "Olho D'água de Pureza - Pureza - RN" } },
      { row: 5, cells: { A: 'Agosto', C: 'Caraubas - Rio Paraíba' } },
      { row: 6, cells: { A: '45956', C: 'Balnearioa Rio Água Viva - Areai - PB' } },
    ]);
    const keys = destinations.map((d) => d.importKey);
    expect(applySheetCorrections(destinations)).toHaveLength(4);
    expect(destinations.map((d) => d.importKey)).toEqual(keys);
    const [lagoa, pureza, caraubas, balneario] = destinations;
    expect(lagoa.links).toEqual([
      { label: 'Google Maps', url: 'https://www.google.com/maps/search/?api=1&query=Lagoa+Azul%2C+Santa+Rita+-+PB' },
      { label: 'Instagram', url: 'https://www.instagram.com/lagoa' },
    ]);
    expect(pureza.outings).toMatchObject([{ date: '2026-05-17' }]);
    expect(caraubas.outings).toEqual([]);
    expect(balneario).toMatchObject({ name: 'Balneário Rio Água Viva', city: 'Areia' });
  });
});

describe('aba de destinos visitados', () => {
  const rows = [
    { row: 1, cells: { A: 'DATA', C: 'DESTINOS' } },
    { row: 2, cells: { D: '2024.0' } },
    { row: 3, cells: { A: '45564.0', B: 'Campina Grande', C: 'Cachoeira Um - PB', D: '78 km', E: 'Moderada', F: 'https://maps.app.goo.gl/a', G: 'https://pt.wikiloc.com/b', I: 'Resumo curto', J: '21.0', K: '65.0', L: '600.0', M: 'Fornecedor', N: '150.0', O: '750', P: '615' } },
    { row: 4, cells: { A: 'março', B: '-', C: '-', D: '-' } },
    { row: 5, cells: { A: 'Abril', J: '29.0', K: '130.0' } },
    { row: 6, cells: { A: 'Maio', B: 'Campina Grande', C: 'Camping - Cachoeira Um - PB', D: '80 km', I: 'Resumo bem mais longo do mesmo lugar', N: '0.0' } },
    { row: 7, cells: { B: 'Campina Grande', C: 'Praia Dois - Cidade - RN', E: '-', F: 'javascript:alert(1)' } },
    { row: 8, cells: { C: 'https://www.instagram.com/lugar' } },
  ];

  it('agrupa por destino, cria saídas só de linhas com data e ignora linhas sem nome', () => {
    const { destinations, skippedRows } = mapDestinationSheet(rows);
    expect(skippedRows).toEqual([4, 5, 8]);
    expect(destinations).toHaveLength(2);
    const [first, second] = destinations;
    expect(first).toMatchObject({
      name: 'Cachoeira Um', region: 'PB', category: 'Cachoeira', originCity: 'Campina Grande', distanceKm: 78, trailLevel: 'MODERATE',
      notes: 'Resumo bem mais longo do mesmo lugar',
      links: [{ label: 'Google Maps', url: 'https://maps.app.goo.gl/a' }, { label: 'Wikiloc', url: 'https://pt.wikiloc.com/b' }],
    });
    expect(first.outings).toEqual([
      { date: '2024-09-29', passengers: 21, pricePerPersonCents: 6500, transportCostCents: 60000, extraCostCents: 15000, supplier: 'Fornecedor', notes: null },
      { date: null, passengers: null, pricePerPersonCents: null, transportCostCents: null, extraCostCents: null, supplier: null, notes: 'Saída com camping. Mês registrado na planilha: Maio/2024 (dia não informado).' },
    ]);
    expect(second).toMatchObject({ name: 'Praia Dois', city: 'Cidade', region: 'RN', category: 'Praia', trailLevel: null, links: [], outings: [] });
  });

  it('gera a mesma chave de importação a cada execução', () => {
    expect(mapDestinationSheet(rows).destinations.map((d) => d.importKey)).toEqual(['sheet:cachoeira um|PB', 'sheet:praia dois|RN']);
  });
});

describe('totais das saídas', () => {
  it('calcula receita, despesa e resultado sem presumir zero', () => {
    expect(outingTotals({ passengers: 15, pricePerPersonCents: 5500, transportCostCents: 80000, extraCostCents: null })).toEqual({ revenueCents: 82500, expenseCents: 80000, resultCents: 2500 });
    expect(outingTotals({ passengers: null, pricePerPersonCents: 5500, transportCostCents: 80000, extraCostCents: null })).toEqual({ revenueCents: null, expenseCents: 80000, resultCents: null });
    expect(outingTotals({ passengers: 15, pricePerPersonCents: 5500, transportCostCents: null, extraCostCents: null })).toEqual({ revenueCents: 82500, expenseCents: null, resultCents: null });
  });

  it('resume médias ignorando campos vazios', () => {
    const summary = summarizeOutings([
      { date: new Date('2024-01-01T12:00:00Z'), passengers: 10, pricePerPersonCents: 5000, transportCostCents: 40000, extraCostCents: null },
      { date: new Date('2025-01-01T12:00:00Z'), passengers: 20, pricePerPersonCents: 7000, transportCostCents: 100000, extraCostCents: 0 },
      { date: null, passengers: null, pricePerPersonCents: null, transportCostCents: null, extraCostCents: null },
    ]);
    expect(summary).toEqual({ outingsCount: 3, lastOutingDate: '2025-01-01T12:00:00.000Z', averagePassengers: 15, averagePricePerPersonCents: 6000, averageExpenseCents: 70000, averageResultCents: 25000 });
  });
});

describe('links', () => {
  it('nomeia links conhecidos e descarta links armazenados inválidos', () => {
    expect(labelForUrl('https://maps.app.goo.gl/x')).toBe('Google Maps');
    expect(labelForUrl('https://vm.tiktok.com/x')).toBe('TikTok');
    expect(labelForUrl('https://example.com')).toBe('Link');
    expect(parseStoredLinks(JSON.stringify([{ label: 'Ok', url: 'https://a.test' }, { label: 'Ruim', url: 'javascript:alert(1)' }]))).toEqual([{ label: 'Ok', url: 'https://a.test' }]);
    expect(parseStoredLinks('não é json')).toEqual([]);
  });
});
