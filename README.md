# Battery Hot 手机阅读版

手机访问：[https://faithkuang.github.io/battery-hot-mobile/](https://faithkuang.github.io/battery-hot-mobile/)。2026-10-12 已完成真实云端免费采集与 Pages 部署，10-13 再次核验 HTTPS/资源/RSS；手机宽度浏览器已验证，尚非实体 iPhone 实测。当前快照及信源状态是运行结果，见 [运行记录](https://github.com/FaithKuang/battery-hot-mobile/actions)，不承诺所有信源可访问。

公开仓库：`FaithKuang/battery-hot-mobile`。此版是 GitHub Pages 静态只读阅读器，不是将本机 PostgreSQL 或管理后台暴露到公网，也不代表本地重建站已经通过七天迁移验收。

## 数据与费用

- 台达美洲官网新闻及博客纳入免费日批次；Power Rack / Power Shelf / 800 VDC 技术内容进入技术重点，明确电池备援进入 BBU，保留官网日期和原文证据，不提升严格精选资格。


- 默认全部动态；另有 AIDC / BBU、四路官方 NVIDIA、严格精选和日报。AIDC「重点信息」分为 BBU 与 NVIDIA、OCP、台达、光宝、顺达、新普科技、新盛力官方技术博客 / 白皮书 / 报告，二者不等于精选。OCP 两个官方 RSS 入口有界抓取，报告时间显示官网发布 / 收录时间，不冒充文档版本日期；未解析 PDF 仍只出标题。社区线索独立标为待核实。
- `publication/pages.ts` 从统一公开读取层导出白名单字段，`pages-model.ts` 再隔离标题快讯字段、检查来源和 URL、合并事件。无完整正文、原始数据库、管理员信息或密钥。
- `public-data/news.json` 是可公开的持久新闻历史。新的临时数据库只收集当天可访问的来源；导出时合并历史，失败不能清空既有新闻。保存同版本历史核验摘要不等于新调用模型。
- GitHub Actions 使用标准 Ubuntu 和临时 PostgreSQL 17；模型及外部推送关闭，不提供任何付费 API Key。每轮检查 `receipt_attempts=0`，违例则停止发布。
- 每天 UTC 01:00（北京时间 09:00）启动一次；GitHub 可能排队延迟或因平台限制停用任务。计算机关机不影响已部署网页和云端任务，但不能承诺精确 09:00 完成。
- 日报仅包含昨日北京时间自然日的严格精选；免费模式没有合格精选时明确写暂无精选，不把英文摘录冒充中文总结。
- RSS 为 `feed/all.xml`。手机刷新按钮只重新读取网页数据，不发起采集或付费调用。

## 构建与故障恢复

`npm run pages:test` → 临时库迁移与种子 → `npm run pages:refresh` → `npm run pages:export -- public-data/news.json .data/pages-run.json` → `npm run pages:build` → 密钥检查 → 保存公开 JSON → Pages 部署。

GitHub 仓库 Settings → Pages → Source 选择 GitHub Actions；Actions 中可人工运行 Battery Hot daily news。没有任何凭据需要放在仓库 Secrets。严禁修改此任务让它连接本机生产库。

出现单源失败仍发布合格新闻，并列出失败来源；致命错误或空快照不发布，旧网页继续服务。若页面提示超过 36 小时未更新，检查最新 Actions 运行。定时配置和一次人工/推送触发成功不等于已通过连续七天定时验收。

恢复时不要直接重跑旧提交的整个工作流：它含采集、公开 JSON 提交和推送，可能失败，也可能重新部署旧历史。先保存最新 `main` 提交与 `public-data/news.json`；需要回退代码时，在最新 main 上只恢复已确认的代码文件，保留最新公开历史，重新检查门禁和构建后再运行工作流。代码回退不保证旧读取规则理解新数据，须检查卡片数量、日期、字段隔离和 RSS。任何会替换线上内容的恢复操作先取得授权；禁止清空新闻 JSON、强推旧分支或删除原始数据库。

发布包只包含执行采集所需的已审查源代码、依赖清单、数据库空结构迁移、品牌资产、页面和公开 JSON；不包含本机 Git 历史、`.env`、`.data`、数据库备份、私人操作笔记或未确认的上游条款模板。

本机 `.data/pages-release/` 是初次发布的生成材料，不是远端 main 的镜像；其中清单和 `dist/pages/` 可能已经过期，也可能混有测试安装的 node_modules。下次发布必须从最新审查源码重新生成白名单，并以远端最新公开 JSON 为历史基底；不得整目录上传或用初次种子覆盖云端历史。本机未提交开发成果与公开仓库提交分别保存，不视为已经同步。

这不是完整 React Router 网站：个人收藏、管理后台、数据库写入和动态 API 不在 Pages 开放。本机 3010、3011 和原调度保持原样。
