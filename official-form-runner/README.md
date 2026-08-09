# 雲林異味通報 Cloud Run Runner

這個服務提供兩項功能：

1. 以 Playwright 開啟環境部公害污染陳情表單，填入已由前端整理的資料。
2. 以 Google Cloud Speech-to-Text 將一次性語音轉成文字，再由 Vertex AI Gemini 依既有選項分類。

服務支援 `prepare` 與 `submit`。`prepare` 會完成表單欄位填寫並停在最後確認前；`submit` 只有在 `OFFICIAL_SUBMIT_ENABLED=true`、請求指定 `finalSubmit=true`，且確認文字完全符合服務端固定字串時，才會進入正式送出分支。環境變數只有精確值 `true` 才會啟用。

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
- `GOOGLE_CLOUD_PROJECT`：Vertex AI 與 Speech-to-Text 使用的 Google Cloud 專案 ID。
- `GOOGLE_CLOUD_LOCATION`：Vertex AI 位置，預設 `global`。
- `VERTEX_MODEL`：Gemini 模型，預設 `gemini-2.5-flash`。
- `SPEECH_MODEL`：Speech-to-Text 模型，繁體中文預設使用 `default`；`latest_long` 目前不支援 `zh-TW`。

Cloud Run 應使用專用服務帳號，並只授予 Speech-to-Text 用戶端與 Vertex AI 使用權。服務使用 Application Default Credentials，不需要把 JSON 私鑰放進映像檔或 Git 儲存庫。

## API

- `GET /health`：回傳服務狀態、限定縣市、預設模式與語音服務是否已設定；`/healthz` 保留供本機相容，但公開 Cloud Run URL 使用 `/health`。
- `POST /submit`：接收通報資料並依 `mode` 執行官方表單 `prepare` 或 `submit` 流程。服務不記錄 request body；瀏覽器與 context 會在請求結束時關閉。
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

- CAPTCHA、官方欄位異動、瀏覽器驗證或表單錯誤時，服務回傳 `manual_required`，交由使用者手動完成。
- 正式送出只在前端明確勾選且服務端完成具名資料、地址、雲林縣與固定確認字串驗證後執行，避免未經最後確認即建立具名陳情。
- 公開 GitHub Pages 無法安全保存服務 token，因此目前以精確 CORS、速率限制、無 body log 和服務端固定條件降低風險；後續可再加上受保護的 broker、App Check 或登入層。
- `https://ww3.moenv.gov.tw/Public/Case_Add.aspx` 是第三方官方表單，欄位改版時必須重新執行本機端到端測試。
## Voice acoustic cue

The voice endpoint may receive short-lived browser-derived acoustic features: average RMS, peak RMS, average pitch, pitch range, and a coarse loudness bucket. These values are used only as a weak review cue when the transcript does not clearly express intensity. They do not identify anger, personality, truthfulness, or odor severity, and the raw audio and acoustic features are not stored by this service.

Transcript content remains the primary input. The returned analysis is always editable in the web form, and acoustic input forces `needsReview=true` so the user can confirm the odor level before submission.
