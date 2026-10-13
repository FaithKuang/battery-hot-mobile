// Static reader: only same-origin public JSON. No account, backend or model calls in a phone browser.
const $ = id => document.getElementById(id);
const companies = [{ id: "simplo", name: "新普科技" }, { id: "aes", name: "AES-KY" }, { id: "dynapack", name: "顺达" }, { id: "delta", name: "台达" }, { id: "liteon", name: "光宝" }, { id: "stl", name: "新盛力" }, { id: "nvidia", name: "NVIDIA" }, { id: "ocp", name: "OCP" }];
const titles = { all: "全部动态", aidc: "AIDC / BBU", nvidia: "NVIDIA 独立监控", selected: "严格精选", daily: "每日简报", notice: "使用与隐私说明" };
const descriptions = { all: "先看到可信日期和直达原文；正文可核验时再展示摘录或精华总结。", aidc: "重点信息包括 BBU，以及 NVIDIA、OCP、台达、光宝、顺达、新普科技、新盛力的官方技术博客、白皮书与报告。重点不等于严格精选；技术资料时间为官网发布 / 收录时间，版本以原文为准。", nvidia: "仅监控 NVIDIA 官方新闻、博客、开发者与研究四路来源，不是完整历史白皮书档案。", selected: "双语标题、中文概览、关键事实和正文证据齐全，且通过五维代码评分，才进入此栏。", daily: "每天 09:00 批次生成，覆盖前一日北京时间 00:00—24:00；仅使用已核验精选。" };
let snapshot = null, visible = 40;
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
const date = value => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const link = (text, url) => { const a = el("a", text); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
function route() { const [key, query = ""] = location.hash.slice(1).split("?"); return { key: titles[key] ? key : "all", company: new URLSearchParams(query).get("company") }; }
function card(item) {
  const article = el("article", null, "card"); article.dataset.itemId = item.id;
  const meta = el("div", null, "meta");
  meta.append(el("span", date(item.publishedAt)), el("span", item.sources[0].name), el("span", ({ "headline-only": "标题快讯", "extract-only": "原文摘录", summarized: "精华总结", selected: "精选" })[item.kind], "type"));
  // Importance in the AIDC list is deliberately not an editorial score.
  if (item.aidcPriority === 2) meta.append(el("span", "BBU 重点", "type"));
  if (item.aidcPriority === 3) meta.append(el("span", "技术博客 / 报告", "type"));
  if (item.kind === "selected") meta.append(el("span", `编辑分 ${item.score}`));
  const h3 = el("h3"); h3.append(link(item.title, item.sources[0].url)); article.append(meta, h3);
  if (item.originalTitle && item.originalTitle !== item.title) article.append(el("p", item.originalTitle, "original"));
  if (item.kind !== "headline-only" && item.summary) {
    const summary = el("p", null, "summary");
    summary.append(el("span", item.kind === "extract-only" ? "原文要点摘录 · 保留原语言" : "精华总结 · 已保存的正文核验结果", "label"), document.createTextNode(item.summary.replace(/^原文摘录：/, "")));
    article.append(summary);
  }
  if (item.kind === "selected" && item.facts.length) {
    const facts = el("ul", null, "facts");
    for (const fact of item.facts) { const li = el("li", fact.text); li.append(el("blockquote", fact.quote)); facts.append(li); }
    article.append(facts);
  }
  const sources = el("div", null, "sources"); item.sources.forEach(s => sources.append(link(`${s.name} · 原文 ↗`, s.url))); article.append(sources);
  return article;
}
function list(items, container, limit = visible) {
  if (!items.length) container.append(el("p", "当前筛选没有内容。可以扩大时间范围，或查看全部动态。", "empty"));
  items.slice(0, limit).forEach(item => container.append(card(item)));
}
function section(title, items, cls = "", limit = visible) {
  const node = el("section", null, cls), heading = el("h2", title, "section-title"); heading.append(el("span", `${items.length} 条`)); node.append(heading); list(items, node, limit); return node;
}
function community(company) {
  const data = snapshot.community, box = el("section", null, "community");
  box.append(el("h2", "社区线索 · 待核实", "section-title"), el("p", "CMoney 作者观点，不进入正式新闻、精选或日报；CBU 是电容备援，不等同于 BBU。", "description"));
  box.append(link(`查看 ${data.account.name} 的账号 ↗`, data.account.url));
  box.append(el("p", `上次检查：${data.account.checkedAt ? date(data.account.checkedAt) : "尚未检查"}；只检查公开首页最近 10 帖。`, "description"));
  for (const item of data.items.filter(i => !company || i.companies.includes(company))) {
    const article = el("article", null, "card"); article.append(el("div", `${date(item.publishedAt)} · ${item.topic.toUpperCase()} · 待核实`, "meta"));
    const h3 = el("h3"); h3.append(link(item.title, item.url)); article.append(h3, el("p", `原帖短摘录（作者观点）：${item.excerpt}`)); box.append(article);
  }
  return box;
}
function render() {
  if (!snapshot) return;
  const { key, company } = route(), content = $("content"); content.replaceChildren();
  $("heading").textContent = titles[key]; $("description").textContent = descriptions[key] ?? "";
  $("controls").hidden = key === "daily" || key === "notice"; $("companies").hidden = key !== "aidc"; $("source-status").hidden = key === "notice";
  document.querySelectorAll(".navigation a").forEach(a => { if (a.hash === `#${key}`) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("companies").replaceChildren();
  for (const c of [{ id: null, name: "全部企业 / 机构" }, ...companies]) {
    const button = el("button", c.name); button.setAttribute("aria-pressed", String(c.id === company));
    button.onclick = () => { location.hash = `aidc${c.id ? `?company=${c.id}` : ""}`; }; $("companies").append(button);
  }
  const days = Number($("period").value), query = $("search").value.trim().toLowerCase();
  let items = snapshot.items.filter(i => (!days || Date.parse(i.publishedAt) >= Date.now() - days * 86400000)
    && (!query || `${i.title} ${i.originalTitle ?? ""} ${i.summary ?? ""} ${i.sources.map(s => s.name).join(" ")}`.toLowerCase().includes(query)));
  if (key === "selected") items = items.filter(i => i.kind === "selected");
  if (key === "nvidia") items = items.filter(i => ["nvidia-news", "nvidia-blog", "nvidia-developer", "nvidia-research"].includes(i.sourceId));
  if (key === "aidc") items = items.filter(i => i.aidcPriority > 0 && (!company || i.companies.includes(company)));
  $("count").textContent = key === "daily" || key === "notice" ? "" : `${items.length} 条动态`;
  $("more").hidden = items.length <= visible || ["daily", "notice"].includes(key);
  if (key === "aidc") {
    content.append(el("h2", "重点信息", "section-title"), section("BBU 电池备援", items.filter(i => i.aidcPriority === 2), "bbu-section"), section("技术博客 / 白皮书 / 报告", items.filter(i => i.aidcPriority === 3), "bbu-section"), section("AIDC 最新", items.filter(i => i.aidcPriority === 1)), community(company));
  } else if (key === "daily") {
    for (const report of snapshot.reports) {
      const box = el("section"); box.append(el("h2", `早报 · ${report.date}`, "section-title"));
      box.append(el("p", `覆盖 ${date(report.windowStart)} — ${date(report.windowEnd)}（北京时间，右端不含）`, "description"));
      const entries = report.itemIds.map(id => snapshot.items.find(i => i.id === id && i.kind === "selected")).filter(Boolean);
      if (!entries.length) { box.append(el("p", "暂无符合条件的精选。免费采集仍在继续，请查看全部动态和 AIDC / BBU。", "empty")); const a = el("a", "查看全部动态 →"); a.href = "#all"; box.append(a); } else list(entries, box, entries.length);
      content.append(box);
    }
  } else if (key === "notice") {
    const notice = el("section", null, "notice card");
    notice.append(el("h2", "个人新闻阅读版"), el("p", "这是公开的新闻索引，不需要登录；只保存公开标题、日期、来源、必要短摘录和已核验摘要，不提供文章全文。新闻与社区观点仅供信息检索，不构成投资建议，重要信息请核对原文。"), el("h2", "隐私与费用"), el("p", "本页面不收集账号、密码或定位，不植入广告与第三方统计。GitHub 作为托管方可能记录访问日志，请参阅 GitHub 隐私政策。搜索仅在你的浏览器内进行。"), el("p", "云端每天 09:00 启动免费采集，GitHub 排队可能延迟；未启用 DeepSeek 或其他付费 API。无法解析正文时只展示标题快讯。充值与模型设置不在手机端开放。"), el("p", "手机 Safari 可通过分享 → 添加到主屏幕固定入口。此版不缓存离线新闻，避免把旧内容误当最新。"), link("GitHub 隐私政策", "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement")); content.append(notice);
  } else list(items, content);
  const check = snapshot.check, stale = Date.now() - Date.parse(check.at) > 36 * 3600000;
  $("status").className = check.state === "partial" || stale ? "warning" : "";
  $("status").textContent = `网页数据 ${date(snapshot.generatedAt)}（北京时间） · ${check.state === "snapshot" ? "本机公开内容快照，尚非云端抓取" : `${check.sources} 个信源已尝试 · ${check.failedSources.length} 个读取失败`} · 免费模式${stale ? " · 更新已超过 36 小时，请检查采集任务" : ""}`;
  $("source-list").replaceChildren(el("p", "访问限制、缺可信日期或未接通的来源不会伪装成已覆盖；仅监控配置的公开入口，不保证全网或历史资料齐全。"));
  for (const s of snapshot.sources) { const p = el("p"); p.append(link(s.name, s.url), document.createTextNode(` · ${{ ok: "已读取", error: "读取失败", paused: "入口待接通", pending: "尚未读取" }[s.state]}${s.lastOkAt ? ` · ${date(s.lastOkAt)}` : ""}`)); $("source-list").append(p); }
  if (check.failedSources.length) $("source-list").append(el("p", `本轮失败：${check.failedSources.join("、")}`));
}
async function load() {
  $("refresh").disabled = true;
  try {
    const response = await fetch(`./news.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("unavailable");
    const value = await response.json(); if (value.version !== 1 || !Array.isArray(value.items)) throw new Error("invalid");
    snapshot = value; render();
  } catch { $("status").textContent = snapshot ? "读取新版本失败，仍显示上一次成功加载的新闻。" : "新闻暂时读取失败，请稍后点刷新。"; $("status").className = "warning"; }
  finally { $("refresh").disabled = false; }
}
$("refresh").onclick = load;
$("more").onclick = () => { visible += 40; render(); };
$("search").oninput = $("period").onchange = () => { visible = 40; render(); };
window.addEventListener("hashchange", () => { visible = 40; render(); window.scrollTo(0, 0); });
load();
