// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Book a reading: the page's content ───────────────────────────────────
// Everything shown on the "Book a reading" page lives here, so it can be edited without
// touching the page's code (readings.js). Change any text, price or link, save, and
// reload the page. Notes:
//   - Readings show in a grid two wide, in this order: left, right, then the next row.
//   - `image` is a path from the site's root folder (the six drawings are in readings/;
//     a photo works too, e.g. "readings/my-photo.jpg"). It shows in a circle.
//   - `price` is a plain number; `currency` (below) is shown after it ("80 EUR").
//   - `link` is where the reading's Book button goes (a booking form, a calendar, an email
//     such as "mailto:you@example.com"…). It opens in a new tab.
//   - Text is plain text: write it as you want it read (no HTML needed).

const READINGS_PAGE = {
  // Whether "Book a reading" shows in the sidebar. With false, the page is still there for
  // anyone given its link (…/astrologyexplorer/#/readings), but nothing on the site leads to it.
  showInSidebar: false,
  title: 'Book an Orbital Reading',
  subtitle: '', // an optional line under the title; leave '' for none
  currency: 'EUR',
  bookLabel: 'Book this reading',
  readings: [
    {
      title: 'Natal Chart Reading',
      reader: 'Luz Andrea Castillo · Colombian astrologer',
      description: 'A psychological portrait drawn from your birth chart: what the planets, signs and houses say about who you are, how you think and feel, and where your gifts and challenges lie. An exact birth time is preferred.',
      sessions: 'One 60-minute session',
      price: 80,
      image: 'readings/astrology-basic.svg',
      imageAlt: 'A natal chart wheel among the stars',
      link: 'https://antoniojl16.github.io/astrologyexplorer',
    },
    {
      title: 'Human Design Reading',
      reader: 'Antonio Juarez',
      description: 'An introduction to your Human Design: your type, profile and definition, with practical guidance for each. It helps you recognize who you are at an energetic level, and accept yourself as the unique being you are.',
      sessions: 'One 90-minute session',
      price: 80,
      image: 'readings/human-design-basic.svg',
      imageAlt: 'A Human Design bodygraph among the stars',
      link: 'https://antoniojl16.github.io/astrologyexplorer',
    },
    {
      title: 'In-Depth Astrology Reading',
      reader: 'Luz Andrea Castillo · Colombian astrologer',
      description: 'Beyond the natal chart: your progressions, the cycles active in your life now, and what lies ahead in the coming weeks, months and years.',
      sessions: 'Two 90-minute sessions',
      price: 200,
      image: 'readings/astrology-in-depth.svg',
      imageAlt: 'A chart wheel ringed by arcs of time',
      link: 'https://antoniojl16.github.io/astrologyexplorer',
    },
    {
      title: 'In-Depth Human Design Reading',
      reader: 'Antonio Juarez',
      description: 'A close study of your design: the energy of each of your channels, your not-self themes and risks, your PHS and Variable, and how you meet others in relationship.',
      sessions: 'Two 90-minute sessions',
      price: 200,
      image: 'readings/human-design-in-depth.svg',
      imageAlt: 'A bodygraph with its channels glowing',
      link: 'https://antoniojl16.github.io/astrologyexplorer',
    },
    {
      title: 'Synastry & Composite Reading',
      reader: 'Luz Andrea Castillo · Colombian astrologer',
      description: 'Two birth charts read together: the main harmonies and tensions between you, how to draw on the harmonies and work through the tensions in a healthy way, and what your bond means as a whole. Includes a natal chart reading for each of you.',
      sessions: 'Two 60-minute sessions and one 90-minute session',
      price: 400,
      image: 'readings/astrology-synastry.svg',
      imageAlt: 'Two chart wheels overlapping',
      link: 'https://antoniojl16.github.io/astrologyexplorer',
    },
    {
      title: 'Human Design Composite Reading',
      reader: 'Antonio Juarez',
      description: 'Two designs read together: what draws you to each other and what pushes you apart, how you complement each other, your shared strengths, and the risks of codependency or distortion. Above all, how to support each other in living as your true, unique selves while living your relationship fully. Includes a Human Design reading for each of you.',
      sessions: 'Three 90-minute sessions',
      price: 400,
      image: 'readings/human-design-composite.svg',
      imageAlt: 'Two bodygraphs joined by shared channels',
      link: 'https://antoniojl16.github.io/astrologyexplorer',
    },
  ],
};
