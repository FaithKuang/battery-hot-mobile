import { AIDC_COMPANIES } from "@aihot/industry/aidc";

const dataCenter = /\baidc\b|data[\s-]?cent(?:er|re)s?|AI factor(?:y|ies)|AI infrastructure|AI server|server rack|hyperscal|数据中心|資料中心|智算|算力中心|AI伺服器|AI服务器|データセンター/iu;
const bbu = /\bbbu\b|battery[\s-]?back[\s-]?up(?: unit)?|backup battery|电池备援|電池備援|電池備用|电池备用|電池備份|电池备份/iu;
const infrastructure = /power|\bups\b|\bhvdc\b|\bvdc\b|battery|batteries|cooling|rack|network|interconnect|accelerator|server|GPU|供电|供電|供配电|供配電|电源|電源|電池|电池|液冷|散热|散熱|机柜|機櫃|伺服器|服务器|互连|互連/iu;
const baseband = /base[\s-]?band unit|基带单元|基帶單元/iu;

/** Scope evidence only; this priority never supplies an editorial score or selection. */
export function classifyAidc(sourceId: string, title: string, evidence = "") {
  const text = `${title} ${evidence}`;
  const companies = AIDC_COMPANIES.filter(c => (c.sources as readonly string[]).includes(sourceId) || c.pattern.test(text)).map(c => c.id);
  const supplier = AIDC_COMPANIES.some(c => c.id !== "nvidia" && (c.sources as readonly string[]).includes(sourceId));
  const directBbu = bbu.test(text) && !baseband.test(text) && (dataCenter.test(text) || supplier || companies.length > 0);
  // A feed's related-links/footer may mention AI factories on unrelated posts. The title
  // must also anchor either the data-center subject or its physical infrastructure.
  const priority: 0 | 1 | 2 = directBbu ? 2 : dataCenter.test(title)
    || (dataCenter.test(text) && infrastructure.test(title)) ? 1 : 0;
  return { priority, companies };
}
