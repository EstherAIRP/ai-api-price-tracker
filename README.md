# API Atlas — AI API Price Tracker

一個無後端、每天自動更新的 AI API 價格比較網站，涵蓋 GPT、Gemini、Claude、DeepSeek、Grok，以及 OpenRouter、Together AI、Fireworks AI、SiliconFlow、Novita AI 等平台（以資料來源實際收錄為準）。

## 介面視覺

- 主題為 **冰藍極簡 × 粉彩手帳**：霧白背景、柔和冰藍、少量粉紫、圓角卡片與膠囊式篩選。
- 價格總覽與費用預估使用同一份 `site/style.css` 樣式表；手機維持卡片列表與 2 × 3 Token 輸入。
- 純視覺更新，不改動 API 報價、上下文限制、快取、幣別、排序或價格更新排程。
- 顯示仍維持三位小數、等寬數字、未四捨五入提示及 OpenRouter 費率驚嘆號。
- 沿用 `scripts/build_site.py` 的 CSS SHA-256 版本化以避免瀏覽器快取載入舊版外觀。

## 主要功能

- 價格總覽依序顯示 **模型／平台 → 上下文限制 → 輸入單價 → 輸出單價 → 資料來源**。價格為 USD / 1,000,000 文字 Token，上下文限制由平台模型目錄獨立蒐集，缺值顯示「—」。
- 可依模型系列、平台、關鍵字篩選及排序；可比較同一模型的多平台報價。
- 網站僅提供 **Standard / Business** 方案切換：OpenRouter 的輸入、輸出與成本試算顯示價格均直接乘上對應儲值費率倍率，並在價格旁提供驚嘆號說明；其他平台維持原始牌價。
- 不顯示虛構或人工填入的價目表。若來源失敗，保留前次有效值並標示其狀態。
- 09:00（Asia/Taipei）抓取暫存；12:00 自動驗證、發布並提交到 GitHub；無需人工批准。
- **費用預估頁面（/estimate.html）**：保留全部模型與供應平台的查詢、分類和排序。填入 Prompt、使用者輸入、RAG、歷史訊息每則 Token × 則數、輸出 Token，即時比較 1／10／50 次成本。
- 預估頁預設每次請求皆帶入相同且完整的歷史上下文：10 次即單次成本 × 10，50 次亦同。
- 有／無 Cache 情境切換；「命中」假設 Prompt＋歷史訊息已預先快取並完全命中，首次寫入費及過期、儲存費另計。沒有快取價格的模型不憑空套用折扣。
- 費用顯示美金及參考新臺幣：GitHub Actions 每日擷取 USD/TWD 匯率，失敗時保留前一筆；頁面必要時會查詢公開匯率備援。
- Python 標準函式庫實作資料蒐集；網站為純 HTML/CSS/JS，無付費 LLM 或後端需求。

## 安裝與上線

1. 本專案已建立於 **EstherAIRP/ai-api-price-tracker**（Public；預設分支 `main`）。
2. 原始碼已同步至儲存庫；若需從本地重新提交，可使用 Git CLI：

   ```bash
   git init
   git branch -M main
   git add .
   git commit -m "Initial API Atlas website"
   git remote add origin https://github.com/EstherAIRP/ai-api-price-tracker.git
   git push -u origin main
   ```

3. 到 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。
4. 到 **Actions → Daily AI API prices → Run workflow**，選擇 `full`，執行首次抓取、驗證、提交與網站部署。
5. 確認 **Actions** 工作流程成功，再開啟 **Settings → Pages** 查看網站網址，通常是 `https://EstherAIRP.github.io/ai-api-price-tracker/`。
6. 如 GitHub Actions 提示無權推送，請到 **Settings → Actions → General** 檢查工作流程與 `GITHUB_TOKEN` 的寫入權限、分支保護規則。排程已在工作流程宣告 `contents: write`，不需要儲存庫存取權杖（PAT）。

> GitHub Pages 必須設定為 Actions 發布來源。若 `github-pages` Environment 有額外設定審核人，須移除該保護規則才符合「無審核直接部署」的需求。

## 每日排程

| 台北時間 | 內容 | 檔案 |
| --- | --- | --- |
| 09:00 | 擷取公開價格、保存中繼快照，同步更新 USD/TWD 匯率 | `data/staging.json`、`site/data/fx-rate.json` |
| 12:00 | 驗證價格並發布網站，必要時更新 USD/TWD 匯率 | `site/data/prices.json`、`site/data/history.json`、`site/data/fx-rate.json` |

使用 GitHub Actions `schedule.timezone: Asia/Taipei`。排程由 GitHub 調度，不保證精確於整點開始。若當天資料未擷取成功或過期，發布會失敗而**不覆蓋現有價目表**。

可隨時手動執行：

```bash
python scripts/prices.py collect
python scripts/prices.py publish
# 或
python scripts/prices.py full
```

本機預覽（請使用伺服器，不要直接 `file://` 開啟）：

```bash
python -m http.server --directory site 8080
```

## 資料來源與準確性

- [Models.dev API](https://models.dev/api.json)：涵蓋多家模型及平台的**社群彙整**價格與上下文限制（`limit.context`）、最大輸出限制（`limit.output`）。記錄中的「官方通路」是指官方提供的 API 通路，不代表直接從官方價格頁擷取、即時核對或保證成交價。
- [OpenRouter 模型 API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)：當平台允許讀取時直接取得 OpenRouter 價格及上下文限制（優先使用 top provider 的有效限制，否則使用模型目錄值），取代相同模型的 Models.dev 彙整值。若回傳 HTTP 401，可在 **Settings → Secrets and variables → Actions** 設定選用的 `OPENROUTER_API_KEY`（不可提交到儲存庫）。
- 官方價格參考： [OpenAI](https://openai.com/api/pricing/)、[Gemini](https://ai.google.dev/gemini-api/docs/pricing)、[Claude](https://www.anthropic.com/pricing#api)、[DeepSeek](https://api-docs.deepseek.com/quick_start/pricing)、[xAI](https://docs.x.ai/developers/models)。這些是**核對連結**，並非目前自動化直接擷取來源。

### 限制

- 上下文長度不是最大輸出長度；OpenRouter 的實際路由供應商限制可能不同，未知數值不跨平台推估。
- 目前只針對標準文字輸入與輸出的 Token 價格；不比較批次、長上下文、快取折扣、圖片／影片／音訊、各種額外手續費、免責／地域／稅金及定價級距。
- 只有**明確的同一模型識別碼**才會被視為同一模型，不會用模糊名稱猜測。
- 價格自動驗證使用變動幅度初篩；當價格從非零變為零、暴漲超過 5 倍或跌到不足 20% 時，首次先保留舊值並標示異常；若隔日獨立擷取再次取得相同候選價格，則自動接受。仍需日後改進來源交叉核對。
- 資料庫會收錄該平台所提供的指定模型系列，平台可能不提供其中某系列；缺少報價不代表價格為零。
- 社群整理資料可能與實際官網價格有時間差；正式使用前應以平台價格頁或帳單為準。
- 長期規模變大時，建議改存每日差異檔與壓縮歷史，以控制 Git 儲存庫大小。

## 結構

```text
.github/workflows/daily-prices.yml   # 09:00 擷取、12:00 發布 + 手動更新
.github/workflows/pages.yml          # 初次與後續網站程式異動自動部署
scripts/prices.py                    # 價格擷取、標準化與異常防護
site/index.html                      # 價目總覽
site/estimate.html                   # 費用預估獨立頁
site/estimate.js                     # 篩選、表格和互動
site/estimate-core.js                # Token／Cache／平台費與匯率純函式
scripts/fx.py                        # 每日 USD/TWD 參考匯率擷取
site/data/fx-rate.json              # 最新有效 USD/TWD 報價
site/style.css
site/app.js
site/data/prices.json              # 發布資料（初始為空）
site/data/history.json             # 歷史變動（初始為空）
data/staging.json                   # 09:00 產生暫存（初始不存在）
tests/test_prices.py                # 無網路單元測試
```

## 測試

```bash
python -m unittest discover -s tests -v
node --check site/app.js
```

License: MIT

## 平台手續費與試算限制

- OpenRouter Standard 非加密貨幣儲值 5.5%，最低 $0.80；Business 8%。手續費只在購買點數時支付，**不是每次 Token 使用後再抽成**。
- BYOK 和 Enterprise 規則仍保留在政策資料中供未來需要時使用，但不在目前網頁的價格篩選與試算介面出現。
- 網站不提供 BYOK／Enterprise 比價模式，也不單列「平台費率」欄；其他平台尚未建檔的額外費用，**不代表不存在**。
- 顯示的 OpenRouter 含費價為 **原始 Token 牌價 × 1.055（Standard）／1.08（Business）** 的等效比較價。實際儲值時才收費，並非每次 Token 重新加收；Standard 最低收費 $0.80，故小額儲值有效費率可能較高。
- JSON 每日原始價與歷史價格保持未加價；只有前端展示與試算套用倍率，避免重複加成。
- 政策來源：[官方定價](https://openrouter.ai/pricing)、[平台費與最低儲值費公告](https://openrouter.ai/blog/simplifying-our-platform-fee/)。政策與模型單價更新頻率分開。
- 本功能的 JS 計算測試：`node --test tests/test_fees.cjs`。

## 預估頁面用法與限制

- 網址：`https://estherairp.github.io/ai-api-price-tracker/estimate.html`。主頁與預估頁使用相同的 `style.css` 與 `prices.json`。
- 每次輸入 Token = Prompt + 使用者輸入 + RAG +（歷史每則 Token × 歷史則數）；輸出 Token 獨立計費。
- 累計費用僅將同一次請求的費用分別乘 1、10、50，不逐輪累積上下文。
- Cache 命中只計可重用前綴（Prompt＋歷史），且需要來源提供 `cache_read_usd_m`；未命中則所有輸入按正常費率。
- 成本僅供預估：不含長上下文級距、推理隱藏 Token、RAG embedding／重排序、快取建立與存續費、稅或匯差；若不支援或缺少報價，清楚顯示不可估算。
- 匯率來源：[fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api)。不是實際信用卡／銀行換匯價格。
- 執行前端測試：`node --test tests/test_estimate.cjs`。
