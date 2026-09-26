/**
 * Rider-profile entities: height, experience, transmission, electric,
 * budget, luggage and trip-usage cues. Pure string parsing on the
 * NORMALIZED form (lowercase, accents stripped) — deterministic, no LLM.
 *
 * None of this data is a business fact; it is user-stated context only.
 * The gazetteer of common trip destinations is NLU vocabulary, not a claim
 * that the shop serves those places.
 */

const DESTINATIONS = [
  'tam dao', 'ba vi', 'ninh binh', 'trang an', 'ha long', 'cat ba',
  'mai chau', 'sapa', 'fansipan', 'da lat', 'hue', 'hoi an', 'da nang',
  'phong nha', 'moc chau', 'yen bai'
];

/** Extract the rider/usage profile from normalized text.
 * @returns {{heightCm?, experience?, transmission?, electric?, luggage?,
 *            usage?, budget?, destination?}} — only fields actually present. */
export function extractRiderProfile(normalized) {
  const text = String(normalized ?? '');
  const out = {};

  const height = parseHeight(text);
  if (height !== null) out.heightCm = height;

  const experience = parseExperience(text);
  if (experience) out.experience = experience;

  const transmission = parseTransmission(text);
  if (transmission) out.transmission = transmission;

  if (/\bxe dien\b|\bxe dap dien\b|\belectric\b/.test(text)) out.electric = true;

  if (/\bvali\b|\bdo dung\b|\bnhieu do\b|\bchuyen do\b|\bstorage\b|\bhanh ly\b/.test(text)) {
    out.luggage = true;
  }

  const usage = parseUsage(text);
  if (usage) out.usage = usage;

  const budget = parseBudget(text);
  if (budget) out.budget = budget;

  const destination = matchDestination(text);
  if (destination) out.destination = destination;

  return out;
}

/** "1m55" / "1.55m" / "155cm" / "1 m 55" -> 155 (cm). Only plausible heights. */
export function parseHeight(text) {
  let m = /(\d)\s*m\s*(\d{2})(?!\d)/.exec(text); // 1m55, 1 m 55
  if (m) return heightCm(Number(m[1]), Number(m[2]));
  m = /(\d)[.,](\d{2})\s*m(?![a-z0-9])/.exec(text); // 1.55m
  if (m) return heightCm(Number(m[1]), Number(m[2]));
  m = /(\d{3})\s*cm/.exec(text); // 155cm
  if (m) return heightCm(0, Number(m[1]));
  return null;
}

function heightCm(meters, centimeters) {
  const cm = meters > 0 ? meters * 100 + centimeters : centimeters;
  return Number.isInteger(cm) && cm >= 100 && cm <= 220 ? cm : null;
}

function parseExperience(text) {
  if (/\bmoi lai\b|\bchua lai\b|\bchua di\b|\bkhong ranh\b|\bchua tung\b|\bbeginner\b|\bnew rider\b/.test(text)) return 'new';
  if (/\branh xe\b|\bdi gioi\b|\bnhieu nam\b|\bthuong xuyen\b|\bexperienced\b/.test(text)) return 'experienced';
  return null;
}

function parseTransmission(text) {
  if (/\bxe so\b|\bxe con\b|\bmanual\b|\bximen\b/.test(text)) return 'manual';
  if (/\bxe ga\b|\bxe tay ga\b|\bscooter\b|\bautomatic\b|\bauto\b/.test(text)) return 'scooter';
  return null;
}

/** city = nội thành/trong phố; long = đường dài/đường núi. */
function parseUsage(text) {
  if (/\btrong pho\b|\bnoi thanh\b|\btrong thanh pho\b|\bcity\b|\bquanh pho\b/.test(text)) return 'city';
  if (/\bduong dai\b|\bduong nui\b|\bchuyen xa\b|\blong trip\b|\bxa hanoi\b|\bdi tinh\b/.test(text)) return 'long';
  return null;
}

/** "150k", "200 nghìn", "dưới 2 triệu", "under 200k" -> {amountVnd, direction}. */
function parseBudget(text) {
  let m = /(\d+(?:[.,]\d+)?)\s*k(?![a-z])/.exec(text); // 150k, 1.5k (nghìn)
  let amount = m ? round1000(m[1]) : null;
  let direction = null;
  if (amount === null) {
    m = /(\d+(?:[.,]\d+)?)\s*(?:nghin|nghiem|ngan)/.exec(text);
    amount = m ? round1000(m[1]) : null;
  }
  if (amount === null) {
    m = /(\d+(?:[.,]\d+)?)\s*trieu/.exec(text);
    amount = m ? roundMillion(m[1]) : null;
  }
  if (amount === null) return null;
  if (/duoi|tren duoi|toi da|maximum|khong qua|under|nho hon|be hon/.test(text)) direction = 'max';
  else if (/tren|tu|it nhat|at least|minimum|lon hon/.test(text)) direction = 'min';
  else direction = 'max'; // "xe ga 150k" = the ceiling the user accepts
  return { amountVnd: amount, direction };
}

const round1000 = (s) => Math.round(Number(String(s).replace(',', '.')) * 1000);
const roundMillion = (s) => Math.round(Number(String(s).replace(',', '.')) * 1000000);

function matchDestination(text) {
  // Word-boundary match: "hue" must not match inside "thue" (thuê).
  for (const name of DESTINATIONS) {
    const pattern = name.split(' ').map((word) => `\\b${word}\\b`).join('\\s+');
    if (new RegExp(pattern).test(text)) return titleCase(name);
  }
  return null;
}

function titleCase(slug) {
  return slug.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
