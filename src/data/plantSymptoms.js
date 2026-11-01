// Curated, free symptom checker. Plain-language guidance summarised from
// UC IPM Pest Notes, Calscape and CNPS. No AI, no network calls.
// `lowWater: true` on a cause flags it as "most likely" for Very low / Low water plants.

const IPM = (slug) => `https://ipm.ucanr.edu/home-and-landscape/${slug}/`;

export const EXPERT_LINKS = {
  diagnostic: 'https://ipm.ucanr.edu/home-and-landscape/plant-problem-diagnostic-tool/',
  masterGardeners: 'https://ipm.ucanr.edu/home-and-landscape/master-gardeners/',
  askExtension: 'https://ask.extension.org/',
  findExtension: 'https://extension.org/find-cooperative-extension-in-your-state/',
  calscape: 'https://calscape.org/',
  cnps: 'https://www.cnps.org/gardening',
};

const OVERWATER_STEPS = [
  'Stop watering and let the soil dry out. Most California natives need dry summers once established.',
  'Check the soil 2 to 3 inches down before every watering and water only when it is dry.',
  'Make sure water drains away from the plant, and pull mulch 2 to 3 inches back from the stem.',
];

export const SYMPTOMS = [
  {
    id: 'yellowing',
    label: 'Yellowing leaves',
    causes: [
      {
        id: 'overwatering',
        name: 'Too much water or poor drainage',
        lowWater: true,
        howToTell: 'Soil stays damp or soggy, leaves yellow and drop (often lower ones first), and the plant may look wilted even though the soil is wet.',
        whatToDo: OVERWATER_STEPS,
        linkLabel: 'Phytophthora root and crown rot',
        link: IPM('phytophthora-root-and-crown-rot'),
      },
      {
        id: 'summer-drought',
        name: 'Natural leaf drop in the dry season',
        howToTell: 'Some older leaves yellow and fall in summer or fall while new growth looks healthy, and the plant is a drought-deciduous or summer-dormant species.',
        whatToDo: [
          'Check the plant\'s dormancy habits on Calscape; many natives rest in summer.',
          'Do not fertilize or add extra water to "fix" it.',
          'Water deeply only if the soil 2 to 3 inches down is bone dry and the plant is still establishing.',
        ],
        linkLabel: 'Calscape plant pages',
        link: EXPERT_LINKS.calscape,
      },
      {
        id: 'sap-feeders',
        name: 'Sap-sucking insects',
        howToTell: 'Look under leaves and on new stems for tiny insects, cottony bits, or sticky residue. Yellow speckling can also be a sign.',
        whatToDo: [
          'Blast insects off with a strong spray of water in the morning.',
          'Encourage natural enemies like ladybugs and lacewings; avoid broad-spectrum sprays.',
          'Prune off badly infested tips.',
        ],
        linkLabel: 'Aphids',
        link: IPM('aphids'),
      },
    ],
  },
  {
    id: 'brown-edges',
    label: 'Brown or crispy leaf edges or tips',
    causes: [
      {
        id: 'too-dry',
        name: 'Too little water while establishing',
        howToTell: 'Plant is less than about 2 years old, soil is dry several inches down, and leaf tips crisp during hot or windy weather.',
        whatToDo: [
          'Water deeply at the root zone, then let the soil dry before watering again.',
          'Add or refresh 2 to 3 inches of mulch, kept back from the stem.',
          'Do not water more often in small amounts; deep and infrequent builds roots.',
        ],
        linkLabel: 'Calscape care guidance',
        link: EXPERT_LINKS.calscape,
      },
      {
        id: 'overwater-roots',
        name: 'Root problems from wet soil',
        lowWater: true,
        howToTell: 'Soil is often wet, browning starts after warm weather, and the plant looks stressed despite regular watering.',
        whatToDo: OVERWATER_STEPS,
        linkLabel: 'Phytophthora root and crown rot',
        link: IPM('phytophthora-root-and-crown-rot'),
      },
      {
        id: 'heat-wind',
        name: 'Heat, wind or sun scorch',
        howToTell: 'Browning is on the sun- or wind-facing side, appeared after a hot spell, and new growth looks normal.',
        whatToDo: [
          'Leave scorched leaves; they do little harm and can be trimmed later.',
          'Water deeply before a forecast heat wave if the plant is still establishing.',
          'Check the plant\'s sun needs; some natives prefer afternoon shade inland.',
        ],
        linkLabel: 'Calscape plant pages',
        link: EXPERT_LINKS.calscape,
      },
    ],
  },
  {
    id: 'wilting',
    label: 'Wilting or drooping',
    causes: [
      {
        id: 'thirsty',
        name: 'Thirsty plant (soil too dry)',
        howToTell: 'Soil 2 to 3 inches down is dry and crumbly, and the plant perks up within a day of a deep soak.',
        whatToDo: [
          'Water slowly and deeply at the root zone, out to the drip line.',
          'Water early in the morning.',
          'Use mulch to hold moisture and re-check the soil in a week.',
        ],
        linkLabel: 'Calscape care guidance',
        link: EXPERT_LINKS.calscape,
      },
      {
        id: 'wilt-wet',
        name: 'Root or crown rot from wet soil',
        lowWater: true,
        howToTell: 'Soil is wet or soggy yet the plant still wilts. Roots may be brown and soft, and the stem base may be dark.',
        whatToDo: OVERWATER_STEPS,
        linkLabel: 'Phytophthora root and crown rot',
        link: IPM('phytophthora-root-and-crown-rot'),
      },
      {
        id: 'root-feeders',
        name: 'Gophers or voles feeding on roots',
        howToTell: 'Plant wilts or tugs loose, and you see fresh mounds or surface runways nearby.',
        whatToDo: [
          'Look for fresh mounds (gophers) or small runways in the grass or mulch (voles).',
          'Trapping is the most effective control; follow the UC IPM guide.',
          'Protect new plantings with buried wire baskets next time.',
        ],
        linkLabel: 'Pocket gophers',
        link: IPM('pocket-gophers'),
      },
    ],
  },
  {
    id: 'spots',
    label: 'Spots on leaves',
    causes: [
      {
        id: 'fungal-spots',
        name: 'Fungal leaf spots or anthracnose',
        howToTell: 'Round or irregular tan, brown or black spots, often after a wet spring or overhead watering.',
        whatToDo: [
          'Water at the base, not on the leaves, and avoid evening watering.',
          'Rake up and dispose of fallen leaves; improve air flow by thinning crowded growth.',
          'Healthy plants usually tolerate spots; fungicides are rarely needed.',
        ],
        linkLabel: 'Anthracnose',
        link: IPM('anthracnose'),
      },
      {
        id: 'thrips-sucking',
        name: 'Insect feeding (thrips, mites)',
        howToTell: 'Tiny pale or silvery specks that look like dots, sometimes with fine black specks on the underside of the leaf.',
        whatToDo: [
          'Check the underside of leaves with a hand lens.',
          'Wash off with water and wait; natural enemies often catch up.',
          'Avoid broad-spectrum insecticides, which kill the helpers.',
        ],
        linkLabel: 'Thrips',
        link: IPM('thrips'),
      },
      {
        id: 'sod',
        name: 'Sudden oak death (oaks, tanoak and some native shrubs, in affected areas)',
        howToTell: 'Dark spots or blotches on leaves of California bay laurel or rhododendron, plus a bleeding trunk on nearby oaks. Mostly in coastal and Bay Area counties.',
        whatToDo: [
          'Do not move leaves, soil or wood away from the area.',
          'Do not assume it is sudden oak death; most leaf spots are not.',
          'Ask your county Master Gardeners or arborist for confirmation.',
        ],
        linkLabel: 'Sudden oak death',
        link: IPM('sudden-oak-death'),
      },
    ],
  },
  {
    id: 'powdery',
    label: 'White powdery coating',
    causes: [
      {
        id: 'powdery-mildew',
        name: 'Powdery mildew',
        howToTell: 'White to gray dusty film on the surface of leaves or stems that can be rubbed off. Common in cool, humid, shady spots.',
        whatToDo: [
          'Improve air flow by thinning crowded growth; make sure the plant gets the sun it prefers.',
          'Water at the base and in the morning.',
          'Prune off badly affected parts; healthy plants usually tolerate mild mildew.',
        ],
        linkLabel: 'Powdery mildew on ornamentals',
        link: IPM('powdery-mildew-on-ornamentals'),
      },
    ],
  },
  {
    id: 'sooty',
    label: 'Black sooty coating or sticky leaves',
    causes: [
      {
        id: 'honeydew',
        name: 'Honeydew from sap-sucking insects, with sooty mold',
        howToTell: 'Leaves feel sticky and a black film grows on them. Look for aphids, whiteflies, scales or mealybugs, often with ants.',
        whatToDo: [
          'Control the insects, not the black mold; the mold fades once the honeydew stops.',
          'Hose the leaves with water and prune heavily infested tips.',
          'Limit ants on the plant, since they protect the insects.',
        ],
        linkLabel: 'Sooty mold',
        link: IPM('sooty-mold'),
      },
      {
        id: 'scale-honeydew',
        name: 'Scale insects',
        howToTell: 'Small, flat or round bumps stuck on stems and leaf veins that do not move, often with sticky residue.',
        whatToDo: [
          'Scrape off small numbers with a fingernail or soft brush.',
          'Prune out heavily infested branches.',
          'Ask before using any oil or soap sprays; timing matters.',
        ],
        linkLabel: 'Scales',
        link: IPM('scales'),
      },
    ],
  },
  {
    id: 'chewed',
    label: 'Holes or chewed leaves',
    causes: [
      {
        id: 'snails',
        name: 'Snails and slugs',
        howToTell: 'Ragged holes with slime trails, mostly at night or on damp mornings. Look under pots and boards after dark.',
        whatToDo: [
          'Hand-pick at dusk and dispose of them.',
          'Reduce hiding places and avoid watering in the evening.',
          'Keep ground clear of heavy debris right next to young plants.',
        ],
        linkLabel: 'Snails and slugs',
        link: IPM('snails-and-slugs'),
      },
      {
        id: 'caterpillars',
        name: 'Caterpillars and other leaf eaters',
        howToTell: 'Chewed edges or missing leaf sections, with droppings (small dark pellets) on leaves below, and sometimes the caterpillars themselves.',
        whatToDo: [
          'Many are butterfly or moth larvae that feed native wildlife; light damage is normal.',
          'Hand-pick if damage is heavy.',
          'Avoid spraying; healthy natives usually recover.',
        ],
        linkLabel: 'Redhumped caterpillar',
        link: IPM('redhumped-caterpillar'),
      },
      {
        id: 'browsers',
        name: 'Rabbits or deer',
        howToTell: 'Clean, angled cuts on stems (rabbits) or ragged tearing higher up (deer), with tracks and droppings nearby.',
        whatToDo: [
          'Protect young plants with wire cages until established.',
          'Choose fencing at the right height for the animal.',
          'Replant with less palatable natives if browsing continues.',
        ],
        linkLabel: 'Rabbits',
        link: IPM('rabbits'),
      },
    ],
  },
  {
    id: 'insects',
    label: 'Tiny insects',
    causes: [
      {
        id: 'aphids',
        name: 'Aphids',
        howToTell: 'Clusters of soft, pear-shaped insects on new growth and buds, often with curled leaves and sticky residue.',
        whatToDo: [
          'Spray off with a strong jet of water, repeating every few days.',
          'Welcome ladybugs, lacewings and syrphid flies.',
          'Skip fertilizer; soft, lush growth attracts aphids.',
        ],
        linkLabel: 'Aphids',
        link: IPM('aphids'),
      },
      {
        id: 'whiteflies',
        name: 'Whiteflies',
        howToTell: 'Tiny white flies puff up in a cloud when you shake the plant; nymphs are flat and scale-like under leaves.',
        whatToDo: [
          'Wash leaf undersides with water and prune infested leaves.',
          'Avoid broad-spectrum sprays that kill natural enemies.',
          'Do not over-fertilize.',
        ],
        linkLabel: 'Whiteflies',
        link: IPM('whiteflies'),
      },
      {
        id: 'mites',
        name: 'Spider mites (stippling)',
        howToTell: 'Fine yellow or bronze stippling on leaves, sometimes with fine webbing. Tap a leaf over white paper and look for specks that move. Worse in hot, dusty, dry conditions.',
        whatToDo: [
          'Rinse leaves with water, including the undersides.',
          'Reduce dust near the plant.',
          'Avoid broad-spectrum sprays, which can make mites worse.',
        ],
        linkLabel: 'Spider mites',
        link: IPM('spider-mites'),
      },
      {
        id: 'scale',
        name: 'Scale insects',
        howToTell: 'Small, immobile brown, tan or white bumps on stems and leaves, sometimes with sticky residue.',
        whatToDo: [
          'Scrape or rub off small numbers.',
          'Prune out heavily infested branches.',
          'Ask your Master Gardeners before using oils; timing matters.',
        ],
        linkLabel: 'Scales',
        link: IPM('scales'),
      },
    ],
  },
  {
    id: 'collapsed',
    label: 'Plant collapsed or stem base dark and mushy',
    causes: [
      {
        id: 'crown-rot',
        name: 'Crown or root rot from wet soil',
        lowWater: true,
        howToTell: 'Bark or stem base is dark, soft or sunken. Soil is wet or has been irrigated in summer. Plant can collapse quickly in warm weather.',
        whatToDo: [
          ...OVERWATER_STEPS.slice(0, 2),
          'A plant that has fully collapsed usually cannot be saved. Remove it and replant in a raised mound or a different, better-drained spot.',
        ],
        linkLabel: 'Phytophthora root and crown rot',
        link: IPM('phytophthora-root-and-crown-rot'),
      },
      {
        id: 'armillaria',
        name: 'Armillaria (oak root fungus)',
        howToTell: 'Honey-colored mushrooms near the base in fall, white fungal sheets under the bark, and decline of trees or shrubs, often in older oak areas.',
        whatToDo: [
          'Avoid summer irrigation near oaks and affected plants.',
          'Do not replant susceptible plants in the same spot.',
          'Confirm the diagnosis with an arborist or Master Gardeners.',
        ],
        linkLabel: 'Armillaria root rot',
        link: IPM('armillaria-root-rot'),
      },
      {
        id: 'animal-roots',
        name: 'Gophers or voles chewing the base',
        howToTell: 'Bark is gnawed at the base or roots are missing, and the plant lifts out easily. Fresh mounds or runways are nearby.',
        whatToDo: [
          'Look for fresh mounds or runways around the plant.',
          'Trapping is the most effective control.',
          'Use wire baskets when replanting.',
        ],
        linkLabel: 'Voles',
        link: IPM('voles'),
      },
    ],
  },
  {
    id: 'weeds',
    label: 'Weeds coming through mulch',
    causes: [
      {
        id: 'thin-mulch',
        name: 'Mulch too thin or weeds already established',
        howToTell: 'Weeds sprout through patches thinner than about 3 inches, or perennial weeds regrow from roots under the mulch.',
        whatToDo: [
          'Pull small weeds when the soil is moist, getting the roots.',
          'Top up mulch to 2 to 3 inches, keeping it away from plant stems.',
          'Weed before they set seed; stay on top of a few minutes each week.',
        ],
        linkLabel: 'Weed management in landscapes',
        link: IPM('weed-management-in-landscapes'),
      },
      {
        id: 'bermuda',
        name: 'Bermudagrass or other creeping grasses',
        howToTell: 'Grass runners or underground stems keep spreading from the old lawn through mulch and between plants.',
        whatToDo: [
          'Dig out runners and roots; leaving fragments lets it regrow.',
          'Repeat every few weeks until it stops coming back.',
          'Thick mulch alone will not stop bermudagrass.',
        ],
        linkLabel: 'Bermudagrass',
        link: IPM('bermudagrass'),
      },
      {
        id: 'oxalis',
        name: 'Creeping woodsorrel',
        howToTell: 'Low clover-like leaves with yellow flowers and seed pods that pop open when touched.',
        whatToDo: [
          'Hand-pull before seed pods form, digging out the roots.',
          'Keep mulch thick and avoid overwatering.',
          'Check weekly in spring.',
        ],
        linkLabel: 'Creeping woodsorrel',
        link: IPM('creeping-woodsorrel-and-bermuda-buttercup'),
      },
    ],
  },
  {
    id: 'dug-up',
    label: 'Plant dug up or roots eaten',
    causes: [
      {
        id: 'gophers',
        name: 'Pocket gophers',
        howToTell: 'Crescent-shaped dirt mounds with a plugged hole, and plants that wilt or vanish into the ground.',
        whatToDo: [
          'Trapping is the most effective control; follow the UC IPM guide.',
          'Protect new plants with a buried wire basket.',
          'Do not flood burrows; it rarely works.',
        ],
        linkLabel: 'Pocket gophers',
        link: IPM('pocket-gophers'),
      },
      {
        id: 'voles',
        name: 'Voles',
        howToTell: 'Surface runways in grass or mulch, small round holes about 1 inch wide, and gnawed bark at the base.',
        whatToDo: [
          'Reduce thick ground cover and mulch right at the stem.',
          'Trap with snap traps placed along runways.',
          'Protect trunk bases with hardware cloth.',
        ],
        linkLabel: 'Voles',
        link: IPM('voles'),
      },
      {
        id: 'rabbits-digging',
        name: 'Rabbits or other digging wildlife',
        howToTell: 'Shallow scrapes and dug-up seedlings, tracks, and droppings, often right after planting.',
        whatToDo: [
          'Cover new plantings with wire cages until established.',
          'Re-firm soil around any plants pulled up.',
          'Ask your Master Gardeners if damage continues.',
        ],
        linkLabel: 'Rabbits',
        link: IPM('rabbits'),
      },
    ],
  },
];

export const symptomById = (id) => SYMPTOMS.find((s) => s.id === id);
