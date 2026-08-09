# 雲林異味通報 Cloud Run Runner

這個服務提供兩項功能：

1. 以 Playwright 開啟環境部公害污染陳情表單，填入已由前端整理的資料。
2. 以 Google Cloud Speech-to-Text 將一次性語音轉成文字，再由 Vertex AI Gemini 依既有選項分類。

正式流程使用兩階段 API：`/prepare` 會完成表單欄位並將環境部 CAPTCHA 圖片回傳前端；使用者本人辨識後，`/finalize` 會在同一個短效 Playwright 工作階段輸入 CAPTCHA 並按下最後送出。服務不使用 OCR 或 LLM 破解 CAPTCHA。舊版 `/submit` 保留相容用途。

## 本機檢查

```powershell
npm install
node --check server.js
```

在專案根目錄執行：

```powershell
npm --prefix tools test
npm --prefix tools run test:browser
```

本機 Playwright 端到端測試會以假資料走過環境部表單的第一至第三階段，預期回傳 `202 READY_FOR_FINAL_REVIEW`，不送出真實案件。

## Cloud Run 環境變數

- `ALLOWED_ORIGIN`：允許的前端來源，例如 `https://conlinkang.github.io`。本測試版本不開放 localhost 來源。
- `REQUIRED_COUNTY`：服務限定的縣市，預設為 `雲林縣`。
- `OFFICIAL_SUBMIT_ENABLED`：正式送出總開關；目前正式環境為 `true`，只有精確值 `true` 才會啟用。
- `RUNNER_TOKEN`：可選的服務端 token；若設定，請求必須帶 `X-Runner-Token`。不可把它放在公開 GitHub Pages 前端。
- `RATE_LIMIT_PER_MINUTE`：每個 IP、每個端點的暫存速率限制，預設 10。
- `CAPTCHA_SESSION_TTL_MS`：短效填表工作階段存活時間，預設 300000（5 分鐘，最低 1 分鐘）。
- `MAX_CAPTCHA_SESSIONS`：單一執行個體同時保留的填表工作階段，預設 3。
- `MAX_CAPTCHA_ATTEMPTS`：同一工作階段允許的 CAPTCHA 嘗試次數，預設 3。
- `DIAGNOSTIC_SCREENSHOT_ENABLED`：僅限短暫人工驗收使用；預設關閉。啟用時，指定診斷請求可直接取得當次 Playwright 畫面，畫面不寫入 Cloud Storage。驗收後必須關閉。
- `GOOGLE_CLOUD_PROJECT`：Vertex AI 與 Speech-to-Text 使用的 Google Cloud 專案 ID。
- `GOOGLE_CLOUD_LOCATION`：Vertex AI 位置，預設 `global`。
- `VERTEX_MODEL`：Gemini 模型，預設 `gemini-2.5-flash`。
- `SPEECH_MODEL`：Speech-to-Text 模型，繁體中文預設使用 `default`；`latest_long` 目前不支援 `zh-TW`。

Cloud Run 應使用專用服務帳號，並只授予 Speech-to-Text 用戶端與 Vertex AI 使用權。服務使用 Application Default Credentials，不需要把 JSON 私鑰放進映像檔或 Git 儲存庫。

## API

- `GET /health`：回傳服務狀態、限定縣市、預設模式與語音服務是否已設定；`/healthz` 保留供本機相容，但公開 Cloud Run URL 使用 `/health`。
- `POST /prepare`：填到環境部最後驗證頁，回傳短效 `sessionId`、CAPTCHA 圖片與到期時間。瀏覽器工作階段只存在 Cloud Run 記憶體。
- `POST /finalize`：接收 `sessionId`、使用者輸入的 CAPTCHA 與固定確認字串，在同一工作階段完成最後送出。驗證碼錯誤時回傳更新圖片與剩餘次數；最多 3 次。
- `POST /submit`：舊版相容端點；請求結束即關閉瀏覽器，不支援 CAPTCHA 接力。
- `POST /analyze-voice`：接收一次性 `audioBase64` 與 `mimeType`，回傳 `transcript` 和受限於既有前端 enum 的 `analysis`。不儲存音檔、逐字稿或個資。

語音端點預期的 JSON：

```json
{
  "audioBase64": "...",
  "mimeType": "audio/webm;codecs=opus"
}
```

前端的規則式選項與自動產生說明文字仍是最後的資料來源；LLM 只提供快速建議，不產生法律結論，也不應在語音中說出姓名、電話、電子信箱或地址。

## 安全與營運限制

- CAPTCHA 必須由使用者本人辨識。輸入錯誤時可取得新圖重試；達 3 次或 5 分鐘未完成時，服務會關閉瀏覽器並清除工作階段。
- 前端可選擇 1–3 張 JPG／PNG 現場照片，壓縮後總計最多 5 MB；附件只存在本次 HTTPS 請求與短效 Playwright 工作階段，不寫入平台紀錄或 Google Sheet。
- 工作階段僅存於記憶體；Cloud Run 執行個體重啟或重新部署時也會失效，使用者必須重新準備表單。
- 通過 CAPTCHA 後，環境部仍可能要求使用者到電子信箱點擊認證連結；取得案件編號後才算完成報案。
- 正式送出只在前端明確勾選且服務端完成具名資料、地址、雲林縣與固定確認字串驗證後執行，避免未經最後確認即建立具名陳情。
- 公開 GitHub Pages 無法安全保存服務 token，因此目前以精確 CORS、速率限制、無 body log 和服務端固定條件降低風險；後續可再加上受保護的 broker、App Check 或登入層。
- `https://ww3.moenv.gov.tw/Public/Case_Add.aspx` 是第三方官方表單，欄位改版時必須重新執行本機端到端測試。
## Voice acoustic cue

The voice endpoint may receive short-lived browser-derived acoustic features: average RMS, peak RMS, average pitch, pitch range, and a coarse loudness bucket. These values are used only as a weak review cue when the transcript does not clearly express intensity. They do not identify anger, personality, truthfulness, or odor severity, and the raw audio and acoustic features are not stored by this service.

Transcript content remains the primary input. The returned analysis is always editable in the web form, and acoustic input forces `needsReview=true` so the user can confirm the odor level before submission.
