// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Readings for the Astrocartography saved locations' hover tooltips (acgLineTipHtml and
// friends, astrocartography.js): what each angle does, and what each planet's line
// means on each angle and as a Local Space direction. Traditional astrocartography
// interpretations, written for this app.

const ACG_ANGLE_MEANINGS = {
  ASC: { name: "Rising line (AS)", text: "The planet was rising on the eastern horizon here. It colours your personality, body and energy, and how others first see you." },
  DSC: { name: "Setting line (DS)", text: "The planet was setting on the western horizon here. It comes to you through partners, close relationships, clients and open rivals." },
  MC: { name: "Culminating line (MC)", text: "The planet was at its highest point, over the meridian, here. It shapes career, reputation, public life and ambitions." },
  IC: { name: "Anti-culminating line (IC)", text: "The planet was directly below your feet here. It works through home, family, roots, property and private life." },
};

// keyword: the planet's themes in a phrase; ASC/DSC/MC/IC: its line on each angle;
// localSpace: its Local Space direction.
const ACG_BODY_MEANINGS = {
  Sun: {
    keyword: "identity, vitality and recognition",
    ASC: "You shine and are seen here: more confidence, vitality and a clearer sense of who you are. Good for self-expression and leadership; watch for ego clashes.",
    DSC: "Others bring out your light: partnerships with strong, prominent people, and relationships that clarify who you are. You may hand the spotlight to others.",
    MC: "Visibility and recognition: a classic line for career, reputation and leadership, where your work gets noticed and authority comes naturally.",
    IC: "A sense of home and personal foundation: roots, family and inner confidence grow here. More private fulfilment than public fame.",
    localSpace: "the direction of vitality, purpose and self-expression, good for anything that puts you in the light",
  },
  Moon: {
    keyword: "feelings, home and belonging",
    ASC: "Feelings are on the surface: sensitivity, intuition and empathy rise, and people respond to your moods. Nurturing, but emotionally changeable.",
    DSC: "Emotional bonds and caring partnerships. You attract nurturing people, or people who need care; relationships feel like family, sometimes dependent.",
    MC: "A public connection through care. Work with the public, food, home or caregiving does well here; reputation rises and falls with the public mood.",
    IC: "One of the strongest \"feels like home\" lines: belonging, family, domestic comfort and emotional safety, along with old memories and moods.",
    localSpace: "the direction of comfort, home and emotional nourishment: a place to rest, nest or reconnect with family",
  },
  Mercury: {
    keyword: "mind, communication and learning",
    ASC: "A quicker, curious and talkative you: learning, networking, writing and trade come easily, along with restlessness and nervous energy.",
    DSC: "Stimulating conversations and partners of ideas. Good for contracts, negotiation, agents and intellectual collaboration.",
    MC: "A career through communication: writing, teaching, media, commerce and travel. Your ideas carry public weight.",
    IC: "A busy, studious home life: reading, writing and thinking at home, frequent moves, and siblings or neighbours in the foreground.",
    localSpace: "the direction for study, communication, trade and short journeys (where to put the desk)",
  },
  Venus: {
    keyword: "love, beauty and pleasure",
    ASC: "Charm and attractiveness increase. You feel graceful, sociable and at ease, with a taste for comfort and art; indulgence is the flip side.",
    DSC: "A classic love line: romance, marriage and harmonious partnerships, plus good business alliances. People come to you.",
    MC: "Popularity and a pleasing public image. Success in the arts, beauty, design, diplomacy or hospitality, and money can follow.",
    IC: "A beautiful, peaceful home and domestic happiness: ideal for settling down, making a nest and family harmony.",
    localSpace: "the direction of love, beauty, money and pleasure, good for social life, art and shopping",
  },
  Mars: {
    keyword: "drive, courage and conflict",
    ASC: "Energy, courage and assertiveness surge. Good for sport, initiative and fighting for goals, but also impatience, accidents and aggression.",
    DSC: "Passionate or combative relationships: strong attraction, competition and open rivals. Energising in partnership if disputes are handled well.",
    MC: "Ambition and drive in career: leadership, entrepreneurship, the military, sport or surgery. Hard work pays, but clashes with authority can flare.",
    IC: "Energy at home: renovation, activity and independence, but also domestic arguments and restlessness. Not the calmest place to settle.",
    localSpace: "the direction of energy, action and conflict: use it for exercise and ventures, avoid it for rest",
  },
  Jupiter: {
    keyword: "growth, luck and meaning",
    ASC: "Optimism, generosity and good fortune. You feel expansive, welcome and confident; opportunities multiply, and so can excess.",
    DSC: "Helpful partners and protectors: generous, wise or foreign people support you. Good for marriage, business partnerships and legal matters.",
    MC: "Career growth and recognition: promotion and success in law, teaching, publishing or travel. One of the most sought-after lines.",
    IC: "An abundant home and inner contentment: a large or happy household, property gains, and a sense of spiritual rootedness.",
    localSpace: "the direction of luck, growth and wisdom, well suited to study, travel and new opportunities",
  },
  Saturn: {
    keyword: "structure, discipline and time",
    ASC: "Seriousness and responsibility. You may feel heavier, older or more tested, but you gain discipline, maturity and lasting achievement.",
    DSC: "Committed but demanding relationships: older or authoritative partners, duty and slowly built loyalty. Can feel lonely or restrictive.",
    MC: "Hard-earned career authority: slow progress and heavy responsibility, leading in the end to solid, respected status. Expect pressure from bosses and institutions.",
    IC: "Duties at home and in the family: building lasting foundations, property or tradition, though home can feel cold, burdensome or isolating.",
    localSpace: "the direction of work, duty and endurance, good for focused effort and less so for leisure",
  },
  Uranus: {
    keyword: "change, freedom and surprise",
    ASC: "Awakening and independence. You feel freer, more original and less predictable; sudden changes and breakthroughs make it hard to stay settled.",
    DSC: "Unconventional, exciting but unstable relationships: sudden meetings and partings, and a need for space within a partnership.",
    MC: "Innovative career paths in technology, science, astrology or reform. Expect sudden changes of direction and a reputation as a maverick.",
    IC: "An unsettled or unusual home life: frequent moves, unconventional households, and freedom from family patterns.",
    localSpace: "the direction of change, innovation and the unexpected, where breakthroughs come from",
  },
  Neptune: {
    keyword: "imagination, spirit and dissolving boundaries",
    ASC: "Heightened sensitivity, imagination and spirituality. Glamour and inspiration come with confusion, escapism and weak boundaries.",
    DSC: "Idealised, romantic or spiritual partnerships. Compassion flows, but so can deception and disillusion; choose partners with open eyes.",
    MC: "A career in art, music, film, healing or spirituality, with a glamorous or vague public image. Scandal and unclear goals are the risks.",
    IC: "A dreamy, spiritual home suited to water, retreat or meditation. Family matters can be foggy, and home can become an escape.",
    localSpace: "the direction of dreams, spirituality and retreat: inspiring, but easy to lose clarity in",
  },
  Pluto: {
    keyword: "power, depth and transformation",
    ASC: "Intense personal transformation: magnetism, psychological power and rebirth, sometimes through crisis. Not a light or easy line.",
    DSC: "Intense, transforming relationships: deep bonds, power struggles and obsession. Partners change you profoundly.",
    MC: "Power and influence in career, in research, psychology, finance or politics. Expect profound professional reinventions and power dynamics.",
    IC: "Deep roots and family transformation: uncovering family secrets, healing ancestry and inner rebirth. Home life can be intense.",
    localSpace: "the direction of transformation, power and depth: intense, and best approached deliberately",
  },
  Chiron: {
    keyword: "wounds, healing and teaching",
    ASC: "Old wounds about the self and the body surface here so they can heal, and you may become a healer or mentor to others through them.",
    DSC: "Relationships that touch old hurts and help heal them: partners as healers or patients, mentors or students.",
    MC: "A career in healing, teaching or guidance: a public role that draws on your own wounds and hard-won wisdom.",
    IC: "Family and ancestral wounds come up for healing, and home can become a place of recovery and inner work.",
    localSpace: "the direction of healing and mentorship, where old hurts can be tended",
  },
  "North Node": {
    keyword: "growth, purpose and destiny",
    ASC: "Growth through personal initiative: a place that pushes you toward your life's direction and brings fated encounters.",
    DSC: "Fated meetings and significant partnerships that help you grow toward your purpose.",
    MC: "Your path and calling come into view here, with career moves that feel destined and publicly meaningful.",
    IC: "Finding your roots in a new way: home and family choices that move your development forward.",
    localSpace: "the direction of growth and destiny: unfamiliar, but it develops you",
  },
  "South Node": {
    keyword: "the familiar, the past and letting go",
    ASC: "Old habits and familiar talents come easily here, but so does stagnation. It's a comfortable place that may not challenge you.",
    DSC: "Karmic, familiar-feeling relationships: instant recognition, old patterns, and lessons in letting go.",
    MC: "Using skills you already have in public life. Recognition comes for past strengths more than for new growth.",
    IC: "A sense of déjà vu and ancestral comfort. Home may bring back the past, for better or worse.",
    localSpace: "the direction of the familiar and the past: comforting, but more for release than for growth",
  },
};

// How strongly a line is felt at a distance (km): the traditional orb is widest at
// about 1,000 km, and strongest within a degree or two (100–200 km).
const ACG_STRENGTH_BANDS = [
  { km: 200, label: "Strong", text: "Well within the line's orb, where it's felt most directly." },
  { km: 500, label: "Clear", text: "Inside the line's orb: its themes are clearly present." },
  { km: 1000, label: "Mild", text: "At the edge of the line's orb: a background influence." },
  { km: Infinity, label: "Faint", text: "Beyond the usual orb: little direct influence, shown for reference." },
];
