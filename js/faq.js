const renderFaq = (entries, list, schema) => {
  const fragment = document.createDocumentFragment();
  entries.forEach((entry, index) => {
    if (typeof entry?.question !== 'string' || typeof entry?.answer !== 'string') return;

    const item = document.createElement('details');
    item.className = 'faq-item reveal is-visible';
    const summary = document.createElement('summary');
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const question = document.createElement('strong');
    question.textContent = entry.question;
    summary.append(number, question);

    const body = document.createElement('div');
    body.className = 'faq-body';
    const answer = document.createElement('p');
    answer.textContent = entry.answer;
    const contact = document.createElement('a');
    contact.className = 'text-link wa-link';
    contact.dataset.waMessage = `Oi! Tenho uma dúvida sobre: ${entry.question}`;
    contact.href = '#';
    contact.target = '_blank';
    contact.rel = 'noreferrer';
    contact.textContent = 'Falar com a equipe';
    body.append(answer, contact);
    item.append(summary, body);
    fragment.append(item);
  });

  if (!fragment.childNodes.length) return false;
  list.replaceChildren(fragment);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map(entry => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
  // Evita que conteúdo do painel consiga encerrar a tag script no JSON-LD.
  schema.textContent = JSON.stringify(structuredData).replace(/</g, '\\u003c');
  document.dispatchEvent(new CustomEvent('overtrip:faq-updated'));
  return true;
};

async function updatePublicFaq() {
  const list = document.querySelector('#faq-list');
  const schema = document.querySelector('#faq-schema');
  if (!list || !schema) return;
  try {
    const response = await fetch('/api/public/faq', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    if (Array.isArray(payload?.entries)) renderFaq(payload.entries, list, schema);
  } catch {
    // O HTML contém o FAQ inicial como alternativa se a API estiver indisponível.
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updatePublicFaq, { once: true });
else void updatePublicFaq();

export { renderFaq, updatePublicFaq };
