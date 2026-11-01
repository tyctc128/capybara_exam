"use strict";

const LEVELS = {
  1: { name: "草原練習場", size: 3, maxActive: 3, spawnMin: 360, spawnMax: 920, dwellMin: 1300, dwellMax: 2800, correctGap: 1500, background: "assets/backgrounds/meadow.png" },
  2: { name: "蘋果果園", size: 4, maxActive: 5, spawnMin: 220, spawnMax: 680, dwellMin: 850, dwellMax: 2100, correctGap: 1150, background: "assets/backgrounds/orchard.png" },
  3: { name: "溫泉祭典", size: 5, maxActive: 7, spawnMin: 110, spawnMax: 440, dwellMin: 560, dwellMax: 1550, correctGap: 820, background: "assets/backgrounds/hotspring.png" }
};

const STORAGE_KEY = "capybara-math-progress-v1";
const ANSWER_SPRITE = "assets/sprites/capy-answer/clean.png";
const HIT_SPRITE = "assets/sprites/capy-hit/clean.png";
const BGM_TRACKS = {
  title: "sound/bg.mp3",
  map: "sound/bg.mp3",
  1: "sound/1.mp3",
  2: "sound/2.mp3",
  3: "sound/3.mp3"
};
const SFX_TRACKS = {
  swing: "sound/swing.mp3",
  bonk: "sound/bonk.mp3",
  correct: "sound/correct.mp3",
  wrong: "sound/wrong.mp3",
  pop: "sound/pop.mp3",
  capyVoice: "sound/capy-voice.mp3",
  capySad: "sound/capy-sad.mp3",
  clear: "sound/clear-cheer.mp3"
};

const state = {
  screen: "title",
  unlocked: 1,
  tutorialSeen: false,
  sound: true,
  level: 1,
  lives: 5,
  score: 0,
  combo: 0,
  time: 80,
  running: false,
  paused: false,
  question: null,
  previousQuestion: "",
  spawnTimer: null,
  despawnTimers: new Map(),
  lastCorrectSpawn: 0,
  clockTimer: null,
  nextQuestionTimer: null,
  hammerHideTimer: null,
  activeAnswers: new Map(),
  audio: null,
  bgm: null,
  bgmTrack: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const screens = {
  title: $("#title-screen"),
  map: $("#map-screen"),
  game: $("#game-screen")
};
const sfxTemplates = new Map();
let clearCheer = null;

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.unlocked = Math.min(3, Math.max(1, Number(saved.unlocked) || 1));
    state.tutorialSeen = Boolean(saved.tutorialSeen);
    state.sound = saved.sound !== false;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    unlocked: state.unlocked,
    tutorialSeen: state.tutorialSeen,
    sound: state.sound
  }));
}

function showScreen(name) {
  state.screen = name;
  Object.entries(screens).forEach(([key, element]) => element.classList.toggle("is-active", key === name));
  syncBgm();
}

function updateMap() {
  $$(".level-button").forEach((button) => {
    const level = Number(button.dataset.level);
    button.disabled = level > state.unlocked;
    button.setAttribute("aria-label", level > state.unlocked ? `${LEVELS[level].name}，尚未解鎖` : `進入${LEVELS[level].name}`);
  });
  $("#sound-button").textContent = state.sound ? "音" : "靜";
}

function openTutorial(onClose = null) {
  const overlay = $("#dialog-overlay");
  $("#dialog-body").innerHTML = `
    <p>畫面上方會出現一道九九乘法題，卡皮巴拉會舉著不同答案冒出來。</p>
    <ol>
      <li>先算出正確答案。</li>
      <li>點擊或觸碰卡皮巴拉、答案牌或牠所在的洞口，都算敲中。</li>
      <li>敲錯會失去一顆愛心，五顆都用完就要重新挑戰。</li>
      <li>在80秒內答對10題就能過關！</li>
    </ol>`;
  overlay.hidden = false;
  $("#dialog-button").focus();
  $("#dialog-button").onclick = () => {
    overlay.hidden = true;
    state.tutorialSeen = true;
    saveProgress();
    if (onClose) onClose();
  };
}

function goToMap(message = "") {
  if (clearCheer) {
    clearCheer.pause();
    clearCheer.currentTime = 0;
    clearCheer = null;
  }
  stopGame();
  showScreen("map");
  updateMap();
  if (message) $("#map-status").textContent = message;
}

function startLevel(level) {
  if (level > state.unlocked) return;
  const config = LEVELS[level];
  state.level = level;
  state.lives = 5;
  state.score = 0;
  state.combo = 0;
  state.time = 80;
  state.running = true;
  state.paused = false;
  state.question = null;
  state.lastCorrectSpawn = 0;
  state.activeAnswers.clear();
  $("#feedback").classList.remove("show");
  $("#feedback").textContent = "";
  showScreen("game");
  $("#game-scene").style.setProperty("--game-bg", `url("${config.background}")`);
  buildGrid(config.size);
  updateHud();
  nextQuestion();
  state.clockTimer = window.setInterval(tickClock, 1000);
  playSfx("pop", .45);
}

function stopGame() {
  state.running = false;
  state.paused = false;
  window.clearTimeout(state.spawnTimer);
  window.clearTimeout(state.nextQuestionTimer);
  window.clearInterval(state.clockTimer);
  state.spawnTimer = null;
  state.nextQuestionTimer = null;
  state.clockTimer = null;
  $("#feedback").classList.remove("show");
  clearWave();
}

function buildGrid(size) {
  const grid = $("#hole-grid");
  grid.innerHTML = "";
  grid.style.setProperty("--cols", size);
  grid.dataset.size = String(size);
  for (let index = 0; index < size * size; index += 1) {
    const hole = document.createElement("button");
    hole.type = "button";
    hole.className = "hole";
    hole.dataset.index = String(index);
    hole.setAttribute("aria-label", `第${index + 1}個洞口`);
    hole.innerHTML = `<img class="capy" src="${ANSWER_SPRITE}" alt="" draggable="false"><span class="answer-number"></span>`;
    hole.addEventListener("click", (event) => {
      if (event.detail === 0) handleHit(index);
    });
    grid.appendChild(hole);
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function createQuestion() {
  let left;
  let right;
  let key;
  do {
    left = randomInt(2, 9);
    right = randomInt(2, 9);
    key = `${left}x${right}`;
  } while (key === state.previousQuestion);
  state.previousQuestion = key;
  return { left, right, answer: left * right };
}

function distractors(question, amount) {
  const values = new Set();
  const { left, right, answer } = question;
  const likely = [
    (left - 1) * right,
    (left + 1) * right,
    left * (right - 1),
    left * (right + 1),
    answer - left,
    answer + right,
    answer - 1,
    answer + 1
  ];
  shuffle(likely).forEach((value) => {
    if (value > 0 && value <= 81 && value !== answer) values.add(value);
  });
  while (values.size < amount) {
    const value = randomInt(2, 81);
    if (value !== answer) values.add(value);
  }
  return [...values].slice(0, amount);
}

function nextQuestion() {
  if (!state.running || state.paused) return;
  state.question = createQuestion();
  $("#question-text").textContent = `${state.question.left} × ${state.question.right} = ?`;
  state.lastCorrectSpawn = performance.now() - LEVELS[state.level].correctGap;
  scheduleNextSpawn(true);
}

function scheduleNextSpawn(initial = false) {
  if (!state.running || state.paused || !state.question) return;
  const config = LEVELS[state.level];
  const delay = initial ? randomInt(120, 480) : randomInt(config.spawnMin, config.spawnMax);
  window.clearTimeout(state.spawnTimer);
  state.spawnTimer = window.setTimeout(spawnOne, delay);
}

function spawnOne() {
  if (!state.running || state.paused || !state.question) return;
  const config = LEVELS[state.level];
  const holes = $$(".hole");
  const inactive = holes
    .map((hole, index) => ({ hole, index }))
    .filter(({ hole, index }) => !state.activeAnswers.has(index) && !hole.classList.contains("is-hit"));

  if (state.activeAnswers.size < config.maxActive && inactive.length) {
    const { hole, index } = inactive[randomInt(0, inactive.length - 1)];
    const correctIsVisible = [...state.activeAnswers.values()].includes(state.question.answer);
    const correctIsDue = !correctIsVisible && performance.now() - state.lastCorrectSpawn >= config.correctGap;
    const useCorrect = correctIsDue || (!correctIsVisible && Math.random() < 0.28);
    const usedAnswers = new Set(state.activeAnswers.values());
    let answer = state.question.answer;

    if (!useCorrect) {
      const candidates = distractors(state.question, 8).filter((value) => !usedAnswers.has(value));
      answer = candidates[0] ?? distractors(state.question, 1)[0];
    } else {
      state.lastCorrectSpawn = performance.now();
    }

    state.activeAnswers.set(index, answer);
    hole.querySelector(".capy").src = ANSWER_SPRITE;
    hole.querySelector(".answer-number").textContent = String(answer);
    hole.setAttribute("aria-label", `答案 ${answer}`);
    requestAnimationFrame(() => hole.classList.add("is-active"));
    playSfx("pop", .22);

    const dwell = randomInt(config.dwellMin, config.dwellMax);
    const timer = window.setTimeout(() => hideHole(index), dwell);
    state.despawnTimers.set(index, timer);
  }

  scheduleNextSpawn();
}

function hideHole(index) {
  const hole = $(`.hole[data-index="${index}"]`);
  if (!hole) return;
  if (!state.activeAnswers.has(index)) {
    finalizeHole(index);
    return;
  }

  // Keep the answer hittable while the visible capybara is retreating.
  hole.classList.remove("is-active");
  hole.classList.add("is-leaving");
  window.clearTimeout(state.despawnTimers.get(index));
  const timer = window.setTimeout(() => finalizeHole(index), 240);
  state.despawnTimers.set(index, timer);
}

function finalizeHole(index) {
  const hole = $(`.hole[data-index="${index}"]`);
  state.activeAnswers.delete(index);
  state.despawnTimers.delete(index);
  if (!hole) return;
  hole.classList.remove("is-active", "is-leaving", "is-hit");
  hole.setAttribute("aria-label", `第${index + 1}個洞口`);
  hole.querySelector(".answer-number").textContent = "";
}

function clearWave() {
  window.clearTimeout(state.spawnTimer);
  state.spawnTimer = null;
  state.despawnTimers.forEach((timer) => window.clearTimeout(timer));
  state.despawnTimers.clear();
  state.activeAnswers.clear();
  $$(".hole").forEach((hole, index) => {
    hole.classList.remove("is-active", "is-leaving", "is-hit");
    hole.setAttribute("aria-label", `第${index + 1}個洞口`);
    const number = hole.querySelector(".answer-number");
    if (number) number.textContent = "";
  });
}

function handleHit(index) {
  if (!state.running || state.paused || !state.activeAnswers.has(index)) return;
  const answer = state.activeAnswers.get(index);
  const correct = answer === state.question.answer;
  const hole = $(`.hole[data-index="${index}"]`);
  const image = hole.querySelector(".capy");
  const number = hole.querySelector(".answer-number");
  image.src = HIT_SPRITE;
  number.textContent = "";
  hole.classList.remove("is-active", "is-leaving");
  hole.classList.add("is-hit");
  state.activeAnswers.delete(index);
  window.clearTimeout(state.despawnTimers.get(index));
  state.despawnTimers.delete(index);
  playSfx("bonk", .72);
  window.setTimeout(() => playSfx("capyVoice", .18), 35);

  if (correct) {
    window.clearTimeout(state.spawnTimer);
    state.score += 1;
    state.combo += 1;
    showFeedback(state.combo >= 3 ? `${state.combo} 連擊！` : "答對了！", true);
    window.setTimeout(() => playSfx("correct", .7), 65);
    updateHud();
    if (state.score >= 10) {
      state.nextQuestionTimer = window.setTimeout(completeLevel, 650);
    } else {
      state.nextQuestionTimer = window.setTimeout(() => {
        clearWave();
        nextQuestion();
      }, 620);
    }
  } else {
    state.lives -= 1;
    state.combo = 0;
    showFeedback("再算一次！", false);
    window.setTimeout(() => playSfx("wrong", .68), 70);
    window.setTimeout(() => playSfx("capySad", .34), 150);
    updateHud();
    window.setTimeout(() => finalizeHole(index), 420);
    if (state.lives <= 0) {
      state.nextQuestionTimer = window.setTimeout(() => failLevel("五顆愛心用完了，卡皮老師在主地圖等你再試一次！"), 620);
    }
  }
}

function tickClock() {
  if (!state.running || state.paused) return;
  state.time -= 1;
  updateHud();
  if (state.time <= 0) failLevel("時間到了！回到主地圖，準備好再挑戰一次吧。");
  else if (state.time <= 10) playTone(300, .035, "square");
}

function updateHud() {
  $("#time-value").textContent = String(state.time);
  $("#score-value").textContent = `${state.score} / 10`;
  $("#hearts").innerHTML = Array.from({ length: 5 }, (_, index) => `<span class="heart ${index >= state.lives ? "is-lost" : ""}" aria-hidden="true"></span>`).join("");
  $("#hearts").setAttribute("aria-label", `剩餘${state.lives}顆愛心`);
}

function showFeedback(text, positive) {
  const feedback = $("#feedback");
  feedback.textContent = text;
  feedback.style.setProperty("-webkit-text-stroke-color", positive ? "#163f35" : "#6f1e22");
  feedback.classList.remove("show");
  void feedback.offsetWidth;
  feedback.classList.add("show");
}

function completeLevel() {
  const finishedLevel = state.level;
  stopGame();
  pauseBgm();
  clearCheer = playSfx("clear", .72);
  if (finishedLevel < 3) state.unlocked = Math.max(state.unlocked, finishedLevel + 1);
  saveProgress();
  $("#result-mark").textContent = finishedLevel === 3 ? "全部完成" : "過關";
  $("#result-title").textContent = finishedLevel === 3 ? "三關全數完成！" : "挑戰成功！";
  $("#result-copy").textContent = finishedLevel === 3
    ? "你已經成為卡皮巴拉乘法達人，三座島嶼都為你歡呼！"
    : `答對10題，${LEVELS[finishedLevel + 1].name}已經解鎖。`;
  $("#result-overlay").hidden = false;
  $("#result-button").focus();
}

function failLevel(message) {
  stopGame();
  goToMap(message);
  playTone(130, .2, "triangle");
}

function togglePause() {
  if (!state.running) return;
  state.paused = true;
  window.clearTimeout(state.spawnTimer);
  clearWave();
  pauseBgm();
  $("#pause-overlay").hidden = false;
  $("#resume-button").focus();
}

function resumeGame() {
  $("#pause-overlay").hidden = true;
  state.paused = false;
  syncBgm();
  scheduleNextSpawn(true);
}

function positionHammer(event) {
  const hammer = $("#hammer");
  hammer.style.left = `${event.clientX}px`;
  hammer.style.top = `${event.clientY}px`;
}

function hitAtPoint(clientX, clientY) {
  if (!state.running || state.paused) return;

  const candidates = $$(".hole")
    .map((hole, index) => {
      if (!state.activeAnswers.has(index)) return null;
      const rect = hole.getBoundingClientRect();
      const paddingX = Math.min(12, rect.width * .1);
      const paddingY = Math.min(10, rect.height * .1);
      const inside = clientX >= rect.left - paddingX
        && clientX <= rect.right + paddingX
        && clientY >= rect.top - paddingY
        && clientY <= rect.bottom + paddingY;
      if (!inside) return null;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = ((clientX - centerX) / rect.width) ** 2
        + ((clientY - centerY) / rect.height) ** 2;
      return { index, distance };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  if (candidates.length) handleHit(candidates[0].index);
}

function swingHammer() {
  const hammer = $("#hammer");
  window.clearTimeout(state.hammerHideTimer);
  hammer.classList.add("is-visible");
  hammer.classList.remove("is-swinging");
  void hammer.offsetWidth;
  hammer.classList.add("is-swinging");
  playSfx("swing", .48);
  if (window.matchMedia("(pointer: coarse)").matches) {
    state.hammerHideTimer = window.setTimeout(() => hammer.classList.remove("is-visible"), 340);
  }
}

function pauseBgm() {
  if (state.bgm) state.bgm.pause();
}

function primeSfx() {
  if (sfxTemplates.size) return;
  Object.entries(SFX_TRACKS).forEach(([name, path]) => {
    const audio = new Audio(path);
    audio.preload = "auto";
    audio.load();
    sfxTemplates.set(name, audio);
  });
}

function syncBgm() {
  if (!state.sound || state.paused) {
    pauseBgm();
    return;
  }

  const track = state.screen === "game" ? BGM_TRACKS[state.level] : BGM_TRACKS[state.screen];
  if (!track) return;
  if (!state.bgm || state.bgmTrack !== track) {
    pauseBgm();
    state.bgm = new Audio(track);
    state.bgm.loop = true;
    state.bgm.volume = state.screen === "game" ? .24 : .3;
    state.bgmTrack = track;
  }
  state.bgm.play().catch(() => {});
}

function playSfx(name, volume = 1) {
  if (!state.sound || !SFX_TRACKS[name]) return null;
  primeSfx();
  const sound = sfxTemplates.get(name).cloneNode();
  sound.preload = "auto";
  sound.volume = Math.min(1, Math.max(0, volume));
  sound.play().catch(() => {});
  return sound;
}

function playTone(frequency, duration, type) {
  if (!state.sound) return;
  try {
    if (!state.audio) state.audio = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = state.audio.createOscillator();
    const gain = state.audio.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gain.gain.setValueAtTime(.07, state.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, state.audio.currentTime + duration);
    oscillator.connect(gain).connect(state.audio.destination);
    oscillator.start();
    oscillator.stop(state.audio.currentTime + duration);
  } catch {
    state.sound = false;
  }
}

function bindEvents() {
  $("#start-button").addEventListener("click", () => {
    primeSfx();
    showScreen("map");
    updateMap();
    if (!state.tutorialSeen) openTutorial();
  });

  $("#reset-button").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state.unlocked = 1;
    state.tutorialSeen = false;
    state.sound = true;
    updateMap();
    $("#reset-button").textContent = "紀錄已重設";
  });

  $$(".level-button").forEach((button) => button.addEventListener("click", () => startLevel(Number(button.dataset.level))));
  $("#tutorial-button").addEventListener("click", () => openTutorial());
  $("#sound-button").addEventListener("click", () => {
    state.sound = !state.sound;
    saveProgress();
    updateMap();
    if (state.sound) {
      syncBgm();
      playSfx("correct", .36);
    } else {
      pauseBgm();
    }
  });
  $("#pause-button").addEventListener("click", togglePause);
  $("#exit-button").addEventListener("click", () => goToMap("已退出關卡，隨時可以重新挑戰。"));
  $("#resume-button").addEventListener("click", resumeGame);
  $("#pause-exit-button").addEventListener("click", () => {
    $("#pause-overlay").hidden = true;
    goToMap("已退出關卡，隨時可以重新挑戰。 ");
  });
  $("#result-button").addEventListener("click", () => {
    $("#result-overlay").hidden = true;
    goToMap("新關卡已解鎖，繼續前進吧！");
  });

  $("#game-scene").addEventListener("pointermove", (event) => {
    positionHammer(event);
    $("#hammer").classList.add("is-visible");
  });
  $("#game-scene").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    positionHammer(event);
    swingHammer();
    hitAtPoint(event.clientX, event.clientY);
  });
  $("#game-scene").addEventListener("pointerleave", () => $("#hammer").classList.remove("is-visible"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running && !state.paused) togglePause();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.screen === "game" && state.running) {
      state.paused ? resumeGame() : togglePause();
    }
  });
}

loadProgress();
bindEvents();
updateMap();
