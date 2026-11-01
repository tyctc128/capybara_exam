# 卡皮九九大冒險

純前端的九九乘法打地鼠遊戲，角色為黏土玩具風格的卡皮巴拉。

## 線上遊玩

<https://tyctc128.github.io/capybara_exam/>

## 本機預覽

專案不需要安裝套件。請用靜態 HTTP 伺服器開啟：

```powershell
python -m http.server 8000
```

然後前往 `http://127.0.0.1:8000/`。

## GitHub Pages

將儲存庫的 Pages Source 設為 `Deploy from a branch`，選擇主要分支與根目錄即可。

## 遊戲規則

- 三關依序為 3×3、4×4、5×5 洞口。
- 每關限時80秒，答對10題即過關。
- 敲錯扣一顆愛心，每局共有五顆。
- 失敗會返回主地圖，成功會解鎖下一關。
- 進度、教學狀態與音效偏好保存在瀏覽器 `localStorage`。

## 素材

遊戲場景與角色素材使用內建影像生成工具製作，角色素材再經 `generate2dsprite` 去背與尺寸標準化處理。音效來源與授權記錄請見 `sound/SOURCES.md`。
