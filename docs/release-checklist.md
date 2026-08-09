# SmellLogger 發佈檢查表

這份清單用來把本機版本發佈到 `https://conlinkang.github.io/smelllogger/index.html`。目前 Cloud Run 已部署，但 GitHub repository 的 `main` 尚未包含本機這批變更。

## 發佈前

- [ ] `npm --prefix tools test` 通過。
- [ ] `npm --prefix tools run test:browser` 通過（手機 390px、平台-only 與具名 prepare 雙流程）。
- [ ] `node --check official-form-runner/server.js` 通過。
- [ ] `git diff --check` 沒有新增格式錯誤。
- [ ] `assets/js/app-config.js` 只包含瀏覽器用 Google Maps key，不包含服務帳號 JSON、`RUNNER_TOKEN` 或其他私密金鑰。
- [ ] `officialSubmissionMode` 維持 `prepare`。
- [ ] 若要開啟正式送出，必須同時審核 `officialSubmissionMode=submit`、Cloud Run `OFFICIAL_SUBMIT_ENABLED=true`、`finalSubmit` 與固定確認字串；未完成審核不可變更。
- [ ] Cloud Run `/health` 回傳 `ok:true`、`county:"雲林縣"`、`voiceConfigured:true`。
- [ ] Cloud Run `/analyze-voice` 以不含個資的測試音訊回傳結構化分析。
- [ ] Cloud Run `/submit` 以假資料回傳 `READY_FOR_FINAL_REVIEW`，沒有正式送出案件。

## GitHub Pages 發佈後

- [ ] 開啟 `https://conlinkang.github.io/smelllogger/index.html`，確認頁面包含語音按鈕、製作人名稱與「輔助填單」說明。
- [ ] 確認瀏覽器載入 `assets/js/app-config.js?v=20260809-2`，且兩個 Cloud Run endpoint 不為空。
- [ ] 允許定位後，確認地址格式只保留到房號並加上「附近」。
- [ ] 不填通報人資料時，送出平台紀錄且不呼叫官方填單端點。
- [ ] 填完整姓名、電話、Email、聯絡地址並勾選官方確認後，按一次送出；確認平台紀錄與官方 prepare 流程都產生結果。
- [ ] 確認平台分析資料沒有 `reporter`、電話、Email 或聯絡地址。
- [ ] 錄製不含個資的一句話，確認逐字稿與候選選項可以修改；拒絕麥克風時仍可使用規則式快速選項。
- [ ] 若有聲音表達強度提示，確認畫面只顯示為輔助訊號，不宣稱生氣判定或直接代表臭味程度，且結果標記需要人工確認。

## 上線限制

- 第一版不自動按下環境部正式送出按鈕；使用者必須在官方頁面檢查並完成最後送出。
- 公開 GitHub Pages 不能安全保存 `RUNNER_TOKEN`。目前依賴精確 CORS、速率限制、prepare-only 與不記錄 request body；正式擴大使用前應加入受保護 broker、App Check、登入或短效簽章。
- 官方表單改版、CAPTCHA 或反自動化規則出現時，Cloud Run 必須回到 `manual_required`，不可宣稱已完成。
