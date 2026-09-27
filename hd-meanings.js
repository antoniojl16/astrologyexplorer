// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Short explanations for the Human Design typology tooltips (Chart Snapshot, the Pair
// Explorer's comparison table) and the expandable channel lists (hdTypologyTipHtml and
// hdChannelListMarkup, systems.js). Traditional Human Design meanings, written for this app.

// What each feature is: shown first in every tooltip.
const HD_FEATURE_MEANINGS = {
  type: { label: "Type", text: "The basic way your energy works and meets the world, set by which centers are defined and how they connect to the Throat." },
  aura: { label: "Aura", text: "How your energy field reaches and affects other people before any words are spoken." },
  strategy: { label: "Strategy", text: "The practical way for your Type to engage with life so that decisions and opportunities come with less resistance." },
  authority: { label: "Inner authority", text: "Where in your body reliable decisions come from. It's the voice to trust over the mind when following your strategy." },
  definition: { label: "Definition", text: "How your defined centers link up: one connected whole, or separate groups that other people or time help to bridge." },
  profile: { label: "Profile", text: "Your personal role or costume: the lines of the Personality Sun (conscious) and Design Sun (unconscious), which colour how you learn and relate." },
};

const HD_TYPE_MEANINGS = {
  Manifestor: "An initiator with a motor connected to the Throat. You can start things on your own and have an impact; informing others first eases the resistance you meet.",
  Generator: "Sustainable life-force energy from a defined Sacral. You are built to master work you love, and the right things come to you as something to respond to.",
  "Manifesting Generator": "Sacral energy with a quick, direct path to action. Multi-passionate and fast, you respond first, then inform, and often skip steps others need.",
  Projector: "No defined Sacral, with a gift for seeing and guiding others and systems. Your energy works best when you are recognised and invited.",
  Reflector: "No defined centers: a mirror of your community's health. You sample everyone's energy, and clarity comes over the full cycle of the Moon.",
};
const HD_AURA_MEANINGS = {
  Manifestor: "Closed and repelling: it protects your independence and makes an impact, which can feel unpredictable to others unless you inform them.",
  Generator: "Open and enveloping: it draws life in and makes you approachable, so there is always plenty to respond to.",
  "Manifesting Generator": "Open and enveloping: it draws life in and makes you approachable, so there is always plenty to respond to.",
  Projector: "Focused and absorbing: it reaches deeply into one person at a time, which is how you see others so clearly.",
  Reflector: "Resistant and sampling: it takes in and reflects the energy around you without being taken over by it.",
};
const HD_STRATEGY_MEANINGS = {
  Manifestor: "To inform: tell the people affected before you act. It doesn't ask permission; it removes resistance and keeps the peace.",
  Generator: "Wait to respond: let life bring something to you, then notice your Sacral's gut \"uh-huh\" or \"un-un\" before committing.",
  "Manifesting Generator": "Wait to respond, then inform: follow the gut response, and tell others before you move, so your speed doesn't leave them behind.",
  Projector: "Wait for the invitation: for the big things in life (work, love, where to live), let others recognise you and invite your guidance.",
  Reflector: "Wait a lunar cycle: give major decisions about 28 days, talking them over, so you can feel them from every angle.",
};
const HD_AUTHORITY_MEANINGS = {
  "Emotional (Solar Plexus)": "Emotional authority: there's no truth in the now. Ride your emotional wave and wait for calm clarity before deciding.",
  Sacral: "Sacral authority: a spontaneous gut response in the moment, heard as sounds or a felt yes or no. Trust it over the reasons of the mind.",
  Splenic: "Splenic authority: a quiet, instant intuitive knowing that speaks once, in the moment. It's about health and safety, and doesn't repeat itself.",
  "Ego Manifested": "Ego authority (Manifested): what you say spontaneously reveals what your heart wants. Listen to your own words and willpower.",
  "Ego Projected": "Ego authority (Projected): the heart's desire, recognised when you're invited and hear yourself say what you truly want.",
  "Self-Projected": "Self-projected authority: talk it through and listen to your own voice. Your identity knows the right direction when it hears itself.",
  "Mental (Environmental)": "Mental or environmental authority: no inner authority. Clarity comes from being in the right place and talking things through with trusted people.",
  Lunar: "Lunar authority: wait through the Moon's full cycle, noticing how a decision feels as the Moon moves through all 64 gates.",
};
const HD_DEFINITION_MEANINGS = {
  None: "No definition: every center is open. You take in and reflect your surroundings, and have no fixed way of processing.",
  "Single Definition": "All defined centers connect in one flow. You process independently and feel complete on your own.",
  "Split Definition": "Two separate areas of definition. You tend to look for people who bridge the gap, and processing can take a little longer.",
  "Triple Split Definition": "Three separate areas. You process best when moving between different people and settings, like in public places.",
  "Quadruple Split Definition": "Four separate areas, which is rare. You process slowly and steadily, and need time and many connections to feel whole.",
};
const HD_LINE_MEANINGS = [
  "Investigator: needs a solid foundation of knowledge to feel secure.",
  "Hermit: natural gifts that others call out; needs time alone.",
  "Martyr: learns by trial and error, discovering what doesn't work.",
  "Opportunist: works through a network of friends; warmth and influence.",
  "Heretic: others project expectations onto you; practical solutions in a crisis.",
  "Role Model: lives in three stages, from experience to observation to embodied wisdom.",
];

// The 36 channels: a short description of each one's energy, keyed "lowerGate-higherGate".
const HD_CHANNEL_MEANINGS = {
  "1-8": "Creative role modelling: the drive to express your unique self and contribute it to others, setting an example by simply being yourself.",
  "2-14": "The keeper of the keys: a sense of direction joined with power resources. Energy and money follow when you move in your own true direction.",
  "3-60": "Mutation: energy that pulses on and off. Accepting limits and waiting for the right moment brings genuine innovation and change.",
  "4-63": "Logic: doubt that searches for patterns and answers. A mind that questions, tests and finds formulas that make the future safer.",
  "5-15": "Rhythm: being in the flow of your own natural timing, with habits that matter, while accepting the extremes of other people's rhythms.",
  "6-59": "Mating and intimacy: energy that breaks down barriers between people, for bonding, reproduction and creative collaboration.",
  "7-31": "The Alpha: democratic leadership. A voice for the direction of the future, which works best when elected or recognised by others.",
  "9-52": "Concentration: focused, determined energy that can stay with detail for a long time. Stillness put to use.",
  "10-20": "Awakening: commitment to higher principles, expressed in the now. Being yourself and speaking your truth in the present moment.",
  "10-34": "Exploration: following your own convictions with great personal power; empowered individuality that sets its own course.",
  "10-57": "Perfected form: intuitive self-love and the survival instinct working together, for a clear sense of what's healthy for you.",
  "11-56": "Curiosity: a searcher who gathers ideas and experiences and turns them into stories that stimulate and teach others.",
  "12-22": "Openness: a social being whose grace and emotional expression depend on mood; words with the power to touch and change others.",
  "13-33": "The Prodigal: a witness who gathers experiences and secrets, then retreats to reflect and shares the lessons learned.",
  "16-48": "The Wavelength: talent deepened through repetition and practice, until skill becomes mastery.",
  "17-62": "Acceptance: an organising mind that forms opinions and backs them with detail and structure.",
  "18-58": "Judgment: the insatiable drive to correct and perfect, fuelled by joy in making things better.",
  "19-49": "Synthesis: sensitivity to needs and principles, making bonds, agreements and communities that care for everyone in them.",
  "20-34": "Charisma: busy, powerful energy that turns thoughts into deeds instantly, as long as it responds rather than initiates.",
  "20-57": "The Brainwave: penetrating intuitive awareness in the moment; the ear that hears what's needed right now.",
  "21-45": "Money: the material world, managing resources and taking control of how things are run, with a talent for business.",
  "23-43": "Structuring: individual insights that can sound like genius or nonsense; the skill is in timing and explaining them.",
  "24-61": "Awareness: a thinker who contemplates the mysteries, working through inner questions until they turn into inspiration.",
  "25-51": "Initiation: the courage to be first and to leap into the unknown, with shocks that awaken love and spirit.",
  "26-44": "Surrender: a transmitter who learns from the past and sells, persuades and passes on what serves the group.",
  "27-50": "Preservation: custodianship and care, the values and nourishment that keep family and community alive.",
  "28-38": "Struggle: stubborn perseverance that finds meaning in life by fighting for what's worth it.",
  "29-46": "Discovery: succeeding where others fail by fully committing to an experience and seeing it through to the end.",
  "30-41": "Recognition: the desire for new experiences, starting with fantasy and feeling. A fuel that has to be focused.",
  "32-54": "Transformation: ambition and drive to rise, recognised by others who see your potential and help it along.",
  "34-57": "Power: pure survival power with instant, intuitive response. It keeps the body safe and effective.",
  "35-36": "Transitoriness: a jack of all trades, hungry for new experiences and emotional depth, gaining wisdom by living through things.",
  "37-40": "Community: the bargain that holds a group together, with support given and received, and friendship, work and rest in fair measure.",
  "39-55": "Emoting: moods that come and go, provoking spirit and creativity in yourself and others.",
  "42-53": "Maturation: the energy to begin cycles and see them through, growing through each completed experience.",
  "47-64": "Abstraction: a mind that makes sense of the past by sifting images and memories until clarity comes on its own.",
};
