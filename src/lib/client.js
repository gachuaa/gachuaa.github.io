const root = document.documentElement;
const body = document.body;
const base = body?.dataset.base || '/';
const backButton = document.querySelector('[data-go-back]');

const resolveTheme = (preference) => preference === 'system'
  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  : preference;

function setTheme(preference, persist = true) {
  const next = ['light', 'dark', 'system'].includes(preference) ? preference : 'system';
  root.dataset.theme = resolveTheme(next);
  root.dataset.themePreference = next;
  document.querySelectorAll('[data-theme-switch]').forEach((button) => {
    const isDark = root.dataset.theme === 'dark';
    button.setAttribute('aria-checked', String(isDark));
    button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
  });
  if (persist) {
    try { localStorage.setItem('snipper-theme', next); } catch { /* private browsing */ }
  }
}

setTheme(root.dataset.themePreference || 'system', false);
backButton?.addEventListener('click', () => {
  if (window.history.length > 1 && document.referrer && document.referrer.startsWith(location.origin)) {
    window.history.back();
    return;
  }
  window.location.href = base;
});
document.querySelectorAll('[data-theme-switch]').forEach((button) => {
  button.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (root.dataset.themePreference === 'system') setTheme('system', false);
});

let suppressSearchFocusOnce = false;
function closeDialog(dialog) {
  if (!dialog?.open) return;
  if (dialog.id === 'search-dialog') suppressSearchFocusOnce = true;
  dialog.close();
}
function selectEntryView(tab, syncLocation = false) {
  const views=tab.closest('[data-entry-views]');
  if(!views)return;
  views.querySelectorAll('[data-entry-tab]').forEach(item=>{
    const selected=item===tab;
    item.setAttribute('aria-selected',String(selected));
    item.tabIndex=selected?0:-1;
  });
  views.querySelectorAll('[data-entry-panel]').forEach(panel=>{
    panel.hidden=panel.dataset.entryPanel!==tab.dataset.entryTab;
    if(!panel.hidden)panel.querySelector('.canvas-board')?.dispatchEvent(new Event('entry-view-shown'));
  });
  if(syncLocation){
    const hash=tab.dataset.entryTab==='canvas'?'#canvas':'';
    const locationPath=`${location.pathname}${location.search}${hash}`;
    if(`${location.pathname}${location.search}${location.hash}`!==locationPath)history.replaceState(null,'',locationPath);
  }
}
function syncEntryViewToHash(){
  const name=location.hash==='#canvas'?'canvas':'markdown';
  const tab=document.querySelector(`[data-entry-tab="${name}"]`);
  if(tab)selectEntryView(tab);
}
window.addEventListener('hashchange',syncEntryViewToHash);
syncEntryViewToHash();
document.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-open], [data-close], [data-focus], [data-collapse-all], [data-collapse-topics], [data-entry-tab]');
  if (!target) return;
  if (target.dataset.entryTab !== undefined) selectEntryView(target,true);
  if (target.dataset.open) document.getElementById(target.dataset.open)?.showModal?.();
  if (target.dataset.close !== undefined) closeDialog(target.closest('dialog'));
  if (target.dataset.focus !== undefined) {
    const enabled = body.classList.toggle('focus-mode');
    target.setAttribute('aria-pressed', String(enabled));
  }
  if (target.dataset.collapseAll !== undefined) {
    target.closest('.page')?.querySelectorAll('details').forEach((item) => { item.open = false; });
  }
  if (target.dataset.collapseTopics !== undefined) {
    target.closest('.topic-groups')?.querySelectorAll('details').forEach((item) => { item.open = false; });
  }
});
document.querySelectorAll('[data-entry-tab]').forEach(tab=>tab.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...tab.closest('[data-entry-views]').querySelectorAll('[data-entry-tab]')];
  const index=tabs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  event.preventDefault();tabs[next].focus();selectEntryView(tabs[next],true);
}));

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
});

const globalSearch = document.querySelector('.global-search');
const globalSearchInput = globalSearch?.querySelector('input');
const searchDialog = document.querySelector('#search-dialog');
const overlaySearchInput = searchDialog?.querySelector('[data-search-overlay-input]');
const overlayResults = searchDialog?.querySelector('[data-search-overlay-results]');
let searchScrollPosition = 0;
let searchPointerScrollPosition = 0;
let searchPointerDown = false;
function lockSearchBackground() {
  if (body.classList.contains('search-dialog-open')) return;
  searchScrollPosition = searchPointerDown ? searchPointerScrollPosition : window.scrollY;
  root.classList.add('search-scroll-lock');
  body.style.setProperty('--search-scroll-top', `-${searchScrollPosition}px`);
  body.classList.add('search-dialog-open');
}
function unlockSearchBackground() {
  if (!body.classList.contains('search-dialog-open')) return;
  body.classList.remove('search-dialog-open');
  body.style.removeProperty('--search-scroll-top');
  window.scrollTo({ top: searchScrollPosition, left: 0, behavior: 'instant' });
  requestAnimationFrame(() => {
    if (!searchDialog?.open) root.classList.remove('search-scroll-lock');
  });
}
searchDialog?.addEventListener('close', () => {
  setTimeout(() => {
    if (!searchDialog.open) unlockSearchBackground();
  }, 100);
});
document.addEventListener('click', (event) => {
  if (!searchDialog?.open) return;
  if (event.target.closest?.('.global-search')) return;
  const bounds = searchDialog.getBoundingClientRect();
  const clickInsideDialog = event.clientX >= bounds.left && event.clientX <= bounds.right
    && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  if (!clickInsideDialog) closeDialog(searchDialog);
});
let overlayIndexPromise;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const searchIndex = () => overlayIndexPromise ||= fetch(`${base}search.json`).then((response) => response.json()).catch(() => []);
const searchTypeLabel = (type) => type === 'writeups' ? 'Write-up' : type === 'articles' ? 'Article' : 'Note';
const paletteIconPaths = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 12h8M8 16h6',
  notes: 'M4 4h16v13l-4 4H4ZM8 8h8M8 12h8M8 16h4',
  folder: 'M3 5h7l2 3h9v12H3Z',
  tag: 'M3 3h8l10 10-8 8L3 11ZM7 7h.01',
  archive: 'M3 4h18v4H3ZM5 8v12h14V8M10 12h4',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  command: 'M9 9V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V5',
  print: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6Z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
};
const paletteIcon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paletteIconPaths[name] || paletteIconPaths.file}"/></svg>`;
let searchScope = 'posts';
function paletteLink({url, label, description='', icon='file', meta=''}) {
  return `<a class="search-palette-row" href="${escapeHtml(url)}"><span class="search-palette-icon">${paletteIcon(icon)}</span><span class="search-palette-copy"><strong>${escapeHtml(label)}</strong>${description ? `<small>${escapeHtml(description)}</small>` : ''}</span>${meta ? `<span class="search-palette-meta">${escapeHtml(meta)}</span>` : `<span class="search-palette-arrow">${paletteIcon('arrow')}</span>`}</a>`;
}
function renderSearchOverlay(query = '') {
  if (!overlayResults) return;
  searchIndex().then((index) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matchesQuery = (value) => !terms.length || terms.every((term) => value.toLowerCase().includes(term));
    const topicCounts = new Map();
    index.forEach((item) => item.topics?.forEach((topic) => topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)));
    const topics = [...topicCounts.entries()]
      .map(([topic, count]) => ({topic, count, label:topic === 'http' ? 'HTTP' : topic === 'xss' ? 'XSS' : topic.replace(/(^|-)([a-z])/g, (_match, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`)}))
      .filter(({topic,label}) => matchesQuery(`${topic} ${label}`))
      .sort((left,right) => left.label.localeCompare(right.label))
      .slice(0, terms.length ? 6 : 8)
      .map(({topic,count,label}) => paletteLink({url:`${base}topics/${encodeURIComponent(topic)}/`,label,icon:'tag',meta:`${count} ${count === 1 ? 'entry' : 'entries'}`}));
    const posts = index.filter((item) => matchesQuery(`${item.title} ${item.description} ${item.text} ${item.topics?.join(' ') || ''}`))
      .slice(0, terms.length ? 6 : 4)
      .map((item) => paletteLink({url:item.url,label:item.title,description:item.description,icon:item.type === 'notes' ? 'notes' : item.type === 'writeups' ? 'folder' : 'file',meta:searchTypeLabel(item.type)}));
    const results = searchScope === 'tags' ? topics : posts;
    const heading = searchScope === 'tags' ? 'Tags' : terms.length ? 'Matching posts' : 'Posts';
    overlayResults.innerHTML = `<section class="search-palette-section"><h2 class="search-palette-heading"><span>${heading}</span><span class="search-palette-count">${results.length}</span></h2>${results.length ? results.join('') : '<p class="search-panel-hint search-palette-empty">No matches. Try another search.</p>'}</section>`;
  });
}
searchDialog?.querySelectorAll('[data-search-scope]').forEach((button) => {
  button.addEventListener('click', () => {
    searchScope = button.dataset.searchScope;
    searchDialog.querySelectorAll('[data-search-scope]').forEach((scopeButton) => {
      scopeButton.setAttribute('aria-pressed', String(scopeButton === button));
    });
    renderSearchOverlay(overlaySearchInput?.value || '');
  });
});
function openSearchOverlay() {
  if (!searchDialog?.open) {
    lockSearchBackground();
    searchDialog?.showModal?.();
  }
  if (overlaySearchInput) {
    overlaySearchInput.value = globalSearchInput?.value || '';
    overlaySearchInput.focus();
    overlaySearchInput.select();
  }
  renderSearchOverlay(overlaySearchInput?.value || '');
}
globalSearchInput?.addEventListener('focus', () => {
  if (suppressSearchFocusOnce) {
    suppressSearchFocusOnce = false;
    return;
  }
  if (searchPointerDown) return;
  openSearchOverlay();
});
globalSearch?.addEventListener('pointerdown', () => {
  searchPointerScrollPosition = window.scrollY;
  searchPointerDown = true;
  setTimeout(() => { searchPointerDown = false; }, 1000);
});
globalSearch?.addEventListener('click', () => {
  if (!searchDialog?.open) openSearchOverlay();
  searchPointerDown = false;
});
globalSearch?.addEventListener('pointercancel', () => { searchPointerDown = false; });
globalSearchInput?.addEventListener('input', () => {
  if (overlaySearchInput) overlaySearchInput.value = globalSearchInput.value;
  if (searchDialog?.open) renderSearchOverlay(globalSearchInput.value);
});
overlaySearchInput?.addEventListener('input', () => {
  if (globalSearchInput) globalSearchInput.value = overlaySearchInput.value;
  renderSearchOverlay(overlaySearchInput.value);
});
searchDialog?.querySelector('[data-search-overlay-form]')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = overlaySearchInput?.value.trim() || '';
  closeDialog(searchDialog);
  window.location.href = `${base}search/${query ? `?q=${encodeURIComponent(query)}` : ''}`;
});
globalSearch?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = new FormData(globalSearch).get('q')?.toString().trim() || '';
  window.location.href = `${base}search/${query ? `?q=${encodeURIComponent(query)}` : ''}`;
});
document.addEventListener('click', (event) => {
  const command = event.target.closest?.('[data-search-command]')?.dataset.searchCommand;
  if (!command) return;
  if (command === 'theme') setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  if (command === 'print') window.print();
  closeDialog(searchDialog);
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    globalSearch?.querySelector('input')?.focus();
  }
  if (event.key === 'Escape') document.querySelectorAll('dialog[open]').forEach(closeDialog);
});

function refreshCollections(scope = document) {
  scope.querySelectorAll('[data-collection]').forEach((collection) => {
    const rows = [...collection.querySelectorAll('[data-collection-rows] > .filter-row')];
    const matches = rows.filter((row) => row.dataset.filtered !== 'true');
    const limit = Math.max(1, Number(collection.dataset.limit) || matches.length || 1);
    const state = Number(collection.dataset.page) || 1;
    const pages = Math.max(1, Math.ceil(matches.length / limit));
    const page = Math.min(state, pages);
    collection.dataset.page = String(page);
    rows.forEach((row) => {
      const index = matches.indexOf(row);
      row.hidden = row.dataset.filtered === 'true' || index < (page - 1) * limit || index >= page * limit;
    });
    const pagination = collection.querySelector('[data-collection-pagination]');
    if (pagination) {
      pagination.hidden = pages <= 1;
      pagination.querySelector('[data-previous]')?.toggleAttribute('disabled', page <= 1);
      pagination.querySelector('[data-next]')?.toggleAttribute('disabled', page >= pages);
      const label = pagination.querySelector('[data-page-label]');
      if (label) label.textContent = pages > 1 ? `Page ${page} of ${pages}` : '';
    }
    collection.querySelector('[data-empty]')?.toggleAttribute('hidden', matches.length > 0);
  });
}

function applyFilters(scope) {
  const type = scope.querySelector('[data-type-filter][aria-pressed="true"]')?.dataset.typeFilter || 'all';
  const topic = scope.querySelector('[data-topic-filter][aria-pressed="true"]')?.dataset.topicFilter || '';
  const difficulty = scope.querySelector('[data-writeup-difficulty-option][aria-pressed="true"]')?.dataset.writeupDifficultyOption || '';
  scope.querySelectorAll('.filter-row').forEach((row) => {
    const typeMatch = type === 'all' || row.dataset.type === type;
    const topicMatch = !topic || (row.dataset.topics || '').split(' ').includes(topic);
    const difficultyMatch = !difficulty || (row.dataset.difficulty || '').toLowerCase() === difficulty;
    row.dataset.filtered = String(!(typeMatch && topicMatch && difficultyMatch));
  });
  refreshCollections(scope);
}

document.querySelectorAll('[data-filter-scope]').forEach((scope) => {
  scope.querySelectorAll('[data-type-filter], [data-topic-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.typeFilter !== undefined ? 'type' : 'topic';
      scope.querySelectorAll(kind === 'type' ? '[data-type-filter]' : '[data-topic-filter]').forEach((item) => item.setAttribute('aria-pressed', 'false'));
      button.setAttribute('aria-pressed', 'true');
      applyFilters(scope);
    });
  });
  scope.querySelectorAll('[data-writeup-difficulty-option]').forEach((button) => {
    button.addEventListener('click', () => {
      scope.querySelectorAll('[data-writeup-difficulty-option]').forEach((option) => {
        option.setAttribute('aria-pressed', String(option === button));
      });
      applyFilters(scope);
      scope.querySelector('[data-writeup-filter-menu]')?.removeAttribute('open');
    });
  });
  applyFilters(scope);
});

document.querySelectorAll('[data-collection-pagination]').forEach((pagination) => {
  const collection = pagination.closest('[data-collection]');
  pagination.querySelector('[data-previous]')?.addEventListener('click', () => {
    collection.dataset.page = String(Math.max(1, (Number(collection.dataset.page) || 1) - 1));
    refreshCollections(collection.parentElement);
  });
  pagination.querySelector('[data-next]')?.addEventListener('click', () => {
    collection.dataset.page = String((Number(collection.dataset.page) || 1) + 1);
    refreshCollections(collection.parentElement);
  });
});

// Topic lookup narrows the topic directory without changing the URL.
document.querySelector('[data-topic-lookup]')?.addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('[data-topic-group]').forEach((group) => {
    const matches = !query || group.textContent.toLowerCase().includes(query);
    group.hidden = !matches;
    if (query && matches) group.open = true;
  });
  document.querySelectorAll('[data-topic-card]').forEach((card) => {
    card.hidden = Boolean(query) && !card.textContent.toLowerCase().includes(query);
  });
});

// Highlight the section currently in view on reading pages.
const tocLinks = [...document.querySelectorAll('[data-toc-link]')];
const headings = tocLinks.map((link) => document.getElementById(link.dataset.tocLink)).filter(Boolean);
if (tocLinks.length) {
  const updateToc=()=>{
    const hashMatch = window.location.hash ? tocLinks.find((link) => link.dataset.tocLink === window.location.hash.slice(1)) : null;
    let activeHeading = hashMatch ? document.getElementById(hashMatch.dataset.tocLink) : headings[0];
    const threshold=Math.min(window.innerHeight*.25,180);
    if (!hashMatch) {
      for(const heading of headings){
        if(heading.getBoundingClientRect().top<=threshold)activeHeading=heading;
        else break;
      }
      if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-2)activeHeading=headings.at(-1);
    }
    if(!activeHeading)return;
    const activeLink=tocLinks.find((link)=>link.dataset.tocLink===activeHeading.id);
    if(!activeLink)return;
    tocLinks.forEach((link)=>link.setAttribute('aria-current',String(link.dataset.tocLink===activeLink.dataset.tocLink)));
    for(let parent=activeLink.closest('li')?.parentElement?.closest('li');parent;parent=parent.parentElement?.closest('li')){
      const children=parent.querySelector(':scope > ul');
      if(!children)continue;
      children.hidden=false;
      const toggle=parent.querySelector(':scope > .toc-row [data-toc-toggle]');
      toggle?.setAttribute('aria-expanded','true');
      if(toggle)toggle.setAttribute('aria-label',`Collapse ${toggle.dataset.tocLabel}`);
    }
    const panel=activeLink.closest('.sticky-panel');
    if(!panel?.clientHeight)return;
    const linkBounds=activeLink.getBoundingClientRect(),panelBounds=panel.getBoundingClientRect();
    if(linkBounds.top<panelBounds.top)panel.scrollTop-=panelBounds.top-linkBounds.top;
    else if(linkBounds.bottom>panelBounds.bottom)panel.scrollTop+=linkBounds.bottom-panelBounds.bottom;
  };
  window.addEventListener('scroll',updateToc,{passive:true});
  window.addEventListener('resize',updateToc);
  window.addEventListener('hashchange',updateToc);
  updateToc();
}
document.addEventListener('click',(event)=>{
  const toggle=event.target.closest?.('[data-toc-toggle]');
  if(!toggle)return;
  const children=toggle.closest('li')?.querySelector(':scope > ul');
  if(!children)return;
  const expanded=toggle.getAttribute('aria-expanded')==='true';
  children.hidden=expanded;
  toggle.setAttribute('aria-expanded',String(!expanded));
  toggle.setAttribute('aria-label',`${expanded?'Expand':'Collapse'} ${toggle.dataset.tocLabel}`);
});

document.querySelectorAll('.prose pre').forEach((pre) => {
  if (pre.parentElement?.classList.contains('code-block')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block';
  pre.before(wrapper);
  wrapper.append(pre);
  const button = document.createElement('button');
  button.className = 'code-copy';
  button.type = 'button';
  button.textContent = 'Copy';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector('code')?.innerText || pre.innerText);
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1200);
    } catch { button.textContent = 'Select and copy'; }
  });
  wrapper.append(button);
});

const searchPage = document.querySelector('[data-search-page]');
if (searchPage) {
  const results = searchPage.querySelector('[data-search-results]');
  const summary = searchPage.querySelector('[data-search-summary]');
  const pageLabel = searchPage.querySelector('[data-search-page-label]');
  const previous = searchPage.querySelector('[data-search-previous]');
  const next = searchPage.querySelector('[data-search-next]');
  const topicSelect = searchPage.querySelector('[data-search-topic]');
  let index = [], matches = [], page = 1, type = 'all';
  const perPage = 8;
  const queryInput = document.querySelector('.global-search input');
  const initialQuery = new URLSearchParams(window.location.search).get('q')?.trim() || '';
  if (queryInput) queryInput.value = initialQuery;
  const escape = (value) => value.replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const highlight = (value, query) => {
    const safe = escape(value);
    if (!query) return safe;
    const pattern = query.split(/\s+/).filter(Boolean).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return pattern ? safe.replace(new RegExp(`(${pattern})`, 'ig'), '<mark>$1</mark>') : safe;
  };
  const render = () => {
    const query = queryInput?.value.trim() || initialQuery;
    const topic = topicSelect?.value || '';
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    matches = index.filter((item) => {
      const haystack = `${item.title} ${item.description} ${item.text}`.toLowerCase();
      return (!terms.length || terms.every((term) => haystack.includes(term))) && (type === 'all' || item.type === type) && (!topic || item.topics.includes(topic));
    });
    const pages = Math.max(1, Math.ceil(matches.length / perPage));
    page = Math.min(page, pages);
    const visible = matches.slice((page - 1) * perPage, page * perPage);
    results.innerHTML = visible.length ? visible.map((item) => `<article class="search-result"><div class="search-result-meta"><span class="type-label">${escape(item.type === 'writeups' ? 'Write-up' : item.type === 'articles' ? 'Article' : 'Note')}</span><span class="small muted">${escape(item.topics.slice(0, 2).join(' · '))}</span></div><h2><a href="${escape(item.url)}">${highlight(item.title, query)}</a></h2><p>${highlight(item.description || item.text.slice(0, 180), query)}</p></article>`).join('') : '<p class="empty-state">No matching entries. Try a broader search.</p>';
    summary.textContent = query ? `${matches.length} result${matches.length === 1 ? '' : 's'} for “${query}”.` : 'Search titles, headings, and page content.';
    previous.toggleAttribute('disabled', page <= 1); next.toggleAttribute('disabled', page >= pages); previous.parentElement.hidden = pages <= 1; pageLabel.textContent = pages > 1 ? `Page ${page} of ${pages}` : '';
    searchPage.querySelectorAll('[data-type-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.typeFilter === type)));
  };
  document.querySelectorAll('[data-type-filter]').forEach((button) => button.addEventListener('click', () => { type = button.dataset.typeFilter; page = 1; render(); }));
  topicSelect?.addEventListener('change', () => { page = 1; render(); });
  previous?.addEventListener('click', () => { page = Math.max(1, page - 1); render(); });
  next?.addEventListener('click', () => { page += 1; render(); });
  fetch(`${base}search.json`).then((response) => response.json()).then((data) => { index = Array.isArray(data) ? data : []; render(); }).catch(() => { summary.textContent = 'Search index unavailable. Run the build again to regenerate it.'; });
}
