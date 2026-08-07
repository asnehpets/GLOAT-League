(() => {
  'use strict';

  const STORAGE_KEY = 'gloat-league-v3';
  const SESSION_KEY = 'gloat-session-v3';
  const APP_VERSION = 3;
  const config = window.GLOAT_CONFIG || {};

  const authRoot = document.getElementById('authRoot');
  const appEl = document.getElementById('app');
  const main = document.getElementById('mainContent');
  const seasonSelect = document.getElementById('seasonSelect');
  const weekSelect = document.getElementById('weekSelect');
  const menu = document.getElementById('mobileMenu');
  const menuButton = document.getElementById('menuButton');
  const profileButton = document.getElementById('profileButton');
  const modalRoot = document.getElementById('modalRoot');
  const toastEl = document.getElementById('toast');
  const importInput = document.getElementById('importInput');

  let state = loadState();
  let currentView = 'home';
  let standingsScope = 'season';
  let authMode = 'register';
  let deferredInstallPrompt = null;
  let toastTimer = null;

  function uid(prefix='id') {
    if (window.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function toast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  function defaultGameCatalog() {
    return [
      { id:'catalog-asshole', name:'Asshole', defaultMode:'solo', description:'Primary GLOAT card game. Individual finishing order.', featured:true, active:true, createdBy:null },
      { id:'catalog-flipcup', name:'Flip Cup', defaultMode:'team', description:'Team relay drinking game.', featured:false, active:true, createdBy:null },
      { id:'catalog-beerpong', name:'Beer Pong', defaultMode:'team', description:'Team cup-elimination game.', featured:false, active:true, createdBy:null },
      { id:'catalog-cornhole', name:'Cornhole', defaultMode:'team', description:'Pairs compete head-to-head.', featured:false, active:true, createdBy:null },
      { id:'catalog-trivia', name:'Trivia', defaultMode:'team', description:'Team knowledge competition.', featured:false, active:true, createdBy:null },
      { id:'catalog-darts', name:'Darts', defaultMode:'solo', description:'Individual scoring game.', featured:false, active:true, createdBy:null }
    ];
  }

  function createDefaultState() {
    const members=[];
    for (let i=1;i<=10;i++) {
      const maleId=`member-${i}-m`, femaleId=`member-${i}-f`;
      members.push({id:maleId,firstName:`Husband ${i}`,lastName:'',email:'',gender:'M',spouseId:femaleId,active:true,accountId:null});
      members.push({id:femaleId,firstName:`Wife ${i}`,lastName:'',email:'',gender:'F',spouseId:maleId,active:true,accountId:null});
    }
    const seasonId=uid('season');
    return {
      version:APP_VERSION,
      league:{name:'GLOAT',fullName:'Game League of Overcompetitive Adult Teams'},
      accounts:[], members, gameCatalog:defaultGameCatalog(),
      seasons:[{id:seasonId,name:'GLOAT Season 1',totalWeeks:12,createdAt:new Date().toISOString(),weeks:{}}],
      selectedSeasonId:seasonId, selectedWeek:1, posts:[], audit:[]
    };
  }

  function normalizeState(data) {
    const fallback=createDefaultState();
    if (!data || typeof data!=='object') return fallback;
    data.version=APP_VERSION;
    data.league ||= fallback.league;
    data.accounts ||= [];
    data.members ||= fallback.members;
    data.gameCatalog ||= defaultGameCatalog();
    if (!data.gameCatalog.some(g=>g.name?.toLowerCase()==='asshole')) data.gameCatalog.unshift(defaultGameCatalog()[0]);
    data.seasons ||= fallback.seasons;
    data.posts ||= [];
    data.audit ||= [];
    if (!data.seasons.length) data.seasons.push(fallback.seasons[0]);
    data.seasons.forEach(s=>{
      s.weeks ||= {};
      s.totalWeeks=Math.max(1,Number(s.totalWeeks)||12);
      Object.values(s.weeks).forEach(w=>normalizeWeek(w));
    });
    if (!data.selectedSeasonId || !data.seasons.some(s=>s.id===data.selectedSeasonId)) data.selectedSeasonId=data.seasons[0].id;
    data.selectedWeek=Math.max(1,Number(data.selectedWeek)||1);
    return data;
  }

  function normalizeWeek(w) {
    w.attendance ||= [];
    w.teams ||= [];
    w.unpaired ||= [];
    w.soloOrder ||= [];
    w.hostMemberIds ||= [];
    w.rsvps ||= {};
    w.adjustments ||= [];
    w.games ||= [];
    if (!w.games.length) w.games=[{id:uid('game'),catalogId:'catalog-asshole',name:'Asshole',mode:'solo',weight:1,results:{}}];
    w.games.forEach(g=>{
      g.results ||= {};
      g.mode ||= w.format==='team'?'team':'solo';
      g.weight=Math.max(.25,Number(g.weight)||1);
      if (!g.catalogId) {
        const found=defaultGameCatalog().find(x=>x.name?.toLowerCase()===String(g.name||'').toLowerCase());
        if (found) g.catalogId=found.id;
      }
    });
    delete w.format;
    return w;
  }

  function loadState() {
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
      // migrate prior prototype if present
      const prior=localStorage.getItem('gloat-league-v2');
      if (prior) return normalizeState(JSON.parse(prior));
      return createDefaultState();
    } catch(e) { console.error(e); return createDefaultState(); }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    refreshSelectors();
  }

  function sessionId(){return localStorage.getItem(SESSION_KEY) || localStorage.getItem('gloat-session-v2');}
  function currentAccount(){return state.accounts.find(a=>a.id===sessionId())||null;}
  function currentMember(){const a=currentAccount();return a?memberById(a.memberId):null;}
  function isAdmin(){return currentAccount()?.role==='admin';}
  function currentSeason(){return state.seasons.find(s=>s.id===state.selectedSeasonId)||state.seasons[0];}
  function activeMembers(){return state.members.filter(m=>m.active!==false);}
  function memberById(id){return state.members.find(m=>m.id===id);}
  function accountById(id){return state.accounts.find(a=>a.id===id);}
  function catalogById(id){return state.gameCatalog.find(g=>g.id===id);}
  function publicName(memberOrId){const m=typeof memberOrId==='string'?memberById(memberOrId):memberOrId;return m?.firstName||'Player';}
  function fullName(memberOrId){const m=typeof memberOrId==='string'?memberById(memberOrId):memberOrId;return [m?.firstName,m?.lastName].filter(Boolean).join(' ')||'Player';}
  function spousePairKey(m){return [m.id,m.spouseId].filter(Boolean).sort().join('|');}

  async function hashPassword(password) {
    if (!crypto?.subtle) return btoa(unescape(encodeURIComponent(password)));
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password));
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function couples() {
    const seen=new Set(),rows=[];
    activeMembers().forEach(m=>{
      if (!m.spouseId) return;
      const key=spousePairKey(m); if (!key||seen.has(key)) return;
      const spouse=memberById(m.spouseId); if (!spouse||spouse.active===false) return;
      seen.add(key);
      const male=m.gender==='M'?m:spouse.gender==='M'?spouse:m;
      const female=m.gender==='F'?m:spouse.gender==='F'?spouse:spouse;
      rows.push({id:key,maleId:male.id,femaleId:female.id,memberIds:[m.id,spouse.id]});
    });
    return rows;
  }

  function audit(action,details='') {
    state.audit.unshift({id:uid('audit'),action,details,actorId:currentAccount()?.id||null,at:new Date().toISOString()});
    state.audit=state.audit.slice(0,400);
  }

  function newGameInstance(catalogId='catalog-asshole',mode=null) {
    const cat=catalogById(catalogId) || defaultGameCatalog().find(g=>g.id===catalogId) || {id:'',name:'Game',defaultMode:'solo'};
    return {id:uid('game'),catalogId:cat.id,name:cat.name,mode:mode||cat.defaultMode||'solo',weight:1,results:{}};
  }

  function ensureWeek(number=state.selectedWeek) {
    const season=currentSeason(), key=String(number);
    if (!season.weeks[key]) {
      const host=couples().length?couples()[(number-1)%couples().length]:null;
      season.weeks[key]={
        number,title:`GLOAT Week ${number}`,date:'',time:'19:30',location:'',hostMemberIds:host?.memberIds||[],
        attendance:activeMembers().map(m=>m.id),avoidSpouses:true,minimizeRepeats:true,teams:[],unpaired:[],soloOrder:[],
        games:[newGameInstance('catalog-asshole','solo')],notes:'',rsvps:{},adjustments:[],finalized:false,updatedAt:new Date().toISOString()
      };
      saveState();
    }
    return normalizeWeek(season.weeks[key]);
  }

  function updateWeek(mutator,rerender=true,action='') {
    const week=ensureWeek(); mutator(week); week.updatedAt=new Date().toISOString();
    if (action) audit(action,`Week ${week.number}`);
    saveState(); if (rerender) render();
  }

  function clearWeekResults(week) {(week.games||[]).forEach(g=>g.results={});week.finalized=false;}

  function refreshSelectors() {
    const season=currentSeason();
    seasonSelect.innerHTML=state.seasons.map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===state.selectedSeasonId?'selected':''}>${escapeHtml(s.name)}</option>`).join('');
    state.selectedWeek=Math.min(Math.max(1,state.selectedWeek),season.totalWeeks);
    weekSelect.innerHTML=Array.from({length:season.totalWeeks},(_,i)=>`<option value="${i+1}" ${state.selectedWeek===i+1?'selected':''}>Week ${i+1}</option>`).join('');
  }

  function shuffle(arr){const out=[...arr];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}

  function pairHistory(excludeWeek) {
    const map=new Map();
    Object.values(currentSeason().weeks).forEach(w=>{
      if (w.number===excludeWeek) return;
      (w.teams||[]).forEach(t=>{if(t.playerIds?.length===2){const k=[...t.playerIds].sort().join('|');map.set(k,(map.get(k)||0)+1);}});
    });
    return map;
  }

  function generateTeamAssignment(week) {
    const present=week.attendance.map(memberById).filter(Boolean);
    const men=present.filter(m=>m.gender==='M'),women=present.filter(m=>m.gender==='F');
    if (!men.length||!women.length) return {error:'Team games need at least one player marked Male and one marked Female.'};
    const left=men.length<=women.length?men:women,right=men.length<=women.length?women:men,history=pairHistory(week.number);
    let best=null;
    for(let attempt=0;attempt<700;attempt++){
      const available=shuffle(right),pairs=[];let penalty=0,failed=false;
      for(const person of shuffle(left)){
        let candidates=available.filter(c=>!week.avoidSpouses||c.id!==person.spouseId);
        if(!candidates.length){failed=true;break;}
        candidates=shuffle(candidates).sort((a,b)=>{
          if(!week.minimizeRepeats)return 0;
          return (history.get([person.id,a.id].sort().join('|'))||0)-(history.get([person.id,b.id].sort().join('|'))||0);
        });
        const partner=candidates[0];available.splice(available.findIndex(x=>x.id===partner.id),1);
        penalty+=history.get([person.id,partner.id].sort().join('|'))||0;pairs.push([person.id,partner.id]);
      }
      if(!failed){const candidate={pairs,unpaired:available.map(m=>m.id),penalty};if(!best||candidate.penalty<best.penalty)best=candidate;if(best.penalty===0)break;}
    }
    if(!best)return{error:'No valid spouse-free pairing exists. Change attendance, allow spouses, or use individual games.'};
    return{teams:best.pairs.map((ids,i)=>({id:uid('team'),number:i+1,name:`Team ${i+1}`,playerIds:ids})),unpaired:best.unpaired};
  }

  function competitorsForGame(week,game) {
    if (game.mode==='solo') {
      const order=week.soloOrder?.length?week.soloOrder:week.attendance;
      return order.filter(id=>week.attendance.includes(id)).map(id=>({key:`player:${id}`,label:publicName(id),playerIds:[id]}));
    }
    return (week.teams||[]).map(t=>({key:`team:${t.id}`,label:t.name||`Team ${t.number}`,sublabel:t.playerIds.map(publicName).join(' + '),playerIds:t.playerIds}));
  }

  function isGameComplete(week,game) {
    const competitors=competitorsForGame(week,game);if(competitors.length<2)return false;
    const ranks=competitors.map(c=>Number(game.results?.[c.key]));
    return !ranks.some(r=>!Number.isInteger(r)||r<1||r>competitors.length)&&new Set(ranks).size===ranks.length;
  }

  function computeStandings(throughWeek=state.selectedWeek,scope='season') {
    const rows=new Map(activeMembers().map(m=>[m.id,{id:m.id,name:m.firstName,points:0,wins:0,losses:0,firsts:0,games:0,rankSum:0,weeks:new Set(),adjustments:0,weekWins:0}]));
    const nums=scope==='week'?[throughWeek]:Array.from({length:throughWeek},(_,i)=>i+1);
    nums.forEach(n=>{
      const week=currentSeason().weeks[String(n)];if(!week)return;
      (week.games||[]).forEach(game=>{
        if(!isGameComplete(week,game))return;
        const competitors=competitorsForGame(week,game),count=competitors.length,weight=Number(game.weight)||1;
        competitors.forEach(c=>{
          const rank=Number(game.results[c.key]);
          c.playerIds.forEach(id=>{const r=rows.get(id);if(!r)return;r.points+=(count-rank+1)*weight;r.wins+=count-rank;r.losses+=rank-1;r.firsts+=rank===1?1:0;r.games++;r.rankSum+=rank;r.weeks.add(n);});
        });
      });
      (week.adjustments||[]).forEach(a=>{const r=rows.get(a.playerId);if(!r)return;r.points+=Number(a.points)||0;r.adjustments+=Number(a.points)||0;r.wins+=Number(a.wins)||0;r.losses+=Number(a.losses)||0;r.weeks.add(n);});
    });
    let out=[...rows.values()].filter(r=>r.games||r.adjustments||r.wins||r.losses).map(r=>({...r,weeksPlayed:r.weeks.size,avgFinish:r.games?r.rankSum/r.games:0,winPct:(r.wins+r.losses)?r.wins/(r.wins+r.losses):0}));
    out.sort(standingSort);
    if(scope==='season'){
      const winCounts=new Map();
      for(let n=1;n<=throughWeek;n++){
        const weekRows=computeStandings(n,'week');if(weekRows[0])winCounts.set(weekRows[0].id,(winCounts.get(weekRows[0].id)||0)+1);
      }
      out=out.map(r=>({...r,weekWins:winCounts.get(r.id)||0}));
    }
    return out;
  }

  function standingSort(a,b){return b.points-a.points||b.winPct-a.winPct||b.wins-a.wins||b.firsts-a.firsts||a.avgFinish-b.avgFinish||a.name.localeCompare(b.name);}
  function recordText(r){return `${r.wins}-${r.losses}`;}
  function pctText(r){return (r.winPct||0).toLocaleString(undefined,{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});}

  function weeklyChampion(weekNumber) { return computeStandings(weekNumber,'week')[0]||null; }

  function winnerForGame(week,game) {
    if(!isGameComplete(week,game))return null;
    const competitors=competitorsForGame(week,game);const winner=competitors.find(c=>Number(game.results[c.key])===1);
    return winner||null;
  }

  function completedGameCount(throughWeek=state.selectedWeek){let count=0;for(let n=1;n<=throughWeek;n++){const w=currentSeason().weeks[String(n)];if(w)count+=(w.games||[]).filter(g=>isGameComplete(w,g)).length;}return count;}

  function setView(view) {
    if(view==='admin'&&!isAdmin()){toast('Administrator access required.');return;}
    currentView=view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    menu.hidden=true;menuButton.setAttribute('aria-expanded','false');render();window.scrollTo({top:0,behavior:'smooth'});
  }

  function render() {
    if(!currentAccount()){renderAuth();return;}
    authRoot.hidden=true;appEl.hidden=false;profileButton.textContent=publicName(currentMember());profileButton.classList.toggle('admin',isAdmin());
    document.querySelectorAll('[data-admin-only]').forEach(el=>el.hidden=!isAdmin());refreshSelectors();ensureWeek();
    switch(currentView){
      case'schedule':renderSchedule();break;case'games':renderGames();break;case'week':renderWeekSetup();break;case'scores':renderScores();break;
      case'standings':renderStandings();break;case'review':renderWeeklyReview();break;case'feed':renderFeed();break;case'history':renderHistory();break;
      case'profile':renderProfile();break;case'admin':renderAdmin();break;default:renderHome();
    }
  }

  function renderAuth() {
    appEl.hidden=true;authRoot.hidden=false;const first=state.accounts.length===0;if(first)authMode='register';
    authRoot.innerHTML=`<div class="auth-card"><div class="auth-logo"><img src="assets/gloat-logo.png" alt="GLOAT"></div><div class="auth-body">
      <div class="auth-tabs"><button data-auth-tab="register" class="${authMode==='register'?'active':''}">Register</button><button data-auth-tab="login" class="${authMode==='login'?'active':''}" ${first?'disabled':''}>Sign In</button></div>
      ${authMode==='register'?`<h1>${first?'Create the Commissioner Account':'Join GLOAT'}</h1><p>Register with your email and full name. Only your first name appears in games, teams and standings.</p><form id="registerForm"><div class="inline-fields"><div class="field"><label>First name</label><input name="firstName" required></div><div class="field"><label>Last name</label><input name="lastName" required></div></div><div class="field"><label>Email address</label><input name="email" type="email" required></div><div class="field"><label>Password</label><input name="password" type="password" minlength="6" required></div><button class="btn btn-primary btn-block">${first?'Create Commissioner Account':'Register'}</button></form>`:`<h1>Sign in to GLOAT</h1><p>Use your registered email and password.</p><form id="loginForm"><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Password</label><input name="password" type="password" required></div><button class="btn btn-secondary btn-block">Sign In</button></form>`}
      <div class="auth-footer">Prototype mode stores data on this device. The included backend setup can be connected for shared accounts and announcement emails.</div></div></div>`;
  }

  function renderHome() {
    const week=ensureWeek(), standings=computeStandings(state.selectedWeek,'season'), leader=standings[0], champ=weeklyChampion(week.number), complete=week.games.filter(g=>isGameComplete(week,g)).length;
    const hasTeam=week.games.some(g=>g.mode==='team'),hasSolo=week.games.some(g=>g.mode==='solo');
    main.innerHTML=`<section class="hero"><div class="hero-content"><div class="hero-kicker">${escapeHtml(currentSeason().name)}</div><h1>Week ${week.number}</h1><p>${week.date?`${formatDate(week.date)}${week.time?' · '+formatTime(week.time):''}`:'Date not set'} · ${hasTeam&&hasSolo?'Team + individual games':hasTeam?'Team games':'Individual games'}</p></div><div class="hero-stats"><div class="hero-stat"><strong>${week.attendance.length}</strong><span>Present</span></div><div class="hero-stat"><strong>${week.games.length}</strong><span>Games</span></div><div class="hero-stat"><strong>${complete}</strong><span>Scored</span></div></div></section>
      <section class="grid two"><div class="card"><div class="card-header"><h2>Game Night</h2><button class="btn btn-small btn-outline" data-action="go-schedule">Schedule</button></div><div class="summary-list"><div class="summary-item"><span>Date</span><strong>${week.date?escapeHtml(formatDate(week.date)):'Not set'}</strong></div><div class="summary-item"><span>Host</span><strong>${escapeHtml(week.hostMemberIds.map(publicName).join(' & ')||'Not set')}</strong></div><div class="summary-item"><span>Location</span><strong>${escapeHtml(week.location||'Not set')}</strong></div></div></div>
      <div class="card"><div class="card-header"><h2>Season Leader</h2><button class="btn btn-small btn-outline" data-action="go-standings">Standings</button></div>${leader?`<div style="text-align:center;padding:8px"><div class="rank-medal rank-1" style="margin:auto;width:48px;height:48px;font-size:20px">1</div><h2 style="margin:9px 0 2px">${escapeHtml(leader.name)}</h2><div class="muted">${leader.points.toFixed(1)} pts · ${recordText(leader)} · ${pctText(leader)}</div></div>`:`<div class="empty compact"><strong>No completed games yet</strong></div>`}</div></section>
      <section class="card" style="margin-top:14px"><div class="card-header"><div><h2>Week ${week.number} Games</h2><div class="muted small">Choose games, score them, and track every player.</div></div><button class="btn btn-small btn-primary" data-action="go-games">Games</button></div>${renderWeekGameList(week,true)}</section>
      ${champ?`<section class="card" style="margin-top:14px"><div class="card-header"><h2>Weekly Leader</h2><button class="btn btn-small btn-outline" data-action="go-review">Weekly Review</button></div><div class="leader-card"><div class="eyebrow">Week ${week.number} leader</div><h2>${escapeHtml(champ.name)}</h2><p>${champ.points.toFixed(1)} points · ${recordText(champ)} · ${pctText(champ)}</p></div></section>`:''}
      <section class="card" style="margin-top:14px"><h2>Quick Actions</h2><div class="button-row"><button class="btn btn-primary" data-action="go-games">Games</button><button class="btn btn-secondary" data-action="go-standings">Standings</button><button class="btn btn-outline" data-action="go-review">Weekly Review</button>${isAdmin()?'<button class="btn btn-outline" data-action="go-week">Set Teams</button>':''}</div></section>`;
  }

  function renderSchedule() {
    const season=currentSeason(),weeks=Array.from({length:season.totalWeeks},(_,i)=>ensureWeek(i+1));
    main.innerHTML=`<section class="card"><div class="card-header"><div><h2>Schedule</h2><div class="muted small">Dates, host houses, RSVP, games and weekly details</div></div>${isAdmin()?'<button class="btn btn-small btn-primary" data-action="add-week">+ Add Week</button>':''}</div></section><section class="stack" style="margin-top:14px">${weeks.map(renderEventCard).join('')}</section>`;
  }

  function renderEventCard(week) {
    const date=week.date?new Date(`${week.date}T12:00:00`):null,my=currentMember(),myRsvp=my?week.rsvps?.[my.id]:'';const counts={yes:0,maybe:0,no:0};Object.values(week.rsvps||{}).forEach(v=>{if(counts[v]!==undefined)counts[v]++;});
    const games=week.games.map(g=>g.name).join(', ');
    return `<article class="event-card"><div class="event-top"><div class="event-date"><div class="month">${date?date.toLocaleDateString(undefined,{month:'short'}):'WEEK'}</div><div class="day">${date?date.getDate():week.number}</div><div class="dow">${date?date.toLocaleDateString(undefined,{weekday:'short'}):'TBD'}</div></div><div class="event-info"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${escapeHtml(week.title||`GLOAT Week ${week.number}`)}</h3>${week.finalized?'<span class="badge green">Final</span>':''}</div><p><strong>${week.time?escapeHtml(formatTime(week.time)):'Time TBD'}</strong> · ${escapeHtml(week.hostMemberIds.map(publicName).join(' & ')||'Host TBD')}</p><p>${escapeHtml(week.location||'Location TBD')}</p><p><strong>Games:</strong> ${escapeHtml(games||'TBD')}</p>${week.notes?`<p>${escapeHtml(week.notes)}</p>`:''}<div class="button-row" style="margin-top:8px"><button class="btn btn-small btn-outline" data-action="select-week" data-week="${week.number}">Open Week</button>${isAdmin()?`<button class="btn btn-small btn-light" data-action="edit-schedule" data-week="${week.number}">Edit</button>`:''}</div></div></div><div class="rsvp-summary"><span>✓ ${counts.yes} going</span><span>? ${counts.maybe} maybe</span><span>× ${counts.no} out</span></div><div class="rsvp-bar"><button data-action="rsvp" data-week="${week.number}" data-rsvp="yes" class="${myRsvp==='yes'?'active yes':''}">Going</button><button data-action="rsvp" data-week="${week.number}" data-rsvp="maybe" class="${myRsvp==='maybe'?'active maybe':''}">Maybe</button><button data-action="rsvp" data-week="${week.number}" data-rsvp="no" class="${myRsvp==='no'?'active no':''}">Out</button></div></article>`;
  }

  function renderGames() {
    const week=ensureWeek(),catalog=state.gameCatalog.filter(g=>g.active!==false);
    main.innerHTML=`<section class="hero"><div class="hero-content"><div class="hero-kicker">Game Portal</div><h1>Games</h1><p>Build the league game library, choose Week ${week.number} games, and enter results.</p></div><div class="hero-stats"><div class="hero-stat"><strong>${catalog.length}</strong><span>Library</span></div><div class="hero-stat"><strong>${week.games.length}</strong><span>This Week</span></div><div class="hero-stat"><strong>${week.games.filter(g=>isGameComplete(week,g)).length}</strong><span>Complete</span></div></div></section>
      <section class="card"><div class="card-header"><div><h2>Week ${week.number} Games</h2><div class="muted small">Team and individual games can be mixed in the same week.</div></div><button class="btn btn-small btn-secondary" data-action="go-scores">Scores</button></div>
      ${isAdmin()?renderGamePicker(week,catalog):'<div class="notice">The commissioner selects the official games for each week. All registered users can add ideas to the Game Library below.</div>'}
      <div style="margin-top:12px">${renderWeekGameList(week,false)}</div></section>
      <section class="card"><div class="card-header"><div><h2>Game Library</h2><div class="muted small">Any registered member can add a game idea. Asshole stays marked as the primary game.</div></div><button class="btn btn-small btn-primary" data-action="add-library-game">+ Add Game</button></div><div class="game-library-grid">${catalog.map(renderLibraryCard).join('')}</div></section>`;
  }

  function renderGamePicker(week,catalog) {
    return `<form id="weekGameForm" class="game-picker"><div class="field"><label>Choose game</label><select name="catalogId" id="weekGameCatalog">${catalog.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}${g.featured?' — Main Game':''}</option>`).join('')}</select></div><div class="field"><label>Play format</label><select name="mode" id="weekGameMode"><option value="solo">Individual</option><option value="team">Team</option></select></div><div class="field"><label>Points multiplier</label><input name="weight" type="number" min="0.25" step="0.25" value="1"></div><button class="btn btn-primary" type="submit">Add to Week</button></form>`;
  }

  function renderLibraryCard(g) {
    return `<article class="library-card ${g.featured?'featured':''}"><div><div class="library-title">${escapeHtml(g.name)} ${g.featured?'<span class="featured-chip">MAIN GAME</span>':''}</div><div class="muted small">${escapeHtml(g.description||'No description yet.')}</div><div class="library-meta"><span class="mode-badge ${g.defaultMode==='team'?'team':'solo'}">${g.defaultMode==='team'?'Team':'Individual'}</span></div></div>${isAdmin()&&!g.featured?`<button class="btn btn-small btn-light" data-action="remove-library-game" data-catalog-id="${g.id}">Remove</button>`:''}</article>`;
  }

  function renderWeekGameList(week,compact=false) {
    if(!week.games.length)return'<div class="empty compact"><strong>No games selected</strong>Add games from the library.</div>';
    return week.games.map((g,i)=>{const winner=winnerForGame(week,g);return `<div class="week-game-row"><div class="week-game-top"><div><div class="week-game-name">${i+1}. ${escapeHtml(g.name)}</div><div class="week-game-meta"><span class="mode-badge ${g.mode==='team'?'team':'solo'}">${g.mode==='team'?'Team':'Individual'}</span><span class="badge">${Number(g.weight)||1}× points</span>${isGameComplete(week,g)?'<span class="badge green">Complete</span>':'<span class="badge amber">Open</span>'}</div>${winner?`<div class="winner-line">Winner: ${escapeHtml(winner.label)}${winner.sublabel?` — ${escapeHtml(winner.sublabel)}`:''}</div>`:''}</div>${!compact?`<div class="button-row"><button class="btn btn-small btn-outline" data-action="go-scores">${isAdmin()?'Enter Scores':'View Scores'}</button>${isAdmin()&&!week.finalized?`<button class="btn btn-small btn-light" data-action="remove-week-game" data-game-id="${g.id}">Remove</button>`:''}</div>`:''}</div></div>`;}).join('');
  }

  function renderWeekSetup() {
    const week=ensureWeek(),editable=isAdmin(),teamGames=week.games.filter(g=>g.mode==='team').length;
    main.innerHTML=`<section class="card"><div class="card-header"><div><h2>Week ${week.number} Setup</h2><div class="muted small">Attendance drives both individual games and randomized team games.</div></div>${!editable?'<span class="badge">Admin managed</span>':''}</div><div class="inline-fields"><div class="field"><label>Date</label><input id="weekDate" type="date" value="${escapeHtml(week.date)}" ${editable?'':'disabled'}></div><div class="field"><label>Time</label><input id="weekTime" type="time" value="${escapeHtml(week.time||'')}" ${editable?'':'disabled'}></div></div><div class="field"><label>Location</label><input id="weekLocation" value="${escapeHtml(week.location||'')}" ${editable?'':'disabled'}></div><div class="field"><label>Week notes</label><textarea id="weekNotes" ${editable?'':'disabled'}>${escapeHtml(week.notes||'')}</textarea></div></section>
      <section class="card"><div class="card-header"><h2>Who’s Present?</h2><span class="badge navy">${week.attendance.length} selected</span></div>${editable?'<div class="button-row" style="margin-bottom:12px"><button class="btn btn-small btn-outline" data-action="attendance-all">All</button><button class="btn btn-small btn-outline" data-action="attendance-none">None</button><button class="btn btn-small btn-outline" data-action="attendance-from-rsvp">Use Going RSVPs</button></div>':''}${renderAttendance(week,editable)}</section>
      <section class="card"><div class="card-header"><div><h2>Randomized Coed Teams</h2><div class="muted small">Used only by games marked Team. Individual games use the same attendance list without partners.</div></div><span class="badge ${teamGames?'navy':''}">${teamGames} team game${teamGames===1?'':'s'}</span></div>${editable?`<div class="toggle-row"><div><strong>Avoid spouses</strong><div class="muted small">Never pair married partners together.</div></div><label class="switch"><input id="avoidSpouses" type="checkbox" ${week.avoidSpouses?'checked':''}><span class="slider"></span></label></div><div class="toggle-row"><div><strong>Minimize repeat partners</strong><div class="muted small">Prefer new partners based on earlier weeks.</div></div><label class="switch"><input id="minimizeRepeats" type="checkbox" ${week.minimizeRepeats?'checked':''}><span class="slider"></span></label></div><div class="button-row" style="margin:12px 0"><button class="btn btn-primary" data-action="randomize-teams">Randomize Teams</button><button class="btn btn-outline" data-action="clear-assignments">Clear</button></div>`:''}${renderAssignments(week)}</section>`;
  }

  function renderAttendance(week,editable){return `<div class="attendance-grid">${couples().map((c,i)=>`<div class="couple-card"><div class="couple-label">Couple ${i+1}</div>${c.memberIds.map(id=>renderPersonCheck(memberById(id),week,editable)).join('')}</div>`).join('')}${activeMembers().filter(m=>!m.spouseId).map(m=>`<div class="couple-card">${renderPersonCheck(m,week,editable)}</div>`).join('')}</div>`;}
  function renderPersonCheck(m,week,editable){if(!m)return'';return `<label class="person-check"><input type="checkbox" data-action="attendance-toggle" data-member-id="${m.id}" ${week.attendance.includes(m.id)?'checked':''} ${editable?'':'disabled'}><span>${escapeHtml(m.firstName)}</span><small>${m.gender==='M'?'M':m.gender==='F'?'F':'—'}</small></label>`;}

  function renderAssignments(week) {
    if(!week.teams.length)return'<div class="empty compact"><strong>No teams generated yet</strong>Team games need randomized pairs. Individual games do not.</div>';
    return `<div class="team-grid">${week.teams.map(t=>`<div class="team-card"><div class="team-title"><strong>${escapeHtml(t.name)}</strong>${isAdmin()?`<button class="btn btn-small btn-light" data-action="rename-team" data-team-id="${t.id}">Rename</button>`:''}</div><div class="team-players">${t.playerIds.map(id=>`<span class="player-pill">${escapeHtml(publicName(id))}</span>`).join('')}</div></div>`).join('')}${week.unpaired.length?`<div class="team-card unpaired"><strong>Unpaired / Alternate</strong><div class="team-players">${week.unpaired.map(id=>`<span class="player-pill">${escapeHtml(publicName(id))}</span>`).join('')}</div></div>`:''}</div>`;
  }

  function renderScores() {
    const week=ensureWeek(),editable=isAdmin()&&!week.finalized;
    main.innerHTML=`<section class="card"><div class="card-header"><div><h2>Week ${week.number} Scores</h2><div class="muted small">Each game can be team or individual. Standings always follow the individual player.</div></div><button class="btn btn-small btn-outline" data-action="go-games">Games</button></div>${isAdmin()?`<div class="button-row">${week.finalized?'<button class="btn btn-warn" data-action="reopen-week">Reopen Week</button>':'<button class="btn btn-success" data-action="finalize-week">Finalize Week</button>'}<button class="btn btn-outline" data-action="add-adjustment">Scoring Adjustment</button></div>`:'<div class="notice">Scores are commissioner-managed. Members can view results live.</div>'}</section><section style="margin-top:14px">${week.games.map((g,i)=>renderGameCard(week,g,i,editable)).join('')}</section>${renderAdjustments(week)}`;
  }

  function renderGameCard(week,game,index,editable) {
    const competitors=competitorsForGame(week,game),complete=isGameComplete(week,game),opts=Array.from({length:competitors.length},(_,i)=>i+1);
    const missingTeam=game.mode==='team'&&!week.teams.length;
    return `<div class="game-card"><div class="game-head"><div><div class="game-title">${index+1}. ${escapeHtml(game.name)}</div><div class="week-game-meta"><span class="mode-badge ${game.mode==='team'?'team':'solo'}">${game.mode==='team'?'Team':'Individual'}</span><span class="badge">${Number(game.weight)||1}× points</span><span class="badge ${complete?'green':'amber'}">${complete?'Complete':'Incomplete'}</span></div></div></div><div class="game-body">${missingTeam?'<div class="notice warn">This is a team game. Generate Week teams first.</div>':competitors.length>=2?competitors.map(c=>`<div class="result-row"><div><div class="competitor-name">${escapeHtml(c.label)}</div>${c.sublabel?`<div class="competitor-sub">${escapeHtml(c.sublabel)}</div>`:''}</div><select data-action="rank-change" data-game-id="${game.id}" data-competitor-key="${escapeHtml(c.key)}" ${editable?'':'disabled'} class="${editable?'':'locked-select'}"><option value="">Place</option>${opts.map(n=>`<option value="${n}" ${Number(game.results?.[c.key])===n?'selected':''}>${ordinal(n)}</option>`).join('')}</select></div>`).join(''):'<div class="empty compact"><strong>Need at least two competitors</strong>Set attendance first.</div>'}</div></div>`;
  }

  function renderAdjustments(week){if(!(week.adjustments||[]).length)return'';return `<section class="card"><div class="card-header"><h2>Manual Adjustments</h2></div>${week.adjustments.map(a=>`<div class="audit-row"><div class="audit-title">${escapeHtml(publicName(a.playerId))}: ${formatSigned(a.points)} pts, ${formatSigned(a.wins)} W, ${formatSigned(a.losses)} L</div><div class="audit-meta">${escapeHtml(a.reason)} · ${formatDateTime(a.at)}</div>${isAdmin()&&!week.finalized?`<button class="btn btn-small btn-light" data-action="delete-adjustment" data-adjustment-id="${a.id}">Remove</button>`:''}</div>`).join('')}</section>`;}

  function renderStandings() {
    const rows=standingsScope==='week'?computeStandings(state.selectedWeek,'week'):computeStandings(state.selectedWeek,'season');
    main.innerHTML=`<section class="card"><div class="card-header"><div><h2>Individual Standings</h2><div class="muted small">Every team or solo result rolls up to the individual player's record.</div></div><button class="btn btn-small btn-outline" data-action="go-review">Weekly Review</button></div><div class="segmented"><button data-action="standings-scope" data-scope="season" class="${standingsScope==='season'?'active':''}">Season Through W${state.selectedWeek}</button><button data-action="standings-scope" data-scope="week" class="${standingsScope==='week'?'active':''}">Week ${state.selectedWeek}</button></div>${rows.length?renderStandingsTable(rows,standingsScope==='season'):'<div class="empty"><strong>No standings yet</strong>Complete a game to populate standings.</div>'}<div class="table-note">Record is calculated as opponents/teams beaten vs. opponents/teams finishing ahead in each completed game. Win % = wins ÷ (wins + losses).</div></section>`;
  }

  function renderStandingsTable(rows,seasonMode) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Rank</th><th>Player</th><th class="num">Record</th><th class="num">Win %</th>${seasonMode?'<th class="num">Weeks Won</th>':''}<th class="num">Pts</th><th class="num">Games</th></tr></thead><tbody>${rows.map((r,i)=>`<tr class="${i===0?'highlight-row':''}"><td><div class="rank-medal rank-${i+1}">${i+1}</div></td><td><strong>${escapeHtml(r.name)}</strong>${r.adjustments?`<div class="adjustment">${formatSigned(r.adjustments)} adjustment</div>`:''}</td><td class="num record">${recordText(r)}</td><td class="num winpct pct-good">${pctText(r)}</td>${seasonMode?`<td class="num">${r.weekWins||0}</td>`:''}<td class="num points-big">${r.points.toFixed(1)}</td><td class="num">${r.games}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderWeeklyReview() {
    const week=ensureWeek(),rows=computeStandings(week.number,'week'),champ=rows[0];
    const games=week.games.map(g=>{const winner=winnerForGame(week,g);return `<div class="review-game"><strong>${escapeHtml(g.name)} <span class="mode-badge ${g.mode==='team'?'team':'solo'}">${g.mode==='team'?'Team':'Individual'}</span></strong>${winner?`<div class="winner-line">Winner: ${escapeHtml(winner.label)}${winner.sublabel?` — ${escapeHtml(winner.sublabel)}`:''}</div>`:'<div class="muted small">Not completed</div>'}</div>`;}).join('');
    main.innerHTML=`<section class="card"><div class="card-header"><div><h2>Week ${week.number} Review</h2><div class="muted small">See the weekly winner, every game winner, and how the week affected the season.</div></div><button class="btn btn-small btn-outline" data-action="go-standings">Season Standings</button></div>${champ?`<div class="leader-card"><div class="eyebrow">Week ${week.number} Champion</div><h2>${escapeHtml(champ.name)}</h2><p>${champ.points.toFixed(1)} points · ${recordText(champ)} · ${pctText(champ)}</p><div class="leader-metrics"><div class="leader-metric"><strong>${champ.firsts}</strong><span>1st Places</span></div><div class="leader-metric"><strong>${champ.wins}</strong><span>Wins</span></div><div class="leader-metric"><strong>${champ.games}</strong><span>Games</span></div></div></div>`:'<div class="empty compact"><strong>No weekly winner yet</strong>Complete at least one game.</div>'}</section><section class="grid two" style="margin-top:14px"><div class="card"><h2>Game Winners</h2><div class="review-games">${games}</div></div><div class="card"><h2>Week ${week.number} Standings</h2>${rows.length?renderStandingsTable(rows,false):'<div class="empty compact">No results yet.</div>'}</div></section>`;
  }

  function renderFeed() {
    main.innerHTML=`<section class="card"><div class="card-header"><div><h2>League Feed</h2><div class="muted small">Announcements, reminders and league notes</div></div>${isAdmin()?'<button class="btn btn-small btn-primary" data-action="new-post">+ Post</button>':''}</div>${config.emailWebhookUrl?'<div class="notice success">Announcement email delivery is connected.</div>':'<div class="notice warn">Posts work in the app. Automatic email delivery activates after the included email service is configured.</div>'}</section><section class="card" style="margin-top:14px">${state.posts.length?state.posts.map(renderPost).join(''):'<div class="empty"><strong>No league posts yet</strong></div>'}</section>`;
  }
  function renderPost(post){const author=accountById(post.authorId);return `<article class="feed-item"><div class="feed-meta"><span>${escapeHtml(author?publicName(author.memberId):'GLOAT')}</span><span>•</span><span>${formatDateTime(post.createdAt)}</span>${post.emailStatus?`<span class="badge ${post.emailStatus==='sent'?'green':post.emailStatus==='failed'?'red':'amber'}">Email ${escapeHtml(post.emailStatus)}</span>`:''}</div><div class="feed-title">${escapeHtml(post.title)}</div><div class="feed-body">${escapeHtml(post.body)}</div>${isAdmin()?`<div class="button-row" style="margin-top:9px"><button class="btn btn-small btn-light" data-action="delete-post" data-post-id="${post.id}">Delete</button></div>`:''}</article>`;}

  function renderHistory() {
    const weeks=Array.from({length:currentSeason().totalWeeks},(_,i)=>ensureWeek(i+1));
    main.innerHTML=`<section class="card"><div class="card-header"><h2>League History</h2><span class="badge navy">${completedGameCount(currentSeason().totalWeeks)} scored games</span></div>${weeks.map(w=>{const champ=weeklyChampion(w.number);return `<div class="system-item"><div style="display:flex;justify-content:space-between;gap:8px"><strong>Week ${w.number}</strong>${champ?`<span class="week-winner-pill">★ ${escapeHtml(champ.name)}</span>`:''}</div><div class="muted small" style="margin:5px 0">${w.date?formatDate(w.date):'No date'} · ${(w.games||[]).filter(g=>isGameComplete(w,g)).length}/${w.games.length} games scored</div><div class="small">${escapeHtml(w.games.map(g=>g.name).join(', '))}</div></div>`;}).join('')}</section>`;
  }

  function renderProfile() {
    const a=currentAccount(),m=currentMember();
    main.innerHTML=`<section class="card"><div class="card-header"><div><h2>My Profile</h2><div class="muted small">Only your first name is displayed publicly.</div></div>${a.role==='admin'?'<span class="badge admin">Administrator</span>':'<span class="badge">Member</span>'}</div><div class="summary-list"><div class="summary-item"><span>Display name</span><strong>${escapeHtml(m?.firstName||'')}</strong></div><div class="summary-item"><span>Full name</span><strong>${escapeHtml(fullName(m))}</strong></div><div class="summary-item"><span>Email</span><strong>${escapeHtml(a.email)}</strong></div></div><div class="toggle-row"><div><strong>Email league posts</strong><div class="muted small">Receive an email when an administrator publishes a post.</div></div><label class="switch"><input id="emailOptIn" type="checkbox" ${a.emailOptIn!==false?'checked':''}><span class="slider"></span></label></div><div class="button-row" style="margin-top:15px"><button class="btn btn-outline" data-action="sign-out">Sign Out</button>${isAdmin()?'<button class="btn btn-secondary" data-action="go-admin">Admin Center</button>':''}</div></section>`;
  }

  function renderAdmin() {
    if(!isAdmin())return setView('home');const season=currentSeason();
    main.innerHTML=`<section class="hero"><div class="hero-content"><div class="hero-kicker">Commissioner Tools</div><h1>Admin Center</h1><p>Manage people, weeks, schedule, scoring, game library and communications.</p></div><div class="hero-stats"><div class="hero-stat"><strong>${state.accounts.length}</strong><span>Registered</span></div><div class="hero-stat"><strong>${state.gameCatalog.filter(g=>g.active!==false).length}</strong><span>Games</span></div><div class="hero-stat"><strong>${season.totalWeeks}</strong><span>Weeks</span></div></div></section><section class="admin-grid"><div class="admin-section"><div class="card-header"><h2>Season & Weeks</h2></div><div class="field"><label>Season name</label><input id="adminSeasonName" value="${escapeHtml(season.name)}"></div><div class="button-row"><button class="btn btn-secondary" data-action="save-season-name">Save</button><button class="btn btn-primary" data-action="add-week">+ Add Week</button><button class="btn btn-outline" data-action="new-season">New Season</button></div></div><div class="admin-section"><div class="card-header"><h2>League Tools</h2></div><div class="button-row"><button class="btn btn-primary" data-action="go-games">Manage Games</button><button class="btn btn-outline" data-action="new-post">Post Announcement</button><button class="btn btn-outline" data-action="add-adjustment">Scoring Adjustment</button></div></div></section><section class="card"><div class="card-header"><div><h2>Roster & Accounts</h2><div class="muted small">Set Male/Female category and spouse links for randomized coed teams.</div></div><button class="btn btn-small btn-primary" data-action="add-member">+ Player</button></div>${activeMembers().map(renderAdminMember).join('')}</section><section class="card"><div class="card-header"><h2>Recent Admin Activity</h2><button class="btn btn-small btn-outline" data-action="export-data">Backup</button></div>${state.audit.slice(0,30).map(x=>`<div class="audit-row"><div class="audit-title">${escapeHtml(x.action)}</div><div class="audit-meta">${escapeHtml(x.details||'')} · ${escapeHtml(publicName(accountById(x.actorId)?.memberId))} · ${formatDateTime(x.at)}</div></div>`).join('')||'<div class="empty compact">No admin activity yet.</div>'}<div class="button-row" style="margin-top:13px"><button class="btn btn-outline" data-action="import-data">Restore Backup</button><button class="btn btn-danger" data-action="reset-data">Reset Demo Data</button></div></section>`;
  }
  function renderAdminMember(m){const acc=state.accounts.find(a=>a.memberId===m.id),spouse=m.spouseId?memberById(m.spouseId):null;return `<div class="member-row"><div><div class="member-name">${escapeHtml(fullName(m))} ${acc?.role==='admin'?'<span class="badge admin">Admin</span>':''}</div><div class="member-meta">${m.gender||'Category not set'} · ${spouse?`Spouse: ${escapeHtml(spouse.firstName)}`:'No spouse linked'} · ${acc?escapeHtml(acc.email):'Not registered'}</div></div><button class="btn btn-small btn-light" data-action="edit-member" data-member-id="${m.id}">Edit</button></div>`;}

  function openModal(title,bodyHtml){modalRoot.hidden=false;modalRoot.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="modal-close" data-action="close-modal">×</button></div><div class="modal-body">${bodyHtml}</div></div>`;}
  function closeModal(){modalRoot.hidden=true;modalRoot.innerHTML='';}

  function openScheduleModal(weekNumber){const w=ensureWeek(weekNumber),opts=couples().map((c,i)=>`<option value="${escapeHtml(c.id)}" ${c.memberIds.every(id=>w.hostMemberIds.includes(id))?'selected':''}>Couple ${i+1}: ${c.memberIds.map(publicName).map(escapeHtml).join(' & ')}</option>`).join('');openModal(`Edit Week ${w.number} Schedule`,`<form id="scheduleForm" data-week="${w.number}"><div class="field"><label>Title</label><input name="title" value="${escapeHtml(w.title)}" required></div><div class="inline-fields"><div class="field"><label>Date</label><input name="date" type="date" value="${escapeHtml(w.date)}"></div><div class="field"><label>Time</label><input name="time" type="time" value="${escapeHtml(w.time)}"></div></div><div class="field"><label>Host couple</label><select name="hostPair"><option value="">Not set</option>${opts}</select></div><div class="field"><label>Location</label><input name="location" value="${escapeHtml(w.location)}"></div><div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(w.notes)}</textarea></div><button class="btn btn-primary btn-block">Save Schedule</button></form>`);}
  function openPostModal(){openModal('New League Post',`<form id="postForm"><div class="field"><label>Title</label><input name="title" required></div><div class="field"><label>Message</label><textarea name="body" required></textarea></div><div class="notice">Publishing adds this to the feed${config.emailWebhookUrl?' and emails opted-in registered users.':'. Email sends once the included production email endpoint is configured.'}</div><button class="btn btn-primary btn-block" style="margin-top:12px">Publish Post</button></form>`);}
  function openLibraryGameModal(){openModal('Add a Game to GLOAT',`<form id="libraryGameForm"><div class="field"><label>Game name</label><input name="name" required placeholder="e.g. Quarters"></div><div class="field"><label>Default format</label><select name="defaultMode"><option value="solo">Individual</option><option value="team">Team</option></select></div><div class="field"><label>Short description / rules note</label><textarea name="description" placeholder="What is it and how do you play?"></textarea></div><button class="btn btn-primary btn-block">Add to Game Library</button></form>`);}
  function openAdjustmentModal(){const opts=activeMembers().map(m=>`<option value="${m.id}">${escapeHtml(m.firstName)}</option>`).join('');openModal('Scoring Adjustment',`<form id="adjustmentForm"><div class="field"><label>Player</label><select name="playerId">${opts}</select></div><div class="inline-fields"><div class="field"><label>Points +/-</label><input name="points" type="number" step="0.5" value="0"></div><div class="field"><label>Wins +/-</label><input name="wins" type="number" step="1" value="0"></div></div><div class="field"><label>Losses +/-</label><input name="losses" type="number" step="1" value="0"></div><div class="field"><label>Reason</label><input name="reason" required></div><button class="btn btn-primary btn-block">Apply Adjustment</button></form>`);}
  function openMemberModal(memberId=null){const m=memberId?memberById(memberId):{firstName:'',lastName:'',email:'',gender:'',spouseId:''},acc=memberId?state.accounts.find(a=>a.memberId===memberId):null,spouseOpts=activeMembers().filter(x=>x.id!==memberId).map(x=>`<option value="${x.id}" ${m.spouseId===x.id?'selected':''}>${escapeHtml(fullName(x))}</option>`).join('');openModal(memberId?'Edit Player':'Add Player',`<form id="memberForm" data-member-id="${escapeHtml(memberId||'')}"><div class="inline-fields"><div class="field"><label>First name</label><input name="firstName" value="${escapeHtml(m.firstName)}" required></div><div class="field"><label>Last name</label><input name="lastName" value="${escapeHtml(m.lastName)}"></div></div><div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(m.email||acc?.email||'')}"></div><div class="inline-fields"><div class="field"><label>Team category</label><select name="gender"><option value="">Not set</option><option value="M" ${m.gender==='M'?'selected':''}>Male</option><option value="F" ${m.gender==='F'?'selected':''}>Female</option></select></div><div class="field"><label>Spouse / partner</label><select name="spouseId"><option value="">Not linked</option>${spouseOpts}</select></div></div>${acc?`<div class="field"><label>Account role</label><select name="role"><option value="member" ${acc.role==='member'?'selected':''}>Member</option><option value="admin" ${acc.role==='admin'?'selected':''}>Administrator</option></select></div>`:''}<button class="btn btn-primary btn-block">Save Player</button></form>`);}

  async function sendAnnouncementEmail(post){if(!config.emailWebhookUrl)return{status:'not configured'};const recipients=state.accounts.filter(a=>a.emailOptIn!==false).map(a=>({email:a.email,firstName:publicName(a.memberId)}));try{const res=await fetch(config.emailWebhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({post,recipients,league:state.league.name})});if(!res.ok)throw new Error(`HTTP ${res.status}`);return{status:'sent'};}catch(e){console.error(e);return{status:'failed'};}}

  async function handleSubmit(event) {
    const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();const fd=new FormData(form);
    if(form.id==='registerForm'){
      const firstName=String(fd.get('firstName')||'').trim(),lastName=String(fd.get('lastName')||'').trim(),email=String(fd.get('email')||'').trim().toLowerCase(),password=String(fd.get('password')||'');
      if(!firstName||!lastName||!email||password.length<6)return toast('Complete all registration fields.');if(state.accounts.some(a=>a.email===email))return toast('That email is already registered.');
      let member=state.members.find(m=>m.email?.toLowerCase()===email);if(!member)member=state.members.find(m=>!m.accountId);if(!member){member={id:uid('member'),firstName,lastName,email,gender:'',spouseId:'',active:true,accountId:null};state.members.push(member);}member.firstName=firstName;member.lastName=lastName;member.email=email;
      const account={id:uid('account'),email,passwordHash:await hashPassword(password),role:state.accounts.length===0?'admin':'member',memberId:member.id,emailOptIn:true,createdAt:new Date().toISOString()};member.accountId=account.id;state.accounts.push(account);audit('Account registered',`${firstName} ${lastName}`);saveState();localStorage.setItem(SESSION_KEY,account.id);currentView='home';render();toast(account.role==='admin'?'Commissioner account created.':'Welcome to GLOAT.');return;
    }
    if(form.id==='loginForm') {const email=String(fd.get('email')||'').trim().toLowerCase(),password=String(fd.get('password')||'');const a=state.accounts.find(x=>x.email===email);if(!a||a.passwordHash!==await hashPassword(password))return toast('Email or password is incorrect.');localStorage.setItem(SESSION_KEY,a.id);currentView='home';render();return;}
    if(!currentAccount())return;
    if(form.id==='weekGameForm'&&isAdmin()) {const cat=catalogById(String(fd.get('catalogId')));if(!cat)return toast('Choose a game.');const w=ensureWeek();w.games.push({id:uid('game'),catalogId:cat.id,name:cat.name,mode:String(fd.get('mode'))==='team'?'team':'solo',weight:Math.max(.25,Number(fd.get('weight'))||1),results:{}});audit('Game scheduled',`Week ${w.number}: ${cat.name}`);saveState();renderGames();toast(`${cat.name} added to Week ${w.number}.`);return;}
    if(form.id==='libraryGameForm') {const name=String(fd.get('name')||'').trim();if(!name)return; if(state.gameCatalog.some(g=>g.active!==false&&g.name.toLowerCase()===name.toLowerCase()))return toast('That game is already in the library.');state.gameCatalog.push({id:uid('catalog'),name,defaultMode:String(fd.get('defaultMode'))==='team'?'team':'solo',description:String(fd.get('description')||'').trim(),featured:false,active:true,createdBy:currentAccount().id,createdAt:new Date().toISOString()});audit('Game added to library',name);saveState();closeModal();renderGames();toast('Game added to the library.');return;}
    if(form.id==='scheduleForm'&&isAdmin()){const n=Number(form.dataset.week),w=ensureWeek(n);w.title=String(fd.get('title')||'').trim();w.date=String(fd.get('date')||'');w.time=String(fd.get('time')||'');w.location=String(fd.get('location')||'').trim();w.notes=String(fd.get('notes')||'').trim();const pair=couples().find(c=>c.id===fd.get('hostPair'));w.hostMemberIds=pair?.memberIds||[];audit('Schedule updated',`Week ${n}`);saveState();closeModal();renderSchedule();toast('Schedule updated.');return;}
    if(form.id==='postForm'&&isAdmin()){const post={id:uid('post'),title:String(fd.get('title')||'').trim(),body:String(fd.get('body')||'').trim(),authorId:currentAccount().id,createdAt:new Date().toISOString(),emailStatus:config.emailWebhookUrl?'sending':'not configured'};state.posts.unshift(post);audit('League post published',post.title);saveState();closeModal();renderFeed();const result=await sendAnnouncementEmail(post);post.emailStatus=result.status;saveState();if(currentView==='feed')renderFeed();toast(result.status==='sent'?'Post published and emailed.':'Post published.');return;}
    if(form.id==='adjustmentForm'&&isAdmin()){const w=ensureWeek();w.adjustments.push({id:uid('adjust'),playerId:String(fd.get('playerId')),points:Number(fd.get('points'))||0,wins:Number(fd.get('wins'))||0,losses:Number(fd.get('losses'))||0,reason:String(fd.get('reason')||'').trim(),adminId:currentAccount().id,at:new Date().toISOString()});audit('Scoring adjustment',`Week ${w.number}: ${publicName(fd.get('playerId'))}`);saveState();closeModal();renderScores();toast('Adjustment applied.');return;}
    if(form.id==='memberForm'&&isAdmin()){const id=String(form.dataset.memberId||''),existing=id?memberById(id):null,m=existing||{id:uid('member'),active:true,accountId:null};m.firstName=String(fd.get('firstName')||'').trim();m.lastName=String(fd.get('lastName')||'').trim();m.email=String(fd.get('email')||'').trim().toLowerCase();m.gender=String(fd.get('gender')||'');const oldSpouse=m.spouseId;m.spouseId=String(fd.get('spouseId')||'');if(!existing)state.members.push(m);if(oldSpouse&&oldSpouse!==m.spouseId){const old=memberById(oldSpouse);if(old?.spouseId===m.id)old.spouseId='';}if(m.spouseId){const s=memberById(m.spouseId);if(s){if(s.spouseId&&s.spouseId!==m.id){const prior=memberById(s.spouseId);if(prior?.spouseId===s.id)prior.spouseId='';}s.spouseId=m.id;}}const acc=state.accounts.find(a=>a.memberId===m.id);if(acc&&fd.get('role'))acc.role=String(fd.get('role'));audit(existing?'Player updated':'Player added',fullName(m));saveState();closeModal();renderAdmin();return;}
  }

  function handleClick(event) {
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.authTab){authMode=button.dataset.authTab;renderAuth();return;}
    if(button.dataset.view){setView(button.dataset.view);return;}
    const action=button.dataset.action;if(!action)return;const week=ensureWeek();
    const go={home:'home',schedule:'schedule',games:'games',week:'week',scores:'scores',standings:'standings',review:'review',feed:'feed',admin:'admin'};
    if(action.startsWith('go-')){setView(go[action.slice(3)]||'home');return;}
    switch(action){
      case'close-modal':closeModal();break;
      case'select-week':state.selectedWeek=Number(button.dataset.week);saveState();setView('games');break;
      case'edit-schedule':if(isAdmin())openScheduleModal(Number(button.dataset.week));break;
      case'rsvp':{const w=ensureWeek(Number(button.dataset.week)),m=currentMember();if(!m)return;w.rsvps[m.id]=button.dataset.rsvp;saveState();renderSchedule();break;}
      case'add-library-game':openLibraryGameModal();break;
      case'remove-library-game':if(isAdmin()){const g=catalogById(button.dataset.catalogId);if(g&&confirm(`Remove ${g.name} from the game library? Existing week results will be kept.`)){g.active=false;audit('Game removed from library',g.name);saveState();renderGames();}}break;
      case'remove-week-game':if(isAdmin()&&!week.finalized){const g=week.games.find(x=>x.id===button.dataset.gameId);if(g&&confirm(`Remove ${g.name} from Week ${week.number}?`)){week.games=week.games.filter(x=>x.id!==g.id);audit('Game removed from week',`Week ${week.number}: ${g.name}`);saveState();renderGames();}}break;
      case'attendance-all':if(isAdmin())updateWeek(w=>{w.attendance=activeMembers().map(m=>m.id);w.teams=[];w.unpaired=[];w.soloOrder=[];clearWeekResults(w);},true,'Attendance updated');break;
      case'attendance-none':if(isAdmin())updateWeek(w=>{w.attendance=[];w.teams=[];w.unpaired=[];w.soloOrder=[];clearWeekResults(w);},true,'Attendance cleared');break;
      case'attendance-from-rsvp':if(isAdmin())updateWeek(w=>{const ids=Object.entries(w.rsvps||{}).filter(([,v])=>v==='yes').map(([id])=>id);if(ids.length)w.attendance=ids;w.teams=[];w.unpaired=[];w.soloOrder=[];clearWeekResults(w);},true,'Attendance loaded from RSVP');break;
      case'randomize-teams':if(isAdmin()){if(week.games.some(g=>Object.keys(g.results||{}).length)&&!confirm('Randomizing teams clears current results. Continue?'))return;const result=generateTeamAssignment(week);if(result.error)return toast(result.error);week.teams=result.teams;week.unpaired=result.unpaired;clearWeekResults(week);audit('Teams randomized',`Week ${week.number}`);saveState();renderWeekSetup();toast('Teams randomized.');}break;
      case'clear-assignments':if(isAdmin()){week.teams=[];week.unpaired=[];clearWeekResults(week);audit('Teams cleared',`Week ${week.number}`);saveState();renderWeekSetup();}break;
      case'rename-team':if(isAdmin()){const t=week.teams.find(x=>x.id===button.dataset.teamId),name=prompt('Team name:',t?.name||'');if(t&&name?.trim()){t.name=name.trim();audit('Team renamed',`Week ${week.number}: ${t.name}`);saveState();renderWeekSetup();}}break;
      case'finalize-week':if(isAdmin()){const incomplete=week.games.filter(g=>!isGameComplete(week,g));if(incomplete.length)return toast(`Complete ${incomplete.length} game${incomplete.length===1?'':'s'} first.`);week.finalized=true;audit('Week finalized',`Week ${week.number}`);saveState();renderScores();toast('Week finalized.');}break;
      case'reopen-week':if(isAdmin()&&confirm('Reopen this week so scores can be corrected?')){week.finalized=false;audit('Week reopened',`Week ${week.number}`);saveState();renderScores();break;}
      case'add-adjustment':if(isAdmin())openAdjustmentModal();break;
      case'delete-adjustment':if(isAdmin()){week.adjustments=week.adjustments.filter(a=>a.id!==button.dataset.adjustmentId);audit('Scoring adjustment removed',`Week ${week.number}`);saveState();renderScores();}break;
      case'standings-scope':standingsScope=button.dataset.scope;renderStandings();break;
      case'new-post':if(isAdmin())openPostModal();break;
      case'delete-post':if(isAdmin()&&confirm('Delete this post?')){state.posts=state.posts.filter(p=>p.id!==button.dataset.postId);audit('League post deleted','');saveState();renderFeed();}break;
      case'add-week':if(isAdmin()){const s=currentSeason();s.totalWeeks++;state.selectedWeek=s.totalWeeks;ensureWeek(s.totalWeeks);audit('Week added',`Week ${s.totalWeeks}`);saveState();render();toast(`Week ${s.totalWeeks} added.`);}break;
      case'save-season-name':if(isAdmin()){const val=document.getElementById('adminSeasonName')?.value.trim();if(val){currentSeason().name=val;audit('Season renamed',val);saveState();renderAdmin();toast('Season saved.');}}break;
      case'new-season':if(isAdmin()){const name=prompt('New season name:',`GLOAT Season ${state.seasons.length+1}`);if(name?.trim()){const s={id:uid('season'),name:name.trim(),totalWeeks:12,createdAt:new Date().toISOString(),weeks:{}};state.seasons.push(s);state.selectedSeasonId=s.id;state.selectedWeek=1;audit('Season created',s.name);saveState();renderAdmin();}}break;
      case'add-member':if(isAdmin())openMemberModal();break;
      case'edit-member':if(isAdmin())openMemberModal(button.dataset.memberId);break;
      case'sign-out':localStorage.removeItem(SESSION_KEY);localStorage.removeItem('gloat-session-v2');authMode='login';render();break;
      case'export-data':exportData();break;
      case'import-data':importInput.click();break;
      case'reset-data':if(isAdmin()&&confirm('Reset ALL local GLOAT data on this device?')){state=createDefaultState();localStorage.removeItem(SESSION_KEY);localStorage.removeItem('gloat-session-v2');saveState();render();}break;
      case'install-app':installApp();break;
    }
  }

  function handleChange(event) {
    const t=event.target,week=ensureWeek();
    if(t===seasonSelect){state.selectedSeasonId=t.value;state.selectedWeek=1;saveState();render();return;}
    if(t===weekSelect){state.selectedWeek=Number(t.value);saveState();render();return;}
    if(t.id==='emailOptIn'){const a=currentAccount();if(a){a.emailOptIn=t.checked;saveState();}return;}
    if(t.id==='weekGameCatalog'){const cat=catalogById(t.value),mode=document.getElementById('weekGameMode');if(cat&&mode)mode.value=cat.defaultMode||'solo';return;}
    if(!isAdmin())return;
    if(t.id==='weekDate'){updateWeek(w=>w.date=t.value,false,'Week date changed');return;}
    if(t.id==='weekTime'){updateWeek(w=>w.time=t.value,false,'Week time changed');return;}
    if(t.id==='weekLocation'){updateWeek(w=>w.location=t.value,false,'Week location changed');return;}
    if(t.id==='weekNotes'){updateWeek(w=>w.notes=t.value,false,'Week notes changed');return;}
    if(t.id==='avoidSpouses'){updateWeek(w=>w.avoidSpouses=t.checked,false,'Pairing rule changed');return;}
    if(t.id==='minimizeRepeats'){updateWeek(w=>w.minimizeRepeats=t.checked,false,'Pairing rule changed');return;}
    if(t.dataset.action==='attendance-toggle'){
      if(week.games.some(g=>Object.keys(g.results||{}).length)&&!confirm('Changing attendance clears teams and current results. Continue?')){t.checked=!t.checked;return;}
      const id=t.dataset.memberId;if(t.checked&&!week.attendance.includes(id))week.attendance.push(id);if(!t.checked)week.attendance=week.attendance.filter(x=>x!==id);week.teams=[];week.unpaired=[];week.soloOrder=[];clearWeekResults(week);audit('Attendance updated',`Week ${week.number}`);saveState();renderWeekSetup();return;
    }
    if(t.dataset.action==='rank-change'){
      if(week.finalized)return;const game=week.games.find(g=>g.id===t.dataset.gameId);if(!game)return;const key=t.dataset.competitorKey,rank=t.value?Number(t.value):null;
      if(rank){const dup=Object.entries(game.results||{}).find(([k,r])=>k!==key&&Number(r)===rank);if(dup){t.value=game.results?.[key]||'';return toast(`${ordinal(rank)} place is already assigned.`);}game.results[key]=rank;}else delete game.results[key];
      week.updatedAt=new Date().toISOString();audit('Score edited',`Week ${week.number}: ${game.name}`);saveState();renderScores();return;
    }
  }

  function formatDate(value){if(!value)return'';return new Date(`${value}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});} 
  function formatTime(value){if(!value)return'';const[h,m]=value.split(':').map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});} 
  function formatDateTime(value){if(!value)return'';return new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});} 
  function formatSigned(n){n=Number(n)||0;return n>0?`+${n}`:`${n}`;} 
  function ordinal(n){const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}

  function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`gloat-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Backup downloaded.');}
  function installApp(){if(!deferredInstallPrompt)return toast('Use your browser’s Add to Home Screen option.');deferredInstallPrompt.prompt();deferredInstallPrompt.userChoice.finally(()=>deferredInstallPrompt=null);}

  document.addEventListener('submit',handleSubmit);
  document.addEventListener('click',handleClick);
  document.addEventListener('change',handleChange);
  document.getElementById('brandButton').addEventListener('click',()=>setView('home'));
  profileButton.addEventListener('click',()=>setView('profile'));
  menuButton.addEventListener('click',()=>{menu.hidden=!menu.hidden;menuButton.setAttribute('aria-expanded',String(!menu.hidden));});
  modalRoot.addEventListener('click',e=>{if(e.target===modalRoot)closeModal();});
  importInput.addEventListener('change',async()=>{const file=importInput.files?.[0];if(!file)return;try{const imported=normalizeState(JSON.parse(await file.text()));if(!confirm('Replace all current local GLOAT data with this backup?'))return;state=imported;saveState();render();toast('Backup restored.');}catch(e){console.error(e);toast('Invalid GLOAT backup.');}finally{importInput.value='';}});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;});
  if('serviceWorker'in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(console.error));

  render();
})();
