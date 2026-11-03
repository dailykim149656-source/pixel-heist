# PIXEL HEIST — 3분 데모 영상 대본

심사 기준: Impact 30% · Meta 도구 활용 25% · Demo 25% · Technical 20%.
영상이 보여줘야 하는 한 줄: **"SAM 3.1의 마스크 모양 자체가 퍼즐의 열쇠이고, 박스로는 안 풀린다."**

내레이션은 영어(글로벌 심사), 화면 자막은 짧게. 총 3:00 이내.

---

## 촬영 전 준비

- [ ] 브라우저 1440×900, 줌 100%, 북마크바·확장 아이콘 숨김. 다크모드 끔.
- [ ] 진행 상황 초기화: DevTools 콘솔에서 `localStorage.setItem("pixel-heist.unlocked","10")` (스테이지 선택용). 프롤로그 컷은 새 시크릿 창에서.
- [ ] **실물 소품**: 머그(손잡이 있는 것), 자 또는 펜. 단색 책상 위에 놓기 — 잘린 모양이 깔끔하게 나온다.
- [ ] 폰 화면 녹화 켜기(iOS 제어센터 / Android 빠른 설정). 폰 밝기 최대, 방해금지.
- [ ] Live Sam 한도: IP당 시간당 40회. 리허설은 Recorded로, 본촬영만 Live.
- [ ] 화면 녹화 60fps, 마우스 커서 강조 켜기.
- [ ] 라이브 SAM 성공 장면은 **먼저, 여러 번** 찍어 둔다. 네트워크가 나빠지면 나머지는 Recorded로도 촬영 가능.

---

## 샷 리스트

### 0:00–0:15 · 훅 (랜딩)
- **화면:** pixel-heist.vercel.app 랜딩. 히어로 오토플레이(머그가 카메라를 막고, 자가 틈을 잇고, 도둑이 금고로)가 한 바퀴 돈다.
- **자막:** `Steal reality. Escape the sketch.`
- **내레이션:**
  > "A museum drawn entirely in pencil. Pencil cameras, pencil lasers — they can't stop something real. So you cut real objects out of photos and smuggle them in."

### 0:15–0:30 · 프롤로그 (Sam 소개)
- **화면:** Play the Heist → 프롤로그 1~3컷을 →키로 빠르게. 3컷의 Sam 휴대폰 화면("AI model · Meta SAM 3.1")에서 잠깐 멈춤.
- **내레이션:**
  > "Your partner is Sam — Meta's Segment Anything Model 3.1. Tap an object, and Sam cuts out its exact pixels."
- 4컷(박스 vs 실제 모양)에서 0.5초 멈추고 Skip.

### 0:30–1:05 · 라이브 컷 — 폰으로 실물 촬영 ★핵심
- **화면(폰 화면 녹화):** 게임 화면 → 📷 Take a photo → 책상 위 머그 촬영 → **Live Sam** 상태로 머그 탭 → "✂ Sam is cutting…" → 마스크 오버레이 → Geometry 카드(Length / Thickness / Solid / Aspect / Box only) → Extract → 하단 가방에 들어감.
- **화면 확대 컷:** Geometry 카드 아래 줄 `SAM confidence 0.xx · NNNms`와 Sam 채팅 말풍선 — 실제 API 응답 값.
- **자막:** `Live call · Meta SAM 3.1 · point prompt → mask`
- **내레이션:**
  > "This is a live call. One tap becomes a point prompt; SAM 3.1 returns a pixel mask with its confidence and latency. The game never sees a label — it doesn't know this is a mug. It only measures the shape: length, thickness, solidity, and holes."

### 1:05–1:35 · 퍼즐 = 모양 (데스크톱, 스테이지 3)
- **화면:** 데스크톱, Stage 3 The Gallery. Sample Desk A → Recorded → 머그·자 Extract.
  1. 머그를 먼저 틈 위에 → **레이저 빨간색, "Too thick — trips the lasers"**.
  2. 바꿔서: 머그 → 카메라 시선(✓ Camera blocked), 자 → 틈(✓ Bridge, 초록 스팬 라인).
  3. RUN HEIST → 도둑이 자 위를 건너 금고 도착 → ESCAPE SUCCESS.
- **내레이션:**
  > "Each room asks for a different shape. Chunky blocks a camera's view. Long and thin slips between the lasers to bridge a gap. Swap them and the heist fails — because of geometry, not names."

### 1:35–2:05 · X-ray: 마스크 vs 박스 ★Technical / Meta 도구 근거
- **화면:** 같은 배치에서 **X-ray: mask vs box** 켜기. 주황 점선 박스가 겹쳐 보이고, 오른쪽 X-ray 표에서 SAM mask ✓ / Box only ✗.
- 이어서 Stage 5 The Hook Hall: 머그 손잡이 구멍이 고리에 걸림(✓ Hooked) → X-ray에서는 박스에 구멍이 없으니 고리 ✗.
- **자막:** `Same placement. Bounding boxes fail.`
- **내레이션:**
  > "Here's why segmentation matters. X-ray re-judges the exact same plan using bounding boxes — what you'd get from a plain detector. The ruler's box becomes a slab that trips the lasers. The mug's box has no handle hole, so it can't hang on the hook. Only the real mask solves it."

### 2:05–2:30 · 난이도 곡선 몽타주
- **화면(각 3~5초):**
  - Stage 4: 포스트잇이 압력판 누름 → 문 열림. 가위(고리 모양)는 실패.
  - Stage 6: 자를 ⟳ 회전시켜 경사 틈에 맞춤.
  - Stage 8: 두 센서 빔 사이로 자를 끼워 카메라 차단. 머그를 넣으면 **ALARM!**
  - Stage 10: 가위 손가락 구멍이 고리에, 계산기·포스트잇이 카메라 두 대, 펜이 가파른 틈.
- **내레이션:**
  > "Ten rooms, each tightening the rules: plates that need bulk, hooks that need a real hole, slopes that need rotation, sensor beams only the thinnest bar can slip between. Two sample desks with different solutions — or your own photos."

### 2:30–2:50 · 엔딩 클리프행어
- **화면:** Stage 10 성공 → Watch the ending ▶ → 다이아몬드가 진짜 색 → 철창 → Sam "The museum hired me first." → 감옥 → 뮤즈 참 → **To be continued...?**
- **내레이션:** 없음(컷 자체로). 마지막 컷에서 1초 정적.

### 2:50–3:00 · 마무리 카드
- **화면:** 랜딩 히어로 + URL + 레포 링크.
- **자막:** `pixel-heist.vercel.app · Built with Meta SAM 3.1`
- **내레이션:**
  > "PIXEL HEIST. Steal reality. Escape the sketch."

---

## 정직성 체크 (자막·내레이션에서 지킬 것)

- 샘플 책상 사진은 **AI 생성 이미지**임을 언급하거나 자막으로 표시(랜딩 푸터에도 있음). 실물 촬영 장면은 폰 카메라.
- Recorded 장면이 나오면 화면의 "Recorded" 배지가 보이게 둔다. "live"라고 말하는 건 0:30–1:05 장면뿐.
- Sam의 배신은 스토리. 실제 모델이 데이터를 어떻게 한다는 뉘앙스의 말은 하지 않는다.

## 편집 팁

- 라이브 컷 대기 시간은 1.5배속까지만 — 지연값(ms)이 화면에 보이므로 과하게 자르지 말 것.
- X-ray 표는 확대(줌 인) 컷으로 2초 이상.
- 배경음은 낮게, 내레이션 −14 LUFS 근처.
