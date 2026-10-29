預設音效由 js/sound.js 即時合成（8-bit 風格），不需要任何音檔。
若想換成自己的音檔，把 mp3 放在這個資料夾，並在 js/sound.js 的 CUSTOM_FILES 填入檔名即可。
請只使用你有權使用的音檔（自製或免版稅素材）。
可替換的音效名稱：tick、coin、bump、powerUp（加分）、gameOver（扣分）、powerDown、jump、pipe。
例如扣分想用自己的 Game Over 音檔：放 gameover.mp3 到這裡，CUSTOM_FILES 的 gameOver 改成 '/sounds/gameover.mp3'。
抽籤過程的背景音樂（預設為原創 8-bit 循環）：放 draw-loop.mp3 到這裡，CUSTOM_FILES 的 drawLoop 改成 '/sounds/draw-loop.mp3'，會循環播放到停下為止。
