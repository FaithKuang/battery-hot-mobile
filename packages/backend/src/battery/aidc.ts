import { AIDC_COMPANIES } from "@aihot/industry/aidc";

const dataCenter = /\baidc\b|data[\s-]?cent(?:er|re)s?|AI factor(?:y|ies)|AI infrastructure|AI server|server rack|hyperscal|数据中心|資料中心|智算|算力中心|AI伺服器|AI服务器|データセンター/iu;
const bbu = /\bbbu\b|battery(?: and capacitance)?[\s-]?back[\s-]?up(?: unit)?|backup battery|电池备援|電池備援|電池備用|电池备用|電池備份|电池备份/iu;
const infrastructure = /power|\bups\b|\bhvdc\b|\bvdc\b|battery|batteries|cooling|rack|network|interconnect|accelerator|server|GPU|供电|供電|供配电|供配電|电源|電源|電池|电池|液冷|散热|散熱|机柜|機櫃|伺服器|服务器|互连|互連/iu;
const baseband = /base[\s-]?band unit|基带单元|基帶單元/iu;
const documentTitle = /white[\s-]?paper|technical (?:blog|report|paper)|research paper|design guide|application note|reference (?:design|architecture)|白皮[书書]|技[术術](?:博客|部落格|報告|报告|文章)|研究(?:报告|報告)|设计指南|設計指南|应用笔记|應用筆記/iu;
const technicalTitle = /architect|engineering|standardiz|specification|design|powering|thermal|cooling|networking|interconnect|synchronization|高密度|架构|架構|設計|设计|散热|散熱|技术解析|技術解析/iu;
const nonTechnical = /annual report|financial|earnings|sustainability report|\besg\b|年[报報]|財報|财报|可持[续續]|股[价價]|target price|conference registration|register now|summit.*(?:tracks|lineup|location|numbers)|周年|获奖|獲獎/iu;
const blogSources = new Set(["nvidia-blog", "nvidia-developer", "nvidia-research", "delta-brandnews", "ocp-blog"]);
const deltaAmericas = new Set(["delta-americas-news", "delta-americas-blog"]);
const rackPower = /power[\s-]rack|power[\s-]shelf|800\s*vdc|机柜供电|機櫃供電/iu;

/** Only configured official sources qualify; a media mention of a company is not its technical blog. */
export function isPriorityTechnical(sourceId: string, title: string, evidence = "") {
  const official = AIDC_COMPANIES.some(c => (c.sources as readonly string[]).includes(sourceId)
    && !sourceId.endsWith("-media") && c.id !== "aes");
  if (!official || nonTechnical.test(title)) return false;
  return (deltaAmericas.has(sourceId) && rackPower.test(`${title} ${evidence}`))
    || sourceId === "ocp-whitepapers" || sourceId === "nvidia-developer" || documentTitle.test(title)
    || (sourceId === "nvidia-research" && /learning|model|neural|generat|training|render|comput|GPU|system/iu.test(title))
    || (blogSources.has(sourceId) && technicalTitle.test(title));
}

/** Scope evidence only; this priority never supplies an editorial score or selection. */
export function classifyAidc(sourceId: string, title: string, evidence = "") {
  const text = `${title} ${evidence}`;
  const companies = AIDC_COMPANIES.filter(c => (c.sources as readonly string[]).includes(sourceId) || c.pattern.test(text)).map(c => c.id);
  const supplier = AIDC_COMPANIES.some(c => c.id !== "nvidia" && c.id !== "ocp" && (c.sources as readonly string[]).includes(sourceId));
  const directBbu = bbu.test(text) && !baseband.test(text) && (dataCenter.test(text) || supplier || companies.length > 0);
  // A feed's related-links/footer may mention AI factories on unrelated posts. The title
  // must also anchor either the data-center subject or its physical infrastructure.
  const priority: 0 | 1 | 2 | 3 = directBbu ? 2 : isPriorityTechnical(sourceId, title, evidence) ? 3 : dataCenter.test(title)
    || (dataCenter.test(text) && infrastructure.test(title)) ? 1 : 0;
  return { priority, companies };
}

/** Quote the relevant source sentence, not a generated summary or a navigation/menu match. */
export function deltaPowerExcerpt(sourceId: string, body: string) {
  if (!deltaAmericas.has(sourceId)) return body.slice(0, 240);
  const at = body.search(bbu) >= 0 ? body.search(bbu) : body.search(rackPower);
  const boundary = at < 0 ? -1 : body.lastIndexOf(". ", at);
  const start = boundary < 0 ? 0 : boundary + 2;
  return body.slice(start, start + 240);
}
