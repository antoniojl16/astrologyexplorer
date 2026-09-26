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
// HD_GATE_WHEEL[0] (gate 55) begins at 0°07'30" Pisces (330.125° tropical), per the
// Rave Mandala: gate 41 opens at 2°00' Aquarius (302°), and five 5.625° gates later
// gate 55 opens 1/8° past the Pisces cusp — not exactly on it. Gate index = floor of
// how far `angle` has traveled (in 64ths of the circle) past that anchor; line =
// which 1/6th of the gate's own arc the angle falls in.
const HD_GATE55_START = 330.125;
function computeGateLineColorToneBase(angle) {
  const shiftedAngle = ((angle - HD_GATE55_START) % 360 + 360) % 360;
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

// Standard names of the 36 channels, keyed "lowerGate-higherGate".
const HD_CHANNEL_NAMES = {
  '1-8': 'Inspiration', '2-14': 'The Beat', '3-60': 'Mutation', '4-63': 'Logic', '5-15': 'Rhythm',
  '6-59': 'Mating', '7-31': 'The Alpha', '9-52': 'Concentration', '10-20': 'Awakening', '10-34': 'Exploration',
  '10-57': 'Perfected Form', '11-56': 'Curiosity', '12-22': 'Openness', '13-33': 'The Prodigal', '16-48': 'The Wavelength',
  '17-62': 'Acceptance', '18-58': 'Judgment', '19-49': 'Synthesis', '20-34': 'Charisma', '20-57': 'The Brainwave',
  '21-45': 'Money', '23-43': 'Structuring', '24-61': 'Awareness', '25-51': 'Initiation', '26-44': 'Surrender',
  '27-50': 'Preservation', '28-38': 'Struggle', '29-46': 'Discovery', '30-41': 'Recognition', '32-54': 'Transformation',
  '34-57': 'Power', '35-36': 'Transitoriness', '37-40': 'Community', '39-55': 'Emoting', '42-53': 'Maturation',
  '47-64': 'Abstraction',
};
function hdChannelKey([first, second]) {
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}
// "20–34", "Charisma", "Throat – Sacral" for a channel given as a gate pair.
function hdChannelInfo(gates) {
  const [first, second] = [...gates].sort((a, b) => a - b);
  const centerName = gate => HD_CENTERS.find(center => center.id === HD_GATE_CENTER[gate])?.name;
  return { gates: `${first}–${second}`, name: HD_CHANNEL_NAMES[hdChannelKey(gates)] || '', centers: `${centerName(first)} – ${centerName(second)}` };
}

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

// ── Typology: type, authority, definition, profile, cross, Variable, PHS ──
// Everything here derives from the 26 activations (gate/line/color/tone) and the
// channels they complete — no extra astronomy. Centers are "defined" by a channel
// whose two gates are both activated (either side), as in computeBodygraphState.
const HD_MOTOR_CENTERS = new Set(['sacral', 'solar-plexus', 'heart', 'root']);
const HD_TYPE_INFO = {
  Manifestor: { aura: 'Closed & repelling', strategy: 'To inform', notSelf: 'Anger', signature: 'Peace' },
  Generator: { aura: 'Open & enveloping', strategy: 'Wait to respond', notSelf: 'Frustration', signature: 'Satisfaction' },
  'Manifesting Generator': { aura: 'Open & enveloping', strategy: 'Wait to respond, then inform', notSelf: 'Frustration & anger', signature: 'Satisfaction & peace' },
  Projector: { aura: 'Focused & absorbing', strategy: 'Wait for the invitation', notSelf: 'Bitterness', signature: 'Success' },
  Reflector: { aura: 'Resistant & sampling', strategy: 'Wait a lunar cycle', notSelf: 'Disappointment', signature: 'Surprise' },
};
const HD_LINE_NAMES = ['Investigator', 'Hermit', 'Martyr', 'Opportunist', 'Heretic', 'Role Model'];
const HD_DEFINITION_NAMES = ['None', 'Single Definition', 'Split Definition', 'Triple Split Definition', 'Quadruple Split Definition'];
// Quarters of 16 gates each, starting at gate 13 (Initiation), 2, 7 and 1.
const HD_QUADRANTS = [
  { name: 'Initiation', theme: 'Purpose fulfilled through Mind' },
  { name: 'Civilization', theme: 'Purpose fulfilled through Form' },
  { name: 'Duality', theme: 'Purpose fulfilled through Bonding' },
  { name: 'Mutation', theme: 'Purpose fulfilled through Transformation' },
];
// PHS tables, indexed by color (1–6); [left, right] pairs are chosen by tone
// (tones 1–3 left, 4–6 right).
const HD_DIGESTION = [
  { name: 'Appetite', sides: ['Consecutive', 'Alternating'] },
  { name: 'Taste', sides: ['Open', 'Closed'] },
  { name: 'Thirst', sides: ['Hot', 'Cold'] },
  { name: 'Touch', sides: ['Calm', 'Nervous'] },
  { name: 'Sound', sides: ['High', 'Low'] },
  { name: 'Light', sides: ['Direct', 'Indirect'] },
];
const HD_ENVIRONMENTS = [
  { name: 'Caves', sides: ['Selective', 'Blending'] },
  { name: 'Markets', sides: ['Internal', 'External'] },
  { name: 'Kitchens', sides: ['Wet', 'Dry'] },
  { name: 'Mountains', sides: ['Active', 'Passive'] },
  { name: 'Valleys', sides: ['Narrow', 'Wide'] },
  { name: 'Shores', sides: ['Natural', 'Artificial'] },
];
const HD_MOTIVATIONS = ['Fear', 'Hope', 'Desire', 'Need', 'Guilt', 'Innocence'];
const HD_PERSPECTIVES = ['Survival', 'Possibility', 'Power', 'Wanting', 'Probability', 'Personal'];
// Tone (1–6) → sense/cognition. The two senses come from the Design side (Sun and
// Node tones), the two cognitions from the Personality side (Sun and Node tones).
const HD_TONE_SENSES = ['Smell', 'Taste', 'Outer Vision', 'Inner Vision', 'Feeling', 'Touch'];
const HD_BASES = ['Movement', 'Evolution', 'Being', 'Design', 'Space'];

// Channels, centers, definition islands, type and authority follow from the set of
// activated gates alone (either side, any person) — shared by a single chart's
// typology and the Pair Explorer's composite.
function hdStructureFromGates(active) {
  const definedChannels = HD_CHANNELS.filter(([a, b]) => active.has(a) && active.has(b));
  const links = new Map();
  const link = (from, to) => {
    if (!links.has(from)) links.set(from, new Set());
    links.get(from).add(to);
  };
  definedChannels.forEach(([a, b]) => {
    link(HD_GATE_CENTER[a], HD_GATE_CENTER[b]);
    link(HD_GATE_CENTER[b], HD_GATE_CENTER[a]);
  });
  const definedCenters = new Set(links.keys());
  const reachableFrom = start => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) links.get(queue.shift())?.forEach(next => { if (!seen.has(next)) { seen.add(next); queue.push(next); } });
    return seen;
  };
  // Definition: how many separate islands the defined centers form.
  const islands = [];
  const assigned = new Set();
  definedCenters.forEach(center => {
    if (assigned.has(center)) return;
    const island = reachableFrom(center);
    island.forEach(member => assigned.add(member));
    islands.push(island);
  });
  const throatIsland = definedCenters.has('throat') ? reachableFrom('throat') : new Set();
  const motorToThroat = [...throatIsland].some(center => HD_MOTOR_CENTERS.has(center));
  const sacral = definedCenters.has('sacral');
  const type = !definedCenters.size ? 'Reflector' : sacral ? (motorToThroat ? 'Manifesting Generator' : 'Generator') : motorToThroat ? 'Manifestor' : 'Projector';

  const authority = definedCenters.has('solar-plexus') ? 'Emotional (Solar Plexus)'
    : sacral ? 'Sacral'
    : definedCenters.has('spleen') ? 'Splenic'
    : definedCenters.has('heart') ? (type === 'Manifestor' ? 'Ego Manifested' : 'Ego Projected')
    : definedCenters.has('g') ? 'Self-Projected'
    : type === 'Reflector' ? 'Lunar'
    : 'Mental (Environmental)';
  return { definedChannels, definedCenters, islands, type, authority, definition: HD_DEFINITION_NAMES[Math.min(islands.length, 4)] };
}

function computeHumanDesignTypology(hd) {
  if (!hd) return null;
  const find = (side, planet) => hd[side].find(influence => influence.planet === planet);
  const ps = find('personality', 'Sun'), pe = find('personality', 'Earth'), pn = find('personality', 'North Node');
  const ds = find('design', 'Sun'), de = find('design', 'Earth'), dn = find('design', 'North Node');
  if ([ps, pe, pn, ds, de, dn].some(influence => !influence || influence.gate == null)) return null;

  const active = new Set([...hd.personality, ...hd.design].filter(influence => influence.gate != null).map(influence => influence.gate));
  const { definedChannels, definedCenters, islands, type, authority } = hdStructureFromGates(active);

  const profile = `${ps.line}/${ds.line}`;
  const angle = ps.line === 4 && ds.line === 1 ? 'Juxtaposition' : ps.line >= 5 ? 'Left Angle' : 'Right Angle';
  const wheelFrom13 = index => (index - HD_GATE_WHEEL.indexOf(13) + HD_GATE_WHEEL.length) % HD_GATE_WHEEL.length;
  const quadrant = HD_QUADRANTS[Math.floor(wheelFrom13(HD_GATE_WHEEL.indexOf(ps.gate)) / 16)];

  const arrow = influence => (influence.tone <= 3 ? 'Left' : 'Right');
  const letter = influence => arrow(influence)[0];
  const side = (table, influence) => table[influence.color - 1].sides[influence.tone <= 3 ? 0 : 1];

  return {
    type,
    ...HD_TYPE_INFO[type],
    authority,
    definition: HD_DEFINITION_NAMES[Math.min(islands.length, 4)],
    definedCenters,
    definedChannels,
    profile,
    profileNames: `${HD_LINE_NAMES[ps.line - 1]} / ${HD_LINE_NAMES[ds.line - 1]}`,
    cross: { angle, gates: `${ps.gate}/${pe.gate}/${ds.gate}/${de.gate}` },
    quadrant,
    variable: {
      notation: `P${letter(ps)}${letter(pn)} D${letter(ds)}${letter(dn)}`,
      digestion: arrow(ds), environment: arrow(dn), motivation: arrow(ps), perspective: arrow(pn),
    },
    phs: {
      digestion: { color: ds.color, name: HD_DIGESTION[ds.color - 1].name, side: side(HD_DIGESTION, ds) },
      environment: { color: dn.color, name: HD_ENVIRONMENTS[dn.color - 1].name, side: side(HD_ENVIRONMENTS, dn) },
      motivation: { color: ps.color, name: HD_MOTIVATIONS[ps.color - 1] },
      perspective: { color: pn.color, name: HD_PERSPECTIVES[pn.color - 1] },
    },
    senses: [
      { source: 'Design Sun', tone: ds.tone, name: HD_TONE_SENSES[ds.tone - 1] },
      { source: 'Design Node', tone: dn.tone, name: HD_TONE_SENSES[dn.tone - 1] },
    ],
    cognitions: [
      { source: 'Personality Sun', tone: ps.tone, name: HD_TONE_SENSES[ps.tone - 1] },
      { source: 'Personality Node', tone: pn.tone, name: HD_TONE_SENSES[pn.tone - 1] },
    ],
  };
}

// ── Pair composite ───────────────────────────────────────────────────────
// Two charts' activations combined. Every channel complete in the composite is one
// of the four classic connection kinds:
//   electromagnetic — each person brings one gate; the channel exists only together
//   companionship   — both people have the whole channel
//   dominance       — one has the whole channel, the other neither gate
//   compromise      — one has the whole channel, the other only one of its gates
function hdActiveGates(chart) {
  const hd = computeHumanDesignChart(chart, 0);
  return new Set([...hd.personality, ...hd.design].filter(influence => influence.gate != null).map(influence => influence.gate));
}
function computeCompositeHumanDesign(chartA, chartB) {
  const gatesA = hdActiveGates(chartA), gatesB = hdActiveGates(chartB);
  const union = new Set([...gatesA, ...gatesB]);
  const structure = hdStructureFromGates(union);
  const own = [hdStructureFromGates(gatesA), hdStructureFromGates(gatesB)];
  const connections = { electromagnetic: [], companionship: [], dominance: [], compromise: [] };
  structure.definedChannels.forEach(([first, second]) => {
    const fullA = gatesA.has(first) && gatesA.has(second), fullB = gatesB.has(first) && gatesB.has(second);
    const channel = { gates: [first, second] };
    if (fullA && fullB) connections.companionship.push(channel);
    else if (fullA || fullB) {
      const owner = fullA ? 'A' : 'B', other = fullA ? gatesB : gatesA;
      const partial = [first, second].filter(gate => other.has(gate));
      connections[partial.length ? 'compromise' : 'dominance'].push({ ...channel, owner, partial });
    } else connections.electromagnetic.push({ ...channel, fromA: [first, second].find(gate => gatesA.has(gate)), fromB: [first, second].find(gate => gatesB.has(gate)) });
  });
  const electromagneticGates = new Set(connections.electromagnetic.flatMap(channel => channel.gates));
  const newlyDefinedCenters = [...structure.definedCenters].filter(center => !own.some(single => single.definedCenters.has(center)));
  return {
    gatesA, gatesB, structure, connections, newlyDefinedCenters,
    // Same shape as computeBodygraphState, so the bodygraph/mandala markup can draw it.
    state: {
      gateSide: gate => {
        const sides = [gatesA.has(gate) && 'person-a', gatesB.has(gate) && 'person-b'].filter(Boolean);
        return sides.length ? sides : null;
      },
      centerDefined: centerId => structure.definedCenters.has(centerId),
      gateHalo: gate => electromagneticGates.has(gate),
      gateTitle: gate => {
        const who = [gatesA.has(gate) && 'Chart A', gatesB.has(gate) && 'Chart B'].filter(Boolean);
        return `Gate ${gate}${who.length ? ` · ${who.join(' + ')}` : ''}${electromagneticGates.has(gate) ? ' · electromagnetic' : ''}`;
      },
    },
  };
}
