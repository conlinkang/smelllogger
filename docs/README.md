# Smell Logger

雲林地區臭味紀錄與分析前端。第一版的通報輔助採用「規則式快速選擇＋自動產生說明文字」，不依賴 LLM，也不依賴 `.194`。

## 啟動前設定

1. 在 `assets/js/app-config.js` 填入一組已限制 HTTP referrer、API scope 的 Google Maps 瀏覽器金鑰；不要使用未限制或已公開的舊金鑰。
2. 若要使用 OpenWeatherMap，填入新的 `weatherApiKey`，並保留 `weatherEndpoint`；沒有 Key 時會自動使用 `weatherFallbackEndpoint` 的 Open-Meteo。
3. 確認 `recordEndpoint` 的 Apps Script `doPost` 能解析 `text/plain` 內的 JSON。
4. 確認 `analysisEndpoint` 回傳 `{ "records": [...] }`，並在後端 readback 驗證 `complaint` 物件已保存。
5. 以 HTTPS 或 localhost 提供網頁，GPS 與 Clipboard API 才能正常工作。

可用任何靜態伺服器啟動，例如：

```powershell
python -m http.server 8000
```

## 資料契約

紀錄送出內容包含原有的座標、臭味程度、發生時間、天氣型態，以及：

```json
{
  "complaint": {
    "pollutionCategory": "異味污染物",
    "locationAddress": "GPS 反向查詢地址或 GPS 定位點",
    "moenvCause": "fertilizeCompost",
    "odorType": "burning",
    "duration": "fiveToThirty",
    "suspectedSource": "unknown",
    "impacts": ["throat"],
    "description": "可編輯的通報說明",
    "reporter": {
      "name": "",
      "phone": "",
      "email": "",
      "address": ""
    }
  }
}
```

前端目前會將反向地理編碼取得的地址，以及發生地點的天氣型態、溫度、風速、風向加入自動說明；也提供環境部異味快速分類與 CAPTCHA 人工接力。使用者勾選具名確認且資料完整後，Cloud Run 先填到最後驗證頁，將 CAPTCHA 顯示回平台；本人輸入後才由同一短效工作階段送出。

已部署的 runner：

```text
https://smelllogger-runner-442879625893.asia-east1.run.app
```

- `/health`：健康檢查。
- `/prepare`：準備環境部表單並回傳 CAPTCHA 與 5 分鐘短效工作階段。
- `/finalize`：接收本人輸入的 CAPTCHA；錯誤可更新圖片重試，最多 3 次。
- `/submit`：具名資料完整時填寫環境部表單；`prepare` 可停在最後確認前，`submit` 在服務端開關與固定確認條件都通過時才會按下最後送出。
- `/analyze-voice`：一次性語音轉寫與 Vertex AI 候選分類；使用者仍可修改快速選項。

完整開發順序、驗收條件與尚未完成的 GitHub Pages 發佈步驟見 [development-roadmap.md](development-roadmap.md)；實際上線前請依 [release-checklist.md](release-checklist.md) 逐項驗證。

通報人欄位沒有網站代理人預設值。未填寫時只保存平台臭味紀錄；使用者若填寫並勾選「記住於本機」，資料只存於該瀏覽器的 localStorage，下一次可自動帶入。平台送出前會移除 `reporter` 欄位，Apps Script 與 Google Sheet 永不收到或保存通報人個資。

## 上線前後端同步

目前試算表主分頁是 `工作表1`，可直接參考 [apps-script/Code.gs](../apps-script/Code.gs) 與 [部署說明](../apps-script/README.md)：

- 以 `JSON.parse(e.postData.contents)` 解析 `text/plain` 請求內容。
- 保存去除通報人個資後的 `complaint` JSON；通報人只在當次瀏覽器頁面內用於複製正式填單資料。
- 至少保存位置地址、污染類別、環境部快速分類、異味類型、持續時間、疑似來源、身體影響與可編輯說明。
- 後端無論是否勾選本機記住，都不得保存 `reporter` 物件。
- 用一筆真實測試紀錄 readback 確認 `complaint` 已出現在分析端點回傳資料，再宣告整合完成。

前端送出使用 `no-cors` 是為了相容目前尚未確認 CORS 回應的 Apps Script；因此瀏覽器只能顯示「已送出請求」，不能宣稱伺服器已保存。不要用假資料測試正式紀錄端點。

正式陳情自動填單的欄位盤點、資安界線與 Google Cloud 方案見 [official-submission.md](official-submission.md)。

## 驗證

- `npm --prefix tools test`：執行前端與 Apps Script 純函式資料契約煙霧測試。
- `assets/js/report-form.js`：規則式文字與 `complaint` 資料產生。
- `assets/js/submission-client.js`：集中處理送出 timeout 與 opaque response 判斷。
- `assets/js/analysis-ui.js`：KPI 與 SVG 趨勢圖，不新增圖表服務金鑰。
- `assets/js/date-utils.js`：所有日期篩選與顯示以 `Asia/Taipei` 為準。
