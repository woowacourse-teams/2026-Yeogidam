// 히어로의 폰 데모: 인스타그램 릴스를 여기담에 공유하면 보관함에 게시물이 담기고, 찾은 장소를 지도에서 보는 흐름을
// 직접 눌러 보거나 자동으로 본다. 화면 구성과 문구는 앱 2.3.0(fe-release)을 따른다
import { track } from '../shared/analytics.js';
import { reduceMotion } from '../shared/motion.js';
import { ALL, CATEGORIES, categoryOf, middleCategory, placesIn } from './categories.js';
import { DELAY } from './timing.js';

// 방문 통계에 남기는 데모 단계. 순서는 방문자가 데모를 어디까지 봤는지(store_click의 demo_progress)를 가르는 기준이다
const STEPS = ['share', 'send', 'open_app', 'result', 'library', 'map', 'detail', 'end'];
// 데모 아래 진행 표시(공유, 분석, 보관함, 지도)의 칸 번호
const STEP = { share: 0, analysis: 1, library: 2, map: 3, done: 4 };
const DEMO_ONLY = '데모에서는 여기담 흐름만 눌러 볼 수 있어요';

const ICON = {
  place: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 11.5Q13.03 11.5 13.76 10.78Q14.49 10.05 14.49 9.01Q14.49 7.98 13.76 7.25Q13.03 6.52 12 6.52Q10.97 6.52 10.24 7.25Q9.51 7.98 9.51 9.01Q9.51 10.05 10.24 10.78Q10.97 11.5 12 11.5ZM19 9.01Q19 10.47 18.27 12.35Q17.54 14.23 16.51 15.87Q15.48 17.52 14.47 18.95Q13.46 20.38 12.75 21.23L12 22.03Q11.72 21.7 11.25 21.16Q10.78 20.62 9.56 19Q8.34 17.38 7.42 15.85Q6.5 14.32 5.75 12.4Q5 10.47 5 9.01Q5 6.1 7.04 4.06Q9.09 2.01 12 2.01Q14.91 2.01 16.96 4.06Q19 6.1 19 9.01Z"/></svg>',
  sell: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.44 11.41L12.56 2.58Q12 2.01 11.15 2.01L3.97 2.01Q3.17 2.01 2.58 2.6Q1.99 3.19 1.99 3.99L1.99 11.17Q1.99 12.02 2.56 12.58L11.44 21.46Q12 22.03 12.85 22.03Q13.69 22.03 14.26 21.46L21.44 14.28Q22.01 13.66 22.01 12.84Q22.01 12.02 21.44 11.41ZM6.5 8.03Q5.85 8.03 5.42 7.58Q5 7.13 5 6.52Q5 5.87 5.42 5.44Q5.85 5.02 6.5 5.02Q7.11 5.02 7.56 5.44Q8.01 5.87 8.01 6.52Q8.01 7.13 7.56 7.58Q7.11 8.03 6.5 8.03Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 21.04L19 6.99L8.01 6.99L8.01 21.04L19 21.04ZM19 5.02Q19.8 5.02 20.41 5.61Q21.02 6.19 21.02 6.99L21.02 21.04Q21.02 21.84 20.41 22.45Q19.8 23.06 19 23.06L8.01 23.06Q7.21 23.06 6.6 22.45Q5.99 21.84 5.99 21.04L5.99 6.99Q5.99 6.19 6.6 5.61Q7.21 5.02 8.01 5.02L19 5.02ZM15.99 0.98L15.99 3L3.97 3L3.97 17.05L1.99 17.05L1.99 3Q1.99 2.2 2.58 1.59Q3.17 0.98 3.97 0.98L15.99 0.98Z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.03 3Q17.83 3 18.41 3.61Q19 4.22 19 5.02L19 21.04L12 18.03L5 21.04L5 5.02Q5 4.22 5.59 3.61Q6.17 3 6.97 3L17.03 3Z"/></svg>',
  folderOpen: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.03 18.03L20.03 8.03L3.97 8.03L3.97 18.03L20.03 18.03ZM20.03 6.01Q20.83 6.01 21.42 6.62Q22.01 7.23 22.01 8.03L22.01 18.03Q22.01 18.83 21.42 19.44Q20.83 20.05 20.03 20.05L3.97 20.05Q3.17 20.05 2.58 19.44Q1.99 18.83 1.99 18.03L1.99 6.01Q1.99 5.21 2.58 4.6Q3.17 3.99 3.97 3.99L9.98 3.99L12 6.01L20.03 6.01Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8.8335C10.2883 8.8335 8.83337 10.2885 8.83337 12.0002C8.83337 13.7119 10.2883 15.1668 12 15.1668C13.7118 15.1668 15.1667 13.7119 15.1667 12.0002C15.1667 10.2885 13.7118 8.8335 12 8.8335Z"/><path d="M16.0591 2.5H8.02727C4.91818 2.5 2.5 4.91818 2.5 7.94091V15.9727C2.5 19.0818 4.91818 21.5 8.02727 21.5H16.0591C19.0818 21.5 21.5 19.0818 21.5 15.9727V7.94091C21.5 4.91818 19.0818 2.5 16.0591 2.5ZM12 17.0091C9.23636 17.0091 7.07727 14.7636 7.07727 12.0864C7.07727 9.40909 9.23636 7.07727 12 7.07727C14.7636 7.07727 16.9227 9.32273 16.9227 12C16.9227 14.6773 14.7636 17.0091 12 17.0091ZM17.0955 8.11364C16.4909 8.11364 15.9727 7.59545 15.9727 6.99091C15.9727 6.38636 16.4909 5.86818 17.0955 5.86818C17.7 5.86818 18.2182 6.38636 18.2182 6.99091C18.2182 7.59545 17.7 8.11364 17.0955 8.11364Z"/></svg>',
};

const $ = (id) => document.getElementById(id);
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// reels 가운데 첫 릴스로 데모를 시작하고, 스토어 클릭에 실을 데모 진행 단계를 돌려준다
export function initDemo(reels) {
  const phoneWrap = $('phoneWrap'), phone = $('phone'), screen = $('screen'), sbar = $('sbar');
  const scrReel = $('scrReel'), reelBg = $('reelBg'), scrim = $('scrim'), sheet = $('sheet');
  const shareDim = $('shareDim'), shareCard = $('shareCard'), launch = $('launch');
  const scrApp = $('scrApp'), lib = $('lib'), mapScr = $('mapScr'), profile = $('profile'), tabbar = $('tabbar');
  const shareRing = $('shareRing'), ringLabel = $('ringLabel'), ringCount = $('ringCount');
  const posts = $('posts'), places = $('places'), libChips = $('libChips'), libEmpty = $('libEmpty');
  const viewPosts = $('viewPosts'), viewPlaces = $('viewPlaces');
  const mapSvg = $('mapSvg'), pins = $('pins'), mapChips = $('mapChips'), msheet = $('msheet'), mlist = $('mlist'), mdetail = $('mdetail');
  const mapAvatar = $('mapAvatar'), btnMapBack = $('btnMapBack'), btnFinishMap = $('btnFinishMap');
  const scrPost = $('scrPost'), postPlaces = $('postPlaces');
  const scrDetail = $('scrDetail'), dname = $('dname'), dbody = $('dbody'), btnFinishIn = $('btnFinishIn');
  const confirmBox = $('confirm'), endcard = $('endcard'), ptoast = $('ptoast'), hint = $('hint'), hintText = $('hintText');
  const steps = $('steps'), btnAuto = $('btnAuto'), btnFinish = $('btnFinish'), chips = $('chips');

  let reel = reels[0];
  let auto = false;
  // reset마다 올려서, 지난 회차에 걸어 둔 타이머가 새 회차 화면을 건드리지 못하게 한다
  let run = 0;
  let timers = [];
  // feed, sheet, card, launcher, home, post, map, mapDetail, detail, profile, end
  let state = 'feed';
  let analysed = false;
  // 이번 회차에 게시물 상세를 열었는지. 보관함에 돌아왔을 때 다음 안내를 고르는 데 쓴다
  let postSeen = false;
  let libView = 'posts';
  let libCode = ALL;
  let mapCode = ALL;
  let detailFrom = null;
  let hintTarget = null;
  let toastTimer = null;
  let confirmYes = null;
  // 단계 기록은 페이지를 열 때마다 단계별로 한 번만 보내므로 다시 해 보기에도 지우지 않는다
  const reached = {};
  let furthest = 'none';

  /* ---------- 유틸 ---------- */
  const later = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
  const autoLater = (ms, fn) => { const id = run; later(ms, () => { if (auto && id === run) fn(); }); };
  // 같은 회차이고 아직 같은 화면일 때만 할 일
  const laterIn = (ms, expected, fn) => { const id = run; later(ms, () => { if (id === run && state === expected) fn(); }); };
  const stagger = (ms) => (reduceMotion ? 0 : ms);
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const scale = () => parseFloat(getComputedStyle(phone).getPropertyValue('--s')) || 1;

  function fit() {
    const avail = phoneWrap.parentNode.clientWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const byHeight = Math.max(0.8, Math.min(1, (vh - 130) / 720));
    const s = Math.min(1, avail / 360, byHeight);
    phone.style.setProperty('--s', s);
    phoneWrap.style.width = `${360 * s}px`;
    phoneWrap.style.height = `${720 * s}px`;
  }

  function toast(message) {
    ptoast.textContent = message;
    ptoast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ptoast.classList.remove('on'), DELAY.toast);
  }

  function setStep(n) {
    steps.querySelectorAll('.step').forEach((item, i) => {
      item.classList.toggle('on', i === n && n < STEP.done);
      item.classList.toggle('done', i < n || n >= STEP.done);
      if (i === n && n < STEP.done) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  function hideHint() { hint.classList.remove('on'); hintTarget = null; }

  function showHint(target, text, pos) {
    if (!target || target.hidden || !target.getClientRects().length) { hideHint(); return; }
    hintTarget = target;
    hintText.textContent = text;
    hint.className = `hint ${pos || 'top'}`;
    const s = scale(), sr = screen.getBoundingClientRect(), tr = target.getBoundingClientRect();
    const x = (tr.left - sr.left) / s + tr.width / s / 2, y = (tr.top - sr.top) / s + tr.height / s / 2;
    hint.style.left = `${x}px`;
    hint.style.top = `${y}px`;
    const w = hintText.offsetWidth, sw = screen.clientWidth, pad = 12;
    let shift = 0;
    if (pos === 'left' && x - 40 - w < pad) { hint.className = 'hint top'; pos = 'top'; }
    if (pos !== 'left') {
      if (x - w / 2 < pad) shift = pad - (x - w / 2);
      else if (x + w / 2 > sw - pad) shift = (sw - pad) - (x + w / 2);
    }
    hintText.style.marginLeft = `${shift}px`;
    hint.classList.add('on');
  }

  // 화면마다 함께 보이는 층. 장소 상세는 보관함에서 열었을 때만 하단 탭을 둔다
  function showScreen(name) {
    scrReel.hidden = name !== 'reel';
    scrApp.hidden = name !== 'app';
    scrPost.hidden = name !== 'post';
    scrDetail.hidden = name !== 'detail';
    tabbar.hidden = !(name === 'app' || (name === 'detail' && detailFrom === 'lib'));
    sbar.classList.toggle('light', name === 'reel' || name === 'post');
  }

  function askConfirm(title, onYes) {
    $('confirmTitle').textContent = title;
    confirmYes = onYes;
    confirmBox.hidden = false;
  }

  function mark(step) {
    if (reached[step]) return;
    reached[step] = true;
    if (STEPS.indexOf(step) > STEPS.indexOf(furthest)) furthest = step;
    track('demo_step', { step, mode: auto ? 'auto' : 'tap' });
  }

  /* ---------- 릴스 준비 ---------- */
  function setReel(r) {
    reel = r;
    reelBg.className = 'reel-bg photo';
    reelBg.innerHTML = `<img class="blur" src="${r.thumb}" alt=""><img class="fit" src="${r.thumb}" alt="">`;
    $('reelCap').textContent = r.caption;
    $('reelAuthor').textContent = r.author;
    $('reelAv').textContent = r.av;
    $('reelLikes').textContent = r.likes;
    $('reelComments').textContent = r.comments;
    $('sheetThumb').innerHTML = `<img src="${r.thumb}" alt="">`;
    $('sheetTitle').textContent = `${r.author.replace(/^@/, '')}님의 게시물`;
    $('ringThumb').src = r.thumb;
    $('postImg').src = r.thumb;
    $('postAccount').textContent = r.author;
    $('postCaption').textContent = r.caption;
    $('postOrig').href = r.post;
    $('postCount').textContent = r.places.length;
    chips.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('on', chip.dataset.id === r.id));
  }

  /* ---------- 상태 전이 ---------- */
  function reset(r) {
    run++;
    clearTimers();
    hideHint();
    analysed = false;
    postSeen = false;
    detailFrom = null;
    libCode = ALL;
    mapCode = ALL;
    setReel(r || reel);
    scrim.classList.remove('on');
    sheet.classList.remove('on');
    shareDim.hidden = true;
    shareCard.hidden = true;
    shareCard.classList.remove('on');
    launch.hidden = true;
    setRing('pending');
    posts.innerHTML = '';
    places.innerHTML = '';
    postPlaces.innerHTML = '';
    pins.innerHTML = '';
    mlist.innerHTML = '';
    mdetail.innerHTML = '';
    mdetail.hidden = true;
    mlist.hidden = false;
    msheet.classList.remove('on');
    mapAvatar.hidden = false;
    btnMapBack.hidden = true;
    btnFinishMap.hidden = true;
    confirmBox.hidden = true;
    endcard.hidden = true;
    btnFinish.hidden = true;
    ptoast.classList.remove('on');
    $('reportLabel').textContent = '제보하기';
    setLibView('posts', true);
    showTab('lib', true);
    showScreen('reel');
    state = 'feed';
    setStep(STEP.share);
    laterIn(DELAY.hintShare, 'feed', () => showHint($('btnShare'), '공유를 눌러 보세요', 'left'));
    autoLater(DELAY.autoShare, tapShare);
  }

  function tapShare() {
    if (state !== 'feed') return;
    state = 'sheet';
    mark('share');
    hideHint();
    scrim.classList.add('on');
    sheet.classList.add('on');
    laterIn(DELAY.hintYeogidam, 'sheet', () => showHint($('btnYeogidam'), '여기담을 눌러 보세요', 'top'));
    autoLater(DELAY.autoYeogidam, tapYeogidam);
  }

  function closeSheet() {
    if (state !== 'sheet') return;
    state = 'feed';
    hideHint();
    scrim.classList.remove('on');
    sheet.classList.remove('on');
    laterIn(DELAY.hintShare, 'feed', () => showHint($('btnShare'), '공유를 눌러 보세요', 'left'));
  }

  // 앱의 공유 확장처럼 시트가 내려간 자리에 「공유 완료!」 카드가 올라온다
  function tapYeogidam() {
    if (state !== 'sheet') return;
    state = 'card';
    mark('send');
    hideHint();
    setStep(STEP.analysis);
    sheet.classList.remove('on');
    scrim.classList.remove('on');
    laterIn(DELAY.shareCardIn, 'card', () => {
      shareDim.hidden = false;
      shareCard.hidden = false;
      requestAnimationFrame(() => shareCard.classList.add('on'));
      laterIn(DELAY.hintOpenApp, 'card', () => showHint($('btnOpenApp'), '앱에서 보기를 눌러 보세요', 'top'));
      autoLater(DELAY.autoOpenApp, openApp);
      laterIn(DELAY.shareCardClose, 'card', closeShareCard);
    });
  }

  // 누르지 않고 4초가 지나면 카드가 닫히므로, 홈 화면의 여기담 아이콘으로 앱을 연다
  function closeShareCard() {
    state = 'launcher';
    hideHint();
    shareCard.classList.remove('on');
    shareCard.hidden = true;
    shareDim.hidden = true;
    launch.hidden = false;
    laterIn(DELAY.hintLauncher, 'launcher', () => showHint($('btnLaunch'), '이제 여기담 앱을 열어 보세요', 'bottom'));
    autoLater(DELAY.autoLauncher, openApp);
  }

  function openApp() {
    if (state !== 'card' && state !== 'launcher') return;
    state = 'home';
    mark('open_app');
    hideHint();
    shareCard.classList.remove('on');
    shareCard.hidden = true;
    shareDim.hidden = true;
    launch.hidden = true;
    showScreen('app');
    showTab('lib', true);
    const id = run;
    later(DELAY.ringPending, () => { if (id === run && !analysed) setRing('processing'); });
    later(DELAY.ringPending + DELAY.ringProcessing, () => { if (id === run) analysisDone(); });
  }

  function setRing(ringState) {
    shareRing.dataset.state = ringState;
    ringLabel.textContent = { pending: '대기 중', processing: '장소 찾는 중', done: '완료' }[ringState];
    ringCount.textContent = ringState === 'done' ? reel.places.length : '';
  }

  // 분석이 끝나면 최근 공유 링이 「완료」로 바뀌고 게시물 카드가 보관함에 담긴다
  function analysisDone() {
    analysed = true;
    setRing('done');
    renderPosts();
    renderPlaces();
    renderPostPlaces();
    setStep(STEP.library);
    guideLibrary();
  }

  // 보관함에 들어올 때마다 지금 보기와 분석 상태로 다음에 누를 곳을 가리키고, 자동 재생이면 다음 단계를 예약한다.
  // 분석 중에 다른 탭에 다녀오거나 「장소」를 먼저 눌러도 흐름이 끊기지 않게 한곳에서 정한다
  function guideLibrary() {
    if (state !== 'home' || !analysed) return;
    hideHint();
    if (libView === 'places') {
      mark('library');
      laterIn(DELAY.hintMapTab, 'home', () => { if (libView === 'places') showHint($('tabMap'), '지도 탭을 눌러 보세요', 'top'); });
      autoLater(DELAY.autoMapTab, () => { if (state === 'home') showTab('map'); });
    } else if (!postSeen) {
      laterIn(DELAY.hintPost, 'home', () => { if (libView === 'posts') showHint(posts.querySelector('.post-card'), '방금 공유한 게시물을 눌러 보세요', 'top'); });
      autoLater(DELAY.autoPost, () => { if (state === 'home' && libView === 'posts') openPost(); });
    } else {
      laterIn(DELAY.hintPlacesView, 'home', () => { if (libView === 'posts') showHint(viewPlaces, '장소만 모아 볼 수도 있어요', 'bottom'); });
      autoLater(DELAY.autoPlacesView, () => { if (state === 'home') setLibView('places'); });
    }
  }

  function renderPosts() {
    posts.innerHTML = `<button type="button" class="post-card"><img src="${reel.thumb}" alt=""><span class="post-count">${ICON.place}${reel.places.length}</span><b>${esc(reel.title)}</b></button>`;
    const card = posts.querySelector('.post-card');
    card.addEventListener('click', openPost);
    requestAnimationFrame(() => card.classList.add('in'));
    updateLibEmpty();
  }

  const placeRow = (p, extra = '') => `<span class="prow-pic"><img src="${p.img}" alt="" loading="lazy"></span>`
    + `<span class="prow-text"><span class="prow-name"><b>${esc(p.name)}</b><span class="cat-pill">${esc(middleCategory(p.cat))}</span></span>`
    + `<small>${esc(p.road)}</small></span>${extra}`;

  function renderPlaces() {
    places.innerHTML = '';
    if (!analysed) { updateLibEmpty(); return; }
    placesIn(reel.places, libCode).forEach((p) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'prow';
      row.innerHTML = placeRow(p);
      row.addEventListener('click', () => openFullDetail(p, 'lib'));
      places.appendChild(row);
    });
    updateLibEmpty();
  }

  function renderPostPlaces() {
    postPlaces.innerHTML = '';
    reel.places.forEach((p) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'prow';
      row.innerHTML = placeRow(p, `<span class="prow-bm" aria-label="저장한 장소">${ICON.bookmark}</span>`);
      row.addEventListener('click', () => openFullDetail(p, 'post'));
      postPlaces.appendChild(row);
    });
  }

  // 보관함 안 빈 결과: 아직 분석 전이거나 고른 칩에 장소가 없을 때
  function updateLibEmpty() {
    let title = '', text = '';
    if (libView === 'posts' && !analysed) {
      title = '담긴 게시물이 아직 없어요';
      text = '릴스를 공유하고 게시물을 담아보세요.';
    } else if (libView === 'places' && !analysed) {
      title = '아직 저장한 장소가 없어요';
      text = '릴스를 공유하고 마음에 드는 장소를 담아보세요.';
    } else if (libView === 'places' && !placesIn(reel.places, libCode).length) {
      title = `${categoryOf(libCode).name} 카테고리에 저장한 장소가 없어요`;
      text = '다른 카테고리를 골라보세요.';
    }
    libEmpty.hidden = !title;
    $('libEmptyTitle').textContent = title;
    $('libEmptyText').textContent = text;
  }

  function renderChips(box, selected, onPick) {
    box.innerHTML = [{ code: ALL, name: '전체' }, ...CATEGORIES]
      .map((c) => `<button type="button" class="cat-chip${c.code === selected ? ' on' : ''}" data-code="${c.code}" aria-pressed="${c.code === selected}">${esc(c.name)}</button>`)
      .join('');
    box.onclick = (e) => {
      const chip = e.target.closest('.cat-chip');
      if (chip) onPick(chip.dataset.code);
    };
  }

  function setLibView(view, silent) {
    libView = view;
    [viewPosts, viewPlaces].forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    posts.hidden = view !== 'posts';
    places.hidden = view !== 'places';
    libChips.hidden = view !== 'places';
    if (view === 'places') renderChips(libChips, libCode, pickLibCategory);
    updateLibEmpty();
    if (!silent) guideLibrary();
  }

  function pickLibCategory(code) {
    libCode = code;
    renderChips(libChips, libCode, pickLibCategory);
    renderPlaces();
  }

  function openPost() {
    if (!analysed || state !== 'home') return;
    state = 'post';
    postSeen = true;
    mark('result');
    hideHint();
    showScreen('post');
    laterIn(DELAY.hintPostBack, 'post', () => showHint($('btnPostBack'), '보관함으로 돌아가 장소를 모아 봐요', 'bottom'));
    autoLater(DELAY.autoPostBack, closePost);
  }

  function closePost() {
    if (state !== 'post') return;
    state = 'home';
    hideHint();
    showScreen('app');
    showTab('lib', true);
    guideLibrary();
  }

  function showTab(name, silent) {
    lib.hidden = name !== 'lib';
    mapScr.hidden = name !== 'map';
    profile.hidden = name !== 'profile';
    if (name !== 'map') leaveMapDetail();
    tabbar.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
    if (silent) return;
    hideHint();
    if (name === 'map') {
      state = 'map';
      setStep(STEP.map);
      mark('map');
      renderMap();
    } else if (name === 'lib') {
      state = 'home';
      guideLibrary();
    } else {
      state = 'profile';
    }
  }

  /* ---------- 지도 ---------- */
  function renderMap() {
    leaveMapDetail();
    mapSvg.innerHTML = mapSVG(reel);
    renderChips(mapChips, mapCode, pickMapCategory);
    drawPins(true);
    later(DELAY.mapSheetUp + reel.places.length * DELAY.pinStagger, () => msheet.classList.add('on'));
    const id = run;
    later(DELAY.hintPin + reel.places.length * DELAY.pinStagger, () => {
      if (id !== run || state !== 'map') return;
      const first = pins.querySelector('.pin');
      if (first) showHint(first, '핀을 눌러 보세요', 'top');
    });
    autoLater(DELAY.autoPin + reel.places.length * DELAY.pinStagger, () => {
      const first = placesIn(reel.places, mapCode)[0];
      if (state === 'map' && first) openMapDetail(first);
    });
  }

  function drawPins(drop) {
    const id = run;
    pins.innerHTML = '';
    mlist.innerHTML = '';
    placesIn(reel.places, mapCode).forEach((p, i) => {
      const pin = document.createElement('button');
      pin.type = 'button';
      // 지도를 처음 열 때만 핀이 차례로 튀어나오고, 칩으로 다시 거를 때는 바로 보인다
      pin.className = drop ? 'pin' : 'pin shown';
      pin.style.left = `${p.x}%`;
      pin.style.top = `${p.y}%`;
      pin.dataset.name = p.name;
      pin.setAttribute('aria-label', p.name);
      pin.innerHTML = `<img src="${categoryOf(p.code).icon}" alt=""><span class="pin-name">${esc(p.name)}</span>`;
      pin.addEventListener('click', () => openMapDetail(p));
      pins.appendChild(pin);
      if (drop) later(DELAY.pinDrop + stagger(i * DELAY.pinStagger), () => { if (id === run) pin.classList.add('drop'); });
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'prow';
      row.innerHTML = placeRow(p);
      row.addEventListener('click', () => openMapDetail(p));
      mlist.appendChild(row);
    });
  }

  function pickMapCategory(code) {
    hideHint();
    mapCode = code;
    renderChips(mapChips, mapCode, pickMapCategory);
    if (state === 'mapDetail') { leaveMapDetail(); state = 'map'; }
    drawPins(false);
  }

  // 지도에서는 앱처럼 아래 시트 안에서 상세가 열리고, 고른 핀이 커지며 이름이 붙는다
  function openMapDetail(p) {
    state = 'mapDetail';
    mark('detail');
    hideHint();
    pins.querySelectorAll('.pin').forEach((pin) => pin.classList.toggle('sel', pin.dataset.name === p.name));
    mdetail.innerHTML = `<div class="dtitle"><b>${esc(p.name)}</b>${detailIcons()}</div>${detailBody(p)}`;
    mlist.hidden = true;
    mdetail.hidden = false;
    msheet.classList.add('on');
    mapAvatar.hidden = true;
    btnMapBack.hidden = false;
    btnFinishMap.hidden = false;
    btnFinish.hidden = false;
    autoLater(DELAY.autoFinish, () => { if (state === 'mapDetail') finish(); });
    if (!auto) laterIn(DELAY.hintFinish, 'mapDetail', () => showHint(btnFinishMap, '다 봤으면 여기를 눌러요', 'bottom'));
  }

  function leaveMapDetail() {
    pins.querySelectorAll('.pin').forEach((pin) => pin.classList.remove('sel'));
    mdetail.hidden = true;
    mlist.hidden = false;
    mapAvatar.hidden = false;
    btnMapBack.hidden = true;
    btnFinishMap.hidden = true;
  }

  function backFromMapDetail() {
    if (state !== 'mapDetail') return;
    hideHint();
    leaveMapDetail();
    state = 'map';
  }

  /* ---------- 장소 상세(앱 구성: 카테고리, 주소, 버튼 두 개, 사진, 게시물과 정보 탭) ---------- */
  const detailIcons = () => `<span class="dicons"><button type="button" class="dic" aria-label="폴더에 담기">${ICON.folderOpen}</button>`
    + `<button type="button" class="dic bm" aria-label="장소 북마크 해제하기">${ICON.bookmark}</button></span>`;

  function detailBody(p) {
    const lines = `<div class="iline"><span class="k">도로명</span><span class="v">${esc(p.road)}</span><button type="button" data-msg="도로명 주소가 복사되었습니다." data-copy="${esc(p.road)}">복사</button></div>`
      + `<div class="iline"><span class="k">지번</span><span class="v">${esc(p.lot)}</span><button type="button" data-msg="지번 주소가 복사되었습니다." data-copy="${esc(p.lot)}">복사</button></div>`;
    return '<div class="dmeta">'
      + `<div class="drow">${ICON.sell}<span>${esc(middleCategory(p.cat))}</span></div>`
      + `<div class="drow addr">${ICON.place}<span>${esc(p.road)}</span></div>`
      + `<div class="dacts"><a class="dact kakao" href="${p.url}" target="_blank" rel="noopener" aria-label="카카오맵에서 보기(새 창)"><b>K</b>카카오맵</a>`
      + `<button type="button" class="dact copy" data-msg="도로명 주소가 복사되었습니다." data-copy="${esc(p.road)}">${ICON.copy}주소 복사</button></div>`
      + '</div>'
      + `<div class="dphoto"><img src="${p.img}" alt=""></div>`
      + '<div class="dtabs"><button type="button" class="on" data-dtab="posts">게시물</button><button type="button" data-dtab="info">정보</button></div>'
      + `<div class="dposts"><a class="dpost" href="${reel.post}" target="_blank" rel="noopener"><div class="pt"><img src="${reel.thumb}" alt=""></div>`
      + `<span class="dacc">${ICON.instagram}${esc(reel.author)}</span><b class="dcap">${esc(reel.title)}</b></a></div>`
      + `<div class="dinfo" hidden><div class="irow"><span class="iic">${ICON.place}</span><div class="ilines">${lines}</div></div></div>`;
  }

  function setDetailTab(box, name) {
    box.querySelectorAll('.dtabs button').forEach((b) => b.classList.toggle('on', b.dataset.dtab === name));
    box.querySelector('.dposts').hidden = name !== 'posts';
    box.querySelector('.dinfo').hidden = name !== 'info';
  }

  // 보관함 장소 목록이나 게시물 상세의 장소를 누르면 전체 화면 상세가 열린다
  function openFullDetail(p, from) {
    detailFrom = from;
    state = 'detail';
    mark('detail');
    hideHint();
    dname.textContent = p.name;
    dbody.innerHTML = detailBody(p);
    showScreen('detail');
    btnFinish.hidden = false;
    autoLater(DELAY.autoFinish, () => { if (state === 'detail') finish(); });
    if (!auto) laterIn(DELAY.hintFinish, 'detail', () => showHint(btnFinishIn, '다 봤으면 여기를 눌러요', 'top'));
  }

  function backFromDetail() {
    if (state !== 'detail') return;
    hideHint();
    if (detailFrom === 'post') {
      state = 'post';
      showScreen('post');
    } else {
      state = 'home';
      showScreen('app');
      showTab('lib', true);
      guideLibrary();
    }
  }

  function finish(title, text) {
    hideHint();
    clearTimers();
    setStep(STEP.done);
    mark('end');
    btnFinish.hidden = true;
    $('endTitle').textContent = title || '진짜 내 릴스로 해 보세요';
    $('endText').textContent = text || '저장해 둔 릴스를 여기담에 공유하면 지금처럼 지도에 담겨요.';
    endcard.hidden = false;
    state = 'end';
    if (auto) {
      auto = false;
      btnAuto.textContent = '자동으로 보기';
      btnAuto.classList.remove('btn-dark');
      btnAuto.classList.add('btn-soft');
    }
    endcard.querySelector('.ecard').scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 지도 그림 ---------- */
  function mapSVG(r){
    var s='<svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice" role="img" aria-label="지도">';
    s+='<rect width="360" height="720" fill="#f3f2ec"/>';
    for (var y=-20;y<720;y+=64) for (var x=-20;x<360;x+=62) s+='<rect x="'+(x+6)+'" y="'+(y+6)+'" width="50" height="52" rx="6" fill="#e8e6de"/>';
    s+='<ellipse cx="300" cy="420" rx="90" ry="60" fill="#cfe3cf"/>'+(r.map==='metro' ? '' : '<ellipse cx="40" cy="120" rx="50" ry="40" fill="#cfe3cf"/>');
    var roads=[[0,210,360,210],[178,0,178,720],[0,330,360,330],[90,0,90,720],[270,0,270,720],[0,80,360,80],[0,520,360,520]];
    roads.forEach(function(rd){ s+='<line x1="'+rd[0]+'" y1="'+rd[1]+'" x2="'+rd[2]+'" y2="'+rd[3]+'" stroke="#d9d6cc" stroke-width="14"/><line x1="'+rd[0]+'" y1="'+rd[1]+'" x2="'+rd[2]+'" y2="'+rd[3]+'" stroke="#ffffff" stroke-width="10"/>'; });
    if (r.map==='metro'){
      s+='<path d="M-10,52 C60,30 120,70 190,48 C260,26 310,60 370,40 L370,-10 L-10,-10 Z" fill="#b9d7f0"/>';
      s+='<path d="M-10,52 C60,30 120,70 190,48 C260,26 310,60 370,40" fill="none" stroke="#ffffff" stroke-width="6"/>';
      s+='<text x="180" y="26" font-size="12" fill="#4a6f90" font-weight="700" text-anchor="middle">한강</text>';
      s+='<text x="262" y="188" font-size="13" fill="#5b5b66" font-weight="700" text-anchor="middle">강남구</text>';
      s+='<text x="80" y="214" font-size="13" fill="#5b5b66" font-weight="700" text-anchor="middle">서초구</text>';
      s+='<text x="318" y="124" font-size="13" fill="#5b5b66" font-weight="700" text-anchor="middle">강동구</text>';
      s+='<text x="52" y="300" font-size="12" fill="#5b5b66" font-weight="700" text-anchor="middle">수원</text>';
      s+='<text x="240" y="282" font-size="12" fill="#5b5b66" font-weight="700" text-anchor="middle">용인</text>';
      s+='<text x="320" y="312" font-size="12" fill="#5b5b66" font-weight="700" text-anchor="middle">청주</text>';
    } else {
      s+='<path d="M310,-10 C330,120 300,260 330,400 C350,520 320,640 340,730" fill="none" stroke="#b9d7f0" stroke-width="18"/>';
      s+='<line x1="0" y1="210" x2="360" y2="210" stroke="#996cac" stroke-width="4"/><line x1="178" y1="0" x2="178" y2="720" stroke="#747f00" stroke-width="4"/>';
      s+='<circle cx="178" cy="210" r="9" fill="#fff" stroke="#1a1a2e" stroke-width="3"/>';
      s+='<rect x="146" y="226" width="64" height="20" rx="10" fill="#fff" stroke="#e5e5ea"/><text x="178" y="240" font-size="12" fill="#1a1a2e" font-weight="800" text-anchor="middle">'+esc(r.mapLabel)+'</text>';
      s+='<text x="300" y="130" font-size="13" fill="#5b5b66" font-weight="700" text-anchor="middle">중곡동</text><text x="60" y="440" font-size="13" fill="#5b5b66" font-weight="700">군자동</text><text x="300" y="424" font-size="12" fill="#4f7a4f" font-weight="700" text-anchor="middle">어린이대공원</text>';
    }
    return s+'</svg>';
  }

  /* ---------- 이벤트 ---------- */
  $('btnShare').addEventListener('click', tapShare);
  $('btnYeogidam').addEventListener('click', tapYeogidam);
  scrim.addEventListener('click', closeSheet);
  $('btnOpenApp').addEventListener('click', openApp);
  shareDim.addEventListener('click', () => { if (state === 'card') closeShareCard(); });
  $('btnLaunch').addEventListener('click', openApp);
  shareRing.addEventListener('click', () => {
    if (analysed) openPost();
    else toast('장소를 찾고 있어요.');
  });
  $('btnAddLink').addEventListener('click', () => toast('링크를 붙여 넣어 직접 추가할 수도 있어요'));
  viewPosts.addEventListener('click', () => setLibView('posts'));
  viewPlaces.addEventListener('click', () => setLibView('places'));
  $('btnPostBack').addEventListener('click', closePost);
  $('btnReport').addEventListener('click', () => askConfirm('제보할까요?', () => {
    toast('데모에서는 바로 제보 완료로 표시해요');
    $('reportLabel').textContent = '제보 완료';
  }));
  $('btnBack').addEventListener('click', backFromDetail);
  btnMapBack.addEventListener('click', backFromMapDetail);
  $('confirmNo').addEventListener('click', () => { confirmBox.hidden = true; confirmYes = null; });
  $('confirmYes').addEventListener('click', () => {
    confirmBox.hidden = true;
    const onYes = confirmYes;
    confirmYes = null;
    if (onYes) onYes();
  });
  btnFinishIn.addEventListener('click', () => finish());
  btnFinishMap.addEventListener('click', () => finish());
  screen.addEventListener('click', (e) => {
    const inert = e.target.closest('.reel-acts button:not(#btnShare), .apps .app-ic:not(.me), .sheet-row, .search, .recent-more, .lib-edit, .plist div, .locbtn, #mapSeg button:not(.on), .dic');
    if (inert) { toast(DEMO_ONLY); return; }
    const tabButton = e.target.closest('.dtabs button');
    if (tabButton) { setDetailTab(tabButton.closest('.dtabs').parentNode, tabButton.dataset.dtab); return; }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const { msg, copy: text } = copy.dataset;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(msg), () => toast(msg));
      else toast(msg);
    }
  });
  tabbar.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    if (!analysed && t.dataset.tab === 'map') { toast('장소를 확인하는 중이에요. 잠시만요'); return; }
    if (state === 'detail') { hideHint(); showScreen('app'); }
    showTab(t.dataset.tab);
  });
  btnFinish.addEventListener('click', () => finish());
  $('btnAgain').addEventListener('click', () => reset(reel));
  $('btnOther').addEventListener('click', () => reset(reels[(reels.indexOf(reel) + 1) % reels.length]));
  $('btnReset').addEventListener('click', () => reset(reel));
  btnAuto.addEventListener('click', () => {
    auto = !auto;
    btnAuto.textContent = auto ? '자동 재생 멈추기' : '자동으로 보기';
    btnAuto.classList.toggle('btn-dark', auto);
    btnAuto.classList.toggle('btn-soft', !auto);
    if (auto) reset(reel);
  });
  reels.forEach((r) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.id = r.id;
    chip.textContent = r.chip;
    chip.addEventListener('click', () => { reset(r); phoneWrap.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
    chips.appendChild(chip);
  });

  if (window.ResizeObserver) new ResizeObserver(fit).observe(phoneWrap.parentNode);
  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  fit();
  window.addEventListener('resize', () => {
    if (!hintTarget) return;
    const pos = hint.classList.contains('left') ? 'left' : (hint.classList.contains('bottom') ? 'bottom' : 'top');
    showHint(hintTarget, hintText.textContent, pos);
  });
  reset(reels[0]);

  return { progress: () => furthest };
}
