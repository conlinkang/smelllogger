# 環境部正式陳情填單整合

## 已確認的官方流程

目前官方異味陳情表單需要依序處理：

1. 閱讀說明並同意開始登錄。
2. 選擇「異味污染物」與異味情形，例如「施肥或堆肥」。
3. 填寫「污染情形描述」（必填）。
4. 填寫污染者名稱（必填；未知時可使用「不明」），以及污染者電話、負責人與是否指定稽查時間。
5. 填寫污染地點：縣市、鄉鎮市區，以及地址、地段或地址備註其中一種。
6. 選擇回覆方式（必選）、是否願意會同稽查，並填寫具名通報人的姓名、Email，以及市話或行動電話至少一項。

本系統已將上述資料拆成快速選項、GPS 地址、天氣、自動說明、環境部第二階段預填欄位與本機通報人資料。使用者在平台勾選具名陳情確認後，Cloud Run 先把表單填到 CAPTCHA；CAPTCHA 圖片回到平台由本人辨識，再由同一個短效工作階段完成送出。

## 目前已完成

- 平台紀錄與正式陳情資料分離。
- 沒有通報人資料時，只保存平台臭味紀錄。
- 通報人資料只存於使用者瀏覽器的 localStorage；Apps Script 與 Google Sheet 永不保存。
- 已將「畜牧或堆肥異味」作為預設快速選項，並支援規則式選項與自動產生說明文字。
- 說明文字會附註：`本通報由 https://conlinkang.github.io/smelllogger/index.html 輔助填單。`
- `official-form-runner/` 已用真實官方表單，以假資料完成第一至第三階段的本機 Playwright prepare 端到端測試；測試回傳 `202 READY_FOR_FINAL_REVIEW`，未送出案件。正式送出不使用假資料測試。
- 已加入可選語音流程：Google Cloud Speech-to-Text 轉寫，Vertex AI Gemini 只回傳既有選項的候選分類；前端規則式說明文字仍是最後來源。
- Cloud Run 已部署並完成驗證；目前 revision 為 `smelllogger-runner-00009-m5c`，服務網址為 `https://smelllogger-runner-442879625893.asia-east1.run.app`。`/health` 回傳 `officialSubmitEnabled:true`、`captchaRelayEnabled:true`、300 秒期限與 3 次 CAPTCHA 上限。

## Cloud Run 自動填單流程

使用者按下「送出」後，系統按以下順序處理：

1. 前端驗證 GPS、雲林縣、鄉鎮市區、異味選項與必要的具名資料。
2. 通報資料以 HTTPS 傳給 Cloud Run；後端不保存 request body。為了銜接 CAPTCHA，Playwright 工作階段只暫存在單一 Cloud Run 執行個體的記憶體，預設 5 分鐘後清除。
3. Playwright 開啟環境部表單，完成同意頁、異味分類、描述、污染地點與具名資料欄位。
4. `/prepare` 將 CAPTCHA 圖片與不可猜測的短效 session ID 回傳平台；CAPTCHA 只由使用者辨識，不交給 OCR 或 LLM。
5. `/finalize` 在同一工作階段輸入使用者提供的 CAPTCHA 並按下最後送出。錯誤時更新圖片，可重試至多 3 次；逾時、超過次數、執行個體重啟或流程異常時，必須重新準備。
6. 環境部若寄出認證信，使用者仍須到信箱完成認證；取得案件編號後才算正式完成報案。

目前服務部署設定應維持：

```text
OFFICIAL_SUBMIT_ENABLED=true
officialSubmissionMode=submit
```

目前已依使用者指示開啟正式送出，但仍必須同時滿足前端 `officialSubmissionMode=submit`、服務端精確判斷 `OFFICIAL_SUBMIT_ENABLED=true`、`finalSubmit=true`、固定確認字串、雲林縣限制、完整具名資料與地址解析；前端單獨改設定不能繞過服務端防護。

## 語音快速通報流程

使用者按住或點擊錄音，講一句描述，例如「斗六這邊有很重的畜牧堆肥味，晚上開始，會刺鼻和噁心」。錄音上限 15 秒，只有在使用者主動啟用且服務端點已設定時才送出。

1. Cloud Run 將 WebM/Opus 或 Ogg/Opus 送給 Speech-to-Text。
2. Vertex AI Gemini 依系統既有 enum 回傳 `odorLevel`、`odorType`、`moenvCause`、`duration`、`impacts` 等候選值。
3. 前端把候選值套入快速選項，顯示逐字稿與可修改欄位。
4. 前端重新產生固定格式說明，並要求使用者確認；LLM 不產生法律結論，也不處理姓名、電話、Email 或地址。

## 風險與前置條件

- 官方網站沒有提供本系統可直接使用的正式 API，頁面以多頁 Web Forms 與動態 postback 運作，欄位或流程變更會使自動化失效。
- CAPTCHA 由使用者人工輸入，系統不繞過或自動破解；官方反自動化規則、網站服務條款或欄位變更仍可能讓 Cloud Run 無法完成最後送出。
- Cloud Run、Cloud Build、Artifact Registry、Vertex AI 與 Speech-to-Text 可能依使用量計費；應設定預算通知、速率限制與日誌保留政策。
- 具名陳情涉及真實個人資料與法律責任；在沒有人工確認與明確同意前，不應由後端無人值守提交。
- 公開 GitHub Pages 無法安全保存 `RUNNER_TOKEN`，目前依靠精確 CORS、速率限制、無 body log、明確勾選與服務端固定確認條件。若要提高防濫用能力，後續加入受保護 broker、App Check、登入或短效簽章。

## 官方入口

- [環境部公害污染陳情網路受理系統](https://ww3.moenv.gov.tw/Public/Case_Add.aspx)
## Voice and acoustic safeguards

The optional voice flow sends a short recording to Google Cloud Speech-to-Text and Vertex AI. The browser may calculate coarse acoustic features (loudness and pitch variation) before sending the request. They are only a weak “expression intensity” hint; the system does not claim to detect anger or infer odor severity from pitch alone. Text remains primary, the user can edit every suggested field, and acoustic-assisted results require review. Raw audio and acoustic features are not written to the platform record.
