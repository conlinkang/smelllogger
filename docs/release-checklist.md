# SmellLogger 發佈檢查表

這份清單用來把本機版本發佈到 `https://conlinkang.github.io/smelllogger/index.html`。目前 Cloud Run 已部署，但 GitHub repository 的 `main` 尚未包含本機這批變更。

## 發佈前

- [ ] `npm --prefix tools test` 通過。
- [ ] `npm --prefix tools run test:browser` 通過（手機 390px、平台-only 與具名 prepare 雙流程）。
- [ ] `node --check official-form-runner/server.js` 通過。
- [ ] `git diff --check` 沒有新增格式錯誤。
- [ ] `assets/js/app-config.js` 只包含瀏覽器用 Google Maps key，不包含服務帳號 JSON、`RUNNER_TOKEN` 或其他私密金鑰。
- [x] `officialSubmissionMode=submit`，且只有使用者勾選具名陳情確認後才會建立正式請求。
- [x] Cloud Run `OFFICIAL_SUBMIT_ENABLED=true`，後端只接受精確字串 `true`；`finalSubmit` 與固定確認字串仍由服務端驗證。
- [ ] Cloud Run `/health` 回傳 `ok:true`、`county:"雲林縣"`、`voiceConfigured:true`。
- [ ] Cloud Run `/analyze-voice` 以不含個資的測試音訊回傳結構化分析。
- [x] 已驗證 Cloud Run `/health` 回傳 `officialSubmitEnabled:true` 與 `defaultMode:submit`。
- [x] 本機瀏覽器整合測試攔截 `/submit` 並回傳 `manual_required`；不以假資料呼叫已啟用正式送出的 Cloud Run，避免建立誤報案件。

## GitHub Pages 發佈後

- [ ] 開啟 `https://conlinkang.github.io/smelllogger/index.html`，確認頁面包含語音按鈕、製作人名稱與「輔助填單」說明。
- [ ] 確認瀏覽器載入 `assets/js/app-config.js?v=20260809-4`，且兩個 Cloud Run endpoint 不為空。
- [ ] 允許定位後，確認地址格式只保留到房號並加上「附近」。
- [ ] 未完成定位時，送出按鈕保持無效；完成定位後才啟用平台紀錄送出。
- [ ] 不填通報人資料時，送出平台紀錄且不呼叫環境部填單端點。
- [ ] 環境部個資未完整時，按鈕只顯示「送出平台紀錄」，且部分填寫的個資不會送到平台或環境部。
- [ ] 填完整姓名、電話、Email、聯絡地址並勾選環境部確認後，按一次送出；確認平台紀錄與環境部結果均有回報，若遇 CAPTCHA／流程異常則顯示人工處理畫面。
- [ ] 一般填寫畫面不顯示環境部外部連結；只有人工確認、CAPTCHA、逾時或服務錯誤時才顯示環境部表單入口。
- [ ] 確認平台分析資料沒有 `reporter`、電話、Email 或聯絡地址。
- [ ] 錄製不含個資的一句話，確認逐字稿與候選選項可以修改；拒絕麥克風時仍可使用規則式快速選項。
- [ ] 若有聲音表達強度提示，確認畫面只顯示為輔助訊號，不宣稱生氣判定或直接代表臭味程度，且結果標記需要人工確認。

## 上線限制

- 正式送出已啟用，但只在使用者明確勾選確認、資料完整且服務端條件全部通過時按下；CAPTCHA 或官方流程改版時必須人工完成。
- 公開 GitHub Pages 不能安全保存 `RUNNER_TOKEN`。目前依賴精確 CORS、速率限制、固定確認條件與不記錄 request body；正式擴大使用前應加入受保護 broker、App Check、登入或短效簽章。
- 官方表單改版、CAPTCHA 或反自動化規則出現時，Cloud Run 必須回到 `manual_required`，不可宣稱已完成。
