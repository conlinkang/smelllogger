# Google Apps Script 後端

`Code.gs` 是第一版資料保存與分析 readback 的參考實作，對應前端的 `recordEndpoint` 與 `analysisEndpoint`。

## 部署

1. 建立或開啟保存臭味紀錄的 Google Sheet。
2. 在 Apps Script 專案加入 `Code.gs`。若是綁定試算表的腳本，保留 `CONFIG.spreadsheetId` 空白；若是獨立腳本，填入試算表 ID。
3. 目前提供的試算表主分頁是 `工作表1`，`Code.gs` 已預設使用它；若改名，才需要同步修改 `CONFIG.sheetName`。
4. 以 Web app 部署，執行身分選擇擁有者，存取權依實際使用者範圍設定。
5. 將部署 URL 更新到 `assets/js/app-config.js`。

## 資料與隱私

- `doPost` 解析 `text/plain` 內的 JSON，保存既有欄位與去除通報人個資後的 `complaint` JSON。
- `備註` 保留說明文字供舊欄位相容；`通報資料JSON` 是完整通報資料的保存來源。
- `氣象狀態`、`溫度`、`風速`、`風向` 以及疑似位置的對應欄位會保存前端取得的天氣資料；API Key 與服務連結只屬於前端設定，不應寫入試算表。
- 不再使用網站代理人預設資料；沒有通報人資料時標記為 `platform-only`。
- `reporter` 的姓名、電話、Email、聯絡地址只供當次前端複製正式填單使用，Apps Script 會在寫入 Sheet 前一律剔除，不保存於 `通報資料JSON`。
- 使用者勾選本機記住時，資料保存在瀏覽器 localStorage，不會送到 Apps Script。
- `doGet` 只回傳分析所需欄位與去除通報人聯絡資料的 `complaint` 摘要，不回傳姓名、電話、Email、聯絡地址、IP 或原始說明文字。
- 測試版會為新平台紀錄建立隨機 `紀錄ID`。只有 Cloud Run 最後回傳 `submitted` 或 `email_verification_required` 時，前端才會以該 ID 寫回 `環境部送出狀態` 與伺服器時間；`紀錄ID` 不會由 `doGet` 公開。
- `email_verification_required` 代表環境部表單已送出但仍待使用者完成信箱認證；analysis 的「已送出環境部」會計入此狀態，但不等同已取得案件編號。
- 正式部署前要確認 Google Sheet 存取權、個資保存期限與環境部通報流程的管理責任。

## 驗證

先用測試 Sheet 部署，再由前端送出一筆使用者同意的真實測試紀錄，確認：

1. 試算表新增一列，且 `通報資料JSON` 可解析。
2. `doGet` 回傳的 `records` 包含座標、臭味程度、時間與去識別化 `complaint`。
3. `doGet` 絕不包含 `reporter` 物件或 `通報資料JSON` 原文。
4. 完成環境部 CAPTCHA 送出後，同一列出現 `環境部送出狀態` 與 `環境部送出時間`，且 analysis 測試頁的數量隨日期與臭味等級篩選更新。
