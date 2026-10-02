// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Gene Keys reference text for the sphere tooltips (systems.js, geneKeysTooltipHtml).
// The Shadow / Gift / Siddhi names are the Gene Keys' own; every description here is
// an original short summary, not quoted from the Gene Keys books.

// The 64 Gene Keys: Shadow → Gift → Siddhi, and what each is about.
const GENE_KEYS = {
  1: { shadow: t("Entropy"), gift: t("Freshness"), siddhi: t("Beauty"), summary: t("Creative spirit: energy goes flat when it's forced into routine, and turns fresh and original when you follow your own mood and timing.") },
  2: { shadow: t("Dislocation"), gift: t("Orientation"), siddhi: t("Unity"), summary: t("The inner compass: feeling lost or out of place gives way to trusting the direction life is already taking you.") },
  3: { shadow: t("Chaos"), gift: t("Innovation"), siddhi: t("Innocence"), summary: t("Meeting change: what feels like chaos becomes the raw material for innovation once you stop resisting it.") },
  4: { shadow: t("Intolerance"), gift: t("Understanding"), siddhi: t("Forgiveness"), summary: t("The mind's need for answers: rigid certainty relaxes into understanding that holds many viewpoints at once.") },
  5: { shadow: t("Impatience"), gift: t("Patience"), siddhi: t("Timelessness"), summary: t("Rhythm and timing: trusting natural cycles instead of pushing replaces impatience with a calm, patient flow.") },
  6: { shadow: t("Conflict"), gift: t("Diplomacy"), siddhi: t("Peace"), summary: t("Emotional boundaries: friction between people turns into diplomacy when feelings are allowed to settle before acting.") },
  7: { shadow: t("Division"), gift: t("Guidance"), siddhi: t("Virtue"), summary: t("Leadership: taking sides divides people; guiding by example and serving the whole brings them together.") },
  8: { shadow: t("Mediocrity"), gift: t("Style"), siddhi: t("Exquisiteness"), summary: t("Individual expression: conforming dulls you, while daring to be yourself gives rise to a style that's unmistakably yours.") },
  9: { shadow: t("Inertia"), gift: t("Determination"), siddhi: t("Invincibility"), summary: t("The power of small things: steady attention to details turns stuck energy into quiet, unstoppable determination.") },
  10: { shadow: t("Self-Obsession"), gift: t("Naturalness"), siddhi: t("Being"), summary: t("Self-love: worrying about how you come across gives way to simply being natural.") },
  11: { shadow: t("Obscurity"), gift: t("Idealism"), siddhi: t("Light"), summary: t("Ideas and dreams: images that cloud the mind become inspiring ideals when they're shared and lived.") },
  12: { shadow: t("Vanity"), gift: t("Discrimination"), siddhi: t("Purity"), summary: t("The voice of the heart: speaking to be admired gives way to choosing words with care and feeling.") },
  13: { shadow: t("Discord"), gift: t("Discernment"), siddhi: t("Empathy"), summary: t("Listening: tuning into others' stories without getting lost in them turns discord into discernment.") },
  14: { shadow: t("Compromise"), gift: t("Competence"), siddhi: t("Bounteousness"), summary: t("Work and resources: energy put into what you love grows into competence and abundance rather than compromise.") },
  15: { shadow: t("Dullness"), gift: t("Magnetism"), siddhi: t("Florescence"), summary: t("Flow and extremes: embracing life's highs and lows, rather than flattening them, makes you naturally magnetic.") },
  16: { shadow: t("Indifference"), gift: t("Versatility"), siddhi: t("Mastery"), summary: t("Skill: genuine enthusiasm turns half-hearted practice into versatility and, over time, mastery.") },
  17: { shadow: t("Opinion"), gift: t("Far-Sightedness"), siddhi: t("Omniscience"), summary: t("Perspective: holding fixed opinions narrows the view; stepping back reveals the long-range pattern.") },
  18: { shadow: t("Judgement"), gift: t("Integrity"), siddhi: t("Perfection"), summary: t("Improvement: the urge to correct becomes integrity when it starts with yourself instead of criticising others.") },
  19: { shadow: t("Co-Dependence"), gift: t("Sensitivity"), siddhi: t("Sacrifice"), summary: t("Needs and belonging: depending on others' approval becomes a fine sensitivity to what people truly need.") },
  20: { shadow: t("Superficiality"), gift: t("Self-Assurance"), siddhi: t("Presence"), summary: t("The present moment: acting from the surface gives way to a quiet self-assurance rooted in the now.") },
  21: { shadow: t("Control"), gift: t("Authority"), siddhi: t("Valour"), summary: t("Control: gripping tightly out of fear becomes natural authority that others trust.") },
  22: { shadow: t("Dishonour"), gift: t("Graciousness"), siddhi: t("Grace"), summary: t("Openness: letting emotions move through you gracefully turns hurt and dishonour into grace.") },
  23: { shadow: t("Complexity"), gift: t("Simplicity"), siddhi: t("Quintessence"), summary: t("Communication: over-explaining gives way to saying the simple essence of things.") },
  24: { shadow: t("Addiction"), gift: t("Invention"), siddhi: t("Silence"), summary: t("The thinking mind: repetitive loops of thought turn into genuine invention when the mind is allowed to rest.") },
  25: { shadow: t("Constriction"), gift: t("Acceptance"), siddhi: t("Universal Love"), summary: t("The wounded heart: closing down to avoid pain gives way to accepting life as it is.") },
  26: { shadow: t("Pride"), gift: t("Artfulness"), siddhi: t("Invisibility"), summary: t("Influence: pushing yourself forward becomes the art of persuading with humour, honesty and skill.") },
  27: { shadow: t("Selfishness"), gift: t("Altruism"), siddhi: t("Selflessness"), summary: t("Care: looking after yourself and others in balance turns selfishness into genuine altruism.") },
  28: { shadow: t("Purposelessness"), gift: t("Totality"), siddhi: t("Immortality"), summary: t("Meaning: facing the fear of a meaningless life leads to throwing yourself into it wholeheartedly.") },
  29: { shadow: t("Half-Heartedness"), gift: t("Commitment"), siddhi: t("Devotion"), summary: t("Saying yes: committing fully to what you truly say yes to turns half-heartedness into devotion.") },
  30: { shadow: t("Desire"), gift: t("Lightness"), siddhi: t("Rapture"), summary: t("Feeling: burning desire becomes lightness when you enjoy the longing without needing it fulfilled.") },
  31: { shadow: t("Arrogance"), gift: t("Leadership"), siddhi: t("Humility"), summary: t("Voice and influence: leading from arrogance divides; leading by listening earns people's trust.") },
  32: { shadow: t("Failure"), gift: t("Preservation"), siddhi: t("Veneration"), summary: t("Continuity: the fear of failing gives way to preserving what's truly worth keeping over time.") },
  33: { shadow: t("Forgetting"), gift: t("Mindfulness"), siddhi: t("Revelation"), summary: t("Memory: stepping back to reflect turns forgotten lessons into mindful understanding.") },
  34: { shadow: t("Force"), gift: t("Strength"), siddhi: t("Majesty"), summary: t("Power: pushing by force gives way to a natural strength that simply acts when the moment is right.") },
  35: { shadow: t("Hunger"), gift: t("Adventure"), siddhi: t("Boundlessness"), summary: t("Experience: the restless hunger for more becomes a spirit of adventure that savours each experience.") },
  36: { shadow: t("Turbulence"), gift: t("Humanity"), siddhi: t("Compassion"), summary: t("Emotional growth: living through emotional turbulence opens a deep sense of shared humanity.") },
  37: { shadow: t("Weakness"), gift: t("Equality"), siddhi: t("Tenderness"), summary: t("Family and community: relationships built on fair give-and-take turn weakness into equality.") },
  38: { shadow: t("Struggle"), gift: t("Perseverance"), siddhi: t("Honour"), summary: t("Meaningful struggle: fighting against life becomes perseverance for what truly matters.") },
  39: { shadow: t("Provocation"), gift: t("Dynamism"), siddhi: t("Liberation"), summary: t("Energy: provoking and being provoked turns into dynamism that frees up stuck energy in others.") },
  40: { shadow: t("Exhaustion"), gift: t("Resolve"), siddhi: t("Divine Will"), summary: t("Willpower: honouring the need to rest and be alone turns exhaustion into steady resolve.") },
  41: { shadow: t("Fantasy"), gift: t("Anticipation"), siddhi: t("Emanation"), summary: t("New beginnings: escaping into fantasy gives way to anticipating what's truly about to begin.") },
  42: { shadow: t("Expectation"), gift: t("Detachment"), siddhi: t("Celebration"), summary: t("Cycles: letting go of expectations about how things should end brings detachment and joy.") },
  43: { shadow: t("Deafness"), gift: t("Insight"), siddhi: t("Epiphany"), summary: t("Breakthrough: tuning out your inner knowing gives way to sudden, original insight.") },
  44: { shadow: t("Interference"), gift: t("Teamwork"), siddhi: t("Synarchy"), summary: t("Collaboration: reading people and patterns well turns interference into effortless teamwork.") },
  45: { shadow: t("Dominance"), gift: t("Synergy"), siddhi: t("Communion"), summary: t("Community and resources: controlling others gives way to synergy, where everyone's contribution counts.") },
  46: { shadow: t("Seriousness"), gift: t("Delight"), siddhi: t("Ecstasy"), summary: t("The body: taking life too seriously gives way to delight in simply being embodied.") },
  47: { shadow: t("Oppression"), gift: t("Transmutation"), siddhi: t("Transfiguration"), summary: t("Mental pressure: the weight of the past, once accepted, transmutes into new understanding.") },
  48: { shadow: t("Inadequacy"), gift: t("Resourcefulness"), siddhi: t("Wisdom"), summary: t("Depth: the fear of not knowing enough becomes resourcefulness that meets life as it comes.") },
  49: { shadow: t("Reaction"), gift: t("Revolution"), siddhi: t("Rebirth"), summary: t("Change: emotional reactions turn into principled revolution that transforms how people live together.") },
  50: { shadow: t("Corruption"), gift: t("Equilibrium"), siddhi: t("Harmony"), summary: t("Values: compromising your values gives way to balance and sound judgement in groups.") },
  51: { shadow: t("Agitation"), gift: t("Initiative"), siddhi: t("Awakening"), summary: t("Shock: the jolt of the unexpected becomes the initiative to start something new.") },
  52: { shadow: t("Stress"), gift: t("Restraint"), siddhi: t("Stillness"), summary: t("Stillness: restless stress gives way to a focused restraint that waits for the right moment.") },
  53: { shadow: t("Immaturity"), gift: t("Expansion"), siddhi: t("Superabundance"), summary: t("Beginnings: rushing into new starts gives way to growth that unfolds in natural stages.") },
  54: { shadow: t("Greed"), gift: t("Aspiration"), siddhi: t("Ascension"), summary: t("Ambition: grasping for more becomes aspiration that lifts yourself and others.") },
  55: { shadow: t("Victimisation"), gift: t("Freedom"), siddhi: t("Freedom"), summary: t("Emotional freedom: blaming life for how you feel gives way to the freedom of accepting every mood.") },
  56: { shadow: t("Distraction"), gift: t("Enrichment"), siddhi: t("Intoxication"), summary: t("Storytelling: seeking stimulation to avoid pain becomes stories and experiences that enrich others.") },
  57: { shadow: t("Unease"), gift: t("Intuition"), siddhi: t("Clarity"), summary: t("Intuition: underlying fear and unease give way to trusting a clear inner knowing in the moment.") },
  58: { shadow: t("Dissatisfaction"), gift: t("Vitality"), siddhi: t("Bliss"), summary: t("Joy: the drive to improve things turns from dissatisfaction into the vitality of serving life.") },
  59: { shadow: t("Dishonesty"), gift: t("Intimacy"), siddhi: t("Transparency"), summary: t("Intimacy: hidden agendas give way to openness that lets real closeness grow.") },
  60: { shadow: t("Limitation"), gift: t("Realism"), siddhi: t("Justice"), summary: t("Limits: working within real constraints, rather than fighting them, becomes grounded realism.") },
  61: { shadow: t("Psychosis"), gift: t("Inspiration"), siddhi: t("Sanctity"), summary: t("Inner truth: the pressure to know the unknowable relaxes into genuine inspiration.") },
  62: { shadow: t("Intellect"), gift: t("Precision"), siddhi: t("Impeccability"), summary: t("Language: using the intellect to categorise everything gives way to precise, meaningful expression.") },
  63: { shadow: t("Doubt"), gift: t("Inquiry"), siddhi: t("Truth"), summary: t("Questioning: anxious doubt turns into an open, curious inquiry into what's really true.") },
  64: { shadow: t("Confusion"), gift: t("Imagination"), siddhi: t("Illumination"), summary: t("Imagination: the mind's confusion becomes a rich imagination when you stop trying to resolve it.") },
};

// Each sphere: what it represents, and a short phrase for it used in the line meanings.
const GENE_KEYS_SPHERE_INFO = {
  lifeswork: { summary: t("Your core purpose in the world: the gift you're here to express through your work and way of life."), focus: t("your life's work") },
  evolution: { summary: t("Your core challenge: the pattern that keeps pushing you to grow, and the gift hidden inside it."), focus: t("your core challenge") },
  radiance: { summary: t("Your health and vitality: what keeps you well and lets you shine."), focus: t("your health and radiance") },
  purpose: { summary: t("Your deepest purpose: what grounds and centres you, and gives your life meaning."), focus: t("your deepest purpose") },
  attraction: { summary: t("What you draw into your life: the kind of relationships and partners your nature attracts."), focus: t("the relationships you attract") },
  iq: { summary: t("Your mental intelligence: how your mind works at its best, and the fear that can cloud it."), focus: t("your mental intelligence") },
  eq: { summary: t("Your emotional intelligence: how you meet others and handle feelings in relationship."), focus: t("your emotional intelligence") },
  sq: { summary: t("Your spiritual intelligence: the love that opens once the heart's old wounds are healed."), focus: t("your spiritual intelligence") },
  vocation: { summary: t("Your natural calling: where your gifts meet the world, and the pattern that can block them."), focus: t("your vocation") },
  culture: { summary: t("The groups and culture you're drawn to, and the role you play within them."), focus: t("your role in groups") },
  pearl: { summary: t("Your prosperity: how you create lasting wealth by serving something larger than yourself."), focus: t("your prosperity") },
  brand: { summary: t("How the world recognises you: the essence your life's work carries out into the world."), focus: t("your brand") },
  creativity: { summary: t("Your creative genius: how new things come through you."), focus: t("your creativity") },
  relating: { summary: t("How you relate: the way you communicate and share yourself with others."), focus: t("the way you relate") },
  stability: { summary: t("What gives your work and prosperity a lasting, stable foundation."), focus: t("your stability") },
};

// The six lines in general, applied to a sphere's focus phrase.
const GENE_KEYS_LINES = {
  1: { name: t("Foundation"), meaning: (focus) => t("Line 1 grounds {focus} in study and a secure foundation; it thrives on knowing how things really work.", { focus }) },
  2: { name: t("Natural"), meaning: (focus) => t("Line 2 carries {focus} as a natural, often unconscious talent that shines when others call it out.", { focus }) },
  3: { name: t("Experiment"), meaning: (focus) => t("Line 3 develops {focus} through trial and error; what fails teaches as much as what works.", { focus }) },
  4: { name: t("Network"), meaning: (focus) => t("Line 4 unfolds {focus} among the people around it; its opportunities come through relationships and community.", { focus }) },
  5: { name: t("Influence"), meaning: (focus) => t("Line 5 projects {focus} outward: others look to it for practical solutions, so its reputation matters.", { focus }) },
  6: { name: t("Role Model"), meaning: (focus) => t("Line 6 lives {focus} as an example to others, maturing over a lifetime into a role model.", { focus }) },
};

// Each gate's own name for each of its lines (384 in all), keyed "gate.line", e.g.
// "55.1": "Sharing". When a name is listed here, the tooltip shows it in place of the
// general line name above.
const GENE_KEYS_LINE_NAMES = {};
