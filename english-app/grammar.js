// 아주 기초적인 영문법 레슨 데이터
// 각 레슨: 제목, 설명(한국어), 핵심 포인트, 예문, 간단 연습(퀴즈)
window.GRAMMAR_LESSONS = [
  {
    id: "be-verb",
    level: "기초",
    title: "be동사 (am / are / is)",
    summary: "'~이다, ~에 있다'를 나타내는 가장 기본 동사예요.",
    points: [
      "I 뒤에는 am — I am a student. (나는 학생이다)",
      "You / We / They 뒤에는 are — You are kind. (너는 친절하다)",
      "He / She / It 뒤에는 is — She is happy. (그녀는 행복하다)",
      "부정은 be동사 뒤에 not — I am not tired. (나는 피곤하지 않다)"
    ],
    examples: [
      { en: "I am a teacher.", ko: "나는 교사이다." },
      { en: "They are my friends.", ko: "그들은 내 친구들이다." },
      { en: "He is not at home.", ko: "그는 집에 없다." }
    ],
    quiz: [
      { q: "I ___ a doctor.", options: ["am", "is", "are"], answer: 0 },
      { q: "She ___ very kind.", options: ["am", "is", "are"], answer: 1 },
      { q: "We ___ students.", options: ["am", "is", "are"], answer: 2 }
    ]
  },
  {
    id: "general-verb",
    level: "기초",
    title: "일반동사와 3인칭 단수",
    summary: "동작을 나타내는 동사예요. 주어가 He/She/It이면 동사에 -s를 붙여요.",
    points: [
      "I / You / We / They + 동사원형 — I play soccer. (나는 축구를 한다)",
      "He / She / It + 동사원형+s — He plays soccer. (그는 축구를 한다)",
      "-s, -sh, -ch, -x, -o로 끝나면 -es — She goes to school.",
      "자음+y로 끝나면 y를 i로 바꾸고 -es — He studies English."
    ],
    examples: [
      { en: "I like coffee.", ko: "나는 커피를 좋아한다." },
      { en: "She watches TV every day.", ko: "그녀는 매일 TV를 본다." },
      { en: "The cat runs fast.", ko: "그 고양이는 빠르게 달린다." }
    ],
    quiz: [
      { q: "He ___ (go) to work.", options: ["go", "goes", "going"], answer: 1 },
      { q: "They ___ (like) music.", options: ["like", "likes", "liking"], answer: 0 },
      { q: "She ___ (study) hard.", options: ["studys", "studies", "study"], answer: 1 }
    ]
  },
  {
    id: "negation-do",
    level: "기초",
    title: "일반동사 부정문 (don't / doesn't)",
    summary: "일반동사를 부정할 때는 do/does + not 을 써요.",
    points: [
      "I / You / We / They → don't + 동사원형 — I don't know.",
      "He / She / It → doesn't + 동사원형 — She doesn't like tea.",
      "doesn't 뒤에는 동사원형! (-s를 붙이지 않음) — He doesn't play (O)"
    ],
    examples: [
      { en: "I don't eat meat.", ko: "나는 고기를 먹지 않는다." },
      { en: "He doesn't have a car.", ko: "그는 차가 없다." },
      { en: "We don't work on Sunday.", ko: "우리는 일요일에 일하지 않는다." }
    ],
    quiz: [
      { q: "She ___ like fish.", options: ["don't", "doesn't", "isn't"], answer: 1 },
      { q: "They ___ live here.", options: ["don't", "doesn't", "aren't"], answer: 0 },
      { q: "He doesn't ___ TV.", options: ["watches", "watch", "watching"], answer: 1 }
    ]
  },
  {
    id: "questions-do",
    level: "기초",
    title: "일반동사 의문문 (Do / Does)",
    summary: "일반동사로 질문할 때는 문장 앞에 Do/Does를 붙여요.",
    points: [
      "Do + I/you/we/they + 동사원형 ~? — Do you like it?",
      "Does + he/she/it + 동사원형 ~? — Does she work here?",
      "대답: Yes, I do. / No, he doesn't."
    ],
    examples: [
      { en: "Do you speak English?", ko: "너는 영어를 하니?" },
      { en: "Does he know the answer?", ko: "그는 답을 아니?" },
      { en: "Do they live in Seoul?", ko: "그들은 서울에 사니?" }
    ],
    quiz: [
      { q: "___ you like pizza?", options: ["Do", "Does", "Are"], answer: 0 },
      { q: "___ she play tennis?", options: ["Do", "Does", "Is"], answer: 1 },
      { q: "Does he ___ a dog?", options: ["has", "have", "having"], answer: 1 }
    ]
  },
  {
    id: "articles",
    level: "기초",
    title: "관사 (a / an / the)",
    summary: "명사 앞에 붙는 작은 단어예요. a/an은 '하나의', the는 '그 (특정한)'.",
    points: [
      "자음 발음으로 시작하면 a — a book, a car",
      "모음 발음(a,e,i,o,u)으로 시작하면 an — an apple, an hour",
      "이미 아는 특정한 것에는 the — the sun, the book on the table"
    ],
    examples: [
      { en: "I have a dog.", ko: "나는 개 한 마리가 있다." },
      { en: "She ate an orange.", ko: "그녀는 오렌지 하나를 먹었다." },
      { en: "Close the door, please.", ko: "그 문을 닫아 주세요." }
    ],
    quiz: [
      { q: "I saw ___ elephant.", options: ["a", "an", "the"], answer: 1 },
      { q: "He bought ___ new phone.", options: ["a", "an", "the"], answer: 0 },
      { q: "Look at ___ moon tonight.", options: ["a", "an", "the"], answer: 2 }
    ]
  },
  {
    id: "plural",
    level: "기초",
    title: "명사의 복수형",
    summary: "둘 이상이면 명사에 보통 -s를 붙여요.",
    points: [
      "대부분 -s — book → books, dog → dogs",
      "-s, -sh, -ch, -x → -es — box → boxes, bus → buses",
      "자음+y → y를 i로 + es — city → cities, baby → babies",
      "불규칙 — child → children, man → men, foot → feet"
    ],
    examples: [
      { en: "There are three cats.", ko: "고양이가 세 마리 있다." },
      { en: "I have two boxes.", ko: "나는 상자가 두 개 있다." },
      { en: "The children are playing.", ko: "아이들이 놀고 있다." }
    ],
    quiz: [
      { q: "one → two ___ (box)", options: ["boxs", "boxes", "boxies"], answer: 1 },
      { q: "one → three ___ (city)", options: ["citys", "cityes", "cities"], answer: 2 },
      { q: "one → two ___ (child)", options: ["childs", "childrens", "children"], answer: 2 }
    ]
  },
  {
    id: "present-continuous",
    level: "기초",
    title: "현재진행형 (be + -ing)",
    summary: "'지금 ~하고 있는 중이다'를 나타내요.",
    points: [
      "형태: am/are/is + 동사원형-ing",
      "I am reading. (나는 읽고 있다)",
      "She is cooking. (그녀는 요리하고 있다)",
      "-e로 끝나면 e 빼고 ing — make → making, write → writing"
    ],
    examples: [
      { en: "They are playing outside.", ko: "그들은 밖에서 놀고 있다." },
      { en: "I am studying now.", ko: "나는 지금 공부하고 있다." },
      { en: "He is making dinner.", ko: "그는 저녁을 만들고 있다." }
    ],
    quiz: [
      { q: "I ___ watching a movie.", options: ["am", "is", "are"], answer: 0 },
      { q: "She is ___ (run) fast.", options: ["runing", "running", "runs"], answer: 1 },
      { q: "They ___ eating lunch.", options: ["am", "is", "are"], answer: 2 }
    ]
  },
  {
    id: "past-tense",
    level: "기초",
    title: "과거시제 (규칙/불규칙)",
    summary: "'~했다' 과거의 일을 나타내요. 보통 동사에 -ed를 붙여요.",
    points: [
      "규칙: 동사원형 + ed — play → played, work → worked",
      "-e로 끝나면 -d만 — like → liked, live → lived",
      "불규칙: go → went, eat → ate, see → saw, have → had",
      "부정: didn't + 동사원형 — I didn't go."
    ],
    examples: [
      { en: "I visited my grandmother.", ko: "나는 할머니를 방문했다." },
      { en: "She went to the market.", ko: "그녀는 시장에 갔다." },
      { en: "We didn't watch the movie.", ko: "우리는 그 영화를 보지 않았다." }
    ],
    quiz: [
      { q: "Yesterday I ___ (play) soccer.", options: ["play", "played", "plaied"], answer: 1 },
      { q: "He ___ (go) home early.", options: ["goed", "gone", "went"], answer: 2 },
      { q: "I ___ eat breakfast today.", options: ["don't", "didn't", "wasn't"], answer: 1 }
    ]
  },
  {
    id: "future-will",
    level: "기초",
    title: "미래 표현 (will / be going to)",
    summary: "'~할 것이다' 미래의 일을 나타내요.",
    points: [
      "will + 동사원형 — I will call you. (전화할게)",
      "be going to + 동사원형 (예정) — I am going to travel.",
      "부정: will not = won't — I won't be late."
    ],
    examples: [
      { en: "I will help you.", ko: "내가 도와줄게." },
      { en: "She is going to study abroad.", ko: "그녀는 유학 갈 예정이다." },
      { en: "We won't forget this.", ko: "우리는 이것을 잊지 않을 것이다." }
    ],
    quiz: [
      { q: "I ___ call you later.", options: ["will", "am", "did"], answer: 0 },
      { q: "She is going ___ leave soon.", options: ["to", "for", "at"], answer: 0 },
      { q: "won't = will ___", options: ["no", "not", "never"], answer: 1 }
    ]
  },
  {
    id: "prepositions",
    level: "기초",
    title: "기본 전치사 (in / on / at)",
    summary: "시간과 장소를 나타내는 작은 단어예요.",
    points: [
      "at: 정확한 시각/지점 — at 3 o'clock, at the door",
      "on: 요일/날짜, 표면 위 — on Monday, on the table",
      "in: 월/연도/넓은 공간 — in May, in 2025, in the room"
    ],
    examples: [
      { en: "The meeting is at 9 a.m.", ko: "회의는 오전 9시에 있다." },
      { en: "I was born in April.", ko: "나는 4월에 태어났다." },
      { en: "The book is on the desk.", ko: "그 책은 책상 위에 있다." }
    ],
    quiz: [
      { q: "See you ___ Monday.", options: ["in", "on", "at"], answer: 1 },
      { q: "The class starts ___ 8 o'clock.", options: ["in", "on", "at"], answer: 2 },
      { q: "We met ___ 2020.", options: ["in", "on", "at"], answer: 0 }
    ]
  }
];
