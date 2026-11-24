# API Atlas — AI API Price Tracker

一個無後端、每天自動更新的 AI API 價格比較網站，涵蓋 GPT、Gemini、Claude、DeepSeek、Grok，以及 OpenRouter、Together AI、Fireworks AI、SiliconFlow、Novita AI 等平台（以資料來源實際收錄為準）。

## 主要功能

- 所有價格統一為 **USD / 1,000,000 文字 Token**（輸入與輸出分開顯示）。
- 可依模型系列、平台、關鍵字篩選及排序；可比較同一模型的多平台報價。
- 支援成本估算與最近 180 天的價格變動紀錄（僅保存價格異動事件）。
- 不顯示虛構或人工填入的價目表。若來源失敗，保留前次有效值並標示其狀態。
- 09:00（Asia/Taipei）抓取暫存；12:00 自動驗證、發布並提交到 GitHub；無需人工批准。
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
| 09:00 | 擷取公開資料、統一幣別和單位、保存中繼快照 | `data/staging.json` |
| 12:00 | 確認快照新鮮度、攔截異常價格、保留歷史、發布網站 | `site/data/prices.json`、`site/data/history.json` |

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

- [Models.dev API](https://models.dev/api.json)：涵蓋多家模型及平台的**社群彙整**價格。記錄中的「官方通路」是指官方提供的 API 通路，不代表直接從官方價格頁擷取、即時核對或保證成交價。
- [OpenRouter 模型 API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)：當平台允許讀取時直接取得 OpenRouter 價格，取代相同模型的 Models.dev 彙整值。若回傳 HTTP 401，可在 **Settings → Secrets and variables → Actions** 設定選用的 `OPENROUTER_API_KEY`（不可提交到儲存庫）。
- 官方價格參考： [OpenAI](https://openai.com/api/pricing/)、[Gemini](https://ai.google.dev/gemini-api/docs/pricing)、[Claude](https://www.anthropic.com/pricing#api)、[DeepSeek](https://api-docs.deepseek.com/quick_start/pricing)、[xAI](https://docs.x.ai/developers/models)。這些是**核對連結**，並非目前自動化直接擷取來源。

### 限制

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
site/index.html                      # 靜態網站
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
