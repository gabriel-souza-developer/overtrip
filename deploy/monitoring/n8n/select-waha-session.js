'use strict';

function selectWahaSession(sessions, expectedName = 'nox') {
  const matches = sessions.filter(session => session.name === expectedName && String(session.status || '').toUpperCase() === 'WORKING');
  if (matches.length !== 1) {
    throw new Error(`Sessão WAHA "${expectedName}" não está WORKING; envio cancelado.`);
  }
  return matches[0].name;
}

if (typeof module !== 'undefined') module.exports = { selectWahaSession };
