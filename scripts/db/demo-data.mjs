// Demo data for Supabase: the same people, properties and offers as the prototype seed (src/lib/seed.ts),
// with fixed UUIDs so links and tests are stable. Used by scripts/db/seed-supabase.mjs and scripts/db/verify.mjs.
// All SAMPLE data. Persona emails use example.com (never real inboxes). No passwords live here.

export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const PERSONAS = [
  { key: "malee", id: id(101), name: "Khun Malee", nationality: "Thai", member: false, locale: "th", note: "Seller" },
  { key: "somchai", id: id(102), name: "Somchai", nationality: "Thai", member: true, locale: "th", note: "Buyer, co-buyer" },
  { key: "ploy", id: id(103), name: "Ploy", nationality: "Thai", member: true, locale: "th", note: "Co-buyer" },
  { key: "daniel", id: id(104), name: "Daniel", nationality: "Australian", member: true, locale: "en", note: "Co-buyer / lender" },
  { key: "aiko", id: id(105), name: "Aiko", nationality: "Japanese", member: true, locale: "en", note: "Co-buyer" },
  { key: "narin", id: id(106), name: "Narin", nationality: "Thai", member: false, locale: "th", note: "Buyer, not a member" },
  { key: "layla", id: id(107), name: "Layla", nationality: "Emirati", member: true, locale: "ar", note: "Buyer, Arabic UI" },
  { key: "reviewer", id: id(108), name: "Reviewer", nationality: "Thai", member: false, locale: "en", note: "Admin / reviewer", reviewer: true },
].map((p) => ({ ...p, email: `${p.key}.persona@example.com` }));

const P = Object.fromEntries(PERSONAS.map((p) => [p.key, p.id]));

export const BUILDINGS = [
  { id: id(201), owner_id: P.malee, name: "Riverside Sathorn (sample)", district: "Sathorn", province: "Bangkok", total_floor_area_sqm: 12000, foreign_area_used_sqm: 4200, build_year: 2016 },
];

const sample = { appraisal_source: "Treasury Department appraisal (sample value)", appraisal_date: "2025-01" };
export const PROPERTIES = [
  { id: id(301), owner_id: P.malee, type: "condo", building_id: id(201), title: "1-bed condo near BTS, Sathorn", district: "Sathorn", province: "Bangkok", area_sqm: 40, build_year: 2016, deed_type: "Condominium title (อ.ช.2)", official_appraisal_thb: 3200000, ...sample, last_sale_price_thb: 3400000, last_sale_date: "2021-06", index_series: "condo_bkk", nearest_rail: "BTS Surasak", rail_walk_min: 6 },
  { id: id(302), owner_id: P.malee, type: "house", building_id: null, title: "3-bed detached house, Nonthaburi", district: "Bang Yai", province: "Nonthaburi", area_sqm: 160, build_year: 2012, deed_type: "Chanote (โฉนด น.ส.4 จ.)", official_appraisal_thb: 4800000, ...sample, last_sale_price_thb: 5300000, last_sale_date: "2020-03", index_series: "house_bkk", nearest_rail: null, rail_walk_min: null },
  { id: id(303), owner_id: P.malee, type: "condo", building_id: null, title: "Studio condo, Bang Na (comparable)", district: "Bang Na", province: "Bangkok", area_sqm: 30, build_year: 2018, deed_type: "Condominium title (อ.ช.2)", official_appraisal_thb: 2300000, ...sample, last_sale_price_thb: null, last_sale_date: null, index_series: "condo_bkk", nearest_rail: "BTS Bang Na", rail_walk_min: 9 },
  // More SAMPLE property types (same as src/lib/seed.ts). Not part of the demo reset, which only restores the three above.
  { id: id(304), owner_id: P.malee, type: "condo", building_id: null, title: "Luxury 3-bed condo, Pathum Wan", district: "Pathum Wan", province: "Bangkok", area_sqm: 120, build_year: 2021, deed_type: "Condominium title (อ.ช.2)", official_appraisal_thb: 13500000, ...sample, last_sale_price_thb: null, last_sale_date: null, index_series: "condo_bkk", nearest_rail: "BTS Chit Lom", rail_walk_min: 4 },
  { id: id(305), owner_id: P.malee, type: "condo", building_id: null, title: "2-bed condo near BTS Thong Lo, Watthana", district: "Watthana", province: "Bangkok", area_sqm: 65, build_year: 2019, deed_type: "Condominium title (อ.ช.2)", official_appraisal_thb: 6900000, ...sample, last_sale_price_thb: null, last_sale_date: null, index_series: "condo_bkk", nearest_rail: "BTS Thong Lo", rail_walk_min: 7 },
  { id: id(306), owner_id: P.malee, type: "condo", building_id: null, title: "1-bed condo for rent, Chatuchak", district: "Chatuchak", province: "Bangkok", area_sqm: 34, build_year: 2017, deed_type: "Condominium title (อ.ช.2)", official_appraisal_thb: 2400000, ...sample, last_sale_price_thb: null, last_sale_date: null, index_series: "condo_bkk", nearest_rail: "MRT Phahon Yothin", rail_walk_min: 5 },
  { id: id(307), owner_id: P.malee, type: "townhouse", building_id: null, title: "3-bed townhouse, Bang Kapi", district: "Bang Kapi", province: "Bangkok", area_sqm: 140, build_year: 2015, deed_type: "Chanote (โฉนด น.ส.4 จ.)", official_appraisal_thb: 4700000, ...sample, last_sale_price_thb: null, last_sale_date: null, index_series: "house_bkk", nearest_rail: null, rail_walk_min: null },
  { id: id(308), owner_id: P.malee, type: "building", building_id: null, title: "24-unit apartment building, Huai Khwang", district: "Huai Khwang", province: "Bangkok", area_sqm: 1200, build_year: 2010, deed_type: "Chanote (โฉนด น.ส.4 จ.)", official_appraisal_thb: 30000000, ...sample, last_sale_price_thb: null, last_sale_date: null, index_series: "house_bkk", nearest_rail: "MRT Huai Khwang", rail_walk_min: 8 },
  { id: id(309), owner_id: P.malee, type: "building", building_id: null, title: "6-floor office building, Khlong Toei", district: "Khlong Toei", province: "Bangkok", area_sqm: 2400, build_year: 2008, deed_type: "Chanote (โฉนด น.ส.4 จ.)", official_appraisal_thb: 78000000, ...sample, last_sale_price_thb: null, last_sale_date: null, index_series: "house_bkk", nearest_rail: "MRT Queen Sirikit", rail_walk_min: 6 },
];

export const LISTINGS = [
  { id: id(401), code: "l-condo", property_id: id(301), seller_id: P.malee, kind: "sale", asking_price_thb: 4000000, cobuy_enabled: true, description_original: "ห้องชุด 1 ห้องนอน ใกล้ BTS สุรศักดิ์ (ตัวอย่าง)", description_lang: "th" },
  { id: id(402), code: "l-house", property_id: id(302), seller_id: P.malee, kind: "sale", asking_price_thb: 6000000, cobuy_enabled: true, description_original: "บ้านเดี่ยว 3 ห้องนอน บางใหญ่ (ตัวอย่าง)", description_lang: "th" },
  { id: id(403), code: "l-condo2", property_id: id(303), seller_id: P.malee, kind: "sale", asking_price_thb: 2900000, cobuy_enabled: false, description_original: "Studio near BTS Bang Na (sample)", description_lang: "en" },
  { id: id(404), code: "l-lux", property_id: id(304), seller_id: P.malee, kind: "sale", asking_price_thb: 16500000, cobuy_enabled: false, description_original: "Luxury 3-bed corner unit, 4 minutes to BTS Chit Lom (sample)", description_lang: "en" },
  { id: id(405), code: "l-condo3", property_id: id(305), seller_id: P.malee, kind: "sale", asking_price_thb: 8000000, cobuy_enabled: false, description_original: "คอนโด 2 ห้องนอน ใกล้ BTS ทองหล่อ (ตัวอย่าง)", description_lang: "th" },
  { id: id(406), code: "l-rent", property_id: id(306), seller_id: P.malee, kind: "rent", asking_price_thb: 18000, cobuy_enabled: false, description_original: "1-bed condo for rent near MRT Phahon Yothin (sample)", description_lang: "en" },
  { id: id(407), code: "l-town", property_id: id(307), seller_id: P.malee, kind: "sale", asking_price_thb: 5900000, cobuy_enabled: false, description_original: "ทาวน์เฮาส์ 3 ห้องนอน บางกะปิ (ตัวอย่าง)", description_lang: "th" },
  { id: id(408), code: "l-apartment", property_id: id(308), seller_id: P.malee, kind: "sale", asking_price_thb: 38000000, cobuy_enabled: false, description_original: "24-unit apartment building near MRT Huai Khwang (sample)", description_lang: "en" },
  { id: id(409), code: "l-office", property_id: id(309), seller_id: P.malee, kind: "sale", asking_price_thb: 95000000, cobuy_enabled: false, description_original: "6-floor office building near MRT Queen Sirikit (sample)", description_lang: "en" },
];

export const CRITERIA = [
  { key: "price", label: "Offered price", weight: 50 },
  { key: "funding", label: "Funding readiness", weight: 25 },
  { key: "closing", label: "Faster closing", weight: 15 },
  { key: "conditions", label: "Fewer conditions", weight: 10 },
];

export const OFFER_ROUNDS = [{ id: id(501), listing_id: id(401), criteria: CRITERIA, hoursOpen: 24 }];

export const OFFERS = [
  { id: id(601), round_id: id(501), buyer_id: P.narin, price_thb: 3900000, funding: "pre_approved", closing_days: 30, conditions: "Subject to inspection" },
  { id: id(602), round_id: id(501), buyer_id: P.ploy, price_thb: 4050000, funding: "declared", closing_days: 60, conditions: "Subject to bank loan approval; subject to inspection" },
];
