import type { BatteryTopic } from "./free-publication.ts";
import { classifyAidc } from "./aidc.ts";
import { allowsBatteryTopic } from "./free-publication.ts";

const blocked: Array<[BatteryTopic, RegExp]> = [
  ["recycling", /recycl|upcycl|second.life|reuse|回收|梯次利用|再生利用|폐배터리|リサイクル/iu],
  ["esg", /\besg\b|sustainability report|sustainable development report|可持续发展报告|社会责任报告|碳中和报告/iu],
  ["grid-storage", /grid.scale|utility.scale|grid congestion|battery storage (?:plant|project)|solar,? wind,? battery storage|电网侧储能|电网级储能|大型储能电站|锂电池储能电站/iu],
  ["non-target-chemistry", /sodium.ion|sodium batteries|sodium battery|钠离子|钠电池|lead.acid|铅酸电池|zinc.air|锌空气电池|fuel.cell|燃料电池|water.based metal battery|not lithium|非锂电池/iu],
  ["promotion", /sponsored:|discount|coupon|sale now|register now|webinar|conference registration|sustainability squad|报名参会|促销|优惠券/iu],
];

const cell = /lithium|\bli.ion\b|battery|batteries|\bcells?\b|electrode|anode|cathode|electrolyte|separator|solid.state|dry.coat|\bbms\b|电池|锂电|电芯|电极|正极|负极|电解液|隔膜|固态|半固态|干法涂布|배터리|리튬|電池|リチウム/iu;
const power = /\bbbu\b|\bups\b|battery backup|backup power|800\s?vdc|power conversion|power distribution|uninterruptible power|直流供电|备电|备用电源|不间断电源|供配电|电力转换/iu;
const dataCenter = /data.?cent[er]+|ai.?factor|server rack|数据中心|智算中心|机架|データセンター/iu;
const application = /robot|agv|amr|drone|uav|evtol|satellite|spacecraft|wearable|ai glasses|electric (?:vehicle|truck|ship|ferry|train|bike|motorcycle)|mining truck|power tool|机器人|无人机|卫星|航天|电动|电摩|矿卡|工具|船舶|机器人|로봇|ドローン/iu;
const technology = /solid.state|semi.solid|dry.coat|silicon anode|lithium metal|electrolyte|separator|energy density|fast.charg|热管理|快充|固态|半固态|干法|硅碳|锂金属|电解液|隔膜|能量密度/iu;
const materials = /lithium|nickel|cobalt|graphite|cathode|anode|electrolyte|separator|锂矿|镍|钴|石墨|正极|负极|电解液|隔膜/iu;
const policy = /regulation|policy|subsidy|tariff|export control|sanction|采购|政策|补贴|出口管制|关税|制裁/iu;
const product = /launch|unveil|introduc|new product|commercial|量产|发布|推出|交付|新品/iu;

export function classifyBatteryTopic(sourceId: string, title: string, evidence: string): BatteryTopic {
  const text = `${title} ${evidence}`.replace(/\s+/gu, " ");
  for (const [topic, pattern] of blocked) if (pattern.test(text)) return topic;
  if (/stock price|share price|market forecast|appoints.+(?:president|director|ceo)|corporate growth initiatives|股价|股價|股票涨|股票漲|目标价|目標價|任命.+(?:总裁|董事长)/iu.test(title)) return "generic-finance";
  if (["nvidia-news", "nvidia-blog", "nvidia-developer", "nvidia-research"].includes(sourceId)) return "nvidia-monitoring";
  const aidc = classifyAidc(sourceId, title, evidence);
  if (aidc.priority === 2) return "ai-data-center-backup";
  if (aidc.priority === 3) return "aidc-infrastructure";
  if (dataCenter.test(text) && power.test(text)) return "ai-data-center-backup";
  if (aidc.priority === 1) return "aidc-infrastructure";
  if (application.test(text) && (cell.test(text) || power.test(text) || /charg|power supply|续航|充电|供电|功率/iu.test(text))) {
    return "battery-application";
  }
  if (!cell.test(text)) return "unrelated";
  if (policy.test(title)) return "battery-policy";
  if (technology.test(text)) return "battery-technology";
  if (materials.test(title)) return "battery-technology";
  if (product.test(title)) return "battery-product";
  return "battery-technology";
}

/** Historical column membership obeys the same exclusions as newly ingested news. */
export function classifyAidcPublication(sourceId: string, title: string, evidence = "") {
  const aidc = classifyAidc(sourceId, title, evidence);
  return allowsBatteryTopic(sourceId, classifyBatteryTopic(sourceId, title, evidence))
    ? aidc : { priority: 0 as const, companies: aidc.companies };
}
