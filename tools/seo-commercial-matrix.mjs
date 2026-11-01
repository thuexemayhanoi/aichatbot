#!/usr/bin/env node
// Full commercial SEO plan: deterministic, no changes to published content.
import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import{dirname,join}from'node:path';
import{fileURLToPath}from'node:url';
import assert from'node:assert/strict';
const R=join(dirname(fileURLToPath(import.meta.url)),'..'),D=join(R,'docs/seo/commercial'),S='https://chatbot.thuexemaynguyentu.com/';
const get=p=>readFileSync(join(R,p),'utf8'),norm=s=>String(s||'').normalize('NFC').toLowerCase().trim();
const cell=s=>{s=String(s??'');return /[,"\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s};
const csv=(h,a)=>[h.join(','),...a.map(r=>h.map(k=>cell(r[k])).join(','))].join('\n')+'\n';
function parse(s){let a=[],r=[],v='',q=false;for(let i=0;i<s.length;i++){let x=s[i];if(x==='"'){if(q&&s[i+1]==='"'){v+='"';i++}else q=!q}else if(x===','&&!q){r.push(v);v=''}else if((x==='\n'||x==='\r')&&!q){if(x==='\r'&&s[i+1]==='\n')i++;r.push(v);if(r.some(Boolean))a.push(r);r=[];v=''}else v+=x}if(q)throw Error('Invalid CSV');if(v||r.length){r.push(v);a.push(r)}let[h,...data]=a;return data.map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]||''])))}
const source=parse(get('data/blog/content-matrix.csv')).filter(r=>r.status==='PUBLISHED'),
 meta=JSON.parse(get('data/seo/article-meta.json')).articles||{},
 published=JSON.parse(get('data/blog/published.json')).articles;
assert.equal(source.length,published.length,'Published count mismatch');
assert.ok(source.length>=2000,'Expected at least 2000 published articles');
assert.equal(new Set(source.map(r=>r.article_id)).size,source.length,'Duplicate IDs');
assert.equal(new Set(source.map(r=>r.output_path)).size,source.length,'Duplicate paths');
const hubs={APP:'/blog/app/',RENT:'/blog/thue-xe/',EV:'/blog/xe-dien/',GUIDE:'/blog/huong-dan/',SAFE:'/blog/an-toan/',LOCAL:'/blog/dia-phuong/'};
const owners=new Map();for(const r of source.slice().sort((a,b)=>a.article_id.localeCompare(b.article_id))){let k=norm(r.primary_keyword);if(!owners.has(k))owners.set(k,r.article_id)}
const head=new Set(['cho thuê xe máy ở hà nội','cho thuê xe máy hà nội','thuê xe máy hà nội','thuê xe máy ở hà nội']);
function group(r){let q=norm(r.primary_keyword);if(r.category==='APP')return'APP-AGENT';if(r.category==='LOCAL')return'LOCAL-HANOI';if(r.category==='GUIDE')return'GUIDE-PROCEDURE';if(r.category==='SAFE')return'LEGAL-SAFETY';if(r.category==='EV')return'EV-RENTAL';if(/tháng/.test(q))return'RENT-MONTH';if(/50cc/.test(q))return'RENT-50CC';if(/vision/.test(q))return'RENT-VISION';if(/tuần/.test(q))return'RENT-WEEK';if(/ngày/.test(q))return'RENT-DAY';if(/giá|chi phí/.test(q))return'RENT-PRICE';return'RENT-GENERAL'}
const rows=source.map(r=>{const m=meta[r.article_id]||{},p=m.keyword||r.primary_keyword,url=S+r.output_path.replace(/^\/+/,'').replace(/index\.html$/,'');const clash=owners.get(norm(r.primary_keyword))!==r.article_id,headOverlap=head.has(norm(p)),legal=r.requires_sources==='yes',commercial=['RENT','EV','LOCAL'].includes(r.category);return{
 id:r.article_id,url,category:r.category,cluster:group(r),existing_title:r.working_title,
 proposed_title:m.title||r.working_title,original_primary:r.primary_keyword,proposed_primary:headOverlap?r.primary_keyword:p,
 secondary_keywords:r.secondary_keywords||'',intent:r.search_intent,
 role:commercial?'COMMERCIAL_SUPPORT':r.category==='APP'?'APP_PRODUCT':'INFORMATIONAL_SUPPORT',
 parent_hub:S.slice(0,-1)+'/'+String(r.parent_hub||hubs[r.category]).replace(/^\/+/,''),
 commercial_owner:S,conversion_url:S+(r.category==='APP'?'agent/':'gia-thue/'),contact_url:S+'lien-he/',
 local_scope:r.local_scope||'',meta_description:m.description||'',h1_plan:m.title||r.working_title,
 schema:'Article + BreadcrumbList',legal_review:legal?'MANDATORY':'NO',
 internal_links:'Parent hub; 2 relevant articles; contextual commercial CTA if helpful',
 collision:headOverlap?'RESERVE_FOR_HOMEPAGE':clash?'REVIEW_DUPLICATE_OWNER_'+owners.get(norm(r.primary_keyword)):'NONE',
 priority:headOverlap||clash?'P0_REVIEW':commercial?'P1':'P2',
 gsc_rank:'NOT_MEASURED',target:'Improve towards top 2-10 where realistic; not guaranteed',
 status:'PLAN_ONLY',next_action:legal?'Check official legal source and effective date before editing':clash||headOverlap?'Check unique search intent; do not auto-apply':'Compare SERP and content, improve metadata via existing reviewed SEO layer',
 evidence:'data/blog/content-matrix.csv + data/seo/article-meta.json'
}});
// Owner URLs (lô M5, 2026-11-01): one intent, one URL. Day/week/month and model queries go to the
// pillar article that already targets them (data/seo/article-meta.json), procedure to BA-0004;
// deposit and foreign-renter intents go to the subtopic hubs with their own guide (data/blog/hub-guides.json);
// the store's own locality (Long Biên / Bồ Đề / Nguyễn Văn Cừ) goes to /lien-he/ (verified NAP).
const base=[
['CORE','cho thuê xe máy ở Hà Nội','cho thuê xe máy Hà Nội; thuê xe máy Hà Nội; thuê xe máy ở Hà Nội','/','P0'],
['PRICE','giá thuê xe máy Hà Nội','bảng giá thuê xe máy; cho thuê xe máy giá rẻ','/gia-thue/','P0'],
['CONTACT','thuê xe máy gần đây','địa chỉ thuê xe máy Hà Nội; cửa hàng thuê xe','/lien-he/','P0'],
['MONTH','thuê xe máy tháng Hà Nội','thuê xe máy theo tháng Hà Nội; thuê dài hạn','/blog/thue-xe/thue-xe-may-theo-thang/','P0'],
['DAY','thuê xe máy theo ngày Hà Nội','thuê xe máy 1 ngày; thuê 24 giờ','/blog/thue-xe/gia-thue-xe-may-theo-ngay/','P1'],
['WEEK','thuê xe máy theo tuần Hà Nội','thuê xe máy 7 ngày','/blog/thue-xe/thue-xe-may-theo-tuan/','P1'],
['VISION','thuê xe Honda Vision Hà Nội','thuê xe tay ga Honda Vision','/blog/thue-xe/thue-honda-vision/','P1'],
['WAVE','thuê xe Honda Wave Hà Nội','thuê xe số Hà Nội','/blog/thue-xe/thue-wave-alpha/','P1'],
['AIRBLADE','thuê Honda Air Blade Hà Nội','cho thuê Air Blade','/blog/thue-xe/thue-honda-air-blade/','P1'],
['50CC','thuê xe máy 50cc Hà Nội','xe ga 50cc; cho thuê 50cc','/blog/thue-xe/thue-xe-50cc/','P1'],
['EV','thuê xe máy điện Hà Nội','cho thuê xe máy điện Hà Nội','/blog/xe-dien/','P0'],
['EBIKE','thuê xe đạp điện Hà Nội','cho thuê xe đạp điện','/blog/xe-dien/','P1'],
['LONGBIEN','thuê xe máy Long Biên','thuê xe Bồ Đề; thuê xe Nguyễn Văn Cừ','/lien-he/','P0'],
['HOANKIEM','thuê xe máy Hoàn Kiếm','thuê xe máy Phố Cổ','/blog/dia-phuong/','P1'],
['TAYHO','thuê xe máy Tây Hồ','thuê xe máy Hồ Tây','/blog/dia-phuong/','P1'],
['BADINH','thuê xe máy Ba Đình','cho thuê xe máy Ba Đình','/blog/dia-phuong/','P1'],
['GIALAM','thuê xe máy Gia Lâm','cho thuê xe máy Gia Lâm','/blog/dia-phuong/','P1'],
['DELIVERY','giao xe máy thuê tại Hà Nội','giao xe khách sạn; giao xe tận nơi','/lien-he/','P1'],
['DEPOSIT','đặt cọc thuê xe máy Hà Nội','thuê xe máy cọc bao nhiêu','/blog/thue-xe/dat-coc/','P1'],
['DOCUMENT','thủ tục thuê xe máy Hà Nội','giấy tờ thuê xe máy; hợp đồng thuê xe','/blog/huong-dan/thu-tuc-thue-xe-may/','P1'],
['FOREIGN','thuê xe máy cho người nước ngoài Hà Nội','hộ chiếu; bằng lái quốc tế','/blog/thue-xe/du-khach/','P2'],
['AGENT','trợ lý thuê xe máy Hà Nội','ứng dụng web thuê xe máy; MotoAI','/agent/','P1']
];
const targets=base.map(([id,keyword,variants,path,priority])=>({cluster_id:id,head_keyword:keyword,variants,owner_url:S.slice(0,-1)+path,priority,goal:'TOP 2–10 ASPIRATION — NOT GUARANTEED',status:'PLANNED_REVIEW',rank:'NOT_MEASURED',volume:'NOT_MEASURED',rule:'One search intent, one URL owner; verify existing page content before retargeting'}));
const arch=[
{role:'MAIN_COMMERCIAL',url:S,keyword:'cho thuê xe máy ở Hà Nội',note:'Retarget only after homepage brief+CTA+QA; preserve Agent functionality'},
{role:'PRICE_CONVERSION',url:S+'gia-thue/',keyword:'giá thuê xe máy Hà Nội',note:'Verified prices, deposit disclosed separately'},
{role:'LOCAL_CONVERSION',url:S+'lien-he/',keyword:'thuê xe máy gần đây',note:'Verified address, hours, phone and delivery conditions'},
{role:'APP_PRODUCT',url:S+'agent/',keyword:'trợ lý thuê xe máy',note:'Keep web-app identity, no native app false claim'},
...Object.entries(hubs).map(([c,p])=>({role:c+'_HUB',url:S.slice(0,-1)+p,keyword:'Cluster long-tail',note:'Pillar/Hub connects relevant supporting articles; not another generic homepage'}))
];
const dashboard=[{metric:'PUBLISHED ARTICLES',value:rows.length},{metric:'COMMERCIAL CLUSTERS',value:targets.length},{metric:'UNIQUE ARTICLE URLS',value:new Set(rows.map(r=>r.url)).size},{metric:'REVIEW COLLISIONS',value:rows.filter(r=>r.collision!=='NONE').length},{metric:'GSC',value:'NOT MEASURED'},{metric:'RANK GOAL',value:'TOP 2–10 IS TARGET NOT FORECAST'}];
const files={
'SEO-COMMERCIAL-2006.csv':csv(Object.keys(rows[0]),rows),
'SEO-COMMERCIAL-TARGETS.csv':csv(Object.keys(targets[0]),targets),
'SEO-COMMERCIAL-ARCHITECTURE.csv':csv(Object.keys(arch[0]),arch),
'SEO-COMMERCIAL-DASHBOARD.csv':csv(Object.keys(dashboard[0]),dashboard),
'SEO-COMMERCIAL-SUMMARY.json':JSON.stringify({date:'2026-10-29',count:rows.length,clusters:targets.length,source:'Published blog content matrix',target:'Top 2-10 is aspiration, not forecast',google_guidance:['https://developers.google.com/search/docs/essentials/spam-policies','https://developers.google.com/search/docs/appearance/title-link']},null,2)+'\n'};
mkdirSync(D,{recursive:true});let stale=[];
for(const[name,contents]of Object.entries(files)){const dest=join(D,name);if(process.argv.includes('--check')){if(!existsSync(dest)||readFileSync(dest,'utf8')!==contents)stale.push(name)}else writeFileSync(dest,contents)}
if(stale.length){console.error('STALE:',stale);process.exitCode=1}
console.log(JSON.stringify({article_count:rows.length,head_clusters:targets.length,review_collision:dashboard[3].value,files:Object.keys(files)}));
