// Human Design gate/line/color/tone/base computation.
//
// Source of truth for "where is this planet" is the SAME deterministic angle
// function already driving the astrology wheel: positionAngleAtTime(position,
// offsetMinutes) in timeline.js. Nothing in this file computes its own angles —
// it only converts an angle that timeline.js already produced into HD terms.
// That keeps the bodygraph permanently consistent with whatever the wheel shows,
// including once real ephemeris positions replace the current sample data.

const HD_GATE_WHEEL = [55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30];

const HD_PERSONALITY_PLANETS = ['Sun', 'Earth', 'Moon', 'North Node', 'South Node', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

// Design time isn't assumed here — it's read straight from the chart record
// (chart.designTime, set alongside birthDate/birthTime whenever a chart is
// created or edited; see designTimeFor() in app.js). This just converts that
// stored absolute moment into an offset-from-birth, since positionAngleAtTime
// (timeline.js) is offset-based throughout the rest of the app.
function designOffsetMinutesFor(chart) {
  const birthMoment = chartBirthMomentUTC(chart);
  const designMoment = new Date(chart.designTime);
  return (designMoment.getTime() - birthMoment.getTime()) / 60000;
}

// One planetary influence: 5 numeric hierarchy levels (gate/line/color/tone/base)
// plus the "G.L.C.T.B" string form. All fields start null until computed.
function emptyHumanDesignInfluence(planet) {
  return {
    planet,
    angle: null,   // zodiacal angle (0–360, tropical, 0 = 0° Aries) this was derived from
    gate: null,    // 1–64
    line: null,    // 1–6
    color: null,   // 1–6
    tone: null,    // 1–6
    base: null,    // 1–5
    label: null    // "G.L.C.T.B", e.g. "37.6.6.6.5"
  };
}

// ── Gate + line ──────────────────────────────────────────────────────────
// HD_GATE_WHEEL[0] (gate 55) begins at 0° Pisces (330° tropical), not 0°
// Aries — confirmed against a known real mapping (gate 19 falls at
// 307.5°-313.125°, inside Aquarius) before trusting this anchor. Gate index
// = floor of how far `angle` has traveled (in 64ths of the circle) past that
// 330° anchor; line = which 1/6th of the gate's own arc the angle falls in.
function computeGateLineColorToneBase(angle) {
  const shiftedAngle = ((angle - 330) % 360 + 360) % 360;
  const gateExact = (shiftedAngle / 360) * 64;
  const gateIndex = Math.floor(gateExact) % HD_GATE_WHEEL.length;
  const gateNumber = HD_GATE_WHEEL[gateIndex];
  const fracDiff = gateExact - gateIndex;
  const line = Math.floor(fracDiff * 6) + 1;
  const color = Math.floor(((fracDiff*6)%1)*6)+1;
  const tone = Math.floor(((fracDiff*36)%1)*6)+1;
  const base = Math.floor(((fracDiff*216)%1)*5)+1;
  return {gate: HD_GATE_WHEEL[gateIndex], line: line, color: color, tone: tone, base: base};
}


function formatHumanDesignLabel(influence) {
  const {gate, line, color, tone, base} = influence;
  if ([gate, line, color, tone, base].some(value => value == null)) return null;
  return `${gate}.${line}.${color}.${tone}.${base}`;
}

function computeHumanDesignInfluence(planet, angle) {
  const influence = emptyHumanDesignInfluence(planet);
  influence.angle = angle;
  Object.assign(influence, computeGateLineColorToneBase(angle));
  influence.label = formatHumanDesignLabel(influence);
  return influence;
}

// ── Per-chart angle lookup ───────────────────────────────────────────────
// Earth and South Node are now first-class entries in chart.positions
// (produced by makePositions() / oppositePosition() in app.js), so every
// one of the 13 planets is just a plain lookup — no special-casing needed.
function humanDesignAngleFor(chart, planet, offsetMinutes) {
  const position = chart.positions.find(item => item.name === planet);
  return position ? positionAngleAtTime(position, offsetMinutes) : null;
}

// ── Full chart: 13 personality + 13 design influences ───────────────────
// personalityOffsetMinutes lets a caller (e.g. a timeline slider) explore a
// moment other than the exact birth instant; design rides along at whatever
// gap chart.designTime actually sits from birth (88 days, by construction
// today, but this file no longer assumes that number itself).
function computeHumanDesignChart(chart, personalityOffsetMinutes = 0) {
  const buildSet = offsetMinutes => HD_PERSONALITY_PLANETS.map(planet => {
    const angle = humanDesignAngleFor(chart, planet, offsetMinutes);
    return angle == null ? emptyHumanDesignInfluence(planet) : computeHumanDesignInfluence(planet, angle);
  });
  const designOffsetMinutes = designOffsetMinutesFor(chart);
  return {
    personality: buildSet(personalityOffsetMinutes),
    design: buildSet(personalityOffsetMinutes + designOffsetMinutes)
  };
}

// ── Canonical bodygraph topology ─────────────────────────────────────────
// Fixed Human Design structure (which gate belongs to which center, which
// gate pairs form a channel) — independent of any chart or SVG layout.
// Pixel coordinates for drawing stay in systems.js; this is just "what
// connects to what," shared by the bodygraph and (eventually) the mandala.
const HD_CENTERS = [
  {id:'head', name:'Head'}, {id:'ajna', name:'Ajna'}, {id:'throat', name:'Throat'},
  {id:'g', name:'G'}, {id:'heart', name:'Heart'}, {id:'spleen', name:'Spleen'},
  {id:'solar-plexus', name:'Solar Plexus'}, {id:'sacral', name:'Sacral'}, {id:'root', name:'Root'}
];

const HD_GATE_CENTER = {
  64:'head', 61:'head', 63:'head',
  47:'ajna', 24:'ajna', 4:'ajna', 17:'ajna', 43:'ajna', 11:'ajna',
  62:'throat', 23:'throat', 56:'throat', 35:'throat', 12:'throat', 45:'throat', 33:'throat', 8:'throat', 31:'throat', 20:'throat', 16:'throat',
  1:'g', 13:'g', 25:'g', 46:'g', 2:'g', 15:'g', 10:'g', 7:'g',
  21:'heart', 40:'heart', 26:'heart', 51:'heart',
  48:'spleen', 57:'spleen', 44:'spleen', 50:'spleen', 32:'spleen', 28:'spleen', 18:'spleen',
  6:'solar-plexus', 37:'solar-plexus', 22:'solar-plexus', 36:'solar-plexus', 30:'solar-plexus', 55:'solar-plexus', 49:'solar-plexus',
  5:'sacral', 14:'sacral', 29:'sacral', 59:'sacral', 9:'sacral', 3:'sacral', 42:'sacral', 27:'sacral', 34:'sacral',
  58:'root', 38:'root', 54:'root', 53:'root', 60:'root', 52:'root', 19:'root', 39:'root', 41:'root'
};

// The 36 gate pairs that form a channel. Order matches the coordinate array
// in systems.js (renderBodygraph's `channels`) so the two stay easy to cross-check.
const HD_CHANNELS = [
  [1,8], [2,14], [3,60], [4,63], [5,15], [6,59], [7,31], [9,52], [11,56], [12,22],
  [13,33], [16,48], [17,62], [18,58], [19,49], [20,57], [21,45], [23,43], [24,61], [25,51],
  [26,44], [27,50], [28,38], [29,46], [30,41], [32,54], [35,36], [37,40], [39,55], [42,53],
  [47,64], [10,34], [10,20], [10,57], [20,34], [34,57]
];

// ── Bodygraph activation state ───────────────────────────────────────────
// Turns the 13 personality + 13 design placements into per-gate activation
// (which side lit it up) and per-center definition (does at least one fully
// activated channel — both gates lit, either side — connect through it).
function computeBodygraphState(chart, offsetMinutes = 0) {
  const hd = chart ? computeHumanDesignChart(chart, offsetMinutes) : null;
  const gateSides = {};
  if (hd) {
    const addSide = (side, influences) => influences.forEach(influence => {
      if (influence.gate == null) return;
      if (!gateSides[influence.gate]) gateSides[influence.gate] = { personality: false, design: false };
      gateSides[influence.gate][side] = true;
    });
    addSide('personality', hd.personality);
    addSide('design', hd.design);
  }
  const gateActive = gate => Boolean(gateSides[gate]);
  const gateSide = gate => {
    const entry = gateSides[gate];
    if (!entry) return null;
    if (entry.personality && entry.design) return 'both';
    return entry.personality ? 'personality' : 'design';
  };
  const definedCenters = new Set();
  HD_CHANNELS.forEach(([gateA, gateB]) => {
    if (gateActive(gateA) && gateActive(gateB)) {
      definedCenters.add(HD_GATE_CENTER[gateA]);
      definedCenters.add(HD_GATE_CENTER[gateB]);
    }
  });
  return { hd, gateSide, centerDefined: centerId => definedCenters.has(centerId) };
}
