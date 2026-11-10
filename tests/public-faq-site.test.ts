import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const script = readFileSync('js/faq.js', 'utf8');

describe('FAQ público sincronizado do painel ao site', () => {
  it('mantém fallback acessível e pontos únicos para atualizar o conteúdo e o schema', () => {
    expect(html).toContain('id="faq-schema"');
    expect(html).toContain('id="faq-list"');
    expect(html).toContain('src="/js/faq.js?');
    expect(script).toContain("fetch('/api/public/faq'");
    expect(script).toContain("list.replaceChildren(fragment)");
    expect(script).toContain("schema.textContent = JSON.stringify(structuredData)");
  });

  it('insere as perguntas como texto, sem interpretar conteúdo editado como HTML', () => {
    expect(script).toContain('question.textContent = entry.question');
    expect(script).toContain('answer.textContent = entry.answer');
    expect(script).toContain("replace(/</g, '\\\\u003c')");
    expect(script).not.toContain('innerHTML');
  });
});
