# Battery Hot 手机阅读版

公开仓库：`FaithKuang/battery-hot-mobile`。此版是 GitHub Pages 静态只读阅读器，不是将本机 PostgreSQL 或管理后台暴露到公网，也不代表本地重建站已经通过七天迁移验收。

## 数据与费用

- 默认全部动态；另有 AIDC / BBU、四路官方 NVIDIA、严格精选和日报。BBU 重点不等于精选。社区线索独立标为待核实。
- `publication/pages.ts` 从统一公开读取层导出白名单字段，`pages-model.ts` 再隔离标题快讯字段、检查来源和 URL、合并事件。无完整正文、原始数据库、管理员信息或密钥。
- `public-data/news.json` 是可公开的持久新闻历史。新的临时数据库只收集当天可访问的来源；导出时合并历史，失败不能清空既有新闻。保存同版本历史核验摘要不等于新调用模型。
- GitHub Actions 使用标准 Ubuntu 和临时 PostgreSQL 17；模型及外部推送关闭，不提供任何付费 API Key。每轮检查 `receipt_attempts=0`，违例则停止发布。
- 每天 UTC 01:00（北京时间 09:00）启动一次；GitHub 可能排队延迟或因平台限制停用任务。计算机关机不影响已部署网页和云端任务，但不能承诺精确 09:00 完成。
- 日报仅包含昨日北京时间自然日的严格精选；免费模式没有合格精选时明确写暂无精选，不把英文摘录冒充中文总结。
- RSS 为 `feed/all.xml`。手机刷新按钮只重新读取网页数据，不发起采集或付费调用。

## 构建与故障恢复

`npm run pages:test` → 临时库迁移与种子 → `npm run pages:refresh` → `npm run pages:export -- public-data/news.json .data/pages-run.json` → `npm run pages:build` → 密钥检查 → 保存公开 JSON → Pages 部署。

GitHub 仓库 Settings → Pages → Source 选择 GitHub Actions；Actions 中可人工运行 Battery Hot daily news。没有任何凭据需要放在仓库 Secrets。严禁修改此任务让它连接本机生产库。

出现单源失败仍发布合格新闻，并列出失败来源；致命错误或空快照不发布，旧网页继续服务。若页面提示超过 36 小时未更新，检查最新 Actions 运行。回退网页可对指定旧提交重新运行部署；禁止清空新闻 JSON 或删除原始数据库。

发布包只包含执行采集所需的已审查源代码、依赖清单、数据库空结构迁移、品牌资产、页面和公开 JSON；不包含本机 Git 历史、`.env`、`.data`、数据库备份、私人操作笔记或未确认的上游条款模板。

这不是完整 React Router 网站：个人收藏、管理后台、数据库写入和动态 API 不在 Pages 开放。本机 3010、3011 和原调度保持原样。
