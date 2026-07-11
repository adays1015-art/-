/* ============================================================
   MyEnglish — 개인 영어공부 플랫폼
   순수 바닐라 JS · 데이터는 브라우저 localStorage에 저장됩니다.
   ============================================================ */

const STORAGE_KEY = "myenglish_v1";
const DAY = 24 * 60 * 60 * 1000;

/* ---------- 상태 & 저장 ---------- */
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 무시 */ }
  return null;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 최초 실행: 시드 단어로 초기화
function initState() {
  if (state && state.words) return;
  state = {
    words: (window.SEED_WORDS || []).map((w, i) => makeWord(w, i)),
    grammarDone: {},        // { lessonId: true }
    daily: {},              // { "2026-07-11": { reviews: n, correct: n } }
    streak: { count: 0, lastDay: null },
    sentence: { correct: 0, total: 0 },
    theme: "light",
    nextId: (window.SEED_WORDS || []).length
  };
  save();
}

function makeWord(w, id) {
  return {
    id,
    term: w.term,
    meaning: w.meaning,
    example: w.example || "",
    exampleKo: w.exampleKo || "",
    tags: w.tags || [],
    // SRS 필드 (SM-2 간소화)
    ease: 2.5,
    interval: 0,      // 일 단위
    due: Date.now(),  // 복습 예정 시각
    reps: 0,          // 성공 복습 횟수
    lapses: 0,        // 실패 횟수
    createdAt: Date.now()
  };
}

/* ---------- SRS (간격 반복) 알고리즘 ----------
   grade: 0=다시, 1=어려움, 2=알맞음, 3=쉬움
   반환 없음 — word를 직접 수정 후 저장                */
function scheduleWord(word, grade) {
  if (grade === 0) {
    // 실패 → 곧 다시
    word.lapses += 1;
    word.reps = 0;
    word.interval = 0;
    word.ease = Math.max(1.3, word.ease - 0.2);
    word.due = Date.now() + 60 * 1000; // 1분 뒤
    return;
  }
  word.reps += 1;
  if (grade === 1) word.ease = Math.max(1.3, word.ease - 0.15);
  if (grade === 3) word.ease = word.ease + 0.1;

  if (word.reps === 1) {
    word.interval = grade === 1 ? 1 : grade === 3 ? 3 : 1;
  } else if (word.reps === 2) {
    word.interval = grade === 1 ? 3 : grade === 3 ? 7 : 4;
  } else {
    const factor = grade === 1 ? 1.2 : grade === 3 ? word.ease + 0.3 : word.ease;
    word.interval = Math.round(word.interval * factor);
  }
  word.interval = Math.max(1, word.interval);
  word.due = Date.now() + word.interval * DAY;
}

// grade별 다음 간격 미리보기 텍스트
function previewInterval(word, grade) {
  const clone = JSON.parse(JSON.stringify(word));
  scheduleWord(clone, grade);
  if (grade === 0) return "<1분";
  if (clone.interval < 1) return "<1일";
  if (clone.interval === 1) return "1일";
  return clone.interval + "일";
}

// 단어 숙련도 분류
function masteryOf(w) {
  if (w.reps === 0) return "new";
  if (w.interval >= 21) return "mastered";
  if (w.interval >= 4) return "review";
  return "learning";
}
const MASTERY_META = {
  new: { label: "새 단어", color: "#8b96b0" },
  learning: { label: "학습 중", color: "#f0a500" },
  review: { label: "복습 중", color: "#4f6ef7" },
  mastered: { label: "완료", color: "#12b886" }
};

/* ---------- 공통 유틸 ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 1800);
}

function speak(text) {
  if (!window.speechSynthesis) { toast("이 브라우저는 음성을 지원하지 않아요"); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

/* ---------- 학습 기록 & 스트릭 ---------- */
function recordReview(correct) {
  const key = todayKey();
  if (!state.daily[key]) state.daily[key] = { reviews: 0, correct: 0 };
  state.daily[key].reviews += 1;
  if (correct) state.daily[key].correct += 1;
  updateStreak();
  save();
  renderStreak();
}

function updateStreak() {
  const today = todayKey();
  const s = state.streak;
  if (s.lastDay === today) return;
  const yesterday = todayKey(Date.now() - DAY);
  if (s.lastDay === yesterday) s.count += 1;
  else s.count = 1;
  s.lastDay = today;
}

function renderStreak() {
  $("#streakBadge").textContent = `🔥 ${state.streak.count}일`;
}

/* ============================================================
   탭 네비게이션
   ============================================================ */
function switchTab(name) {
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $$(".panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
  if (name === "review") startReview();
  if (name === "words") renderWordList();
  if (name === "sentences") loadSentence();
  if (name === "grammar") renderGrammarList();
  if (name === "stats") renderStats();
}

$$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
document.addEventListener("click", (e) => {
  const goto = e.target.closest("[data-goto]");
  if (goto) switchTab(goto.dataset.goto);
});

/* ============================================================
   오늘 복습 (플래시카드)
   ============================================================ */
let reviewQueue = [];
let currentCard = null;
let reviewSessionCount = 0;

function dueWords() {
  const now = Date.now();
  return state.words
    .filter(w => w.due <= now)
    .sort((a, b) => a.due - b.due);
}

function startReview() {
  reviewQueue = dueWords();
  reviewSessionCount = reviewQueue.length;
  const total = reviewQueue.length;
  $("#reviewSubtitle").textContent = total > 0
    ? `복습 대기 ${total}개 · 오늘 학습 ${(state.daily[todayKey()]?.reviews) || 0}회`
    : "모든 복습을 끝냈어요";
  if (total === 0) {
    $("#reviewEmpty").classList.remove("hidden");
    $("#flashcardArea").classList.add("hidden");
    return;
  }
  $("#reviewEmpty").classList.add("hidden");
  $("#flashcardArea").classList.remove("hidden");
  nextCard();
}

function nextCard() {
  const remaining = reviewQueue.length;
  const done = reviewSessionCount - remaining;
  $("#reviewProgress").style.width = reviewSessionCount ? `${(done / reviewSessionCount) * 100}%` : "0%";

  if (remaining === 0) {
    $("#reviewSubtitle").textContent = "모든 복습을 끝냈어요";
    $("#reviewEmpty").classList.remove("hidden");
    $("#flashcardArea").classList.add("hidden");
    return;
  }
  currentCard = reviewQueue[0];
  const card = $("#flashcard");
  card.classList.remove("flipped");
  $("#gradeButtons").classList.add("hidden");
  $("#cardTerm").textContent = currentCard.term;
  $("#cardMeaning").textContent = currentCard.meaning;
  $("#cardExample").textContent = currentCard.example || "";
  $("#cardExampleKo").textContent = currentCard.exampleKo || "";
  // 간격 미리보기
  $("#hardInterval").textContent = previewInterval(currentCard, 1);
  $("#goodInterval").textContent = previewInterval(currentCard, 2);
  $("#easyInterval").textContent = previewInterval(currentCard, 3);
}

$("#flashcard").addEventListener("click", (e) => {
  if (e.target.closest(".speak-btn")) return;
  const card = $("#flashcard");
  if (!card.classList.contains("flipped")) {
    card.classList.add("flipped");
    $("#gradeButtons").classList.remove("hidden");
  }
});

$("#cardSpeak").addEventListener("click", (e) => {
  e.stopPropagation();
  if (currentCard) speak(currentCard.term);
});

$$(".grade-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!currentCard) return;
    const grade = parseInt(btn.dataset.grade, 10);
    scheduleWord(currentCard, grade);
    recordReview(grade > 0);
    reviewQueue.shift();
    // '다시'는 큐 뒤쪽에 다시 넣어 세션 내 재복습
    if (grade === 0) reviewQueue.push(currentCard);
    save();
    nextCard();
  });
});

/* ============================================================
   단어장
   ============================================================ */
let editingId = null;

function renderWordList() {
  const q = $("#wordSearch").value.trim().toLowerCase();
  const list = $("#wordList");
  const words = state.words
    .filter(w => !q || w.term.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);

  // 상단 통계 칩
  const counts = { new: 0, learning: 0, review: 0, mastered: 0 };
  state.words.forEach(w => counts[masteryOf(w)]++);
  $("#wordStatsRow").innerHTML = `
    <span class="chip">전체 <b>${state.words.length}</b></span>
    <span class="chip">새 단어 <b>${counts.new}</b></span>
    <span class="chip">학습 중 <b>${counts.learning + counts.review}</b></span>
    <span class="chip">완료 <b>${counts.mastered}</b></span>`;

  if (words.length === 0) {
    list.innerHTML = `<p class="muted center" style="padding:30px">단어가 없어요. "+ 단어 추가"로 시작하세요.</p>`;
    return;
  }
  list.innerHTML = words.map(w => {
    const m = MASTERY_META[masteryOf(w)];
    return `
    <div class="word-item">
      <span class="mastery-dot" style="background:${m.color}" title="${m.label}"></span>
      <div class="word-main">
        <div class="word-term">${escapeHtml(w.term)}
          <button class="mini-btn" data-speak="${w.id}" title="발음">🔊</button>
        </div>
        <div class="word-meaning">${escapeHtml(w.meaning)}</div>
        ${w.example ? `<div class="word-example">"${escapeHtml(w.example)}"</div>` : ""}
      </div>
      <span class="word-badge">${m.label}</span>
      <div class="word-actions">
        <button class="mini-btn" data-edit="${w.id}" title="편집">✏️</button>
        <button class="mini-btn" data-del="${w.id}" title="삭제">🗑️</button>
      </div>
    </div>`;
  }).join("");
}

$("#wordSearch").addEventListener("input", renderWordList);

$("#wordList").addEventListener("click", (e) => {
  const sp = e.target.closest("[data-speak]");
  const ed = e.target.closest("[data-edit]");
  const dl = e.target.closest("[data-del]");
  if (sp) { const w = state.words.find(x => x.id == sp.dataset.speak); if (w) speak(w.term); }
  if (ed) openWordModal(parseInt(ed.dataset.edit, 10));
  if (dl) {
    if (confirm("이 단어를 삭제할까요?")) {
      state.words = state.words.filter(x => x.id != dl.dataset.del);
      save(); renderWordList(); toast("삭제했어요");
    }
  }
});

function openWordModal(id = null) {
  editingId = id;
  const modal = $("#wordModal");
  if (id != null) {
    const w = state.words.find(x => x.id === id);
    $("#modalTitle").textContent = "단어 편집";
    $("#mTerm").value = w.term;
    $("#mMeaning").value = w.meaning;
    $("#mExample").value = w.example;
    $("#mExampleKo").value = w.exampleKo;
    $("#mTags").value = (w.tags || []).join(", ");
  } else {
    $("#modalTitle").textContent = "단어 추가";
    ["#mTerm", "#mMeaning", "#mExample", "#mExampleKo", "#mTags"].forEach(s => $(s).value = "");
  }
  modal.classList.remove("hidden");
  $("#mTerm").focus();
}

$("#addWordBtn").addEventListener("click", () => openWordModal(null));
$("#mCancel").addEventListener("click", () => $("#wordModal").classList.add("hidden"));
$("#wordModal").addEventListener("click", (e) => { if (e.target.id === "wordModal") $("#wordModal").classList.add("hidden"); });

$("#mSave").addEventListener("click", () => {
  const term = $("#mTerm").value.trim();
  const meaning = $("#mMeaning").value.trim();
  if (!term || !meaning) { toast("단어와 뜻은 필수예요"); return; }
  const tags = $("#mTags").value.split(",").map(s => s.trim()).filter(Boolean);
  if (editingId != null) {
    const w = state.words.find(x => x.id === editingId);
    Object.assign(w, {
      term, meaning,
      example: $("#mExample").value.trim(),
      exampleKo: $("#mExampleKo").value.trim(),
      tags
    });
    toast("수정했어요");
  } else {
    const w = makeWord({
      term, meaning,
      example: $("#mExample").value.trim(),
      exampleKo: $("#mExampleKo").value.trim(),
      tags
    }, state.nextId++);
    state.words.push(w);
    toast("단어를 추가했어요");
  }
  save();
  $("#wordModal").classList.add("hidden");
  renderWordList();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   예문 학습 (빈칸 채우기)
   ============================================================ */
let sentenceWord = null;

function loadSentence() {
  const pool = state.words.filter(w => w.example && w.example.toLowerCase().includes(w.term.toLowerCase()));
  if (pool.length === 0) {
    $("#sentenceText").textContent = "예문이 있는 단어가 없어요. 단어장에서 예문을 추가해 보세요.";
    $("#sentenceKo").textContent = "";
    $("#sentenceInput").classList.add("hidden");
    $(".sentence-actions").classList.add("hidden");
    return;
  }
  $("#sentenceInput").classList.remove("hidden");
  $(".sentence-actions").classList.remove("hidden");
  sentenceWord = pool[Math.floor(Math.random() * pool.length)];
  const re = new RegExp("\\b" + escapeReg(sentenceWord.term) + "\\b", "i");
  const blanked = sentenceWord.example.replace(re, `<span class="blank">____</span>`);
  $("#sentenceText").innerHTML = blanked;
  $("#sentenceKo").textContent = sentenceWord.exampleKo || "";
  const inp = $("#sentenceInput");
  inp.value = ""; inp.disabled = false; inp.focus();
  const fb = $("#sentenceFeedback");
  fb.textContent = ""; fb.className = "sentence-feedback";
  updateSentScore();
}

function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function checkSentence() {
  if (!sentenceWord) return;
  const val = $("#sentenceInput").value.trim().toLowerCase();
  if (!val) return;
  const fb = $("#sentenceFeedback");
  state.sentence.total += 1;
  if (val === sentenceWord.term.toLowerCase()) {
    fb.textContent = "✅ 정답이에요!";
    fb.className = "sentence-feedback correct";
    state.sentence.correct += 1;
    $("#sentenceInput").disabled = true;
    speak(sentenceWord.example);
  } else {
    fb.textContent = `❌ 아쉬워요. 정답: ${sentenceWord.term}`;
    fb.className = "sentence-feedback wrong";
  }
  save();
  updateSentScore();
}

function updateSentScore() {
  const s = state.sentence;
  if (s.total > 0) $("#sentScore").textContent = `정답 ${s.correct} / 시도 ${s.total} (정답률 ${Math.round(s.correct / s.total * 100)}%)`;
  else $("#sentScore").textContent = "";
}

$("#sentCheck").addEventListener("click", checkSentence);
$("#sentNext").addEventListener("click", loadSentence);
$("#sentHint").addEventListener("click", () => {
  if (sentenceWord) toast(`힌트: ${sentenceWord.meaning} (${sentenceWord.term[0]}...)`);
});
$("#sentSpeak").addEventListener("click", () => { if (sentenceWord) speak(sentenceWord.example); });
$("#sentenceInput").addEventListener("keydown", (e) => { if (e.key === "Enter") checkSentence(); });

/* ============================================================
   기초 문법
   ============================================================ */
function renderGrammarList() {
  $("#grammarDetail").classList.add("hidden");
  const list = $("#grammarList");
  list.classList.remove("hidden");
  list.innerHTML = (window.GRAMMAR_LESSONS || []).map(g => `
    <div class="grammar-card" data-lesson="${g.id}">
      <div class="g-level">${g.level}</div>
      <h3>${escapeHtml(g.title)}</h3>
      <p>${escapeHtml(g.summary)}</p>
      ${state.grammarDone[g.id] ? '<div class="g-done">✓ 학습 완료</div>' : ''}
    </div>`).join("");
}

$("#grammarList").addEventListener("click", (e) => {
  const c = e.target.closest("[data-lesson]");
  if (c) openLesson(c.dataset.lesson);
});

function openLesson(id) {
  const g = window.GRAMMAR_LESSONS.find(x => x.id === id);
  if (!g) return;
  $("#grammarList").classList.add("hidden");
  const d = $("#grammarDetail");
  d.classList.remove("hidden");
  d.innerHTML = `
    <button class="back-link" id="grammarBack">← 목록으로</button>
    <div class="g-level" style="color:var(--accent);font-weight:700;font-size:12px">${g.level}</div>
    <h2>${escapeHtml(g.title)}</h2>
    <p class="g-summary">${escapeHtml(g.summary)}</p>
    <ul class="points">${g.points.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
    <div class="g-examples">
      ${g.examples.map(ex => `
        <div class="g-example">
          <div class="en">${escapeHtml(ex.en)} <button class="mini-btn" data-speak-text="${escapeHtml(ex.en)}">🔊</button></div>
          <div class="ko">${escapeHtml(ex.ko)}</div>
        </div>`).join("")}
    </div>
    <div class="g-quiz">
      <h3>미니 퀴즈</h3>
      ${g.quiz.map((qz, qi) => `
        <div class="quiz-item" data-qi="${qi}">
          <div class="quiz-q">${qi + 1}. ${escapeHtml(qz.q)}</div>
          <div class="quiz-opts">
            ${qz.options.map((op, oi) => `<button class="quiz-opt" data-oi="${oi}">${escapeHtml(op)}</button>`).join("")}
          </div>
        </div>`).join("")}
    </div>`;

  d.querySelector("#grammarBack").addEventListener("click", renderGrammarList);
  d.querySelectorAll("[data-speak-text]").forEach(b =>
    b.addEventListener("click", () => speak(b.dataset.speakText)));

  let solved = 0;
  d.querySelectorAll(".quiz-item").forEach((item, qi) => {
    const qz = g.quiz[qi];
    item.querySelectorAll(".quiz-opt").forEach(opt => {
      opt.addEventListener("click", () => {
        if (item.dataset.answered) return;
        const oi = parseInt(opt.dataset.oi, 10);
        if (oi === qz.answer) {
          opt.classList.add("correct");
          item.dataset.answered = "1";
          solved++;
          if (solved === g.quiz.length && !state.grammarDone[g.id]) {
            state.grammarDone[g.id] = true;
            save();
            toast("문법 레슨 완료! 🎉");
          }
        } else {
          opt.classList.add("wrong");
          setTimeout(() => opt.classList.remove("wrong"), 600);
        }
      });
    });
  });
}

/* ============================================================
   학습 통계
   ============================================================ */
function renderStats() {
  const today = state.daily[todayKey()] || { reviews: 0, correct: 0 };
  const totalReviews = Object.values(state.daily).reduce((a, d) => a + d.reviews, 0);
  const totalCorrect = Object.values(state.daily).reduce((a, d) => a + d.correct, 0);
  const accuracy = totalReviews ? Math.round(totalCorrect / totalReviews * 100) : 0;
  const mastered = state.words.filter(w => masteryOf(w) === "mastered").length;

  $("#statCards").innerHTML = `
    <div class="stat-card"><div class="s-value">${state.streak.count}</div><div class="s-label">🔥 연속 학습일</div></div>
    <div class="stat-card"><div class="s-value">${today.reviews}</div><div class="s-label">오늘 복습</div></div>
    <div class="stat-card"><div class="s-value">${totalReviews}</div><div class="s-label">누적 복습</div></div>
    <div class="stat-card"><div class="s-value">${accuracy}%</div><div class="s-label">정답률</div></div>
    <div class="stat-card"><div class="s-value">${mastered}</div><div class="s-label">완료 단어</div></div>
    <div class="stat-card"><div class="s-value">${state.words.length}</div><div class="s-label">전체 단어</div></div>`;

  // 최근 14일 막대 그래프
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = todayKey(Date.now() - i * DAY);
    days.push({ key, count: (state.daily[key]?.reviews) || 0 });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  $("#barChart").innerHTML = days.map(d => {
    const h = Math.round((d.count / max) * 100);
    const label = d.key.slice(5).replace("-", "/");
    return `<div class="bar-col" title="${d.key}: ${d.count}회">
      <div class="bar-val">${d.count || ""}</div>
      <div class="bar" style="height:${d.count ? Math.max(4, h) : 3}%"></div>
      <div class="bar-label">${label}</div>
    </div>`;
  }).join("");

  // 숙련도 분포
  const counts = { new: 0, learning: 0, review: 0, mastered: 0 };
  state.words.forEach(w => counts[masteryOf(w)]++);
  const totalW = Math.max(1, state.words.length);
  $("#masteryBars").innerHTML = ["new", "learning", "review", "mastered"].map(k => {
    const m = MASTERY_META[k];
    const pct = Math.round(counts[k] / totalW * 100);
    return `<div class="m-row">
      <div class="m-name">${m.label}</div>
      <div class="m-track"><div class="m-fill" style="width:${pct}%;background:${m.color}"></div></div>
      <div class="m-count">${counts[k]}</div>
    </div>`;
  }).join("");
}

/* ---------- 데이터 내보내기/가져오기/초기화 ---------- */
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `myenglish-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("백업 파일을 내려받았어요");
});

$("#importBtn").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.words) throw new Error("형식 오류");
      state = data;
      save();
      toast("데이터를 가져왔어요");
      renderAll();
    } catch (err) { toast("가져오기 실패: 올바른 파일이 아니에요"); }
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("#resetBtn").addEventListener("click", () => {
  if (confirm("모든 학습 데이터가 삭제됩니다. 계속할까요?")) {
    localStorage.removeItem(STORAGE_KEY);
    state = null;
    initState();
    toast("초기화했어요");
    renderAll();
    switchTab("review");
  }
});

/* ---------- 테마 ---------- */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  $("#themeBtn").textContent = state.theme === "dark" ? "☀️" : "🌙";
}
$("#themeBtn").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  save(); applyTheme();
});

/* ============================================================
   초기화
   ============================================================ */
function renderAll() {
  applyTheme();
  renderStreak();
  renderWordList();
}

function boot() {
  initState();
  applyTheme();
  renderStreak();
  switchTab("review");
}

boot();
