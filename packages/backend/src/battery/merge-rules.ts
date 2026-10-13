// Legacy Battery Hot merge rules, with a conservative guard for distinct technical documents.
export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

export function jaccardSimilarity(left: string, right: string) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

export function shouldMergeEvents(
  leftTitle: string,
  rightTitle: string,
  leftSignature: string,
  rightSignature: string,
  leftOrganizations: string[] = [],
  rightOrganizations: string[] = []
) {
  if (leftSignature === rightSignature) return true;
  // "White Paper", "AI" and "Infrastructure" describe a document family, not one event.
  // Keep weakly similar technical reports separate instead of hiding different reports.
  const technicalDocument = /white[\s-]?paper|technical (?:report|paper)|research paper|白皮[书書]|技[术術](?:报告|報告)/iu;
  if (technicalDocument.test(leftTitle) && technicalDocument.test(rightTitle)
    && jaccardSimilarity(leftTitle, rightTitle) < 0.64) return false;
  const left = leftSignature.split("|");
  const right = rightSignature.split("|");
  const leftTokens = eventTokens(leftTitle);
  const rightTokens = eventTokens(rightTitle);
  const shared = Array.from(leftTokens).filter((token) => rightTokens.has(token));
  const leftEntity = left[2] || firstEntityToken(leftTokens);
  const rightEntity = right[2] || firstEntityToken(rightTokens);
  const sameEntity = Boolean(leftEntity && rightEntity && leftEntity === rightEntity);
  const hasEventAnchor = shared.some((token) => eventAnchorTokens.has(token) || /\d/.test(token));
  const entityTokens = new Set(normalizeText(leftEntity ?? "").split(" ").filter(Boolean));
  const sharedSpecific = shared.filter((token) => token !== leftEntity && !entityTokens.has(token) && !weakEventTokens.has(token));
  const similarity = jaccardSimilarity(leftTitle, rightTitle);
  const sameRoute = Boolean(left[3] && right[3] && normalizeRoute(left[3]) === normalizeRoute(right[3]));
  const crossLanguage = /[\u4e00-\u9fff]/.test(leftTitle) !== /[\u4e00-\u9fff]/.test(rightTitle);
  const mutualPrimaryEntities = Boolean(
    !sameEntity
    && leftEntity
    && rightEntity
    && normalizeText(leftTitle).includes(leftEntity)
    && normalizeText(leftTitle).includes(rightEntity)
    && normalizeText(rightTitle).includes(leftEntity)
    && normalizeText(rightTitle).includes(rightEntity)
  );
  const sharedOrganizations = leftOrganizations.filter((leftOrganization) =>
    rightOrganizations.some((rightOrganization) => sameOrganization(leftOrganization, rightOrganization))
  );
  const sameCollaboration = collaborationPattern.test(normalizeText(leftTitle))
    && collaborationPattern.test(normalizeText(rightTitle));
  const sameRapidChargeClaim = sharedOrganizations.length >= 1
    && rapidChargeClaimPattern.test(normalizeText(leftTitle))
    && rapidChargeClaimPattern.test(normalizeText(rightTitle));
  const leftBatteryBoosterCall = batteryBoosterPattern.test(normalizeText(leftTitle))
    || europeanBatteryManufacturingCallPattern.test(normalizeText(leftTitle));
  const rightBatteryBoosterCall = batteryBoosterPattern.test(normalizeText(rightTitle))
    || europeanBatteryManufacturingCallPattern.test(normalizeText(rightTitle));
  const sameBatteryBoosterCall = leftBatteryBoosterCall
    && rightBatteryBoosterCall
    && batteryBoosterCallPattern.test(normalizeText(leftTitle))
    && batteryBoosterCallPattern.test(normalizeText(rightTitle));
  const sameSeoulTechLtpStudy = seoulTechLtpStudyPattern.test(normalizeText(leftTitle))
    && seoulTechLtpStudyPattern.test(normalizeText(rightTitle));
  const sameSodiumIonMiningTruckDelivery = sodiumIonMiningTruckDeliveryPattern.test(normalizeText(leftTitle))
    && sodiumIonMiningTruckDeliveryPattern.test(normalizeText(rightTitle));
  const leftOrganizationsNormalized = leftOrganizations.map(normalizeText);
  const rightOrganizationsNormalized = rightOrganizations.map(normalizeText);
  const sameBasePowerHomeBatteryLaunch = [leftOrganizationsNormalized, rightOrganizationsNormalized].every((organizations) =>
    organizations.includes("base") && organizations.includes("power")
  ) && basePowerHomeBatteryPattern.test(normalizeText(leftTitle))
    && basePowerHomeBatteryPattern.test(normalizeText(rightTitle));
  const sameHanyangNickelRichAirExposureStudy = hanyangNickelRichAirExposurePattern.test(normalizeText(leftTitle))
    && hanyangNickelRichAirExposurePattern.test(normalizeText(rightTitle));
  const sameCatlAviationSafetyTest = catlAviationSafetyPattern.test(normalizeText(leftTitle))
    && catlAviationSafetyPattern.test(normalizeText(rightTitle));
  const sameSilaPentagonLoan = silaPentagonLoanPattern.test(normalizeText(leftTitle))
    && silaPentagonLoanPattern.test(normalizeText(rightTitle));
  const leftMetrics = distinctiveMetrics(leftTitle);
  const rightMetrics = distinctiveMetrics(rightTitle);
  const sharedMetrics = Array.from(leftMetrics).filter((metric) => rightMetrics.has(metric));

  if (left[0] === right[0] && left[1] === right[1] && sameEntity && sameRoute && crossLanguage
    && routeAppearsInTitle(normalizeRoute(left[3]), leftTitle) && routeAppearsInTitle(normalizeRoute(right[3]), rightTitle)) {
    return true;
  }

  if (left[0] === right[0] && sameRoute && sharedOrganizations.length >= 2 && sameCollaboration) {
    return true;
  }

  if (sameRoute && sharedOrganizations.length >= 1 && sameCollaboration && (crossLanguage || similarity >= 0.08)) {
    return true;
  }

  if (sharedOrganizations.length >= 1 && sharedMetrics.length >= 1) {
    return true;
  }

  if (sameRapidChargeClaim) {
    return true;
  }

  if (sameBatteryBoosterCall) {
    return true;
  }

  if (sameSeoulTechLtpStudy) {
    return true;
  }

  if (sameSodiumIonMiningTruckDelivery) {
    return true;
  }

  if (sameBasePowerHomeBatteryLaunch) {
    return true;
  }

  if (sameHanyangNickelRichAirExposureStudy) {
    return true;
  }

  if (sameCatlAviationSafetyTest || sameSilaPentagonLoan) {
    return true;
  }

  if (left[0] === right[0] && left[1] === right[1] && left[2] && left[2] === right[2] && left[3] && left[3] === right[3]) {
    return similarity >= 0.32 && hasEventAnchor;
  }
  if (sameEntity && shared.length >= 2 && hasEventAnchor && similarity >= 0.12) {
    return true;
  }
  if (sameEntity && shared.length >= 3 && sharedSpecific.length >= 2 && similarity >= 0.09) {
    return true;
  }
  if (sameEntity && shared.length >= 3 && sharedSpecific.length >= 1 && similarity >= 0.24) {
    return true;
  }
  if (mutualPrimaryEntities && shared.length >= 3 && hasEventAnchor && similarity >= 0.16) {
    return true;
  }
  if (sameEntity && shared.length >= 4 && sharedSpecific.length >= 2 && similarity >= 0.48) {
    return true;
  }
  if (leftEntity && rightEntity && !sameEntity && !mutualPrimaryEntities) {
    return false;
  }
  if (shared.length >= 4 && similarity >= 0.38) {
    return true;
  }
  return similarity >= 0.64;
}

const collaborationPattern = /(?:\b(?:alliance|collaboration|joining forces|jointly|memorandum|mou|partner(?:ship)?|sign(?:ed|s)?|team(?:ing)? up|taps?)\b|合作|联合|签署|谅解备忘录)/;
const rapidChargeClaimPattern = /(?:ultra[- ]fast|flash[- ]charg|12c|sub[- ]?4[- ]minute|3\s*minutes?\s*41|超充|闪充|3分41)/;
const batteryBoosterPattern = /\bbattery booster\b/;
const batteryBoosterCallPattern = /(?:\b(?:open|opens|opened|call|application|applications|apply)\b|开放|申请)/;
const europeanBatteryManufacturingCallPattern = /(?:commission.*call.*european battery manufacturing|european battery manufacturing.*call|(?:eu|european).*1 5(?:bn| billion).*call.*battery (?:cell|manufacturing))/;
const seoulTechLtpStudyPattern = /(?:seoultech.*anode.*fast charg|off stoichiometric ltp anode.*10c)/;
const sodiumIonMiningTruckDeliveryPattern = /(?:sodium ion.*(?:electric )?mining truck|(?:electric )?mining truck.*sodium ion)/;
const basePowerHomeBatteryPattern = /(?:home battery|battery supports homes)/;
const hanyangNickelRichAirExposurePattern = /(?:air exposure.*nickel rich|hidden battery flaw.*lifespan)/;
const catlAviationSafetyPattern = /(?=.*\bcatl\b)(?=.*(?:aviation battery|evtol|350 wh kg))(?=.*(?:test|thermal runaway|热失控|安全))/;
const silaPentagonLoanPattern = /(?=.*(?:\bsila\b|silicon ev batteries))(?=.*(?:1 4b|1 4 billion))(?=.*(?:pentagon|department of defense|defense department|国防部))/;

function distinctiveMetrics(value: string) {
  const normalized = normalizeText(value);
  const metrics = new Set<string>();
  for (const match of normalized.matchAll(/\d+(?:\.\d+)?\s*c(?![a-z])/g)) {
    metrics.add(match[0].replace(/\s+/g, ""));
  }
  for (const match of normalized.matchAll(/\d+(?:\.\d+)?\s*(?:wh\/kg|gwh|mwh|kwh|wh|gw|mw|kw|%)/g)) {
    metrics.add(match[0].replace(/\s+/g, ""));
  }
  return metrics;
}

function sameOrganization(left: string, right: string) {
  const normalizedLeft = normalizeOrganization(left);
  const normalizedRight = normalizeOrganization(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight
    || normalizedLeft.length >= 4 && normalizedRight.includes(normalizedLeft)
    || normalizedRight.length >= 4 && normalizedLeft.includes(normalizedRight);
}

function normalizeOrganization(value: string) {
  return normalizeText(value)
    .replace(/\b(?:co|company|corp|corporation|energy|group|inc|limited|llc|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const eventStopwords = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that", "are", "its", "new", "news", "latest",
  "battery", "batteries", "lithium", "energy", "storage", "power", "market", "global", "world", "says",
  "maker", "makers", "company", "companies", "technology", "tech", "report", "reports", "update", "updates",
  "analysis", "forecast", "size", "trends", "insights", "exclusive", "press", "release", "ltd", "asx", "plc"
]);

const eventAnchorTokens = new Set([
  "bess", "mwh", "gwh", "solid", "state", "solid-state", "sodium", "ion", "sodium-ion", "cathode", "anode", "electrolyte", "separator",
  "recycling", "recycle", "fire", "recall", "passport", "data", "center", "marine", "vessel",
  "commercialization", "patent", "3d", "print", "printed", "localize", "localizes",
  "grant", "deadline", "finance", "appoint", "appointed", "board", "ptfe", "electrode", "charging", "range",
  "thermal", "runaway", "safety", "residential", "home", "partnership", "agreement", "contract",
  "acquire", "acquisition", "merger", "warranty", "billion", "swap", "garbage"
]);

const weakEventTokens = new Set([
  "solution", "system", "project", "plant", "facility", "factory", "production", "produce", "manufacturing",
  "build", "begin", "start", "open", "launch", "expand", "announce", "unveil", "develop", "test", "line"
]);

function eventTokens(value: string) {
  const normalized = normalizeText(stripPublisherSuffix(value))
    .replace(/\b3d\s+prints?\b/g, "3d print")
    .replace(/\b3d\s+printed\b/g, "3d print")
    .replace(/\bsolid\s+state\b/g, "solid state")
    .replace(/\bdata\s+centre\b/g, "data center")
    .replace(/\bli\s+ion\b/g, "lithium ion")
    .replace(/\bsodium\s+ion\b/g, "sodium ion");
  const raw = normalized.split(" ").filter(Boolean);
  const tokens = new Set<string>();
  for (const token of raw) {
    const normalizedToken = normalizeEventToken(token);
    if (normalizedToken.length < 3 || eventStopwords.has(normalizedToken)) continue;
    tokens.add(normalizedToken);
  }
  const text = raw.join(" ");
  for (const phrase of ["3d print", "solid state", "data center", "sodium ion", "lithium ion", "battery passport"]) {
    if (text.includes(phrase)) tokens.add(phrase.replace(/\s+/g, "-"));
  }
  for (const match of normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*(gwh|mwh|kwh|wh|gw|mw|kw)\b/g)) {
    tokens.add(match[2]);
    tokens.add(`${match[1]}${match[2]}`);
  }
  return tokens;
}

function stripPublisherSuffix(value: string) {
  const parts = value.split(/\s[-–—]\s/);
  if (parts.length < 2) return value;
  const suffix = parts.at(-1)?.trim() ?? "";
  return suffix.split(/\s+/).length <= 3 ? parts.slice(0, -1).join(" - ") : value;
}

function normalizeEventToken(token: string) {
  return token
    .replace(/^swapp(?:able|ing|ed)?$/, "swap")
    .replace(/^refuse$/, "garbage")
    .replace(/^extends?$/, "extend")
    .replace(/^extension$/, "extend")
    .replace(/^financing$/, "finance")
    .replace(/ies$/, "y")
    .replace(/s$/, "")
    .replace(/^li$/, "lithium")
    .replace(/^ev$/, "electric-vehicle");
}

function firstEntityToken(tokens: Set<string>) {
  return Array.from(tokens).find((token) => /^[a-z][a-z0-9-]{2,}$/.test(token));
}

function normalizeRoute(value: string) {
  const normalized = normalizeText(value);
  if (/(sodium|钠)/.test(normalized)) return "sodium-ion";
  if (/(solid|固态|半固态)/.test(normalized)) return "solid-state";
  if (/(silicon|硅)/.test(normalized)) return "silicon-anode";
  if (/(lithium metal|锂金属)/.test(normalized)) return "lithium-metal";
  if (/lmfp/.test(normalized)) return "lmfp";
  if (/lfp/.test(normalized)) return "lfp";
  return normalized;
}

function routeAppearsInTitle(route: string, title: string) {
  const normalized = normalizeText(title);
  if (route === "sodium-ion") return /(sodium|钠)/.test(normalized);
  if (route === "solid-state") return /(solid.?state|固态|半固态)/.test(normalized);
  if (route === "silicon-anode") return /(silicon|硅)/.test(normalized);
  if (route === "lithium-metal") return /(lithium.?metal|锂金属)/.test(normalized);
  return normalized.includes(route);
}

