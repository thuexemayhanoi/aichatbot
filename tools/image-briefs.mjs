#!/usr/bin/env node
/**
 * IMAGE BRIEFS (v80 image factory) — one deterministic featured-image brief
 * per article, read from the same sources the builder uses:
 *   data/blog/published.json      title, slug, category, description, body
 *   data/seo/article-meta.json    SEO title + primary keyword (wins)
 *   data/blog/content-matrix.csv  search intent, local scope
 *   data/blog/articles/*.body.html H2 outline (scene details)
 *
 * Every brief names WHAT the image must show (vehicle, place, theme, people,
 * time/weather, framing), the English generation prompt, the SEO filename and
 * a PLANNED Vietnamese ALT. The planned ALT is a draft: the final ALT in
 * data/seo/article-images.json is written only after the generated image is
 * looked at (it must describe what is actually visible).
 *
 * Images are honest illustrations: no shop signage, logos, readable plates or
 * readable documents, no staged "real customer" claims, legal topics shown as
 * neutral safety scenes (never a rule stated inside the image).
 *
 * Usage:
 *   node tools/image-briefs.mjs            # write data/seo/image-plan.csv
 *   node tools/image-briefs.mjs --check    # exit 1 when the CSV is stale
 *   node tools/image-briefs.mjs --show BA-0050
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SITE } from '../src/config/site.js';
import { taxonomy, deriveSubtopic } from './taxonomy.mjs';
import { FOUNDATION_ROWS } from './matrix-size.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PLAN_CSV = 'data/seo/image-plan.csv';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** ASCII fold for matching (diacritics off, đ→d). */
export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// ---------- scene dictionaries (first match wins, order = priority) ----------

/** Vehicles: en = what the model must draw, vi = ALT wording. */
export const VEHICLES = [
  { id: 'vision', re: /\bvision\b/, en: 'a Honda Vision 110cc automatic scooter (slim step-through body, small front apron)', vi: 'xe tay ga Honda Vision' },
  { id: 'airblade', re: /air ?blade/, en: 'a Honda Air Blade 125cc automatic scooter (sporty angular bodywork)', vi: 'xe tay ga Honda Air Blade' },
  { id: 'wave', re: /\bwave\b/, en: 'a Honda Wave Alpha 110cc underbone motorbike (step-through manual "xe so" with a front leg shield)', vi: 'xe số Honda Wave Alpha' },
  { id: 'clickmio', re: /\bclick\b|\bmio\b/, en: 'a compact automatic scooter in the Honda Click / Yamaha Mio class', vi: 'xe tay ga nhỏ gọn' },
  { id: '50cc', re: /50 ?cc|hang nhe/, en: 'a small lightweight 50cc scooter', vi: 'xe tay ga 50cc' },
  { id: 'ebike', re: /xe dap dien/, en: 'an electric bicycle with pedals and a rear battery pack', vi: 'xe đạp điện' },
  { id: 'ev', re: /xe (may )?dien|\bev\b|doi pin|tram sac|sac pin|pin xe/, en: 'a modern electric scooter', vi: 'xe máy điện' },
  { id: 'manual', re: /xe so\b|chay xe so/, en: 'a manual underbone motorbike ("xe so")', vi: 'xe số' },
  { id: 'scooter', re: /xe ga\b|tay ga/, en: 'an automatic scooter', vi: 'xe tay ga' }
];
const DEFAULT_VEHICLE = {
  EV: [{ id: 'ev', en: 'a modern electric scooter', vi: 'xe máy điện' }],
  // A general rental article shows a typical rental bike, named only by class.
  any: [
    { id: 'scooter', en: 'a clean automatic scooter', vi: 'xe tay ga' },
    { id: 'manual', en: 'a clean manual underbone motorbike ("xe so")', vi: 'xe số' },
    { id: 'scooter', en: 'a clean automatic scooter', vi: 'xe tay ga' }
  ]
};

/** Places: Hanoi first, then trips out of Hanoi. */
export const PLACES = [
  { id: 'oldquarter', re: /pho co|hang (bac|ma|buom|dao|gai)|ta hien/, en: "a narrow street in Hanoi's Old Quarter with tube houses, hanging lanterns and shopfronts (no readable signs)", vi: 'trên phố cổ Hà Nội' },
  { id: 'hoankiem', re: /ho guom|hoan kiem/, en: 'beside Hoan Kiem Lake in central Hanoi with leafy lakeside trees', vi: 'bên hồ Hoàn Kiếm' },
  { id: 'cathedral', re: /nha tho lon/, en: "near St. Joseph's Cathedral in Hanoi with its grey neo-gothic towers", vi: 'gần Nhà thờ Lớn Hà Nội' },
  { id: 'bookstreet', re: /pho sach/, en: "Hanoi's tree-shaded book street lined with small bookshops", vi: 'trên phố sách Hà Nội' },
  { id: 'lbbridge', re: /cau long bien|song hong|ven de|quang di long bien/, en: 'the historic Long Bien steel truss bridge over the Red River', vi: 'trên cầu Long Biên bắc qua sông Hồng' },
  { id: 'lbmarket', re: /cho long bien/, en: 'the busy Long Bien wholesale market under night lights', vi: 'tại chợ Long Biên' },
  { id: 'longbien', re: /long bien|gia lam|bo de/, en: 'a tree-lined residential street in Long Bien district, Hanoi', vi: 'trên phố ở Long Biên, Hà Nội' },
  { id: 'westlake', re: /ho tay|tay ho/, en: 'the West Lake (Ho Tay) shoreline road with willow trees and calm water', vi: 'ven Hồ Tây' },
  { id: 'nhattan', re: /nhat tan/, en: 'the Nhat Tan cable-stayed bridge over the Red River', vi: 'trên cầu Nhật Tân' },
  { id: 'badinh', re: /ba dinh|lang chu tich|cot co|hoang thanh|chua mot cot|van mieu/, en: 'a wide tree-lined boulevard in Ba Dinh near historic yellow colonial buildings', vi: 'trên đại lộ rợp cây ở Ba Đình' },
  { id: 'caugiay', re: /cau giay/, en: 'a modern busy avenue in Cau Giay district, Hanoi', vi: 'trên phố ở Cầu Giấy, Hà Nội' },
  { id: 'dongda', re: /dong da/, en: 'a lively street in Dong Da district, Hanoi, shopfronts with no readable signs', vi: 'trên phố ở Đống Đa, Hà Nội' },
  { id: 'thanhxuan', re: /thanh xuan/, en: 'a wide arterial road in Thanh Xuan district, Hanoi', vi: 'trên đường ở Thanh Xuân, Hà Nội' },
  { id: 'haibatrung', re: /hai ba trung/, en: 'a busy street in Hai Ba Trung district, Hanoi, shopfronts with no readable signs', vi: 'trên phố ở Hai Bà Trưng, Hà Nội' },
  { id: 'battrang', re: /bat trang|lang gom/, en: 'the pottery village of Bat Trang with stacks of glazed ceramics', vi: 'tại làng gốm Bát Tràng' },
  { id: 'flowermarket', re: /cho hoa|quang ba|quang an/, en: 'an early-morning flower market with buckets of fresh flowers', vi: 'tại chợ hoa' },
  { id: 'pagoda', rv: /chùa|đền /, en: 'the gate of an old pagoda in Hanoi with curved tiled roofs', vi: 'trước cổng một ngôi chùa cổ ở Hà Nội' },
  { id: 'museum', re: /bao tang/, en: 'a museum forecourt in Hanoi', vi: 'trước một bảo tàng ở Hà Nội' },
  { id: 'cafe', re: /ca phe/, en: 'a sidewalk café in Hanoi with low stools and a small table', vi: 'bên quán cà phê vỉa hè Hà Nội' },
  { id: 'streetfood', re: /am thuc|banh cuon|pho bo|an uong/, rv: /ăn đêm/, en: 'a Hanoi street-food corner with steaming bowls on a small table', vi: 'cạnh quán ăn đường phố Hà Nội' },
  { id: 'airport', re: /noi bai|san bay/, en: 'the arrivals forecourt of an international airport near Hanoi', vi: 'trước sảnh đến sân bay Nội Bài' },
  { id: 'station', re: /ga tau|ga ha noi/, en: 'the forecourt of Hanoi Railway Station', vi: 'trước ga Hà Nội' },
  { id: 'hotel', re: /khach san|check in/, en: 'the entrance of a small boutique hotel on a Hanoi street', vi: 'trước cửa một khách sạn nhỏ ở Hà Nội' },
  { id: 'ringroad', re: /vanh dai|duong 5|ngoai o|quoc lo|duong truong/, en: 'a wide multi-lane ring road with flyovers on the edge of Hanoi', vi: 'trên đường vành đai rộng ở Hà Nội' },
  { id: 'coloa', re: /soc son|co loa/, en: 'a quiet rural road near the ancient Co Loa citadel ramparts', vi: 'trên đường quê gần thành Cổ Loa' },
  { id: 'bavi', re: /ba vi/, en: 'a forested winding road climbing Ba Vi mountain', vi: 'trên đường đèo rừng Ba Vì' },
  { id: 'duonglam', re: /son tay|thach that|duong lam/, en: 'the laterite-brick lanes of Duong Lam ancient village', vi: 'trong ngõ đá ong làng cổ Đường Lâm' },
  { id: 'hoabinh', re: /hoa binh/, en: 'a winding road above the green Hoa Binh reservoir', vi: 'trên cung đường ven hồ Hòa Bình' },
  { id: 'tamdao', re: /tam dao/, en: 'a misty mountain road up to Tam Dao hill station', vi: 'trên đường đèo sương mù lên Tam Đảo' },
  { id: 'mocchau', re: /moc chau/, en: 'rolling green tea hills of the Moc Chau plateau', vi: 'giữa đồi chè Mộc Châu' },
  { id: 'maichau', re: /mai chau|pom coong|ban lac/, en: 'valley rice fields and wooden stilt houses of Mai Chau', vi: 'giữa đồng lúa và nhà sàn Mai Châu' },
  { id: 'ninhbinh', re: /ninh binh|trang an|bai dinh|tam coc/, en: 'limestone karst mountains and rice paddies of Ninh Binh', vi: 'giữa núi đá vôi và ruộng lúa Ninh Bình' },
  { id: 'cucphuong', re: /cuc phuong/, en: 'a shaded forest road in Cuc Phuong National Park', vi: 'trên đường rừng Cúc Phương' },
  { id: 'halong', re: /ha long|quang ninh/, en: 'a coastal road with the limestone islands of Ha Long Bay in the distance', vi: 'trên đường ven biển Hạ Long' },
  { id: 'cualo', re: /cua lo|ven bien/, rv: /biển/, en: 'a seaside promenade road at Cua Lo beach', vi: 'trên đường ven biển Cửa Lò' },
  { id: 'thanhhoa', re: /thanh hoa/, en: 'a long national highway through the green Thanh Hoa countryside', vi: 'trên quốc lộ qua vùng quê Thanh Hóa' },
  { id: 'hagiang', re: /ha giang|dong van|meo vac|ma pi leng|vong cung/, en: 'a dramatic winding mountain pass in Ha Giang with limestone karst peaks', vi: 'trên đèo núi đá Hà Giang' },
  { id: 'sapa', re: /sa ?pa|lao cai/, en: 'terraced rice fields and misty mountains near Sa Pa', vi: 'bên ruộng bậc thang Sa Pa' },
  { id: 'dalat', re: /da lat/, en: 'a pine-covered hill road around Da Lat', vi: 'trên đường đồi thông Đà Lạt' },
  { id: 'hue', re: /\bhue\b/, en: 'a riverside road along the Perfume River in Hue', vi: 'bên bờ sông Hương, Huế' },
  { id: 'danang', re: /da nang|hai van/, en: 'the Hai Van Pass coastal road above the sea', vi: 'trên đèo Hải Vân' },
  { id: 'hoian', re: /hoi an/, en: 'lantern-lit old town lanes of Hoi An', vi: 'trong phố cổ Hội An' },
  { id: 'saigon', re: /sai gon|ho chi minh/, en: 'a busy tree-lined boulevard in Ho Chi Minh City', vi: 'trên đại lộ ở TP. Hồ Chí Minh' },
  { id: 'mekong', re: /mekong|mien tay/, en: 'a Mekong Delta canal road lined with coconut palms', vi: 'trên đường ven kênh miền Tây' },
  { id: 'vangiang', re: /van giang/, en: 'a green suburban riverside road near Van Giang', vi: 'trên đường ven sông Văn Giang' },
  { id: 'market', rv: /chợ|mua sắm/, en: 'a lively local market street in Hanoi', vi: 'cạnh một khu chợ ở Hà Nội' },
  { id: 'mountain', re: /deo doc|duong doc|phuot|duong dai/, en: 'a winding mountain road in northern Vietnam', vi: 'trên cung đường đèo miền Bắc' }
];
/** Setting for paper/counter themes when the article names no place. */
const COUNTER = { id: 'counter', en: 'a small rental counter open to a Hanoi street, no signage', vi: '' };
/** Named models stay the hero of the frame (model pages must show the model). */
const MODELS = new Set(['vision', 'airblade', 'wave', 'clickmio', '50cc', 'ebike']);
const ELECTRIC = new Set(['ev', 'ebike']);
/** APP articles — and any article whose title is about an app/assistant —
 *  lead with the assistant, not with paperwork or parts. */
const PREFER = { APP: ['scam', 'privacy', 'chat'] };
const APP_TITLE = /\bapp\b|ung dung|tro ly|\bagent\b|chatbot/;
/** Neutral settings when the article names no place (rotated per article). */
const DEFAULT_PLACE = {
  SAFE: [
    { id: 'intersection', en: 'a Hanoi street intersection with traffic lights', vi: 'tại nút giao ở Hà Nội' },
    { id: 'boulevard', en: 'a wide tree-lined boulevard in Hanoi', vi: 'trên đại lộ ở Hà Nội' },
    { id: 'alley', en: 'a quiet residential alley in Hanoi with potted plants', vi: 'trong ngõ nhỏ ở Hà Nội' },
    { id: 'riverside', en: 'a riverside road on the edge of Hanoi', vi: 'trên đường ven sông ở Hà Nội' }
  ],
  APP: [
    { id: 'cafe-table', en: 'a café table near a Hanoi street', vi: 'bên bàn cà phê ở Hà Nội' },
    { id: 'hotel-lobby', en: 'a bright hotel lobby with a sofa', vi: 'tại sảnh khách sạn' },
    { id: 'sidewalk', en: 'a sidewalk in Hanoi next to a parked scooter', vi: 'trên vỉa hè Hà Nội' },
    { id: 'home-desk', en: 'a home desk by a window overlooking a Hanoi street', vi: 'bên bàn làm việc cạnh cửa sổ' },
    { id: 'arrivals', en: 'an airport arrivals hall bench', vi: 'tại sảnh đến sân bay' },
    { id: 'bus-station', en: 'a bus station waiting area', vi: 'tại khu chờ bến xe' }
  ],
  EV: [
    { id: 'residential', en: 'a quiet residential street in Hanoi', vi: 'trên phố yên tĩnh ở Hà Nội' },
    { id: 'basement', en: 'a clean apartment-building parking area', vi: 'tại bãi xe chung cư' },
    { id: 'new-district', en: 'a modern urban district street with young trees', vi: 'trên phố khu đô thị mới' },
    { id: 'parkside', en: 'a park-side road with green lawns', vi: 'trên đường cạnh công viên' }
  ],
  any: [
    { id: 'hanoi', en: 'a clean tree-lined street in Hanoi', vi: 'trên phố Hà Nội' },
    { id: 'alley', en: 'a quiet residential alley in Hanoi with potted plants', vi: 'trong ngõ nhỏ ở Hà Nội' },
    { id: 'shophouse', en: 'a street of narrow Hanoi shophouses with no readable signs', vi: 'trên dãy phố nhà ống ở Hà Nội' },
    { id: 'riverside', en: 'a riverside road on the edge of Hanoi', vi: 'trên đường ven sông ở Hà Nội' }
  ]
};
/** Light when the article names no time (rotated per article). */
const DEFAULT_TIMES = [
  { id: 'soft-morning', en: 'in soft morning light', vi: '' },
  { id: 'midday', en: 'in clear midday light', vi: '' },
  { id: 'golden', en: 'in warm late-afternoon light', vi: '' },
  { id: 'overcast', en: 'on a bright overcast day', vi: '' }
];
/** Which second details can share a frame with the main theme (coherent scenes only). */
const DESK = ['contract', 'deposit', 'price', 'licence', 'insurance', 'time', 'chat', 'privacy', 'scam', 'faq'];
const CLOSE = ['helmet', 'tyre', 'brake', 'mirror', 'battery', 'camera', 'alcohol', 'phone-ride', 'firstaid', 'fatigue', 'flood'];
const SECOND_OK = {
  desk: ['contract', 'deposit', 'price', 'licence', 'insurance', 'time', 'chat', 'helmet', 'faq'],
  scene: ['helmet', 'raincoat', 'luggage', 'map', 'range', 'lock', 'two-up', 'charge'],
  none: ['luggage', 'map', 'raincoat', 'helmet', 'two-up'],
  close: []
};
const groupOf = (theme) => !theme ? 'none' : DESK.includes(theme.id) ? 'desk' : CLOSE.includes(theme.id) ? 'close' : 'scene';
/** Themes that only make sense at a signalised intersection. */
const AT_LIGHTS = new Set(['traffic-rules', 'camera']);
/** Second-theme props: one extra concrete detail drawn from the article. */
const PROPS = {
  swap: 'a battery-swap cabinet nearby', charge: 'a charging cable plugged in', battery: 'a removable battery pack',
  range: 'a small backpack strapped on', helmet: 'a certified half-face helmet', raincoat: 'a folded rain poncho',
  licence: 'a plain blank card', insurance: 'a plain blank certificate (no emblems, stamps or seals)', contract: 'a blank form and pen',
  deposit: 'a plain unmarked envelope', compare: 'a second, different bike beside it', price: 'a closed notebook and a calculator',
  inspect: 'a customer checking the tyre', delivery: 'a staff member handing over the key', fuel: 'a fuel pump nozzle',
  tyre: 'a tyre pressure gauge', brake: 'a gloved hand on the brake lever', mirror: 'an adjusted rear-view mirror',
  lights: 'the headlight switched on', repair: 'a small toolkit', lock: 'a disc lock on the wheel',
  parking: 'a parking ticket', camera: 'a traffic camera on a pole', alcohol: 'a glass of water',
  'phone-ride': 'a handlebar phone mount', children: 'a small child-size helmet', firstaid: 'a first-aid kit',
  fatigue: 'a bottle of water', flood: 'wet pavement', 'traffic-rules': 'a traffic light',
  scam: 'a phone showing a warning icon', privacy: 'a phone showing a padlock icon', map: 'a phone showing a route map',
  luggage: 'a small duffel bag strapped on', 'two-up': 'two helmets', work: 'a work bag', taxi: 'a taxi in the background',
  time: 'a wristwatch', chat: 'a smartphone showing a generic chat interface with blank message bubbles', faq: 'a customer asking a question',
  eco: 'green trees'
};

/**
 * Themes = what happens in the frame. {v} = vehicle (en), {vv} = vehicle (vi).
 * Order matters: specific objects before broad topics.
 */
export const THEMES = [
  { id: 'swap', re: /tram doi pin|doi pin/, en: 'a battery-swap cabinet with charged packs, {v} parked beside it', vi: 'Trạm đổi pin và {vv}' },
  { id: 'charge', rv: /sạc/, en: '{v} plugged into a charging point with the cable connected', vi: '{vv} đang cắm sạc' },
  { id: 'battery', re: /\bpin\b/, en: 'close-up of the removable lithium battery pack being lifted from under the seat of {v}', vi: 'Pin rời được nhấc ra khỏi cốp {vv}' },
  { id: 'range', re: /pham vi|bao xa|quang duong|duong dai/, en: '{v} cruising on an open road, a small backpack strapped on', vi: '{vv} chạy trên đường dài' },
  { id: 'helmet', re: /mu bao hiem/, rv: /nón/, en: 'close-up of hands fastening the chin strap of a certified half-face helmet', vi: 'Cài quai mũ bảo hiểm đạt chuẩn' },
  { id: 'raincoat', re: /ao mua/, en: 'a rider pulling on a bright rain poncho beside {v}', vi: 'Mặc áo mưa trước khi lái {vv}' },
  { id: 'licence', re: /bang lai|giay phep|\bidp\b|hang a1|a1 a2/, en: 'a plain blank card the size of a driving licence held next to a scooter key, no printing on it', vi: 'Thẻ giấy phép lái xe cạnh chìa khóa xe máy', paper: true, prop: 'a plain licence card and the key held in the foreground' },
  { id: 'insurance', rv: /(?<!mũ )bảo hiểm/, en: 'a plain insurance certificate with only faint illegible lines (no emblems, stamps or seals) in a document wallet beside {v}', vi: 'Giấy chứng nhận bảo hiểm đặt cạnh {vv}', prop: 'a plain insurance certificate (no emblems, stamps or seals) in a document wallet resting on the seat' },
  { id: 'contract', re: /hop dong|giay to|thu tuc|dieu kien|cong chung|bao lanh|duoi 18/, en: 'a blank rental form with only faint illegible lines (no letters, no stamps or seals) on a counter with a pen and a scooter key', vi: 'Hợp đồng thuê xe, bút và chìa khóa trên quầy', paper: true, prop: 'a blank form and a pen resting on the seat' },
  { id: 'deposit', rv: /cọc|thanh toán/, en: 'a plain unmarked brown envelope and a scooter key being handed across a rental counter', vi: 'Giao tiền đặt cọc và chìa khóa xe tại quầy', paper: true, prop: 'the key being handed over to a customer' },
  { id: 'children', re: /tre em|cho tre/, en: 'a parent and a child both wearing helmets standing beside {v}', vi: 'Phụ huynh và trẻ em đội mũ bảo hiểm bên {vv}' },
  { id: 'two-up', re: /hai nguoi|nguoi than|cho nguoi/, en: 'two people wearing helmets on {v}, parked and ready to ride', vi: 'Hai người đội mũ bảo hiểm trên {vv}' },
  { id: 'compare', re: /so sanh|khac gi|hay di|hay xe|xe so hay/, en: 'an automatic scooter and a manual underbone motorbike ("xe so") parked side by side for comparison', vi: 'Xe tay ga và xe số đỗ cạnh nhau để so sánh' },
  { id: 'price', rv: /giá|chi phí|tiết kiệm|ưu đãi|rẻ|bao nhiêu|ngân sách/, en: 'a closed notebook, a calculator with a blank display and a scooter key on a table, {v} parked in soft focus behind', vi: 'Sổ tính chi phí, máy tính và chìa khóa, phía sau là {vv}', prop: 'a closed notebook and a calculator resting on the seat' },
  { id: 'inspect', re: /kiem tra|chup anh|nhan xe|tra xe|ban giao|tinh trang/, en: 'a customer inspecting the tyres and mirrors of {v} before handover', vi: 'Khách kiểm tra lốp và gương {vv} trước khi nhận', prop: 'a customer crouching to check its front tyre' },
  { id: 'delivery', re: /giao xe|tan noi/, en: '{v} being delivered and handed over at a front door', vi: 'Giao {vv} tận cửa' },
  { id: 'fuel', re: /xang|nhien lieu/, en: '{v} being refuelled at a petrol station pump', vi: 'Đổ xăng cho {vv} tại cây xăng' },
  { id: 'tyre', rv: /lốp/, en: 'close-up of the tyre tread of {v}', vi: 'Cận cảnh lốp {vv}' },
  { id: 'brake', re: /phanh/, en: 'close-up of the front disc brake of {v}', vi: 'Cận cảnh phanh đĩa trước của {vv}' },
  { id: 'mirror', re: /guong/, en: 'the rear-view mirror of {v} reflecting the street behind', vi: 'Gương chiếu hậu của {vv} phản chiếu dòng xe phía sau' },
  { id: 'lights', re: /den xe|tam nhin|suong mu/, en: '{v} with its headlight on in low light', vi: '{vv} bật đèn pha khi trời tối' },
  { id: 'repair', re: /bao duong|sua xe|hong xe|su co|cuu ho|het pin/, en: 'a mechanic checking {v} in a small roadside repair shop', vi: 'Thợ kiểm tra {vv} tại tiệm sửa xe' },
  { id: 'lock', re: /trom/, rv: /khóa|cầm đồ/, en: 'a sturdy disc lock fitted on the front wheel of {v}', vi: 'Khóa đĩa gắn ở bánh trước {vv}' },
  { id: 'parking', re: /gui xe|bai do/, rv: /đỗ xe|cấm đỗ/, en: 'a neat row of motorbikes in an organised sidewalk parking area', vi: 'Hàng xe máy đỗ ngay ngắn ở bãi gửi xe' },
  { id: 'camera', re: /camera|phat nguoi|den do/, en: 'a traffic camera on a pole above an intersection with traffic lights', vi: 'Camera giao thông phía trên nút giao có đèn tín hiệu' },
  { id: 'alcohol', rv: /nồng độ cồn|rượu|bia/, en: 'a glass of water chosen over beer on a table next to a helmet and scooter key', vi: 'Ly nước lọc cạnh mũ bảo hiểm và chìa khóa xe', placeId: 'streetfood' },
  { id: 'phone-ride', re: /dien thoai khi lai/, en: 'a smartphone locked in a handlebar mount with the screen off', vi: 'Điện thoại đặt cố định trên giá đỡ ghi đông' },
  { id: 'firstaid', re: /tai nan|va cham|canh sat|cong an|khieu nai/, en: 'a first-aid kit and a warning triangle beside {v} parked safely at the roadside', vi: 'Hộp sơ cứu và biển cảnh báo cạnh {vv} đỗ bên lề' },
  { id: 'fatigue', re: /met moi|thuoc|suc khoe/, en: 'a rider resting with a bottle of water at a roadside stop beside {v}', vi: 'Người lái nghỉ chân uống nước bên {vv}' },
  { id: 'flood', re: /ngap/, rv: /bão/, en: '{v} parked under shelter while heavy rain floods the street', vi: '{vv} trú dưới mái hiên khi mưa lớn' },
  { id: 'traffic-rules', re: /luat|quy tac|lan duong|nhuong|nguoc chieu|toc do|khoang cach|ky nang|phanh gap/, en: 'riders wearing helmets waiting in their lane at a red light', vi: 'Người đi xe máy đội mũ bảo hiểm dừng đúng làn khi đèn đỏ' },
  { id: 'scam', re: /lua dao|gia mao|canh giac/, en: 'a person carefully checking a smartphone screen showing a generic warning icon', vi: 'Kiểm tra kỹ màn hình điện thoại có biểu tượng cảnh báo', paper: true },
  { id: 'privacy', re: /privacy|du lieu|bao mat|bao ve/, en: 'a smartphone showing a simple padlock icon on screen, lying beside a scooter key', vi: 'Điện thoại hiển thị biểu tượng ổ khóa cạnh chìa khóa xe', paper: true },
  { id: 'map', re: /ban do|dinh vi|lo trinh|hanh trinh|ke hoach/, en: 'a smartphone in a handlebar mount showing a generic route map', vi: 'Điện thoại gắn ghi đông hiển thị bản đồ lộ trình', notFor: ['LOCAL'] },
  { id: 'luggage', re: /hanh ly|cho do|hai ngay/, en: 'a small duffel bag strapped securely to {v}', vi: 'Túi hành lý buộc chắc trên {vv}' },
  { id: 'work', re: /giao hang|dich vu|cong viec|cong ty|nhan vien|di lam/, en: '{v} parked outside a modern office building in the morning', vi: '{vv} đỗ trước tòa văn phòng buổi sáng' },
  { id: 'taxi', re: /taxi|grab/, en: '{v} and a taxi waiting on the same street', vi: '{vv} và taxi trên cùng một con phố' },
  { id: 'time', re: /dung gio|tre han|gia han|thoi diem|thoi gian/, rv: /sớm/, en: 'a wristwatch and a scooter key on a rental counter', vi: 'Đồng hồ đeo tay và chìa khóa xe trên quầy cho thuê', paper: true, prop: 'a rider checking a wristwatch beside it' },
  { id: 'chat', re: /\bapp\b|ung dung|agent|chatbot|tro ly|web|online|zalo|dien thoai|module|hybrid|feedback|assistant/, en: 'hands holding a smartphone showing a generic chat interface with blank message bubbles, {v} parked in soft focus behind', vi: 'Điện thoại hiển thị giao diện trò chuyện, phía sau là {vv}', prop: 'a smartphone with a generic chat interface held in the foreground' },
  { id: 'faq', rv: /câu hỏi|hỏi đáp/, en: 'a customer asking questions at an open rental counter while staff point to {v}', vi: 'Khách hỏi đáp tại quầy, bên cạnh là {vv}', prop: 'a customer and staff talking beside it' },
  { id: 'eco', re: /moi truong|tieng on|tuong lai|khuyen khich/, en: '{v} on a calm green street with trees and clean air', vi: '{vv} trên con phố xanh, yên tĩnh' }
];

/** People implied by the article angle. */
export const PEOPLE = [
  { id: 'family', re: /gia dinh/, en: 'a family with a young child, everyone wearing helmets', vi: 'gia đình có trẻ nhỏ' },
  { id: 'student', re: /sinh vien/, en: 'a university student with a backpack', vi: 'sinh viên' },
  { id: 'tourist', re: /nuoc ngoai|du khach|khach du lich|tieng anh|khach vang lai/, en: 'a foreign tourist', vi: 'du khách nước ngoài' },
  { id: 'beginner', re: /nguoi moi|lan dau/, en: 'a beginner rider', vi: 'người mới lái' },
  { id: 'senior', re: /cao tuoi/, en: 'an older adult', vi: 'người lớn tuổi' }
];

/** Time, season and weather. */
export const TIMES = [
  { id: 'sunset', re: /hoang hon/, en: 'at sunset with warm golden light', vi: 'lúc hoàng hôn' },
  { id: 'rain', re: /mua mua|troi mua|mua lon|ngay mua/, en: 'on a rainy day with wet reflective streets', vi: 'ngày mưa' },
  { id: 'night', rv: /đêm/, en: 'at night under warm street lights', vi: 'ban đêm' },
  { id: 'evening', re: /buoi toi/, en: 'in the early evening with street lights coming on', vi: 'buổi tối' },
  { id: 'morning', re: /buoi sang|chay buoi sang/, en: 'in soft early-morning light', vi: 'buổi sáng' },
  { id: 'summer', rv: /mùa hè|nắng/, en: 'on a bright hot summer day', vi: 'ngày hè nắng' },
  { id: 'autumn', re: /mua thu/, en: 'in autumn with golden leaves', vi: 'mùa thu' },
  { id: 'winter', rv: /mùa đông|lạnh/, en: 'on a cool winter morning', vi: 'mùa đông' },
  { id: 'holiday', rv: /nghỉ lễ|kỳ nghỉ|tết/, en: 'during a public holiday with red flags along the street', vi: 'dịp nghỉ lễ' },
  { id: 'peak', re: /cao diem/, en: 'at a busy peak time', vi: 'giờ cao điểm' },
  { id: 'weekend', re: /cuoi tuan|weekend/, en: 'on a relaxed weekend morning', vi: 'cuối tuần' }
];

/** Camera framings — the last variation axis, picked to keep briefs unique. */
export const FRAMINGS = [
  { id: 'medium', en: 'Eye-level medium shot' },
  { id: 'three-quarter', en: 'Three-quarter view from a low angle' },
  { id: 'wide', en: 'Wide establishing shot' },
  { id: 'detail', en: 'Close detail shot with a softly blurred background' },
  { id: 'over-shoulder', en: 'Over-the-shoulder view' },
  { id: 'high', en: 'Slightly elevated view' },
  { id: 'side', en: 'Clean side-profile view' },
  { id: 'flatlay', en: 'Top-down flat-lay composition' }
];

export const STYLE = 'Photorealistic editorial photograph, natural light, 3:2 landscape, sharp focus, realistic Vietnamese setting. No text, no captions, no watermark, no logos or brand badges, no shop signage, licence plates not readable, documents and screens unreadable, faces not the main subject; motorbikes without visible brand names, badges, lettering or decals; keys plain with logo-free fobs and no tags; paper and envelopes plain with no letters; anyone riding a motorbike, even far in the background, wears a helmet; background people naturally out of focus, never pixelated or censored.';

// ---------- data ----------

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])));
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (columns, rows) => [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
export { parseCsv };

const h2s = (html) => [...String(html).matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
/** First entry whose folded (`re`) or accented (`rv`) pattern matches. */
const pick = (list, text, vi = '', category = '') => list.find((e) => !(e.notFor ?? []).includes(category) &&
  ((e.re && e.re.test(text)) || (e.rv && e.rv.test(vi)))) ?? null;
const hashInt = (s) => parseInt(createHash('sha256').update(s).digest('hex').slice(0, 8), 16);
const fill = (tpl, v) => tpl.replace(/\{v\}/g, v.en).replace(/\{vv\}/g, v.vi);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** SEO filename: lowercase ASCII slug (≤ 60 chars on a word boundary) + id. */
export function imageFilename(slug, id) {
  let base = slug;
  if (base.length > 60) base = base.slice(0, 60).replace(/-[^-]*$/, '');
  return `${base}-${id.toLowerCase()}.webp`;
}

/** Build the brief for one article (pure; framing chosen by the caller). */
export function sceneFor({ category, title, keyword, slug, h2 = [], localScope = '' }) {
  const headVi = [title, keyword, localScope].join(' ').toLowerCase();
  const head = fold([headVi, slug.replace(/-/g, ' ')].join(' '));
  const outlineVi = h2.join(' ').toLowerCase();
  const outline = fold(outlineVi);
  const rot = (list, salt) => list[hashInt(`${slug}:${salt}`) % list.length];
  const vehicle = pick(VEHICLES, head, headVi) ?? rot(category === 'EV' ? DEFAULT_VEHICLE.EV : DEFAULT_VEHICLE.any, 'v');
  const named = pick(PLACES, head, headVi) ?? (category === 'LOCAL' ? pick(PLACES, outline, outlineVi) : null);
  const preferIds = PREFER[category] ?? (APP_TITLE.test(fold(title)) ? PREFER.APP : []);
  // An electric vehicle is never shown at a petrol pump.
  const themes = ELECTRIC.has(vehicle.id) ? THEMES.filter((t) => t.id !== 'fuel') : THEMES;
  const preferred = preferIds.map((id) => themes.find((t) => t.id === id)).filter(Boolean);
  const theme = pick(preferred, head, headVi, category) ?? pick(themes, head, headVi, category)
    ?? (category === 'LOCAL' ? null : pick(themes, outline, outlineVi, category));
  const hero = MODELS.has(vehicle.id) && theme && (theme.paper || theme.prop) ? theme : null;
  const place = named ?? (theme?.placeId ? PLACES.find((x) => x.id === theme.placeId) : null)
    ?? (theme?.paper && !hero ? COUNTER : AT_LIGHTS.has(theme?.id) ? DEFAULT_PLACE.SAFE[0]
    : rot(DEFAULT_PLACE[category] ?? DEFAULT_PLACE.any, 'p'));
  const people = pick(PEOPLE, head, headVi);
  const time = pick(TIMES, head, headVi) ?? rot(DEFAULT_TIMES, 't');
  // One extra concrete detail: the next distinct theme of the title, else of the outline.
  const ok = SECOND_OK[groupOf(theme)];
  const rest = THEMES.filter((t) => t.id !== theme?.id && ok.includes(t.id) && !(t.id === 'charge' && vehicle.id !== 'ev'));
  const second = pick(rest, head, headVi, category) ?? pick(rest, outline, outlineVi, category);
  return { vehicle, place, theme, hero, people, time, second };
}

function compose(scene, framing, category) {
  const { vehicle, place, theme, hero, people, time, second } = scene;
  const action = hero ? `${vehicle.en} parked as the clear main subject, with ${hero.prop ?? 'a few related props'}`
    : theme ? fill(theme.en, vehicle)
      : category === 'LOCAL' ? `a rider wearing a helmet on ${vehicle.en}, exploring` : `${vehicle.en} parked`;
  const parts = [`${framing.en}: ${action}`];
  if (second && PROPS[second.id] && !hero) parts.push(`with ${PROPS[second.id]} in view`);
  if (people) parts.push(`featuring ${people.en}`);
  parts.push(`setting: ${place.en}`);
  if (time) parts.push(time.en);
  const prompt = `${parts.join('; ')}. ${STYLE}`;
  // Planned ALT (Vietnamese, natural, ≤ 125 chars) — rewritten after viewing.
  let alt = hero ? cap(vehicle.vi) : theme ? fill(theme.vi, vehicle)
    : (category === 'LOCAL' ? `Người lái ${vehicle.vi} khám phá` : `${cap(vehicle.vi)} đỗ`);
  if (people && !/gia đình|trẻ em/.test(alt)) alt += hero ? ` bên ${people.vi}` : ` cùng ${people.vi}`;
  if (place.vi) alt += ` ${place.vi}`;
  if (time?.vi) alt += `, ${time.vi}`;
  alt = cap(alt.replace(/\s+/g, ' ').trim());
  if (alt.length > 125 && time) alt = alt.slice(0, alt.lastIndexOf(','));
  const brief = [
    `Chủ thể: ${hero ? 'xe (' + hero.id + ')' : theme ? theme.id : 'xe'} · ${vehicle.vi}`,
    place.vi ? `bối cảnh: ${place.vi.replace(/^(trên|bên|tại|trong|giữa|trước|cạnh|ven|gần|ở) /, '')}` : 'bối cảnh: quầy cho thuê',
    people ? `nhân vật: ${people.vi}` : null,
    second ? `chi tiết phụ: ${second.id}` : null,
    time ? `ánh sáng/thời điểm: ${time.vi || time.id}` : null,
    `khung hình: ${framing.id}`
  ].filter(Boolean).join('; ');
  return { prompt, alt, brief };
}

export function loadArticles() {
  const published = JSON.parse(read('data/blog/published.json')).articles;
  const meta = JSON.parse(read('data/seo/article-meta.json')).articles;
  const matrix = Object.fromEntries(parseCsv(read('data/blog/content-matrix.csv')).map((r) => [r.article_id, r]));
  return published.map((a) => {
    const row = matrix[a.article_id] ?? {};
    const m = meta[a.article_id] ?? {};
    const dir = taxonomy.categories[a.category].dir;
    return {
      id: a.article_id,
      category: a.category,
      slug: a.slug,
      url: `${SITE}blog/${dir}/${a.slug}/`,
      title: m.title ?? a.title,
      keyword: m.keyword ?? row.primary_keyword ?? '',
      intent: row.search_intent ?? '',
      localScope: row.local_scope ?? '',
      subtopic: deriveSubtopic(a.category, row).label,
      h2: existsSync(join(ROOT, a.body)) ? h2s(read(a.body)) : []
    };
  }).sort((x, y) => x.id.localeCompare(y.id));
}

export const PLAN_COLUMNS = ['article_id', 'scope', 'category', 'subtopic', 'slug', 'url', 'title', 'primary_keyword',
  'search_intent', 'filename', 'vehicle', 'place', 'theme', 'people', 'time', 'framing', 'brief_vi', 'prompt_en', 'alt_plan'];

/** Deterministic plan for every published article; prompts are unique. */
export function buildPlan(articles = loadArticles()) {
  const seen = new Set();
  return articles.map((a) => {
    const scene = sceneFor(a);
    const start = hashInt(a.id) % FRAMINGS.length;
    let framing, out;
    for (let k = 0; k < FRAMINGS.length; k++) {
      framing = FRAMINGS[(start + k) % FRAMINGS.length];
      out = compose(scene, framing, a.category);
      if (!seen.has(out.prompt)) break;
    }
    if (seen.has(out.prompt)) {
      // All framings taken: add the first H2 as a concrete scene note.
      out.prompt = out.prompt.replace('. Photorealistic', `; scene detail inspired by the section "${a.h2[0] ?? a.title}". Photorealistic`);
    }
    if (seen.has(out.prompt)) throw new Error(`image-briefs: duplicate prompt for ${a.id}`);
    seen.add(out.prompt);
    return {
      article_id: a.id,
      scope: Number(a.id.slice(3)) <= FOUNDATION_ROWS ? 'TARGET' : 'EXTRA',
      category: a.category,
      subtopic: a.subtopic,
      slug: a.slug,
      url: a.url,
      title: a.title,
      primary_keyword: a.keyword,
      search_intent: a.intent,
      filename: imageFilename(a.slug, a.id),
      vehicle: scene.vehicle.id,
      place: scene.place.id,
      theme: scene.theme?.id ?? '',
      people: scene.people?.id ?? '',
      time: scene.time?.id ?? '',
      framing: framing.id,
      brief_vi: out.brief,
      prompt_en: out.prompt,
      alt_plan: out.alt
    };
  });
}

export function loadPlan() {
  return existsSync(join(ROOT, PLAN_CSV)) ? parseCsv(read(PLAN_CSV)) : [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = buildPlan();
  const csv = toCsv(PLAN_COLUMNS, plan);
  const arg = process.argv[2];
  if (arg === '--show') {
    console.log(JSON.stringify(plan.find((r) => r.article_id === process.argv[3]), null, 2));
  } else if (arg === '--check') {
    const current = existsSync(join(ROOT, PLAN_CSV)) ? read(PLAN_CSV) : '';
    if (current !== csv) { console.error(`${PLAN_CSV} is stale — run node tools/image-briefs.mjs`); process.exit(1); }
    console.log(`${PLAN_CSV} up to date (${plan.length} briefs)`);
  } else {
    writeFileSync(join(ROOT, PLAN_CSV), csv);
    const target = plan.filter((r) => r.scope === 'TARGET').length;
    console.log(`wrote ${PLAN_CSV}: ${plan.length} briefs (${target} TARGET, ${plan.length - target} EXTRA)`);
  }
}
