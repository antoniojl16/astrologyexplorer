// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// The twelve signs for the astrology wheels' sign tooltips (timeline.js,
// zodiacSignTooltipHtml), in zodiac order (index 0 = Aries). Short original summaries of
// commonly held associations; "esoteric" reflects broad spiritual/esoteric-astrology
// themes, and "material" the traditional body areas, metals and worldly domains.
const ZODIAC_SIGN_INFO = [
  {
    symbol: "The Ram", modality: "Cardinal", ruler: "Mars",
    summary: "The spark that starts the zodiac: raw initiative, courage and the urge to begin.",
    psychological: "Direct, competitive and impulsive; acts first and reflects later; needs challenge and independence.",
    esoteric: "The first impulse of will and spirit into form — the pioneer who clears a new path.",
    material: "Head and face; iron; sport, tools, fire and anything that needs a first push.",
  },
  {
    symbol: "The Bull", modality: "Fixed", ruler: "Venus",
    summary: "Steadiness and substance: building, keeping and enjoying what is real and lasting.",
    psychological: "Patient, sensual and loyal; values security and comfort; slow to change once settled.",
    esoteric: "Illumination through the body and the senses — desire refined into true value.",
    material: "Throat and neck; copper; land, money, food, possessions and the arts of the senses.",
  },
  {
    symbol: "The Twins", modality: "Mutable", ruler: "Mercury",
    summary: "Curiosity and connection: gathering, linking and passing on ideas.",
    psychological: "Quick, witty and adaptable; talkative and restless; easily bored, endlessly interested.",
    esoteric: "The meeting of opposites — soul and personality learning to speak with each other.",
    material: "Lungs, arms, hands and nerves; quicksilver; writing, trade, short journeys, siblings.",
  },
  {
    symbol: "The Crab", modality: "Cardinal", ruler: "the Moon",
    summary: "Belonging and care: home, family, memory and emotional roots.",
    psychological: "Protective, sensitive and nurturing; guarded outside, tender within; led by feeling.",
    esoteric: "The gateway into incarnation — the mothering of new life and of the inner self.",
    material: "Breasts and stomach; silver; the home, land and inheritance, food and the sea.",
  },
  {
    symbol: "The Lion", modality: "Fixed", ruler: "the Sun",
    summary: "Radiance and self-expression: creativity, heart and the courage to shine.",
    psychological: "Warm, proud and generous; dramatic and playful; needs recognition and loyalty.",
    esoteric: "The awakening of the individual self — learning to lead from the heart.",
    material: "Heart and spine; gold; theatre, children, play, leadership and the arts of display.",
  },
  {
    symbol: "The Maiden", modality: "Mutable", ruler: "Mercury",
    summary: "Discernment and service: refining, healing and making things work well.",
    psychological: "Careful, analytical and modest; practical helper; can turn perfectionist or worried.",
    esoteric: "The soul hidden in matter, slowly gestated — purity reached through daily service.",
    material: "Digestion and intestines; quicksilver; health, craft, work, routines and the harvest.",
  },
  {
    symbol: "The Scales", modality: "Cardinal", ruler: "Venus",
    summary: "Balance and relationship: harmony, fairness and seeing through another's eyes.",
    psychological: "Gracious, diplomatic and sociable; seeks beauty and peace; can hesitate to choose.",
    esoteric: "The point of balance between spirit and matter — right relationship as a path.",
    material: "Kidneys and lower back; copper; partnership, law, design, fashion and the arts.",
  },
  {
    symbol: "The Scorpion (and the Eagle)", modality: "Fixed", ruler: "Mars, and Pluto",
    summary: "Depth and transformation: intimacy, power and what lies beneath the surface.",
    psychological: "Intense, private and perceptive; passionate and determined; all or nothing.",
    esoteric: "Trial, death and rebirth — the lower desires faced and turned into strength.",
    material: "Reproductive and eliminative organs; iron; shared resources, debts, inheritance, research.",
  },
  {
    symbol: "The Archer", modality: "Mutable", ruler: "Jupiter",
    summary: "Meaning and exploration: faith, wisdom and the long view.",
    psychological: "Optimistic, frank and freedom-loving; philosophical and adventurous; can overreach.",
    esoteric: "The arrow of aspiration aimed at a distant goal — the seeker becoming the sage.",
    material: "Hips and thighs; tin; travel, higher learning, law, religion and publishing.",
  },
  {
    symbol: "The Sea-Goat", modality: "Cardinal", ruler: "Saturn",
    summary: "Structure and achievement: responsibility, discipline and the climb to mastery.",
    psychological: "Ambitious, reserved and dependable; strategic and patient; can be austere.",
    esoteric: "The mountain climbed from the depths to the summit — initiation through effort.",
    material: "Bones, knees, skin and teeth; lead; government, business, career and public standing.",
  },
  {
    symbol: "The Water Bearer", modality: "Fixed", ruler: "Saturn, and Uranus",
    summary: "Vision and community: innovation, ideals and the good of the whole.",
    psychological: "Independent, inventive and humanitarian; friendly yet detached; thinks ahead.",
    esoteric: "Pouring out the waters of life for all — the individual serving humanity.",
    material: "Ankles, shins and circulation; lead; technology, science, groups, networks and reform.",
  },
  {
    symbol: "The Two Fish", modality: "Mutable", ruler: "Jupiter, and Neptune",
    summary: "Compassion and dissolution: imagination, spirituality and oneness.",
    psychological: "Empathic, dreamy and intuitive; gentle and receptive; can drift or escape.",
    esoteric: "The return to the source — the soul released from form into unity.",
    material: "Feet and the lymph; tin; the sea, film, music, healing, charity and retreats.",
  },
];
