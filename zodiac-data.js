// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// The twelve signs for the astrology wheels' sign tooltips (timeline.js,
// zodiacSignTooltipHtml), in zodiac order (index 0 = Aries). Short original summaries of
// commonly held associations; "esoteric" reflects broad spiritual/esoteric-astrology
// themes, and "material" the traditional body areas, metals and worldly domains.
const ZODIAC_SIGN_INFO = [
  {
    symbol: t("The Ram"), modality: t("Cardinal"), ruler: t("Mars"),
    summary: t("The spark that starts the zodiac: raw initiative, courage and the urge to begin."),
    psychological: t("Direct, competitive and impulsive; acts first and reflects later; needs challenge and independence."),
    esoteric: t("The first impulse of will and spirit into form — the pioneer who clears a new path."),
    material: t("Head and face; iron; sport, tools, fire and anything that needs a first push."),
  },
  {
    symbol: t("The Bull"), modality: t("Fixed"), ruler: t("Venus"),
    summary: t("Steadiness and substance: building, keeping and enjoying what is real and lasting."),
    psychological: t("Patient, sensual and loyal; values security and comfort; slow to change once settled."),
    esoteric: t("Illumination through the body and the senses — desire refined into true value."),
    material: t("Throat and neck; copper; land, money, food, possessions and the arts of the senses."),
  },
  {
    symbol: t("The Twins"), modality: t("Mutable"), ruler: t("Mercury"),
    summary: t("Curiosity and connection: gathering, linking and passing on ideas."),
    psychological: t("Quick, witty and adaptable; talkative and restless; easily bored, endlessly interested."),
    esoteric: t("The meeting of opposites — soul and personality learning to speak with each other."),
    material: t("Lungs, arms, hands and nerves; quicksilver; writing, trade, short journeys, siblings."),
  },
  {
    symbol: t("The Crab"), modality: t("Cardinal"), ruler: t("the Moon"),
    summary: t("Belonging and care: home, family, memory and emotional roots."),
    psychological: t("Protective, sensitive and nurturing; guarded outside, tender within; led by feeling."),
    esoteric: t("The gateway into incarnation — the mothering of new life and of the inner self."),
    material: t("Breasts and stomach; silver; the home, land and inheritance, food and the sea."),
  },
  {
    symbol: t("The Lion"), modality: t("Fixed"), ruler: t("the Sun"),
    summary: t("Radiance and self-expression: creativity, heart and the courage to shine."),
    psychological: t("Warm, proud and generous; dramatic and playful; needs recognition and loyalty."),
    esoteric: t("The awakening of the individual self — learning to lead from the heart."),
    material: t("Heart and spine; gold; theatre, children, play, leadership and the arts of display."),
  },
  {
    symbol: t("The Maiden"), modality: t("Mutable"), ruler: t("Mercury"),
    summary: t("Discernment and service: refining, healing and making things work well."),
    psychological: t("Careful, analytical and modest; practical helper; can turn perfectionist or worried."),
    esoteric: t("The soul hidden in matter, slowly gestated — purity reached through daily service."),
    material: t("Digestion and intestines; quicksilver; health, craft, work, routines and the harvest."),
  },
  {
    symbol: t("The Scales"), modality: t("Cardinal"), ruler: t("Venus"),
    summary: t("Balance and relationship: harmony, fairness and seeing through another's eyes."),
    psychological: t("Gracious, diplomatic and sociable; seeks beauty and peace; can hesitate to choose."),
    esoteric: t("The point of balance between spirit and matter — right relationship as a path."),
    material: t("Kidneys and lower back; copper; partnership, law, design, fashion and the arts."),
  },
  {
    symbol: t("The Scorpion (and the Eagle)"), modality: t("Fixed"), ruler: t("Mars, and Pluto"),
    summary: t("Depth and transformation: intimacy, power and what lies beneath the surface."),
    psychological: t("Intense, private and perceptive; passionate and determined; all or nothing."),
    esoteric: t("Trial, death and rebirth — the lower desires faced and turned into strength."),
    material: t("Reproductive and eliminative organs; iron; shared resources, debts, inheritance, research."),
  },
  {
    symbol: t("The Archer"), modality: t("Mutable"), ruler: t("Jupiter"),
    summary: t("Meaning and exploration: faith, wisdom and the long view."),
    psychological: t("Optimistic, frank and freedom-loving; philosophical and adventurous; can overreach."),
    esoteric: t("The arrow of aspiration aimed at a distant goal — the seeker becoming the sage."),
    material: t("Hips and thighs; tin; travel, higher learning, law, religion and publishing."),
  },
  {
    symbol: t("The Sea-Goat"), modality: t("Cardinal"), ruler: t("Saturn"),
    summary: t("Structure and achievement: responsibility, discipline and the climb to mastery."),
    psychological: t("Ambitious, reserved and dependable; strategic and patient; can be austere."),
    esoteric: t("The mountain climbed from the depths to the summit — initiation through effort."),
    material: t("Bones, knees, skin and teeth; lead; government, business, career and public standing."),
  },
  {
    symbol: t("The Water Bearer"), modality: t("Fixed"), ruler: t("Saturn, and Uranus"),
    summary: t("Vision and community: innovation, ideals and the good of the whole."),
    psychological: t("Independent, inventive and humanitarian; friendly yet detached; thinks ahead."),
    esoteric: t("Pouring out the waters of life for all — the individual serving humanity."),
    material: t("Ankles, shins and circulation; lead; technology, science, groups, networks and reform."),
  },
  {
    symbol: t("The Two Fish"), modality: t("Mutable"), ruler: t("Jupiter, and Neptune"),
    summary: t("Compassion and dissolution: imagination, spirituality and oneness."),
    psychological: t("Empathic, dreamy and intuitive; gentle and receptive; can drift or escape."),
    esoteric: t("The return to the source — the soul released from form into unity."),
    material: t("Feet and the lymph; tin; the sea, film, music, healing, charity and retreats."),
  },
];
