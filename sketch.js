/*
 * 國小四年級數學簡易練習測驗
 * ------------------------------------------------------------
 * 本檔案搭配同資料夾中的 index.html 使用，所有介面都由 p5.js canvas 繪製。
 * 所有介面都使用 p5.js canvas 繪製，並支援滑鼠與觸控操作。
 */

// =========================
// 一、全域設定與測驗資料
// =========================

// 請老師先將 Google 試算表發布到網路，或設定為任何知道連結的人可檢視，讓網站能匿名讀取。
// 請將 GOOGLE_SHEET_ID 替換成 Google 試算表網址中 /d/ 與 /edit 之間的試算表 ID。
// 請將 GOOGLE_SHEET_GID 替換成題庫所在工作表分頁的 GID；第一個分頁通常是 "0"。
// 老師修改並儲存 Google 試算表後，重新載入網站即可取得最新題目；不需要再放置本地 CSV。
const GOOGLE_SHEET_ID = "請貼上你的Google試算表ID";
const GOOGLE_SHEET_GID = "0";
const GOOGLE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vQmkCDGwkBYW3uYxlwGeGFyQyaZDpTUbZoTmhSyQSuagq23gR-EGodfIuclp0cVcHoba5JtV97tb0IV/pub?gid=1713649334&single=true&output=csv`;

// 設定測驗使用的主要顏色，方便日後集中修改。
const COLORS = {
  background: "#fefae0", // 畫布背景色。
  text: "#283618",       // 一般文字顏色。
  mutedText: "#606c38",  // 輔助文字顏色。
  card: "#fffdf0",       // 選項卡片的預設底色。
  questionCard: "#d8e2dc", // 題目卡片的背景色，與選項區隔。
  border: "#dda15e",     // 卡片邊框顏色。
  accent: "#bc6c25",     // 標題與按鈕的強調色。
  correct: "#ccd5ae",    // 答對時，使用者選擇的選項底色。
  wrong: "#f7b1b0",      // 答錯時，使用者選擇的選項底色。
  correctAnswer: "#8ecae6", // 答錯時，正確選項的底色。
  white: "#ffffff"       // 白色文字或按鈕文字。
};

// 題庫由同資料夾中的 Google 試算表 CSV 提供，sketch.js 不內嵌任何題目內容。
let questionTable = null;

// 儲存通過欄位與內容驗證的題目；有效題目不足五題時不啟動測驗。
let validQuestionBank = [];

// 題庫載入狀態：loading、ready 或 error。
let questionsLoadState = "loading";
let questionsLoadError = "";

// CSV 必須使用這六個固定欄位，欄位名稱大小寫也必須一致。
const REQUIRED_CSV_COLUMNS = [
  "question",
  "optionA",
  "optionB",
  "optionC",
  "optionD",
  "answer"
];

// 儲存目前測驗的五題，會在重新測驗時重新抽取並打亂選項。
let quizQuestions = [];

// 儲存目前顯示第幾題，索引從 0 開始。
let currentQuestionIndex = 0;

// 儲存目前答對的題數。
let score = 0;

// 儲存使用者選了哪個選項，尚未作答時為 -1。
let selectedOptionIndex = -1;

// 記錄目前是否已經作答，作答後禁止再次選擇其他選項。
let hasAnswered = false;

// 控制目前畫面是題目頁面還是成績頁面。
let quizState = "question";

// 記錄動畫開始時間，讓答題後的動畫可以持續播放。
let animationStartTime = 0;

// 儲存畫布物件，方便設定觸控與顯示樣式。
let canvas;

// 儲存下一題按鈕與重新測驗按鈕的點擊範圍。
let nextButtonArea = null;
let restartButtonArea = null;

// 儲存目前畫面的選項點擊範圍，避免繪圖與點擊判定不一致。
let optionAreas = [];

// 記錄 Google Fonts 是否已完成載入；未載入時仍會使用瀏覽器備援字型。
let fontLoaded = false;

// 中文介面優先使用指定的 Google Fonts，後方列出常見系統備援字型。
const PRIMARY_FONT = "LXGW WenKai Mono TC";
const FONT_FALLBACK_STACK = '"LXGW WenKai Mono TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif';

// 儲存成績頁面的特效模式與粒子，避免每一幀無限制增加陣列。
let resultEffectMode = "none";
let fireworks = [];
let encouragementParticles = [];
let effectLastSpawnTime = 0;

// =========================
// 二、p5.js 標準函式：setup、draw、windowResized
// =========================
// 題庫在 setup() 建立畫布後以非同步方式載入，避免遠端錯誤讓整個 p5.js 專案崩潰。
// loadTable 的成功與失敗 callback 都會更新畫面狀態，測驗只會在驗證完成後開始。

// Google Sheets CSV 成功載入後，檢查欄位、內容與答案格式，只保留有效資料列。
function handleTableLoaded(table) {
  // 以 callback 傳入的 table 為準，並防止意外取得空物件造成程式崩潰。
  if (!table) {
    handleTableLoadError(new Error("找不到題庫資料。"));
    return;
  }

  questionTable = table;
  const availableColumns = Array.isArray(table.columns) ? table.columns : [];
  const missingColumns = REQUIRED_CSV_COLUMNS.filter(
    (columnName) => !availableColumns.includes(columnName)
  );

  // 欄位缺失時直接顯示清楚訊息，不繼續讀取不完整的資料。
  if (missingColumns.length > 0) {
    handleTableLoadError(
      new Error(`CSV 缺少必要欄位：${missingColumns.join(", ")}`)
    );
    return;
  }

  const parsedQuestions = [];
  const rowCount = typeof table.getRowCount === "function"
    ? table.getRowCount()
    : 0;

  // 逐列讀取資料；欄位缺失、空白內容與錯誤答案列都會被略過。
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = table.getRow(rowIndex);
    if (!row || typeof row.getString !== "function") {
      continue;
    }

    const question = readTableCell(row, "question");
    const options = [
      readTableCell(row, "optionA"),
      readTableCell(row, "optionB"),
      readTableCell(row, "optionC"),
      readTableCell(row, "optionD")
    ];
    const answerLetter = readTableCell(row, "answer").toUpperCase();

    // 題目、四個選項與答案都必須有內容，答案只能是 A、B、C 或 D。
    const hasAllText = question !== "" && options.every((option) => option !== "");
    const answerIndex = "ABCD".indexOf(answerLetter);
    if (!hasAllText || answerIndex < 0) {
      continue;
    }

    parsedQuestions.push({
      question,
      options,
      answer: answerIndex
    });
  }

  validQuestionBank = parsedQuestions;

  // 少於五題時顯示錯誤畫面，避免 slice 後產生不完整測驗。
  if (validQuestionBank.length < 5) {
    handleTableLoadError(
      new Error(`有效題目只有 ${validQuestionBank.length} 題，至少需要 5 題。`)
    );
    return;
  }

  questionsLoadState = "ready";
  questionsLoadError = "";

  // 遠端 callback 完成後，只有 canvas 已建立時才立即開始測驗。
  if (canvas) {
    resetQuiz();
  }
}

// 安全讀取單一 CSV 儲存格，避免 null、undefined 或非字串值造成錯誤。
function readTableCell(row, columnName) {
  try {
    const value = row.getString(columnName);
    return value === null || value === undefined ? "" : String(value).trim();
  } catch (error) {
    return "";
  }
}

// Google Sheets CSV 載入失敗或驗證失敗時，保留畫布並顯示可理解的錯誤訊息。
function handleTableLoadError(error) {
  questionsLoadState = "error";
  questionsLoadError = error && error.message
    ? error.message
    : "無法讀取 Google 試算表題庫。";
  validQuestionBank = [];
}


// p5.js 啟動時執行一次，負責建立全螢幕畫布與初始化測驗。
function setup() {
  // 建立符合瀏覽器視窗大小的畫布。
  canvas = createCanvas(windowWidth, windowHeight);

  // 讓畫布固定填滿瀏覽器視窗，不依賴 index.html 的額外元素。
  canvas.position(0, 0);
  canvas.style("display", "block");
  canvas.style("touch-action", "none");

  // 移除瀏覽器預設邊距，讓畫布真正覆蓋整個視窗。
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.backgroundColor = COLORS.background;

  // 先指定 Google Fonts 與系統備援字型；即使網路尚未完成載入也能先正常顯示。
  textFont(FONT_FALLBACK_STACK);
  setupFontLoading();

  // 設定繪圖模式，讓文字與圓角矩形更容易定位。
  rectMode(CORNER);
  textAlign(LEFT, TOP);

  // 使用 Google Sheets 公開 CSV 讀取題庫；載入完成前只顯示等待畫面，不開始測驗。
  // 第三個參數 header 代表第一列會被當成固定欄位名稱。
  questionTable = loadTable(
    GOOGLE_SHEET_CSV_URL,
    "csv",
    "header",
    handleTableLoaded,
    handleTableLoadError
  );

  // loadTable 是非同步操作；題庫載入完成後由 handleTableLoaded() 建立第一輪測驗。
}

// 安全等待 Google Fonts 載入完成；不支援 document.fonts 的瀏覽器會直接使用備援字型。
function setupFontLoading() {
  // 某些舊版瀏覽器沒有 Font Loading API，因此先檢查物件是否存在。
  if (!document.fonts || !document.fonts.ready) {
    fontLoaded = false;
    return;
  }

  // ready 會在頁面目前已宣告的網頁字型完成載入或失敗後結束。
  document.fonts.ready
    .then(() => {
      fontLoaded = true;
      textFont(PRIMARY_FONT);

      // 字型載入後重新繪製，讓文字立刻套用正確字型。
      if (typeof redraw === "function") {
        redraw();
      }
    })
    .catch(() => {
      // 字型載入失敗時保留備援字型，測驗功能不受影響。
      fontLoaded = false;
      textFont(FONT_FALLBACK_STACK);
    });
}

// p5.js 每一幀執行一次，負責持續繪製畫面與答題動畫。
function draw() {
  // 每一幀都先清除畫布並填入指定的米白色背景。
  background(COLORS.background);

  // 題庫尚未完成或驗證失敗時，顯示安全的載入／錯誤畫面，不進入題目繪製。
  if (questionsLoadState === "loading") {
    drawQuestionBankLoadingScreen();
    return;
  }
  if (questionsLoadState === "error") {
    drawQuestionBankErrorScreen();
    return;
  }

  // 依照目前狀態繪製答題頁或成績頁。
  if (quizState === "question") {
    drawQuestionScreen();
  } else {
    drawResultScreen();

    // 特效繪製在成績卡片之後，但粒子只分布在四周，不遮住文字與按鈕。
    drawResultEffects();
  }
}

// 視窗尺寸改變時執行，重新調整畫布大小以維持響應式全螢幕效果。
function windowResized() {
  // 依照最新的視窗尺寸調整畫布，所有版面會在下一幀重新計算。
  resizeCanvas(windowWidth, windowHeight);

  // 清除舊的點擊範圍，避免尺寸改變後短暫使用舊座標。
  optionAreas = [];
  nextButtonArea = null;
  restartButtonArea = null;
}

// =========================
// 三、測驗流程與題目資料處理
// =========================

// 繪製 Google 試算表題庫載入中的提示，介面仍完全由 canvas 負責。
function drawQuestionBankLoadingScreen() {
  textAlign(CENTER, CENTER);
  noStroke();
  fill(COLORS.text);
  textStyle(BOLD);
  textSize(constrain(min(width, height) * 0.055, 20, 34));
  text("正在讀取 Google 試算表題庫……", width / 2, height / 2);
  textStyle(NORMAL);
  textAlign(LEFT, TOP);
}

// 繪製 Google 試算表題庫載入失敗的說明，讓使用者知道如何修正公開設定或格式。
function drawQuestionBankErrorScreen() {
  const cardWidth = min(width - 32, 760);
  const cardX = (width - cardWidth) / 2;
  const cardY = max(24, height * 0.18);
  const cardHeight = min(height - 48, 350);
  const padding = min(28, max(18, cardWidth * 0.04));
  const messageLines = wrapText(
    questionsLoadError || "無法讀取題庫。",
    cardWidth - padding * 2,
    18
  );

  fill(COLORS.card);
  stroke(COLORS.border);
  strokeWeight(2);
  roundedRect(cardX, cardY, cardWidth, cardHeight, 18);

  noStroke();
  textAlign(CENTER, TOP);
  fill("#b23a48");
  textStyle(BOLD);
  textSize(constrain(min(width, height) * 0.052, 20, 32));
  text("題庫載入失敗", width / 2, cardY + padding);

  fill(COLORS.text);
  textStyle(NORMAL);
  textSize(constrain(min(width, height) * 0.032, 14, 19));
  textAlign(LEFT, TOP);
  drawWrappedLines(messageLines, cardX + padding, cardY + padding + 58, 27);
  textAlign(CENTER, TOP);
  textSize(constrain(min(width, height) * 0.025, 12, 16));
  text("請確認試算表已公開發布，且第一列包含固定欄位：", width / 2, cardY + cardHeight - padding - 48);
  text("question、optionA、optionB、optionC、optionD、answer", width / 2, cardY + cardHeight - padding - 25);
  textAlign(LEFT, TOP);
}

// 開始新的五題測驗，從有效題庫不重複抽題，並重新打亂每題選項。
function resetQuiz() {
  // 題庫尚未準備好時安全返回，避免空陣列造成畫面或索引錯誤。
  if (questionsLoadState !== "ready" || validQuestionBank.length < 5) {
    return;
  }

  // 複製並洗牌整份題庫，再取前五題，因此五題不會重複。
  const shuffledQuestionBank = shuffleArray(validQuestionBank);
  quizQuestions = shuffledQuestionBank.slice(0, 5).map((item) => {
    // 複製題目與選項，避免重新排列時改動已驗證的原始題庫。
    const copiedQuestion = {
      question: item.question,
      options: item.options.slice(),
      answerText: item.options[item.answer]
    };

    // 選項洗牌後，以正確答案文字重新計算 answer 索引。
    copiedQuestion.options = shuffleArray(copiedQuestion.options);
    copiedQuestion.answer = copiedQuestion.options.indexOf(copiedQuestion.answerText);
    return copiedQuestion;
  });

  // 將測驗的各項狀態恢復到初始值。
  currentQuestionIndex = 0;
  score = 0;
  selectedOptionIndex = -1;
  hasAnswered = false;
  quizState = "question";
  animationStartTime = millis();
  nextButtonArea = null;
  restartButtonArea = null;

  // 重新測驗時清除上一輪成績頁的煙火或鼓勵粒子。
  resetResultEffects();
}

// 使用 Fisher-Yates 演算法打亂陣列，避免選項順序固定。
function shuffleArray(sourceArray) {
  // 先複製一份陣列，避免意外修改傳入的原陣列。
  const result = sourceArray.slice();

  // 從陣列尾端往前逐一交換元素。
  for (let i = result.length - 1; i > 0; i -= 1) {
    // 隨機產生目前元素要交換的目標位置。
    const randomIndex = floor(random(i + 1));

    // 交換兩個元素的位置。
    [result[i], result[randomIndex]] = [result[randomIndex], result[i]];
  }

  // 回傳打亂後的陣列。
  return result;
}

// 使用者點擊選項後執行，判斷答案並啟動動畫。
function selectAnswer(optionIndex) {
  // 如果已經答題，就不再接受第二次選擇。
  if (hasAnswered) {
    return;
  }

  // 記錄使用者所選的選項索引。
  selectedOptionIndex = optionIndex;

  // 標記本題已完成，讓畫面顯示正誤顏色與下一題按鈕。
  hasAnswered = true;

  // 如果選項正確，就增加答對題數。
  if (optionIndex === quizQuestions[currentQuestionIndex].answer) {
    score += 1;
  }

  // 重新記錄動畫起始時間，讓每次作答都有完整動畫週期。
  animationStartTime = millis();
}

// 前往下一題，或在第五題後切換到成績頁面。
function goToNextQuestion() {
  // 尚未答題時不允許直接跳題。
  if (!hasAnswered) {
    return;
  }

  // 如果還有下一題，就切換到下一題並重設作答狀態。
  if (currentQuestionIndex < quizQuestions.length - 1) {
    currentQuestionIndex += 1;
    selectedOptionIndex = -1;
    hasAnswered = false;
    animationStartTime = millis();
  } else {
    // 五題全部完成後，顯示答題結果。
    quizState = "result";
    nextButtonArea = null;

    // 六十分以上代表至少答對三題，啟動煙火；否則啟動加油特效。
    resetResultEffects();
    resultEffectMode = score * 20 >= 60 ? "fireworks" : "encouragement";
  }
}

// =========================
// 四、題目頁面繪製
// =========================

// 繪製目前的一題、四個選項與下一題按鈕。
function drawQuestionScreen() {
  // 取得目前題目資料。
  const currentQuestion = quizQuestions[currentQuestionIndex];

  // 計算適合目前螢幕的字型與版面尺寸。
  const layout = calculateQuestionLayout(currentQuestion);

  // 清空上一幀的選項點擊區域。
  optionAreas = [];

  // 繪製上方標題列與進度資訊。
  drawHeader(layout);

  // 繪製題目卡片與題目文字。
  drawQuestionCard(currentQuestion, layout);

  // 繪製四個可點擊選項。
  drawOptions(currentQuestion, layout);

  // 只有作答後才顯示下一題按鈕。
  if (hasAnswered) {
    drawNextButton(layout);
  } else {
    nextButtonArea = null;
  }
}

// 根據視窗寬高計算題目頁面的所有尺寸，讓不同裝置都能使用。
function calculateQuestionLayout(currentQuestion) {
  // 內容寬度在大螢幕上設定上限，避免題目被拉得太寬而降低閱讀性。
  const outerMargin = constrain(width * 0.055, 14, 92);
  const contentWidth = min(width - outerMargin * 2, 960);
  const marginX = (width - contentWidth) / 2;

  // 寬度足夠時使用兩欄；手機直向等窄畫布固定使用單欄。
  const columns = contentWidth >= 520 ? 2 : 1;
  const columnGap = constrain(14 * min(width / 760, 1.15), 8, 18);
  const optionWidth = columns === 2
    ? (contentWidth - columnGap) / 2
    : contentWidth;

  // 先依照寬高估算縮放比例，手機橫向會優先受較矮的高度限制。
  let scale = constrain(min(width / 760, height / 820), 0.40, 1.15);
  let layout = null;

  // 若目前高度不足，逐步縮小文字與間距，直到按鈕也能留在畫布內。
  for (let attempt = 0; attempt < 8; attempt += 1) {
    layout = buildQuestionLayout(scale);
    const requiredBottom = layout.buttonY + layout.buttonHeight + layout.bottomMargin;

    if (requiredBottom <= height || scale <= 0.36) {
      break;
    }

    scale = max(0.36, scale * 0.88);
  }

  return layout;

  // 依照同一個縮放比例建立完整的題目頁面尺寸。
  function buildQuestionLayout(currentScale) {
    // 文字大小設定上下限，避免超大螢幕文字過大或手機文字過小。
    const titleSize = constrain(27 * currentScale, 18, 34);
    const questionSize = constrain(25 * currentScale, 15, 31);
    const optionSize = constrain(21 * currentScale, 13, 26);
    const smallSize = constrain(16 * currentScale, 11, 19);

    // 使用與字型大小連動的行距，讓中文換行後仍保持清楚間隔。
    const questionLineHeight = questionSize * 1.32;
    const optionLineHeight = optionSize * 1.32;

    // 標題區與題目卡片位置會隨高度縮放，手機橫向採用較小的上方間距。
    const headerY = constrain(height * 0.035, 10, 32);
    const questionY = headerY + titleSize + smallSize + 13 * currentScale;

    // 題目卡片內距會同步縮放，並保留手機上的最低可讀空間。
    const cardPaddingX = constrain(18 * currentScale, 10, 22);
    const cardPaddingY = constrain(14 * currentScale, 8, 16);
    const questionLines = wrapText(
      currentQuestion.question,
      max(30, contentWidth - cardPaddingX * 2),
      questionSize
    );
    const promptHeight = smallSize * 1.25;
    const questionTextY = questionY + cardPaddingY + promptHeight + 6 * currentScale;
    const questionHeight = max(
      84 * currentScale,
      cardPaddingY + promptHeight + 6 * currentScale +
      questionLines.length * questionLineHeight + cardPaddingY
    );

    // 選項內部保留標籤空間，並依每一列實際文字行數計算高度。
    const optionPaddingX = constrain(15 * currentScale, 9, 18);
    const optionPaddingY = constrain(13 * currentScale, 7, 14);
    const labelWidth = constrain(36 * currentScale, 28, 40);
    const optionTextWidth = max(
      30,
      optionWidth - optionPaddingX * 2 - labelWidth
    );
    const optionLines = currentQuestion.options.map((optionText) => (
      wrapText(optionText, optionTextWidth, optionSize)
    ));
    const rowHeights = [];

    for (let row = 0; row < ceil(currentQuestion.options.length / columns); row += 1) {
      const firstOption = row * columns;
      const lastOption = min(firstOption + columns, currentQuestion.options.length);
      let rowHeight = 48;

      for (let optionIndex = firstOption; optionIndex < lastOption; optionIndex += 1) {
        rowHeight = max(
          rowHeight,
          optionPaddingY * 2 + optionLines[optionIndex].length * optionLineHeight
        );
      }

      rowHeights.push(rowHeight);
    }

    const rowGap = constrain(12 * currentScale, 6, 14);
    const optionsY = questionY + questionHeight + constrain(17 * currentScale, 8, 20);
    const rowYPositions = [];
    let optionsHeight = 0;

    for (let row = 0; row < rowHeights.length; row += 1) {
      rowYPositions.push(optionsY + optionsHeight);
      optionsHeight += rowHeights[row];
      if (row < rowHeights.length - 1) {
        optionsHeight += rowGap;
      }
    }

    const optionsBottom = optionsY + optionsHeight;
    const bottomMargin = constrain(height * 0.035, 10, 28);
    const buttonWidth = min(max(190 * currentScale, 160), contentWidth);
    const buttonHeight = constrain(52 * currentScale, 42, 58);
    const buttonX = width / 2 - buttonWidth / 2;
    const buttonY = optionsBottom + constrain(18 * currentScale, 8, 20);

    return {
      scale: currentScale,
      marginX,
      contentWidth,
      titleSize,
      questionSize,
      optionSize,
      smallSize,
      questionLineHeight,
      optionLineHeight,
      headerY,
      questionY,
      questionLines,
      questionTextY,
      questionHeight,
      cardPaddingX,
      cardPaddingY,
      columns,
      columnGap,
      optionWidth,
      optionPaddingX,
      optionPaddingY,
      labelWidth,
      optionLines,
      rowHeights,
      rowGap,
      rowYPositions,
      optionsY,
      optionsHeight,
      optionsBottom,
      buttonWidth,
      buttonHeight,
      buttonX,
      buttonY,
      bottomMargin
    };
  }
}

// 繪製頁面標題、測驗名稱與目前進度。
function drawHeader(layout) {
  // 設定標題文字樣式。
  fill(COLORS.text);
  noStroke();
  textSize(layout.titleSize);
  textStyle(BOLD);
  text("四年級數學小測驗", layout.marginX, layout.headerY);

  // 顯示目前是第幾題，共五題。
  textStyle(NORMAL);
  textSize(layout.smallSize);
  fill(COLORS.mutedText);
  text(`第 ${currentQuestionIndex + 1} 題／共 ${quizQuestions.length} 題`, layout.marginX, layout.headerY + layout.titleSize + 6 * layout.scale);
}

// 繪製題目卡片與自動換行的題目文字。
function drawQuestionCard(currentQuestion, layout) {
  // 設定題目卡片的陰影效果，讓題目與選項有清楚的層次。
  drawingContext.shadowColor = "rgba(40, 54, 24, 0.12)";
  drawingContext.shadowBlur = 12;
  drawingContext.shadowOffsetY = 4;

  // 題目卡片使用指定的淡黃色，與選項卡片背景明確區隔。
  fill(COLORS.questionCard);
  stroke(COLORS.border);
  strokeWeight(2);
  roundedRect(layout.marginX, layout.questionY, layout.contentWidth, layout.questionHeight, 18 * layout.scale);

  // 清除陰影，避免影響後續選項與按鈕。
  drawingContext.shadowColor = "transparent";
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetY = 0;

  // 繪製題目提示文字。
  noStroke();
  fill(COLORS.accent);
  textSize(layout.smallSize);
  textStyle(BOLD);
  text("請選出正確答案", layout.marginX + layout.cardPaddingX, layout.questionY + layout.cardPaddingY);

  // 繪製題目內容，使用自訂換行避免文字超出題目卡片。
  fill(COLORS.text);
  textSize(layout.questionSize);
  textStyle(NORMAL);
  drawWrappedLines(
    layout.questionLines,
    layout.marginX + layout.cardPaddingX,
    layout.questionTextY,
    layout.questionLineHeight
  );
}

// 繪製四個選項，答題後依照正誤套用指定顏色與動畫。
function drawOptions(currentQuestion, layout) {
  // 記錄動畫經過時間，讓動畫會持續播放而不是只動一下。
  const elapsed = (millis() - animationStartTime) / 1000;

  // 逐一繪製四個選項。
  for (let i = 0; i < currentQuestion.options.length; i += 1) {
    // 依照欄數與列位置取得目前選項的基準座標。
    const column = i % layout.columns;
    const row = floor(i / layout.columns);
    const baseX = layout.marginX + column * (layout.optionWidth + layout.columnGap);
    const baseY = layout.rowYPositions[row];

    // 預設選項沒有動畫位移。
    let animatedX = baseX;
    let animatedY = baseY;

    // 預設使用選項卡片底色，題目卡片則使用獨立的 questionCard 顏色。
    let optionColor = COLORS.card;

    // 作答後將正確與錯誤選項套用指定的顏色與動畫。
    if (hasAnswered) {
      const isCorrectOption = i === currentQuestion.answer;
      const isSelectedOption = i === selectedOptionIndex;

      // 答對：使用者選擇的正確項目使用淺橄欖色並上下跳動。
      if (isCorrectOption && isSelectedOption) {
        optionColor = COLORS.correct;
        animatedY += sin(elapsed * 5.2) * 7 * layout.scale;
      }

      // 答錯：使用者選擇的項目使用粉紅色並左右移動。
      if (!isCorrectOption && isSelectedOption) {
        optionColor = COLORS.wrong;
        animatedX += sin(elapsed * 12) * 7 * layout.scale;
      }

      // 答錯時，正確答案使用藍色並上下跳動。
      if (isCorrectOption && !isSelectedOption) {
        optionColor = COLORS.correctAnswer;
        animatedY += sin(elapsed * 5.2) * 7 * layout.scale;
      }
    }

    // 儲存動畫後的實際點擊範圍，讓滑鼠與觸控座標和畫面一致。
    optionAreas[i] = {
      x: animatedX,
      y: animatedY,
      width: layout.optionWidth,
      height: layout.rowHeights[row]
    };

    // 讓選項卡片具有輕微陰影，提高可讀性與按鈕感。
    drawingContext.shadowColor = "rgba(40, 54, 24, 0.10)";
    drawingContext.shadowBlur = 8;
    drawingContext.shadowOffsetY = 3;

    // 繪製選項卡片。
    fill(optionColor);
    stroke(COLORS.border);
    strokeWeight(2);
    roundedRect(
      animatedX,
      animatedY,
      layout.optionWidth,
      layout.rowHeights[row],
      14 * layout.scale
    );

    // 清除陰影，避免後續文字也產生不必要的陰影。
    drawingContext.shadowColor = "transparent";
    drawingContext.shadowBlur = 0;
    drawingContext.shadowOffsetY = 0;

    // 繪製選項英文字母標籤，例如 A、B、C、D。
    noStroke();
    fill(COLORS.accent);
    textSize(layout.optionSize * 0.92);
    textStyle(BOLD);
    text(
      `${String.fromCharCode(65 + i)}.`,
      animatedX + layout.optionPaddingX,
      animatedY + layout.optionPaddingY
    );

    // 將預先計算的選項內容換行後繪製在標籤右側。
    fill(COLORS.text);
    textSize(layout.optionSize);
    textStyle(NORMAL);
    drawWrappedLines(
      layout.optionLines[i],
      animatedX + layout.optionPaddingX + layout.labelWidth,
      animatedY + layout.optionPaddingY,
      layout.optionLineHeight
    );
  }
}

// 繪製作答後的下一題按鈕。
function drawNextButton(layout) {
  // 儲存下一題按鈕的實際點擊區域。
  nextButtonArea = {
    x: layout.buttonX,
    y: layout.buttonY,
    width: layout.buttonWidth,
    height: layout.buttonHeight
  };

  // 繪製按鈕陰影。
  drawingContext.shadowColor = "rgba(40, 54, 24, 0.15)";
  drawingContext.shadowBlur = 10;
  drawingContext.shadowOffsetY = 4;

  // 繪製下一題按鈕。
  fill(COLORS.accent);
  noStroke();
  roundedRect(layout.buttonX, layout.buttonY, layout.buttonWidth, layout.buttonHeight, 14 * layout.scale);

  // 清除陰影後再繪製按鈕文字。
  drawingContext.shadowColor = "transparent";
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetY = 0;
  fill(COLORS.white);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(constrain(20 * layout.scale, 16, 23));
  const buttonText = currentQuestionIndex === quizQuestions.length - 1 ? "查看成績" : "下一題";
  text(buttonText, layout.buttonX + layout.buttonWidth / 2, layout.buttonY + layout.buttonHeight / 2);

  // 恢復左上對齊，避免影響下一幀或其他文字。
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
}

// =========================
// 五、成績頁面繪製
// =========================

// 繪製五題完成後的答題結果與重新測驗按鈕。
function drawResultScreen() {
  // 依照畫布寬高計算成績頁，手機橫向會使用較緊湊的尺寸。
  const scale = constrain(min(width / 760, height / 600), 0.45, 1.15);
  const cardWidth = min(width - 24, 760 * scale);
  const cardX = (width - cardWidth) / 2;
  const cardHeight = min(height - 20, max(300 * scale, height * 0.82));
  const cardY = max(10, (height - cardHeight) / 2);
  const padding = constrain(28 * scale, 16, 34);

  // 繪製成績卡片陰影。
  drawingContext.shadowColor = "rgba(40, 54, 24, 0.15)";
  drawingContext.shadowBlur = 18;
  drawingContext.shadowOffsetY = 6;

  // 繪製成績卡片。
  fill(COLORS.card);
  stroke(COLORS.border);
  strokeWeight(2);
  roundedRect(cardX, cardY, cardWidth, cardHeight, 24 * scale);

  // 清除卡片陰影。
  drawingContext.shadowColor = "transparent";
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetY = 0;

  // 置中繪製完成標題與成績內容。
  noStroke();
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  fill(COLORS.accent);
  const titleSize = constrain(34 * scale, 22, 42);
  const scoreSize = constrain(27 * scale, 19, 33);
  const totalSize = constrain(23 * scale, 17, 29);
  const encouragementSize = constrain(20 * scale, 15, 24);
  const titleY = cardY + padding;
  const scoreY = titleY + titleSize + 24 * scale;
  const totalY = scoreY + scoreSize + 18 * scale;
  const encouragementY = totalY + totalSize + 18 * scale;

  textSize(titleSize);
  text("測驗完成！", width / 2, titleY);

  // 顯示答對題數。
  fill(COLORS.text);
  textSize(scoreSize);
  text(`你答對了 ${score} / ${quizQuestions.length} 題`, width / 2, scoreY);

  // 將分數換算成百分制總成績。
  const totalScore = score * 20;
  fill(COLORS.mutedText);
  textSize(totalSize);
  text(`總成績：${totalScore} 分`, width / 2, totalY);

  // 根據分數顯示鼓勵文字，低於六十分時使用脈動動畫強調「繼續加油！」。
  const encouragementMessage = getEncouragement(totalScore);
  const isLowScore = totalScore < 60;
  const encouragementPulse = isLowScore
    ? 1 + 0.10 * sin(millis() / 180)
    : 1;
  textSize(encouragementSize * encouragementPulse);
  fill(isLowScore ? COLORS.accent : COLORS.mutedText);
  text(encouragementMessage, width / 2, encouragementY);

  // 按鈕固定在成績卡片下方，並保留可觸控的最低高度。
  const buttonWidth = min(max(220 * scale, 170), cardWidth - padding * 2);
  const buttonHeight = constrain(52 * scale, 44, 58);
  const buttonX = width / 2 - buttonWidth / 2;
  const buttonY = cardY + cardHeight - padding - buttonHeight;
  restartButtonArea = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };

  // 繪製重新測驗按鈕。
  fill(COLORS.accent);
  noStroke();
  roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 15 * scale);
  fill(COLORS.white);
  textSize(constrain(21 * scale, 16, 25));
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  text("重新測驗", width / 2, buttonY + buttonHeight / 2);

  // 恢復一般文字對齊與樣式。
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
}

// 依照總分回傳不同的鼓勵文字。
function getEncouragement(totalScore) {
  // 六十分以下要清楚提醒作答者「繼續加油！」。
  if (totalScore < 60) {
    return "繼續加油！";
  }

  // 依照分數區間顯示適合的回饋。
  if (totalScore === 100) {
    return "太棒了！全部答對！";
  }
  if (totalScore >= 80) {
    return "表現很好，繼續保持！";
  }
  if (totalScore >= 60) {
    return "做得不錯，再多練習就會更好！";
  }
  return "別灰心，再試一次會進步！";
}

// =========================
// 六、成績頁特效
// =========================

// 清除成績頁特效，重新測驗時會呼叫此函式，避免沿用上一輪粒子。
function resetResultEffects() {
  fireworks = [];
  encouragementParticles = [];
  effectLastSpawnTime = millis();
  resultEffectMode = "none";
}

// 持續更新與繪製目前的成績頁特效。
function drawResultEffects() {
  if (resultEffectMode === "fireworks") {
    drawFireworksEffect();
  } else if (resultEffectMode === "encouragement") {
    drawEncouragementEffect();
  }
}

// 繪製六十分以上的煙火，粒子會爆炸、變色並逐漸淡出。
function drawFireworksEffect() {
  const now = millis();
  const effectScale = constrain(min(width, height) / 700, 0.55, 1.25);

  // 定期產生新的煙火，並限制粒子總量以維持行動裝置效能。
  if (now - effectLastSpawnTime > 720) {
    spawnFireworkBurst(effectScale);
    effectLastSpawnTime = now;
  }

  for (let i = fireworks.length - 1; i >= 0; i -= 1) {
    const particle = fireworks[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.035 * effectScale;
    particle.life -= 1;

    const lifeRatio = constrain(particle.life / particle.maxLife, 0, 1);
    const redValue = red(particle.color);
    const greenValue = green(particle.color);
    const blueValue = blue(particle.color);

    // 繪製淡出的粒子與短暫尾巴，讓爆炸效果更明顯。
    stroke(redValue, greenValue, blueValue, 80 * lifeRatio);
    strokeWeight(max(1, particle.size * 0.45));
    line(
      particle.x,
      particle.y,
      particle.x - particle.vx * 3,
      particle.y - particle.vy * 3
    );
    noStroke();
    fill(redValue, greenValue, blueValue, 255 * lifeRatio);
    circle(particle.x, particle.y, particle.size * (0.65 + lifeRatio));

    if (particle.life <= 0) {
      fireworks.splice(i, 1);
    }
  }

  // 保險限制陣列大小，避免長時間停留在成績頁造成效能負擔。
  if (fireworks.length > 360) {
    fireworks.splice(0, fireworks.length - 360);
  }
}

// 在畫布左右上方產生一朵煙火，避開中央成績文字與重新測驗按鈕。
function spawnFireworkBurst(effectScale) {
  const palettes = [
    ["#ff595e", "#ffca3a", "#8ac926"],
    ["#1982c4", "#6a4c93", "#ffca3a"],
    ["#ff70a6", "#00b4d8", "#f9c74f"]
  ];
  const palette = random(palettes);
  const isLeft = random() < 0.5;
  const burstX = isLeft
    ? random(width * 0.08, width * 0.28)
    : random(width * 0.72, width * 0.92);
  const burstY = random(height * 0.08, height * 0.34);
  const particleCount = floor(random(26, 38));

  for (let i = 0; i < particleCount; i += 1) {
    const angle = random(TWO_PI);
    const speed = random(1.4, 3.9) * effectScale;
    fireworks.push({
      x: burstX,
      y: burstY,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      life: random(70, 112),
      maxLife: 112,
      size: random(3, 6) * effectScale,
      color: color(random(palette))
    });
  }
}

// 繪製六十分以下的上升彩帶、愛心與脈動星星，鼓勵作答者再次挑戰。
function drawEncouragementEffect() {
  const now = millis();
  const effectScale = constrain(min(width, height) / 700, 0.55, 1.2);

  // 定期產生少量粒子，並控制上限，避免陣列在每一幀無限制增加。
  if (now - effectLastSpawnTime > 260) {
    spawnEncouragementParticle(effectScale);
    effectLastSpawnTime = now;
  }

  for (let i = encouragementParticles.length - 1; i >= 0; i -= 1) {
    const particle = encouragementParticles[i];
    particle.x += particle.vx + sin((now + particle.phase) / 280) * 0.25;
    particle.y += particle.vy;
    particle.rotation += particle.rotationSpeed;
    particle.life -= 1;

    const lifeRatio = constrain(particle.life / particle.maxLife, 0, 1);
    const redValue = red(particle.color);
    const greenValue = green(particle.color);
    const blueValue = blue(particle.color);
    const alphaValue = 210 * min(1, lifeRatio * 2);
    const pulse = particle.kind === "star"
      ? 1 + 0.25 * sin(now / 140 + particle.phase)
      : 1;

    push();
    translate(particle.x, particle.y);
    rotate(particle.rotation);
    noStroke();
    fill(redValue, greenValue, blueValue, alphaValue);

    if (particle.kind === "heart") {
      drawHeartShape(0, 0, particle.size);
    } else if (particle.kind === "ribbon") {
      stroke(redValue, greenValue, blueValue, alphaValue);
      strokeWeight(max(2, particle.size * 0.28));
      noFill();
      beginShape();
      for (let point = 0; point <= 12; point += 1) {
        const offsetX = (point - 6) * particle.size * 0.16;
        const offsetY = sin(point * 0.9 + now / 160) * particle.size * 0.35;
        vertex(offsetX, offsetY);
      }
      endShape();
    } else {
      drawStarShape(0, 0, particle.size * pulse, particle.size * 0.42 * pulse);
    }
    pop();

    if (particle.life <= 0 || particle.y < -particle.size * 2) {
      encouragementParticles.splice(i, 1);
    }
  }

  // 保險限制粒子上限，確保手機長時間停留在成績頁也能順暢執行。
  if (encouragementParticles.length > 90) {
    encouragementParticles.splice(0, encouragementParticles.length - 90);
  }
}

// 產生一個從畫布下方往上升的愛心、彩帶或星星。
function spawnEncouragementParticle(effectScale) {
  const kinds = ["heart", "ribbon", "star"];
  const colors = ["#ff6b6b", "#ffca3a", "#4cc9f0", "#80ed99", "#c77dff"];
  const isLeft = random() < 0.5;
  const particle = {
    x: isLeft ? random(width * 0.08, width * 0.28) : random(width * 0.72, width * 0.92),
    y: height + random(8, 45),
    vx: random(-0.35, 0.35) * effectScale,
    vy: -random(0.65, 1.45) * effectScale,
    size: random(12, 23) * effectScale,
    life: random(150, 240),
    maxLife: 240,
    phase: random(TWO_PI),
    rotation: random(TWO_PI),
    rotationSpeed: random(-0.025, 0.025),
    kind: random(kinds),
    color: color(random(colors))
  };
  encouragementParticles.push(particle);
}

// 繪製簡單愛心圖形，完全使用 p5.js canvas，不依賴 HTML 元素。
function drawHeartShape(x, y, size) {
  beginShape();
  vertex(x, y + size * 0.85);
  bezierVertex(
    x - size * 1.15,
    y + size * 0.10,
    x - size * 0.62,
    y - size * 0.72,
    x,
    y - size * 0.12
  );
  bezierVertex(
    x + size * 0.62,
    y - size * 0.72,
    x + size * 1.15,
    y + size * 0.10,
    x,
    y + size * 0.85
  );
  endShape(CLOSE);
}

// 繪製脈動效果中的星星圖形。
function drawStarShape(x, y, outerRadius, innerRadius) {
  beginShape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -HALF_PI + i * PI / 5;
    vertex(x + cos(angle) * radius, y + sin(angle) * radius);
  }
  endShape(CLOSE);
}

// =========================
// 七、滑鼠與觸控互動
// =========================

// p5.js 滑鼠按下時執行，將座標交給共用的點擊處理函式。
function mousePressed() {
  // 使用 p5.js 提供的滑鼠座標處理點擊。
  handlePointerPressed(mouseX, mouseY);

  // 回傳 false 可避免瀏覽器執行預設的選取或拖曳行為。
  return false;
}

// p5.js 觸控事件函式，讓手機與平板能直接使用相同的點擊流程。
function touchStarted() {
  // 觸控事件通常會同步更新 mouseX 與 mouseY，因此使用同一套座標判斷。
  handlePointerPressed(mouseX, mouseY);

  // 回傳 false 可阻止手機瀏覽器滑動畫布或觸發額外手勢。
  return false;
}

// 集中處理滑鼠與觸控的點擊判斷，避免兩套互動邏輯不一致。
function handlePointerPressed(pointerX, pointerY) {
  // 題目頁面且尚未作答時，檢查使用者是否點到某個選項。
  if (quizState === "question" && !hasAnswered) {
    for (let i = 0; i < optionAreas.length; i += 1) {
      // 取得目前選項的點擊範圍。
      const area = optionAreas[i];

      // 如果點擊位置落在選項內，就記錄答案並停止繼續檢查。
      if (area && isPointInside(pointerX, pointerY, area)) {
        selectAnswer(i);
        return;
      }
    }
  }

  // 作答後點擊下一題或查看成績按鈕。
  if (quizState === "question" && hasAnswered && nextButtonArea) {
    if (isPointInside(pointerX, pointerY, nextButtonArea)) {
      goToNextQuestion();
      return;
    }
  }

  // 成績頁面點擊重新測驗按鈕。
  if (quizState === "result" && restartButtonArea) {
    if (isPointInside(pointerX, pointerY, restartButtonArea)) {
      resetQuiz();
    }
  }
}

// 判斷一個座標點是否位於矩形範圍內。
function isPointInside(pointX, pointY, area) {
  // 使用包含邊界的判斷，讓按鈕更容易被點擊。
  return (
    pointX >= area.x &&
    pointX <= area.x + area.width &&
    pointY >= area.y &&
    pointY <= area.y + area.height
  );
}

// =========================
// 八、文字換行與繪圖小工具
// =========================

// 將中英文混合文字依照指定寬度切成多行。
function wrapText(content, maxWidth, fontSize) {
  // 設定換行計算所需的字型大小。
  textSize(fontSize);

  // 使用陣列逐字處理，能同時支援中文與英文內容。
  const characters = Array.from(content);
  const lines = [];
  let currentLine = "";

  // 逐字加入目前行，超過寬度時就換到下一行。
  for (const character of characters) {
    // 遇到手動換行符號時，直接建立新行。
    if (character === "\n") {
      lines.push(currentLine);
      currentLine = "";
      continue;
    }

    // 暫時把下一個字加入目前行。
    const testLine = currentLine + character;

    // 如果超過最大寬度且目前行不是空白，就先保存目前行。
    if (textWidth(testLine) > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = character;
    } else {
      currentLine = testLine;
    }
  }

  // 將最後尚未保存的文字加入結果。
  if (currentLine.length > 0 || lines.length === 0) {
    lines.push(currentLine);
  }

  // 回傳換行後的文字陣列。
  return lines;
}

// 依照固定行高繪製已經換行的文字陣列。
function drawWrappedLines(lines, x, y, lineHeight) {
  // 逐行繪製文字。
  for (let i = 0; i < lines.length; i += 1) {
    text(lines[i], x, y + i * lineHeight);
  }
}

// 使用 CORNER 模式繪製圓角矩形，集中處理圓角參數。
function roundedRect(x, y, rectWidth, rectHeight, radius) {
  // p5.js 的 rect 已支援圓角，因此直接統一呼叫。
  rect(x, y, rectWidth, rectHeight, radius);
}
