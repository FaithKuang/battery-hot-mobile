// Battery Hot public category keys are stable URL and API identities.
export const CATEGORIES = [
  { key: "technology", label: "新技术", section: "技术与材料", guide: "锂电芯、固态/半固态、电极、电解液、热管理和制造工艺" },
  { key: "materials", label: "材料/供应链", section: "技术与材料", guide: "锂、镍、钴、石墨、正负极、电解液、隔膜及相关政策" },
  { key: "product", label: "新产品", section: "产品与应用", guide: "电芯、电池包、供电、充电和电力转换的新产品" },
  { key: "application", label: "新应用", section: "产品与应用", guide: "有明确电池、供电、充电、续航或电动化证据的增量场景" },
  { key: "policy", label: "新政策", section: "政策与产业", guide: "直接影响电池需求、供应链或生产的官方政策" },
  { key: "industry", label: "产业动态", section: "政策与产业", guide: "电池企业的产能、合作和竞争，排除泛财经软文" },
  { key: "nvidia", label: "NVIDIA", section: "NVIDIA 独立监控", guide: "仅配置的 NVIDIA 官方新闻、技术博客、研究和报告" },
] as const;

export const ITEM_TYPES = ["technology", "materials", "product", "application", "policy", "industry", "report"] as const;
export const CATEGORY_TAGS = ["新技术", "材料/供应链", "新产品", "新应用", "新政策", "产业动态", "NVIDIA"] as const;
export const TOPIC_TAGS = [
  "固态/半固态", "锂电芯", "电池包", "正负极", "电解液", "BBU/UPS", "数据中心供电",
  "AI 硬件", "机器人", "无人机", "电动交通", "航天", "船舶", "矿山", "电动工具", "白皮书"
] as const;
export const ENTITY_TAGS = ["LGES", "Samsung SDI", "Panasonic Energy", "CATL", "NVIDIA", "Delta", "Infineon", "Vertiv"] as const;
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "电芯": "锂电芯", "半固态": "固态/半固态", "UPS": "BBU/UPS", "BBU": "BBU/UPS",
  "充电": "新应用", "供电": "新应用", "政策": "新政策", "材料": "材料/供应链"
};
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  technology: "新技术", materials: "材料/供应链", product: "新产品", application: "新应用",
  policy: "新政策", industry: "产业动态", report: "NVIDIA"
};
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  lges: { name: "LG Energy Solution", displayTag: "LGES", aliases: ["LGES", "LG Energy Solution", "LG新能源"] },
  samsung_sdi: { name: "Samsung SDI", displayTag: "Samsung SDI", aliases: ["Samsung SDI", "三星SDI"] },
  panasonic_energy: { name: "Panasonic Energy", displayTag: "Panasonic Energy", aliases: ["Panasonic Energy", "松下能源"] },
  catl: { name: "CATL", displayTag: "CATL", aliases: ["CATL", "宁德时代"] },
  nvidia: { name: "NVIDIA", displayTag: "NVIDIA", aliases: ["NVIDIA", "英伟达"] },
  delta: { name: "Delta Electronics", displayTag: "Delta", aliases: ["Delta Electronics", "台达"] },
  infineon: { name: "Infineon", displayTag: "Infineon", aliases: ["Infineon", "英飞凌"] },
  vertiv: { name: "Vertiv", displayTag: "Vertiv", aliases: ["Vertiv", "维谛"] }
};
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> =
  Object.entries(ENTITIES).map(([id, e]) => ({
    id, name: e.name, patterns: e.aliases.map((alias) => new RegExp(alias.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&"), "i"))
  }));
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "lges", domains: ["lgensol.com"] },
  { entityId: "samsung_sdi", domains: ["samsungsdi.com"] },
  { entityId: "panasonic_energy", domains: ["panasonic.com"] },
  { entityId: "catl", domains: ["catl.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "delta", domains: ["deltaww.com"] },
  { entityId: "infineon", domains: ["infineon.com"] },
  { entityId: "vertiv", domains: ["vertiv.com"] }
];
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
