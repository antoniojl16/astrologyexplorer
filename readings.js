// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Book a reading ───────────────────────────────────────────────────────
// The readings on offer, as a grid of cards: drawing, title, reader, description,
// sessions and price, and a Book link. The content is all in READINGS_PAGE
// (readings-data.js); this file only lays it out.

function readingPriceText(price, currency) {
  return `${Number(price).toLocaleString('en', { maximumFractionDigits: 2 })} ${currency}`;
}
function readingCardMarkup(reading, page) {
  return `<article class="reading-card">
    <img class="reading-image" src="${escapeHtml(reading.image)}" alt="${escapeHtml(reading.imageAlt || '')}" loading="lazy">
    <h3>${escapeHtml(reading.title)}</h3>
    <p class="reading-reader">${escapeHtml(reading.reader)}</p>
    <p class="reading-description">${escapeHtml(reading.description)}</p>
    <p class="reading-terms"><span>${escapeHtml(reading.sessions)}</span><strong>${escapeHtml(readingPriceText(reading.price, page.currency))}</strong></p>
    <a class="reading-book" href="${escapeHtml(reading.link)}" target="_blank" rel="noopener">${escapeHtml(page.bookLabel)}</a>
  </article>`;
}
// The sidebar link shows only when READINGS_PAGE.showInSidebar is true.
document.querySelectorAll('.readings-link').forEach((link) => { link.hidden = typeof READINGS_PAGE === 'undefined' || !READINGS_PAGE.showInSidebar; });

function renderReadings() {
  const body = document.getElementById('readingsBody');
  if (!body || typeof READINGS_PAGE === 'undefined') return;
  const page = READINGS_PAGE;
  body.innerHTML = `
    <header class="readings-head">
      <h2>${escapeHtml(page.title)}</h2>
      ${page.subtitle ? `<p>${escapeHtml(page.subtitle)}</p>` : ''}
    </header>
    <div class="readings-grid">${page.readings.map((reading) => readingCardMarkup(reading, page)).join('')}</div>`;
}
