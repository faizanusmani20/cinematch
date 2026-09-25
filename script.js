
const API_PROXY_BASE = 'https://cinematch-proxy.faizanusmani020.workers.dev';
const IMG_L = 'https://image.tmdb.org/t/p/w500';
const IMG_M = 'https://image.tmdb.org/t/p/w342';

const GENRE_META = {
  Action:{color1:'#ff3d5a',color2:'#8f1c30',icon:'fa-explosion'},
  Adventure:{color1:'#2fa6a6',color2:'#0e4a4a',icon:'fa-mountain-sun'},
  Animation:{color1:'#3ecf9e',color2:'#0e6b4c',icon:'fa-palette'},
  Comedy:{color1:'#f5c24d',color2:'#a97a10',icon:'fa-face-laugh-beam'},
  Crime:{color1:'#b3401f',color2:'#3d1408',icon:'fa-fingerprint'},
  Documentary:{color1:'#5c6470',color2:'#1b1e24',icon:'fa-video'},
  Drama:{color1:'#5b7cf0',color2:'#20326f',icon:'fa-masks-theater'},
  Family:{color1:'#ff8fb3',color2:'#8f2453',icon:'fa-people-roof'},
  Fantasy:{color1:'#9b6cf0',color2:'#3f2379',icon:'fa-hat-wizard'},
  History:{color1:'#a9793f',color2:'#402c14',icon:'fa-landmark'},
  Horror:{color1:'#8a1f2b',color2:'#1a0507',icon:'fa-ghost'},
  Music:{color1:'#c46cf0',color2:'#4a2379',icon:'fa-music'},
  Mystery:{color1:'#4a4e63',color2:'#14151c',icon:'fa-magnifying-glass'},
  Romance:{color1:'#ff6fa5',color2:'#8f2453',icon:'fa-heart'},
  'Science Fiction':{color1:'#7c6cf0',color2:'#3d2f8f',icon:'fa-satellite'},
  'TV Movie':{color1:'#6c7cf0',color2:'#232f79',icon:'fa-tv'},
  Thriller:{color1:'#2b2f3a',color2:'#0d0f14',icon:'fa-user-secret'},
  War:{color1:'#6b7a3f',color2:'#242c14',icon:'fa-jet-fighter-up'},
  Western:{color1:'#c08a4f',color2:'#4a3014',icon:'fa-hat-cowboy'},
};
const MOOD_MAP = {
  Happy:['Comedy','Family','Animation'],
  Sad:['Drama','War'],
  Excited:['Action','Adventure'],
  Romantic:['Romance'],
  Thrilled:['Thriller','Horror','Mystery'],
  Relaxed:['Comedy','Family','Music'],
  Adventurous:['Adventure','Fantasy','Science Fiction'],
  Nostalgic:['Drama','History','Music'],
};
const MOODS = [
  {id:'Happy',icon:'fa-face-grin-stars'},{id:'Sad',icon:'fa-cloud-rain'},
  {id:'Excited',icon:'fa-bolt'},{id:'Romantic',icon:'fa-heart'},
  {id:'Thrilled',icon:'fa-skull'},{id:'Relaxed',icon:'fa-mug-hot'},
  {id:'Adventurous',icon:'fa-compass'},{id:'Nostalgic',icon:'fa-record-vinyl'},
];

let GENRE_BY_ID = {};   // id -> name
let GENRE_NAME_TO_ID = {};

/* =========================================================
   STATE
   ========================================================= */
let state = {
  genreScore: {},          // genreId -> weight
  likedCount: 0,
  swipedCount: 0,
  watchlist: [],           // array of movie objects
  activeMood: null,
  activeGenreIds: new Set(),
  search: '',
  gridPage: 1,
  gridResults: [],
  gridHasMore: false,
  deckPool: [],
  deckSwipedIds: new Set(),
  history: [],
};

const K_SCORE = 'cinematch:genrescore';
const K_LIKED = 'cinematch:likedcount';
const K_SWIPED = 'cinematch:swipedcount';
const K_WATCHLIST = 'cinematch:watchlist';

async function loadPersisted(){
  try{ const r = await window.storage.get(K_SCORE); if(r && r.value) state.genreScore = JSON.parse(r.value); }catch(e){}
  try{ const r = await window.storage.get(K_LIKED); if(r && r.value) state.likedCount = Number(r.value); }catch(e){}
  try{ const r = await window.storage.get(K_SWIPED); if(r && r.value) state.swipedCount = Number(r.value); }catch(e){}
  try{ const r = await window.storage.get(K_WATCHLIST); if(r && r.value) state.watchlist = JSON.parse(r.value); }catch(e){}
}
async function persistScore(){ try{ await window.storage.set(K_SCORE, JSON.stringify(state.genreScore)); }catch(e){} }
async function persistCounts(){
  try{ await window.storage.set(K_LIKED, String(state.likedCount)); }catch(e){}
  try{ await window.storage.set(K_SWIPED, String(state.swipedCount)); }catch(e){}
}
async function persistWatchlist(){ try{ await window.storage.set(K_WATCHLIST, JSON.stringify(state.watchlist)); }catch(e){} }

/* =========================================================
   TMDB FETCH HELPERS
   ========================================================= */
async function tmdb(path, params={}){
  const url = new URL(API_PROXY_BASE + path);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if(!res.ok){
    let msg = 'Request failed (' + res.status + ')';
    try{ const j = await res.json(); if(j.status_message) msg = j.status_message; else if(j.error) msg = j.error; }catch(e){}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.json();
}
async function loadGenres(){
  const data = await tmdb('/genre/movie/list');
  GENRE_BY_ID = {}; GENRE_NAME_TO_ID = {};
  data.genres.forEach(g => { GENRE_BY_ID[g.id] = g.name; GENRE_NAME_TO_ID[g.name] = g.id; });
}

/* =========================================================
   UTIL
   ========================================================= */
function genreMetaByName(name){ return GENRE_META[name] || {color1:'#3a3f52',color2:'#14151c',icon:'fa-film'}; }
function primaryGenreName(genreIds){
  if(!genreIds || !genreIds.length) return null;
  return GENRE_BY_ID[genreIds[0]] || null;
}
function posterStyleFor(genreIds){
  const name = primaryGenreName(genreIds);
  const g = genreMetaByName(name);
  return `background: linear-gradient(155deg, ${g.color1}, ${g.color2});`;
}
function moodToGenreIds(mood){
  const names = MOOD_MAP[mood] || [];
  return names.map(n => GENRE_NAME_TO_ID[n]).filter(Boolean);
}
function matchScore(genreIds){
  const total = Object.values(state.genreScore).reduce((a,b)=>a+b,0);
  if(total === 0 || !genreIds || !genreIds.length) return 0;
  let sum = 0;
  genreIds.forEach(id => sum += (state.genreScore[id]||0));
  return Math.min(100, Math.round((sum / (genreIds.length * total)) * 100 * genreIds.length));
}
function topGenreIds(n=5){
  return Object.entries(state.genreScore).map(([id,v]) => [Number(id), v]).sort((a,b)=>b[1]-a[1]).slice(0,n);
}
function showToast(msg, icon='fa-circle-check', isError=false){
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.querySelector('i').className = `fa-solid ${icon}`;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> t.classList.remove('show'), 2800);
}
function fireConfetti(){
  if(typeof confetti === 'function'){ confetti({ particleCount:90, spread:70, origin:{y:0.7}, colors:['#ff3d5a','#f5c24d','#7c6cf0','#3ecf9e'] }); }
}
function posterUrl(path, size){ return path ? (size||IMG_M) + path : null; }

/* =========================================================
   HERO STACK + TICKER (uses now-playing/popular)
   ========================================================= */
async function loadHeroAndTicker(){
  try{
    const trending = await tmdb('/trending/movie/week');
    const list = trending.results.slice(0, 16);
    const ticker = document.getElementById('ticker');
    const items = [...list, ...list].map(m => `<span><i class="fa-solid fa-star"></i>${m.title} · ${(m.vote_average||0).toFixed(1)}</span>`).join('');
    ticker.innerHTML = items;

    const cards = document.querySelectorAll('#heroStack .stack-card');
    list.slice(0,3).forEach((m,i) => {
      if(cards[i] && m.backdrop_path) cards[i].style.backgroundImage = `url(${posterUrl(m.backdrop_path, IMG_L)})`;
    });
  }catch(e){ /* ticker is decorative; fail silently */ }
}

/* =========================================================
   MOOD + GENRE CHIPS
   ========================================================= */
function renderMoodChips(){
  const row = document.getElementById('moodRow');
  row.innerHTML = MOODS.map(m => `<button class="chip" data-mood="${m.id}"><i class="fa-solid ${m.icon}"></i>${m.id}</button>`).join('');
  row.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const mood = chip.dataset.mood;
      state.activeMood = state.activeMood === mood ? null : mood;
      row.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.mood === state.activeMood));
      loadGrid(true);
    });
  });
}
function renderGenreChips(){
  const row = document.getElementById('genreRow');
  const names = Object.keys(GENRE_NAME_TO_ID).filter(n => GENRE_META[n]).sort();
  row.innerHTML = names.map(name => `<button class="chip" data-gid="${GENRE_NAME_TO_ID[name]}"><i class="fa-solid ${genreMetaByName(name).icon}"></i>${name}</button>`).join('');
  row.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const gid = Number(chip.dataset.gid);
      if(state.activeGenreIds.has(gid)) state.activeGenreIds.delete(gid); else state.activeGenreIds.add(gid);
      chip.classList.toggle('active');
      loadGrid(true);
    });
  });
}

/* =========================================================
   GRID (discover / search, live from TMDB)
   ========================================================= */
function movieCardHtml(m){
  const score = matchScore(m.genre_ids);
  const inWatchlist = state.watchlist.some(w => w.id === m.id);
  const gname = primaryGenreName(m.genre_ids);
  const gmeta = genreMetaByName(gname);
  const year = (m.release_date || '').slice(0,4) || '—';
  const poster = posterUrl(m.poster_path, IMG_M);
  return `
    <div class="card" data-id="${m.id}" data-aos="fade-up" data-aos-duration="500">
      <div class="poster" style="${!poster ? posterStyleFor(m.genre_ids) : ''}">
        ${poster ? `<img src="${poster}" alt="${m.title} poster" loading="lazy" />` : `<i class="fa-solid ${gmeta.icon}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:56px;color:rgba(255,255,255,0.9);"></i>`}
        ${score >= 55 ? `<span class="match-pill">${score}% match</span>` : ''}
        <span class="rating-pill"><i class="fa-solid fa-star"></i> ${(m.vote_average||0).toFixed(1)}</span>
        <span class="genre-badge" style="background:${gmeta.color1}"><i class="fa-solid ${gmeta.icon}"></i></span>
        <button class="heart-btn ${inWatchlist ? 'active':''}" data-heart="${m.id}"><i class="fa-solid fa-bookmark"></i></button>
      </div>
      <div class="body">
        <h4>${m.title}</h4>
        <div class="meta">${year}${gname ? ' · ' + gname : ''}</div>
        <div class="tag-row">${(m.genre_ids||[]).slice(0,3).map(id => `<span>${GENRE_BY_ID[id]||''}</span>`).join('')}</div>
      </div>
    </div>`;
}
async function loadGrid(reset){
  if(reset){ state.gridPage = 1; state.gridResults = []; }
  const grid = document.getElementById('grid');
  const emptyState = document.getElementById('emptyState');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  if(reset){
    grid.innerHTML = Array.from({length:8}).map(()=>'<div class="skeleton"></div>').join('');
    emptyState.style.display = 'none';
  }
  try{
    let data;
    if(state.search.trim()){
      data = await tmdb('/search/movie', { query: state.search.trim(), page: state.gridPage, include_adult:false });
    } else if(state.activeGenreIds.size){
      data = await tmdb('/discover/movie', { with_genres: [...state.activeGenreIds].join(','), sort_by:'popularity.desc', page: state.gridPage });
    } else if(state.activeMood){
      const ids = moodToGenreIds(state.activeMood);
      data = await tmdb('/discover/movie', { with_genres: ids.join('|'), sort_by:'popularity.desc', page: state.gridPage });
    } else {
      data = await tmdb('/discover/movie', { sort_by:'popularity.desc', page: state.gridPage });
    }
    const results = (data.results || []).filter(m => m.poster_path || m.genre_ids?.length);
    state.gridResults = reset ? results : [...state.gridResults, ...results];
    state.gridHasMore = state.gridPage < (data.total_pages || 1) && state.gridPage < 20;

    grid.innerHTML = state.gridResults.map(movieCardHtml).join('');
    emptyState.style.display = state.gridResults.length ? 'none' : 'block';
    loadMoreWrap.style.display = state.gridHasMore ? 'flex' : 'none';
    attachGridHandlers();
    if(window.AOS) AOS.refreshHard();
  }catch(e){
    grid.innerHTML = '';
    showToast('Could not load movies: ' + e.message, 'fa-circle-exclamation', true);
  }
}
function attachGridHandlers(){
  document.querySelectorAll('#grid .card').forEach(card => {
    const id = Number(card.dataset.id);
    card.addEventListener('click', (e) => { if(e.target.closest('[data-heart]')) return; openModal(id); });
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `rotateY(${x*8}deg) rotateX(${-y*8}deg)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = 'rotateY(0) rotateX(0)'; });
  });
  document.querySelectorAll('#grid [data-heart]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleWatchlistFromGrid(Number(btn.dataset.heart)); });
  });
}
function toggleWatchlistFromGrid(id){
  const m = state.gridResults.find(mv => mv.id === id) || state.deckPool.find(mv => mv.id === id);
  if(m) toggleWatchlist(m);
}

/* =========================================================
   SWIPE DECK
   ========================================================= */
async function initDeck(){
  const deck = document.getElementById('deck');
  deck.innerHTML = `<div class="skeleton" style="width:300px;height:430px;"></div>`;
  try{
    const [p1, p2] = await Promise.all([ tmdb('/movie/popular',{page:1}), tmdb('/movie/popular',{page:2}) ]);
    let pool = [...p1.results, ...p2.results].filter(m => m.poster_path);
    for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    state.deckPool = pool;
    renderDeck();
  }catch(e){
    deck.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Couldn't load the swipe deck: ${e.message}</p></div>`;
  }
}
function currentDeckQueue(){
  return state.deckPool.filter(m => !state.deckSwipedIds.has(m.id));
}
function renderDeck(){
  const deck = document.getElementById('deck');
  const queue = currentDeckQueue();
  deck.innerHTML = '';
  if(queue.length === 0){
    deck.innerHTML = `<div class="empty-state"><i class="fa-solid fa-film"></i><p>You've rated every film in this batch! Check your matches below, or refresh for more.</p></div>`;
    return;
  }
  const visible = queue.slice(0, 3);
  visible.slice().reverse().forEach((m, i) => {
    const depth = visible.length - 1 - i;
    const card = document.createElement('div');
    card.className = 'swipe-card';
    card.style.cssText = `background-image:url(${posterUrl(m.poster_path, IMG_L)}); z-index:${10-depth}; transform: scale(${1 - depth*0.05}) translateY(${depth*14}px);`;
    card.dataset.id = m.id;
    const year = (m.release_date||'').slice(0,4);
    const gname = primaryGenreName(m.genre_ids) || '';
    card.innerHTML = `
      <span class="poster-tag"><i class="fa-solid fa-star" style="color:#f5c24d;"></i> ${(m.vote_average||0).toFixed(1)}</span>
      <div class="stamp like">LIKE</div>
      <div class="stamp nope">NOPE</div>
      <div class="info"><h3>${m.title}</h3><p>${year}${gname ? ' · ' + gname : ''}</p></div>`;
    deck.appendChild(card);
    if(depth === 0) attachSwipeHandlers(card, m);
  });
}
function attachSwipeHandlers(card, movie){
  let startX=0, startY=0, curX=0, curY=0, dragging=false;
  const likeStamp = card.querySelector('.stamp.like');
  const nopeStamp = card.querySelector('.stamp.nope');
  function pointerDown(e){ dragging = true; startX = (e.touches?e.touches[0].clientX:e.clientX); startY = (e.touches?e.touches[0].clientY:e.clientY); card.style.transition='none'; card.style.cursor='grabbing'; }
  function pointerMove(e){
    if(!dragging) return;
    const x = (e.touches?e.touches[0].clientX:e.clientX), y = (e.touches?e.touches[0].clientY:e.clientY);
    curX = x-startX; curY = y-startY;
    card.style.transform = `translate(${curX}px, ${curY}px) rotate(${curX/20}deg)`;
    likeStamp.style.opacity = Math.min(1, curX/100);
    nopeStamp.style.opacity = Math.min(1, -curX/100);
  }
  function pointerUp(){
    if(!dragging) return;
    dragging = false; card.style.transition=''; card.style.cursor='grab';
    if(curX > 110) swipeAway(1);
    else if(curX < -110) swipeAway(-1);
    else { card.style.transform=''; likeStamp.style.opacity=0; nopeStamp.style.opacity=0; }
    curX = 0; curY = 0;
  }
  function swipeAway(dir){
    card.style.transform = `translate(${dir*700}px, ${curY}px) rotate(${dir*40}deg)`;
    card.style.opacity = '0';
    setTimeout(() => handleSwipe(movie, dir), 280);
  }
  card.addEventListener('mousedown', pointerDown);
  window.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  card.addEventListener('touchstart', pointerDown, {passive:true});
  card.addEventListener('touchmove', pointerMove, {passive:true});
  card.addEventListener('touchend', pointerUp);
}
function handleSwipe(movie, dir){
  state.history.push({ movie, liked: dir===1, prevScore: {...state.genreScore} });
  state.deckSwipedIds.add(movie.id);
  state.swipedCount++;
  if(dir === 1){
    state.likedCount++;
    (movie.genre_ids||[]).forEach(id => state.genreScore[id] = (state.genreScore[id]||0) + 1);
    showToast(`Liked "${movie.title}"`, 'fa-heart');
  }
  persistScore(); persistCounts();
  renderDeck(); renderTasteBars(); loadGrid(true); renderStats();
}
function programmaticSwipe(dir){
  const deck = document.getElementById('deck');
  const topCard = deck.querySelector('.swipe-card:last-child');
  const id = Number(topCard?.dataset.id);
  const movie = state.deckPool.find(m => m.id === id);
  if(!movie || !topCard) return;
  topCard.style.transition = 'transform .35s ease, opacity .35s ease';
  topCard.style.transform = `translate(${dir*700}px, -30px) rotate(${dir*40}deg)`;
  topCard.style.opacity = '0';
  setTimeout(() => handleSwipe(movie, dir), 280);
}
function undoSwipe(){
  const last = state.history.pop();
  if(!last){ showToast('Nothing to undo', 'fa-circle-info'); return; }
  state.deckSwipedIds.delete(last.movie.id);
  state.swipedCount = Math.max(0, state.swipedCount - 1);
  if(last.liked) state.likedCount = Math.max(0, state.likedCount - 1);
  state.genreScore = last.prevScore;
  persistScore(); persistCounts();
  renderDeck(); renderTasteBars(); loadGrid(true); renderStats();
  showToast('Swipe undone', 'fa-rotate-left');
}

/* =========================================================
   TASTE BARS
   ========================================================= */
function renderTasteBars(){
  const wrap = document.getElementById('tasteBars');
  const total = Object.values(state.genreScore).reduce((a,b)=>a+b,0) || 1;
  const top = topGenreIds(5).filter(([,v]) => v > 0);
  if(top.length === 0){ wrap.innerHTML = `<p class="small" style="margin:0;">Swipe a few films to build your profile.</p>`; return; }
  wrap.innerHTML = top.map(([id,v]) => {
    const name = GENRE_BY_ID[id] || '—';
    const g = genreMetaByName(name);
    return `<div class="taste-bar-row">
      <div class="label"><span>${name}</span><span>${Math.round(v/total*100)}%</span></div>
      <div class="taste-bar-bg"><div class="taste-bar-fill" style="width:${Math.round(v/total*100)}%; background: linear-gradient(90deg, ${g.color1}, ${g.color2});"></div></div>
    </div>`;
  }).join('');
}

/* =========================================================
   MODAL
   ========================================================= */
let activeModalMovie = null;
function openModal(id){
  const m = state.gridResults.find(mv => mv.id === id) || state.deckPool.find(mv => mv.id === id);
  if(!m) return;
  activeModalMovie = m;
  const bg = posterUrl(m.backdrop_path, IMG_L) || posterUrl(m.poster_path, IMG_L);
  document.getElementById('modalHero').style.backgroundImage = bg ? `url(${bg})` : 'none';
  if(!bg) document.getElementById('modalHero').style.cssText += posterStyleFor(m.genre_ids);
  document.getElementById('modalTitle').textContent = m.title;
  const year = (m.release_date||'').slice(0,4) || '—';
  document.getElementById('modalMeta').textContent = `${year} · ★ ${(m.vote_average||0).toFixed(1)} · ${(m.genre_ids||[]).map(id=>GENRE_BY_ID[id]).filter(Boolean).join(', ')}`;
  document.getElementById('modalTags').innerHTML = (m.genre_ids||[]).map(id => GENRE_BY_ID[id]).filter(Boolean).map(g => `<span>${g}</span>`).join('');
  document.getElementById('modalPlot').textContent = m.overview || 'No synopsis available for this title yet.';
  const inWatchlist = state.watchlist.some(w => w.id === id);
  document.getElementById('modalWatchlistBtn').innerHTML = inWatchlist ? '<i class="fa-solid fa-check"></i> On watchlist' : '<i class="fa-solid fa-bookmark"></i> Add to watchlist';
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); activeModalMovie = null; }

/* =========================================================
   WATCHLIST
   ========================================================= */
function toggleWatchlist(m){
  const idx = state.watchlist.findIndex(w => w.id === m.id);
  if(idx === -1){
    state.watchlist.push({ id:m.id, title:m.title, poster_path:m.poster_path, release_date:m.release_date, vote_average:m.vote_average, genre_ids:m.genre_ids });
    fireConfetti();
    showToast(`"${m.title}" added to watchlist`, 'fa-bookmark');
  } else {
    state.watchlist.splice(idx, 1);
    showToast(`Removed "${m.title}"`, 'fa-trash');
  }
  persistWatchlist();
  renderGridInPlace();
  renderWatchlistUI(); renderStats();
  if(activeModalMovie && activeModalMovie.id === m.id) openModal(m.id);
}
function renderGridInPlace(){
  // re-render existing results without refetching (cheaper than loadGrid(true))
  const grid = document.getElementById('grid');
  if(state.gridResults.length){ grid.innerHTML = state.gridResults.map(movieCardHtml).join(''); attachGridHandlers(); }
}
function renderWatchlistUI(){
  const count = state.watchlist.length;
  const badge = document.getElementById('watchlistCount');
  badge.textContent = count; badge.classList.toggle('show', count > 0);
  const list = document.getElementById('drawerList');
  if(count === 0){
    list.innerHTML = `<div class="drawer-empty"><i class="fa-solid fa-bookmark" style="font-size:32px; margin-bottom:10px; display:block;"></i>Your watchlist is empty.<br>Save films with the bookmark icon.</div>`;
  } else {
    list.innerHTML = state.watchlist.map(m => `
      <div class="drawer-item">
        <div class="mini-glyph" style="${m.poster_path ? `background-image:url(${posterUrl(m.poster_path, IMG_M)})` : posterStyleFor(m.genre_ids)}"></div>
        <div class="info"><h5>${m.title}</h5><span>${(m.release_date||'').slice(0,4)||'—'} · ${primaryGenreName(m.genre_ids)||''}</span></div>
        <button data-remove="${m.id}"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
    list.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => { const id = Number(btn.dataset.remove); const m = state.watchlist.find(w=>w.id===id); if(m) toggleWatchlist(m); });
    });
  }
  const scores = {};
  state.watchlist.forEach(m => (m.genre_ids||[]).forEach(id => scores[id] = (scores[id]||0)+1));
  const total = Object.values(scores).reduce((a,b)=>a+b,0) || 1;
  const top = Object.entries(scores).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const barsEl = document.getElementById('drawerBars');
  barsEl.innerHTML = top.length ? top.map(([id,v]) => {
    const name = GENRE_BY_ID[id] || '—'; const g = genreMetaByName(name);
    return `<div class="taste-bar-row"><div class="label"><span>${name}</span><span>${Math.round(v/total*100)}%</span></div><div class="taste-bar-bg"><div class="taste-bar-fill" style="width:${Math.round(v/total*100)}%; background: linear-gradient(90deg, ${g.color1}, ${g.color2});"></div></div></div>`;
  }).join('') : `<p class="small" style="margin:0; color:var(--muted); font-size:13px;">Save films to see a breakdown.</p>`;
}

/* =========================================================
   STATS + CHART
   ========================================================= */
let genreChart;
function renderStats(){
  document.getElementById('statSwipes').textContent = state.swipedCount;
  document.getElementById('statLikes').textContent = state.likedCount;
  document.getElementById('statWatchlist').textContent = state.watchlist.length;
  const top = topGenreIds(1);
  document.getElementById('statTopGenre').textContent = (top.length && top[0][1] > 0) ? (GENRE_BY_ID[top[0][0]] || '—') : '—';

  const ctx = document.getElementById('genreChart');
  const entries = Object.entries(state.genreScore).filter(([,v]) => v > 0).sort((a,b)=>b[1]-a[1]);
  const labels = entries.length ? entries.map(([id]) => GENRE_BY_ID[id] || '—') : ['No data yet'];
  const data = entries.length ? entries.map(([,v]) => v) : [1];
  const colors = entries.length ? entries.map(([id]) => genreMetaByName(GENRE_BY_ID[id]).color1) : ['#2b2f3a'];

  if(genreChart){
    genreChart.data.labels = labels; genreChart.data.datasets[0].data = data; genreChart.data.datasets[0].backgroundColor = colors; genreChart.update();
  } else if(window.Chart){
    genreChart = new Chart(ctx, {
      type:'doughnut',
      data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:0 }] },
      options:{ cutout:'68%', plugins:{ legend:{ position:'bottom', labels:{ color:getComputedStyle(document.body).getPropertyValue('--text'), font:{family:'Sora'}, padding:14 } } }, animation:{ animateRotate:true, duration:900 } }
    });
  }
}

/* =========================================================
   SURPRISE ME
   ========================================================= */
async function surpriseMe(){
  const btn = document.getElementById('surpriseBtn');
  btn.classList.add('spinning');
  try{
    const page = Math.floor(Math.random()*15) + 1;
    const data = await tmdb('/discover/movie', { sort_by:'popularity.desc', page });
    const pool = (data.results||[]).filter(m => m.poster_path);
    const pick = pool[Math.floor(Math.random()*pool.length)];
    if(pick){
      if(!state.gridResults.some(m=>m.id===pick.id)) state.gridResults.push(pick);
      setTimeout(()=>{ btn.classList.remove('spinning'); openModal(pick.id); }, 500);
    } else { btn.classList.remove('spinning'); }
  }catch(e){
    btn.classList.remove('spinning');
    showToast('Surprise pick failed: ' + e.message, 'fa-circle-exclamation', true);
  }
}

/* =========================================================
   THEME
   ========================================================= */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  document.querySelector('#themeToggle i').className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}
function toggleTheme(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  applyTheme(isLight ? 'dark' : 'light');
}

/* =========================================================
   BACKEND-UNREACHABLE FLOW
   ========================================================= */
function showBackendError(msg){
  document.getElementById('setupOverlay').style.display = 'flex';
  document.getElementById('setupErrorMsg').textContent = msg;
}
function hideBackendError(){ document.getElementById('setupOverlay').style.display = 'none'; }

/* =========================================================
   GLOBAL EVENTS
   ========================================================= */
function attachGlobalEvents(){
  document.querySelectorAll('[data-scroll]').forEach(el => el.addEventListener('click', () => document.getElementById(el.dataset.scroll).scrollIntoView({behavior:'smooth', block:'start'})));
  document.getElementById('scrollToBrowse').addEventListener('click', () => document.getElementById('browse').scrollIntoView({behavior:'smooth'}));
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('setupRetryBtn').addEventListener('click', () => { hideBackendError(); init(); });
  document.getElementById('watchlistToggle').addEventListener('click', () => { document.getElementById('drawer').classList.add('open'); document.getElementById('drawerOverlay').classList.add('open'); });
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
  function closeDrawer(){ document.getElementById('drawer').classList.remove('open'); document.getElementById('drawerOverlay').classList.remove('open'); }
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => { if(e.target.id === 'modalOverlay') closeModal(); });
  document.getElementById('modalWatchlistBtn').addEventListener('click', () => { if(activeModalMovie) toggleWatchlist(activeModalMovie); });
  document.getElementById('modalSimilarBtn').addEventListener('click', () => {
    const m = activeModalMovie; if(!m || !m.genre_ids || !m.genre_ids.length) return;
    closeModal();
    state.activeGenreIds = new Set([m.genre_ids[0]]);
    document.querySelectorAll('#genreRow .chip').forEach(c => c.classList.toggle('active', Number(c.dataset.gid) === m.genre_ids[0]));
    loadGrid(true);
    document.getElementById('browse').scrollIntoView({behavior:'smooth'});
  });
  document.getElementById('btnLike').addEventListener('click', () => programmaticSwipe(1));
  document.getElementById('btnNope').addEventListener('click', () => programmaticSwipe(-1));
  document.getElementById('btnUndo').addEventListener('click', undoSwipe);
  document.getElementById('surpriseBtn').addEventListener('click', surpriseMe);
  document.getElementById('loadMoreBtn').addEventListener('click', () => { state.gridPage++; loadGrid(false); });
  document.getElementById('clearFilters').addEventListener('click', () => {
    state.activeMood = null; state.activeGenreIds = new Set(); state.search = '';
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    loadGrid(true);
  });
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const val = e.target.value;
    searchTimer = setTimeout(() => { state.search = val; loadGrid(true); }, 350);
  });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape'){ closeModal(); closeDrawer(); } });
}

/* =========================================================
   BOOT
   ========================================================= */
async function bootApp(){
  renderMoodChips();
  renderGenreChips();
  loadHeroAndTicker();
  initDeck();
  renderTasteBars();
  loadGrid(true);
  renderWatchlistUI();
  renderStats();
}

let eventsAttached = false;
async function init(){
  await loadPersisted();
  if(!eventsAttached){ attachGlobalEvents(); eventsAttached = true; }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  if(window.AOS && !window.AOS._inited){ AOS.init({ once:true, duration:600, easing:'ease-out-cubic' }); window.AOS._inited = true; }

  try{
    await loadGenres();
    hideBackendError();
    await bootApp();
  }catch(e){
    showBackendError('Could not reach the CineMatch backend: ' + e.message);
  }
}
init();
