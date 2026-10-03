#!/usr/bin/env node
/**
 * Generate the BLOG content matrix (data/blog/content-matrix.csv).
 *
 * SEPARATE from the chatbot development matrix (docs/matrix/).
 * Baseline: 2,000 production article rows, 40 batches x 50 articles.
 * Distribution: APP 350, RENT 400, EV 300, GUIDE 300, SAFE 250, LOCAL 400.
 * Idempotent: regenerating overwrites with identical output (no Date/random).
 *
 * v69 AUTO-REFILL: `--refill` APPENDS fresh PLANNED rows when the queue
 * runs low (planned < REFILL_MIN_PLANNED = 100) up to ~REFILL_TARGET = 300
 * planned rows. It NEVER deletes or rewrites existing rows (statuses,
 * scores and dates survive untouched), never recycles used topics and
 * stops cleanly at each category's topic capacity. Production loops must
 * use --refill; a bare run regenerates the 2,000-row baseline and WIPES
 * live statuses (that is the original generator behaviour, kept for
 * local rebuilds only).
 *
 * Rows are PLANNED only. Publication happens through tools/blog-factory.mjs
 * (state machine PLANNED -> WRITING -> QA -> PASS -> PUBLISHED).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/blog/content-matrix.csv');

/** v69 auto-refill thresholds (docs/CONTINUOUS-WRITER.md). */
export const REFILL_MIN_PLANNED = 100;
export const REFILL_TARGET = 300;

export const CATEGORIES = Object.freeze([
  { id: 'APP', dir: 'app', name: 'App & Ứng dụng', count: 350 },
  { id: 'RENT', dir: 'thue-xe', name: 'Thuê xe máy', count: 400 },
  { id: 'EV', dir: 'xe-dien', name: 'Xe điện / xe máy điện', count: 300 },
  { id: 'GUIDE', dir: 'huong-dan', name: 'Hướng dẫn / thủ tục', count: 300 },
  { id: 'SAFE', dir: 'an-toan', name: 'An toàn / pháp lý', count: 250 },
  { id: 'LOCAL', dir: 'dia-phuong', name: 'Địa phương / du lịch', count: 400 }
]);

const AUTHOR = 'MotoAI Editorial';
const TODAY = '2026-09-26';

/** Deterministic slug from Vietnamese text (unaccented, hyphenated). */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Topic templates per category. {v} slots are filled deterministically. */
const TOPICS = {
  APP: [
    'app thuê xe máy là gì', 'cách dùng ứng dụng thuê xe máy', 'ứng dụng thuê xe có an toàn không',
    'cách tính giá thuê xe bằng app', 'chọn xe bằng Agent', 'thuê xe online như thế nào',
    'web app và app native khác gì nhau', 'đặt xe bằng ứng dụng', 'privacy và xử lý cục bộ trong app thuê xe',
    'app thuê xe cho khách du lịch', 'ứng dụng thuê xe máy hoạt động ra sao', 'trợ lý thuê xe máy là gì',
    'tìm xe máy thuê bằng ứng dụng', 'so sánh cách thuê xe truyền thống và qua app',
    'ứng dụng web thuê xe máy', 'công cụ tính giá thuê xe máy online', 'hỏi đáp với Agent thuê xe',
    'cách hỏi giá xe nhanh bằng chatbot', 'gợi ý chọn xe máy phù hợp', 'tính chi phí thuê xe theo ngày tuần tháng',
    'ứng dụng tìm xe máy giá tốt', 'app hỗ trợ thủ tục thuê xe', 'công cụ chọn xe theo kinh nghiệm lái',
    'chatbot thuê xe máy có đáng tin không', 'xử lý dữ liệu cá nhân khi thuê xe online',
    'kịch bản dùng app thuê xe cho người mới', 'so sánh ứng dụng thuê xe máy điện và xe xăng',
    'ứng dụng thuê xe không cần tải', 'rental assistant là gì', 'agent chọn xe giúp bạn',
    'đặt cọc và ứng dụng thuê xe', 'nhận xe khi đặt qua ứng dụng', 'hủy lịch thuê xe qua app',
    'app thuê xe cho người nước ngoài', 'ứng dụng thuê xe tiếng Anh',
    'kết nối Zalo với ứng dụng thuê xe', 'gọi điện từ ứng dụng thuê xe',
    'kinh nghiệm dùng trợ lý thuê xe lần đầu', 'ứng dụng thuê xe trên điện thoại cũ',
    'app thuê xe không cần tài khoản', 'trợ lý ảo tư vấn thuê xe máy',
    'cách ứng dụng hiểu câu hỏi về giá xe', 'tìm hiểu hybrid search trong ứng dụng thuê xe',
    'ai trả lời trong ứng dụng thuê xe', 'chính sách dữ liệu của ứng dụng thuê xe',
    'câu hỏi thường gặp về app thuê xe', 'dùng ứng dụng thuê xe khi đi du lịch Hà Nội',
    'lộ trình tính năng của ứng dụng thuê xe máy', 'ứng dụng thuê xe và khách vãng lai',
    'cách gửi feedback cho ứng dụng thuê xe', 'module gợi ý xe trong ứng dụng thuê xe',
    'tại sao nên dùng ứng dụng trước khi gọi điện', 'soạn câu hỏi hiệu quả cho Agent thuê xe',
    'ứng dụng thuê xe và người mới biết lái xe', 'cảnh giác với app thuê xe giả mạo',
    'trợ lý thuê xe xử lý câu hỏi đa ngôn ngữ', 'tính năng tìm hiểu thủ tục trong app',
    'quy trình tư vấn tự động chọn xe', 'ứng dụng hỗ trợ thuê xe theo tháng',
    'chọn thời điểm thuê xe bằng ứng dụng', 'câu chuyện người dùng ứng dụng thuê xe'
  ],
  RENT: [
    'thuê xe máy giá rẻ', 'giá thuê xe máy theo ngày', 'thuê xe máy theo tuần', 'thuê xe máy theo tháng',
    'cho thuê xe máy thủ tục đơn giản', 'thuê xe số', 'thuê xe ga', 'thuê xe 50cc',
    'thuê honda vision', 'thuê honda air blade', 'thuê wave alpha', 'thuê xe hạng nhẹ',
    'so sánh giá các loại xe máy cho thuê', 'cọc thuê xe máy bao nhiêu', 'nhận xe thuê cần gì',
    'trả xe thuê đúng giờ', 'phí trễ hạn khi thuê xe', 'kiểm tra xe trước khi nhận',
    'điều kiện thuê xe máy ở hà nội', 'thuê xe không bằng lái được không', 'bằng lái a1 và thuê xe máy',
    'người nước ngoài thuê xe máy việt nam', 'khách du lịch thuê xe máy', 'thuê xe cho người cao tuổi',
    'thuê xe hai người', 'chở người thân trên xe thuê', 'đi phố cổ bằng xe máy thuê',
    'thuê xe dài ngày giá tốt', 'ưu đãi thuê xe dài hạn', 'mùa cao điểm thuê xe máy',
    'đặt xe trước hay đến trực tiếp', 'liên hệ đặt xe nhanh', 'xác nhận giá trước khi đặt',
    'xe thuê có bảo hiểm không', 'hỏng xe giữa đường khi thuê', 'hỗ trợ khi xe thuê gặp sự cố',
    'thuê xe giao tận nơi', 'phí giao xe thuê', 'thuê xe ở ga tàu sân bay',
    'so sánh thuê xe máy và taxi', 'thuê xe máy hay đi grab', 'khoảng chi phí đi lại khi thuê xe',
    'bảng giá thuê xe tham khảo', 'cách đọc bảng giá thuê xe', 'giá thuê thay đổi theo mùa không',
    'thuê xe cho công việc giao hàng', 'thuê xe chạy dịch vụ', 'chọn xe theo mục đích sử dụng',
    'thuê xe số hay xe ga cho người mới', 'xe nào tiết kiệm xăng khi thuê', 'xe nào dễ điều khiển',
    'thuê xe máy cũ hay mới', 'tình trạng xe tại cửa hàng', 'đồngo kèm theo xe thuê',
    'mũ bảo hiểm khi thuê xe', 'áo mưa khi thuê xe máy', 'giá xe tháng cho sinh viên',
    'thuê xe dài hạn cho người đi làm', 'hợp đồng thuê xe máy', 'thuê xe công ty cho nhân viên'
  ],
  EV: [
    'app thuê xe điện', 'ứng dụng thuê xe máy điện', 'chọn xe điện phù hợp',
    'thuê xe điện theo ngày', 'thuê xe điện dài ngày', 'pin của xe máy điện',
    'phạm vi hoạt động của xe điện', 'hướng dẫn sử dụng xe máy điện', 'khác biệt xe điện và xe xăng',
    'sạc pin xe điện ở đâu', 'thời gian sạc xe máy điện', 'chi phí điện khi thuê xe điện',
    'thuê xe điện có rẻ không', 'xe điện chạy bao xa', 'xe máy điện cho người mới',
    'xe điện an toàn không', 'bảo dưỡng xe điện', 'xe điện khi mưa',
    'đi xe điện đường dài', 'xe điện trong phố', 'xe điện chở hai người',
    'vận tốc xe máy điện', 'đăng ký thuê xe điện', 'cọc khi thuê xe điện',
    'so sánh các dòng xe điện cho thuê', 'thuê xe điện cho khách du lịch',
    'cách giữ pin bền khi thuê xe điện', 'hết pin giữa đường phải làm gì', 'trạm đổi pin',
    'app theo dõi pin xe điện', 'ứng dụng tìm chỗ sạc xe', 'công cụ ước tính quãng đường xe điện',
    'xe điện và mùi môi trường', 'xe điện giảm tiếng ồn phố', 'chính sách khuyến khích xe điện',
    'xe điện hết hạn pin', 'thuê xe điện ban đêm', 'xe điện và thời tiết lạnh',
    'xe điện và đường dốc', 'lốp xe điện', 'phanh xe máy điện',
    'hộp số xe điện', 'chìa khóa xe điện thông minh', 'app mở khóa xe điện',
    'cửa hàng cho thuê xe điện', 'dịch vụ sửa xe điện', 'kiểm tra xe điện trước khi thuê',
    'quy trình trả xe điện', 'pin chảy khi không dùng', 'bảo quản xe điện mùa mưa',
    'xe điện cho thành phố nhỏ', 'tương lai xe điện cho thuê'
  ],
  GUIDE: [
    'thủ tục thuê xe máy', 'giấy tờ cần khi thuê xe', 'hướng dẫn đặt xe nhanh',
    'quy trình nhận xe', 'quy trình trả xe', 'kiểm tra xe khi nhận',
    'hợp đồng thuê xe cần những gì', 'đặt cọc thế nào', 'nhận lại tiền cọc',
    'chụp ảnh xe trước khi nhận', 'nhiên liệu khi nhận trả xe', 'giao xe tận nơi thủ tục',
    'hủy đặt xe đúng cách', 'đổi xe giữa kỳ thuê', 'gia hạn thời gian thuê',
    'chở hành lý khi thuê xe', 'đi hai người trên xe thuê', 'bản đồ và định vị khi thuê xe',
    'ứng dụng bản đồ cho người thuê xe', 'kỹ năng lái xe an toàn cơ bản',
    'chạy xe số cho người mới', 'chạy xe ga lần đầu', 'chạy xe điện lần đầu',
    'đỗ xe ở hà nội', 'luật đỗ xe phố cổ', 'trộm cắp xe và xe thuê',
    'khoá xe khi thuê', 'sửa xe nhỏ khi đang thuê', 'gặp cảnh sát giao thông với xe thuê',
    'giấy tờ người nước ngoài thuê xe', 'dịch công chứng giấy tờ thuê xe',
    'thuê xe cho người dưới 18 tuổi', 'thuê xe cần người bảo lãnh không',
    'thời gian nhận xe sớm', 'nhận xe ban đêm', 'giao xe tại khách sạn',
    'giao xe tại sân bay nội bài', 'thuê xe và check-in khách sạn',
    'lên kế hoạch hành trình với agent', 'tính lộ trình thuê xe theo ngày',
    'đi chợ bằng xe thuê', 'mua sắm và chở đồ', 'ăn uống và lái xe an toàn',
    'trời mưa thuê xe máy', 'mùa đông thuê xe hà nội', 'nắng nóng và lái xe',
    'đi đường trường bằng xe thuê', 'đèo dốc và xe máy thuê', 'đường vành đai hà nội',
    'trả xe đúng giờ để tránh phí', 'đánh giá cửa hàng sau khi thuê'
  ],
  SAFE: [
    'luật giao thông đường bộ cơ bản', 'nồng độ cồn khi lái xe', 'mũ bảo hiểm chuẩn',
    'tốc độ cho phép trong phố', 'đi xe không giấy phép', 'bằng lái a1 a2 khác gì',
    'người nước ngoài lái xe ở việt nam', 'idp và bằng lái quốc tế',
    'bảo hiểm khi thuê xe máy', 'trách nhiệm khi tai nạn với xe thuê',
    'thủ tục khi va chạm nhẹ', 'gọi cảnh sát khi tai nạn', 'khám sức khỏe lái xe',
    'đèn xe và an toàn đêm', 'kỹ năng phanh gấp', 'gương chiếu hậu an toàn',
    'mưa lớn và lái xe', 'sương mù mùa đông', 'tầm nhìn khi lái xe',
    'xe cộ phía trước và khoảng cách an toàn', 'làn đường và quy tắc nhường',
    'đèn đỏ và camera phạt nguội', 'đi ngược chiều hậu quả', 'điện thoại khi lái xe',
    'chở trẻ em trên xe máy', 'quy định mũ bảo hiểm trẻ em', 'đeo nón đúng cách',
    'thuốc và lái xe', 'mệt mỏi khi lái đường dài', 'đi nhóm an toàn',
    'bão và xe máy', 'ngập nước và xe máy', 'trộm xe và phòng ngừa',
    'camera phạt nguội khi thuê xe', 'phạt nguội và xe thuê', 'ai chịu phạt khi đi xe thuê',
    'cầm đồ xe máy đúng luật', 'mua bán xe máy giấy tờ', 'kiểm định xe máy',
    'thuế và phí xe máy cá nhân', 'tránh app thuê xe lừa đảo', 'nhận diện hợp đồng thuê xe hợp pháp',
    'quyền của người thuê xe', 'nghĩa vụ của bên cho thuê', 'khiển nại dịch vụ thuê xe',
    'bảo vệ dữ liệu cá nhân khi thuê xe', 'an toàn khi thanh toán cọc'
  ],
  LOCAL: [
    'thuê xe máy quanh long biên', 'đi phố cổ bằng xe máy', 'du lịch hoàn kiếm bằng xe máy',
    'hồ tây và xe máy', 'ba đình xe máy phượng', 'cầu giấy đi xe máy', 'đống đa và xe máy',
    'thanh xuân đường đi', 'hai bà trưng hành trình', 'gia lâm và long biên',
    'sông hồng và cầu long biên', 'chợ long biên đêm', 'phố cổ ẩm thực xe máy',
    'hồ gươm ban đêm', 'ven đê sông hồng', 'cột cờ hoàng thành', 'lăng chủ tích qua phố',
    'bảo tàng hà nội hành trình', 'phố sách hà nội', 'nhà thờ lớn hà nội',
    'làng gốm bát tràng', 'bát tràng gốm xe máy', 'đường đồng by bike',
    'văn giang ev and bikes', 'chùa và Hà Nội', 'đền nguyễn cần bằng xe',
    'quảng đi long biên view', 'hoàng hôn hồ tây', 'chạy buổi sáng hồ gươm',
    'cà phê phố cổ', 'cà phê trứng và xe máy', 'bánh cuốn và hành trình',
    'phở bò và hành trình sáng', 'chợ hoa quận tám', 'chùa một cột hà nội',
    'cầu nhật tân hoàng hôn', 'đường 5 và ngoại ô', 'soc son và co loa',
    'ba vì cuối tuần', 'thạch thất và sơn tây', 'hòa bình đường trường',
    'tam đảo bằng xe máy', 'mộc châu hành trình dài', 'ninh bình cuối tuần xe máy',
    'hạ long đường quốc lộ', 'cửa lò ven biển', 'thanh hóa và xe đường dài',
    'tràng an ride', 'bái đính xe máy', 'cúc phương weekend',
    'hành trình mài châu', 'đà lạt đường xa', 'huế xuyên việt',
    'đà nẵng hành trình bắc nam', 'hội an cuối tuần', 'sài gòn đường nam',
    'mekong delta ride', 'ha giang vòng cung', 'cao nguyên đá đồng văn',
    'mèo vạc đồng cao' 
  ]
};

/** Variants used to extend seeds to the required count without duplicates. */
const VARIANTS = {
  APP: ['cho người mới', 'năm 2026', 'tại Hà Nội', 'cho khách nước ngoài', 'tận nơi', 'câu hỏi thường gặp'],
  RENT: ['giá tốt nhất', 'kỳ nghĩ lễ', 'cho sinh viên', 'cho gia đình', 'chạy phố', 'cuối tuần'],
  EV: ['cho người mới', 'cho khách du lịch', 'giá tốt', 'mùa hè', 'mùa mưa', 'dài hạn'],
  GUIDE: ['từ A đến Z', 'cho người mới', 'cho khách nước ngoài', 'nhanh gọn', 'tại Hà Nội', 'checklist'],
  SAFE: ['cần biết 2026', 'cho du khách', 'cho người mới', 'tóm tắt', 'ví dụ thực tế', 'câu hỏi thường gặp'],
  LOCAL: ['trong ngày', 'hai ngày một đêm', 'cuối tuần', 'buổi sáng', 'buổi tối', 'mùa thu']
};

const INTENT = { APP: 'informational-product', RENT: 'commercial-informational', EV: 'informational-product', GUIDE: 'informational', SAFE: 'informational-legal', LOCAL: 'local-informational' };
const SOURCE_POLICY = { APP: 'no-external', RENT: 'no-external', EV: 'no-external', GUIDE: 'no-external', SAFE: 'legal-gate', LOCAL: 'no-external' };

function buildTopics(catId, count) {
  const seeds = TOPICS[catId];
  const variants = VARIANTS[catId];
  // Capacity guard: seeds x (bare + variants) unique titles exist; asking
  // for more would loop forever. The refill stops at capacity instead.
  const maxI = seeds.length * (variants.length + 1);
  const list = [];
  const seen = new Set();
  let i = 0;
  while (list.length < count && i < maxI) {
    const seed = seeds[i % seeds.length];
    const round = Math.floor(i / seeds.length);
    const title = round === 0 ? seed : `${seed} ${variants[round % variants.length]}`;
    i++;
    if (seen.has(title)) continue;
    seen.add(title);
    list.push(title);
  }
  return list;
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Deterministic unique slug for a topic (suffix -2, -3… on collision). */
function uniqueSlugOf(topic, usedSlugs, n) {
  let slug = slugify(topic);
  if (slug.length === 0) slug = `bai-viet-${n}`;
  let unique = slug;
  let suffix = 2;
  while (usedSlugs.has(unique)) unique = `${slug}-${suffix++}`;
  usedSlugs.add(unique);
  return unique;
}

/** One PLANNED matrix row (shared by the baseline generator and --refill). */
function makeRow(n, cat, topic, usedSlugs) {
  const slug = uniqueSlugOf(topic, usedSlugs, n);
  return {
    article_id: `BA-${String(n).padStart(4, '0')}`,
    batch_id: `B${String(Math.ceil(n / 50)).padStart(2, '0')}`,
    category: cat.id,
    status: 'PLANNED',
    primary_keyword: topic,
    secondary_keywords: `${cat.name}; ${topic}`,
    search_intent: INTENT[cat.id],
    working_title: titleCase(topic),
    slug,
    output_path: `blog/${cat.dir}/${slug}/index.html`,
    parent_hub: `blog/${cat.dir}/`,
    local_scope: cat.id === 'LOCAL' ? localScope(topic) : '',
    requires_sources: cat.id === 'SAFE' ? 'yes' : 'no',
    source_policy: SOURCE_POLICY[cat.id],
    internal_link_targets: `blog/${cat.dir}/; /`,
    commercial_link_target: 'none',
    agent_retrieval: cat.id === 'SAFE' ? 'no' : 'yes',
    author: AUTHOR,
    score: '',
    quality_status: '',
    repair_attempts: '0',
    published_date: '',
    last_checked: '',
    notes: cat.id === 'SAFE' ? 'legal-gate: CLAIM->SUBJECT->CONDITION->RULE->VERSION->PRIMARY SOURCE required' : ''
  };
}

export function buildRows() {
  const queues = CATEGORIES.map((c) => ({ cat: c, topics: buildTopics(c.id, c.count) }));
  const rows = [];
  const usedSlugs = new Set();
  let n = 0;
  // Round-robin across categories so every batch has a healthy mix.
  const indexes = new Array(queues.length).fill(0);
  while (n < 2000) {
    for (let q = 0; q < queues.length && n < 2000; q++) {
      const { cat, topics } = queues[q];
      const idx = indexes[q];
      if (idx >= topics.length) continue;
      indexes[q]++;
      n++;
      rows.push(makeRow(n, cat, topics[idx], usedSlugs));
    }
  }
  return rows;
}

/**
 * v69 auto-refill: append fresh PLANNED rows when planned < 100 until
 * ~300 planned. Existing rows (statuses, scores, dates) are byte-preserved:
 * the new rows are appended as CSV lines, never merged or reordered.
 * Topics already used anywhere in the matrix are skipped, so keywords and
 * slugs stay unique. Returns { refilled, planned_before, planned_after,
 * appended } and is a no-op on a healthy queue.
 */
export function refillMatrix() {
  const raw = readFileSync(OUT, 'utf8');
  const lines = raw.trim().split('\n');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
  const plannedBefore = rows.filter((r) => r.status === 'PLANNED').length;
  if (plannedBefore >= REFILL_MIN_PLANNED) {
    return { refilled: 0, planned_before: plannedBefore, planned_after: plannedBefore, appended: 0 };
  }
  const usedKeywords = new Set(rows.map((r) => r.primary_keyword.trim().toLowerCase()));
  const usedSlugs = new Set(rows.map((r) => r.slug));
  let maxN = rows.reduce((m, r) => Math.max(m, Number(String(r.article_id).replace('BA-', '')) || 0), 0);
  // Full topic pools (capacity-guarded), skipping topics the matrix used.
  const pools = CATEGORIES.map((c) => ({ cat: c, topics: buildTopics(c.id, Infinity) }));
  const cursors = new Array(pools.length).fill(0);
  const appended = [];
  let planned = plannedBefore;
  while (planned < REFILL_TARGET) {
    let added = 0;
    for (let q = 0; q < pools.length && planned < REFILL_TARGET; q++) {
      const { cat, topics } = pools[q];
      while (cursors[q] < topics.length && usedKeywords.has(topics[cursors[q]].toLowerCase())) cursors[q]++;
      if (cursors[q] >= topics.length) continue; // category at capacity
      const topic = topics[cursors[q]++];
      usedKeywords.add(topic.toLowerCase());
      maxN++;
      planned++;
      added++;
      appended.push(makeRow(maxN, cat, topic, usedSlugs));
    }
    if (added === 0) break; // every category exhausted its topic capacity
  }
  if (appended.length > 0) {
    const prefix = raw.endsWith('\n') ? raw : raw + '\n';
    writeFileSync(OUT, prefix + appended.map((r) => csvLine(r)).join('\n') + '\n', 'utf8');
  }
  return { refilled: appended.length, planned_before: plannedBefore, planned_after: planned, appended: appended.length };
}

// LOCAL rows must only ever claim a locality that exists in
// data/local/hanoi.json (the LOCAL quality gate enforces this for PUBLISHED
// rows). Landmarks such as "phố cổ" or "hồ tây" are NOT verified unit names,
// so they must stay unclaimed (''), never guessed into a phường.
const LOCALITY_CLAIMS = Object.freeze({
  'long biên': 'Long Biên',
  'hoàn kiếm': 'Hoàn Kiếm',
  'tây hồ': 'Tây Hồ',
  'ba đình': 'Ba Đình',
  'cầu giấy': 'Cầu Giấy',
  'đống đa': 'Đống Đa',
  'thanh xuân': 'Thanh Xuân',
  'hai bà trưng': 'Hai Bà Trưng'
});

/** Canonical verified-unit claim for a LOCAL topic ('' = claim nothing). */
export function localScope(topic) {
  const t = String(topic || '').toLowerCase();
  // 'hồ tây' must be tested before 'tây hồ' would ever match the same text.
  if (t.includes('hồ tây') || t.includes('phố cổ')) return '';
  for (const [needle, unit] of Object.entries(LOCALITY_CLAIMS)) {
    if (t.includes(needle)) return unit;
  }
  return '';
}

function titleCase(s) {
  return s.split(' ').map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

export const COLUMNS = ['article_id', 'batch_id', 'category', 'status', 'primary_keyword', 'secondary_keywords', 'search_intent', 'working_title', 'slug', 'output_path', 'parent_hub', 'local_scope', 'requires_sources', 'source_policy', 'internal_link_targets', 'commercial_link_target', 'agent_retrieval', 'author', 'score', 'quality_status', 'repair_attempts', 'published_date', 'last_checked', 'notes'];

/** One CSV data line for a row object (shared by toCsv and --refill). */
const csvLine = (row) => COLUMNS.map((c) => csvCell(row[c])).join(',');

export function toCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) lines.push(csvLine(row));
  return lines.join('\n') + '\n';
}

export function main() {
  if (process.argv.includes('--refill')) {
    const r = refillMatrix();
    console.log(`refill: refilled=${r.refilled} planned_before=${r.planned_before} planned_after=${r.planned_after} appended=${r.appended}`);
    return;
  }
  const rows = buildRows();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, toCsv(rows), 'utf8');
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, rows.filter((r) => r.category === c.id).length]));
  console.log(`wrote ${rows.length} rows -> ${OUT}`, counts);
}

// Run directly; importable for tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
