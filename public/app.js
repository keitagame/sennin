'use strict';

(function () {
  const el = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    data: null, // サーバー/Electronから取得した永続データ
    sideView: 'boards',
    menuCache: new Map(), // bbsmenuUrl -> categories
    currentBoard: null, // { name, url }
    currentThreads: [],
    threadSort: 'momentum',
    currentThread: null, // { id, title, datFile }
    currentPosts: [],
    knownBytesByThread: new Map(),
    autoUpdateTimer: null,
    filterText: '',
  };

  // ---------------------------------------------------------------------
  // 初期化
  // ---------------------------------------------------------------------
  async function init() {
    state.data = await window.api.getState();
    applyTheme();
    bindGlobalUI();
    renderSidePane();
    renderEmptyThreadPane();
    renderEmptyPostPane();
  }

  function applyTheme() {
    document.body.dataset.theme = state.data.settings.theme === 'light' ? 'light' : 'dark';
  }

  // ---------------------------------------------------------------------
  // 共通UIイベント
  // ---------------------------------------------------------------------
  function bindGlobalUI() {
    els('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        els('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.sideView = tab.dataset.view;
        renderSidePane();
        showPaneNarrow('side');
      });
    });

    el('#boardFilter').addEventListener('input', (e) => {
      state.filterText = e.target.value.trim();
      renderSidePane();
    });

    el('#addBoardBtn').addEventListener('click', openAddBoardModal);
    el('#addMenuBtn').addEventListener('click', openAddMenuModal);

    el('#refreshBtn').addEventListener('click', () => {
      if (state.currentThread) loadThreadPosts(state.currentBoard, state.currentThread, true);
      else if (state.currentBoard) loadThreadList(state.currentBoard);
      else init();
    });

    el('#settingsBtn').addEventListener('click', openSettingsModal);

    el('#threadSort').addEventListener('change', (e) => {
      state.threadSort = e.target.value;
      renderThreadList();
    });

    el('#navToggle').addEventListener('click', () => showPaneNarrow('side'));
    el('#backBtn').addEventListener('click', () => {
      if (getPaneStackNarrow() === 'post') showPaneNarrow('thread');
      else showPaneNarrow('side');
    });

    el('#favBtn').addEventListener('click', toggleFavoriteCurrentThread);
    el('#ngBtn').addEventListener('click', openNgModal);

    // アンカーホバープレビュー & クリックジャンプ (イベント委譲)
    const postList = el('#postList');
    postList.addEventListener('click', (e) => {
      const a = e.target.closest('a.anchor-link');
      if (a) {
        e.preventDefault();
        jumpToPost(parseInt(a.dataset.num, 10));
      }
    });
    postList.addEventListener('mouseover', (e) => {
      const a = e.target.closest('a.anchor-link');
      if (a) showAnchorPreview(a);
    });
    postList.addEventListener('mouseout', (e) => {
      const a = e.target.closest('a.anchor-link');
      if (a) hideAnchorPreview();
    });
  }

  function showPaneNarrow(which) {
    const map = { side: 'sidePane', thread: 'threadPane', post: 'postPane' };
    els('.pane').forEach((p) => p.classList.remove('visible'));
    el('#' + map[which]).classList.add('visible');
    document.body.dataset.paneStack = which;
  }
  function getPaneStackNarrow() {
    return document.body.dataset.paneStack || 'side';
  }

  // ---------------------------------------------------------------------
  // サイドペイン(板一覧 / お気に入り / 履歴)
  // ---------------------------------------------------------------------
  function renderSidePane() {
    const root = el('#sideContent');
    root.innerHTML = '';
    if (state.sideView === 'boards') return renderBoardsTree(root);
    if (state.sideView === 'favorites') return renderFavorites(root);
    if (state.sideView === 'history') return renderHistory(root);
  }

  function matchesFilter(text) {
    if (!state.filterText) return true;
    return text.toLowerCase().includes(state.filterText.toLowerCase());
  }

  function renderBoardsTree(root) {
    // 登録済みの板(手動追加)
    if (state.data.boards.length) {
      const cat = document.createElement('div');
      cat.className = 'menu-category';
      cat.textContent = '登録した板';
      root.appendChild(cat);
      state.data.boards.forEach((b) => {
        if (!matchesFilter(b.name)) return;
        root.appendChild(renderBoardRow(b, true));
      });
    }

    // BBSMENUごとのカテゴリツリー
    state.data.bbsmenus.forEach((menu) => {
      const cached = state.menuCache.get(menu.url);
      const header = document.createElement('div');
      header.className = 'menu-category';
      header.textContent = menu.name + (cached ? '' : ' (クリックで読込)');
      header.style.cursor = 'pointer';
      header.addEventListener('click', async () => {
        if (state.menuCache.has(menu.url)) return;
        header.textContent = menu.name + ' (読込中…)';
        try {
          const categories = await window.api.fetchBbsMenu(menu.url);
          state.menuCache.set(menu.url, categories);
          renderSidePane();
        } catch (err) {
          header.textContent = menu.name + ' (読込失敗)';
          console.error(err);
        }
      });
      root.appendChild(header);

      if (cached) {
        cached.forEach((category) => {
          const shown = category.boards.filter((b) => matchesFilter(b.name));
          if (!shown.length) return;
          const sub = document.createElement('div');
          sub.className = 'menu-category';
          sub.style.opacity = '0.6';
          sub.style.fontSize = '9px';
          sub.textContent = category.name;
          root.appendChild(sub);
          shown.slice(0, 60).forEach((b) => root.appendChild(renderBoardRow(b, false)));
        });
      }
    });

    if (!root.children.length) {
      root.appendChild(emptyState('◈', 'まだ板がありません。\n下の「+ 板を追加」または\n「+ BBSMENU追加」から登録してください。'));
    }
  }

  function renderBoardRow(board, removable) {
    const row = document.createElement('div');
    row.className = 'board-row';
    if (state.currentBoard && state.currentBoard.url === board.url) row.classList.add('active');
    row.innerHTML = `<span>${escapeHtml(board.name)}</span>` + (removable ? '<span class="del" data-act="del">✕</span>' : '');
    row.addEventListener('click', (e) => {
      if (e.target.dataset.act === 'del') {
        e.stopPropagation();
        window.api.removeBoard(board.url).then((s) => {
          state.data = s;
          renderSidePane();
        });
        return;
      }
      loadThreadList(board);
      showPaneNarrow('thread');
    });
    return row;
  }

  function renderFavorites(root) {
    if (!state.data.favorites.length) {
      root.appendChild(emptyState('☆', 'お気に入りのスレッドはありません。\nスレを開いて☆ボタンで登録できます。'));
      return;
    }
    state.data.favorites.forEach((f) => {
      if (!matchesFilter(f.title)) return;
      const row = document.createElement('div');
      row.className = 'fav-row';
      row.innerHTML = `
        <div class="main">
          <span>${escapeHtml(f.title)}</span>
          <span class="sub">${escapeHtml(f.boardName || '')}</span>
        </div>
        <span class="del" data-act="del">✕</span>`;
      row.addEventListener('click', (e) => {
        if (e.target.dataset.act === 'del') {
          e.stopPropagation();
          window.api.removeFavorite(f.boardUrl, f.threadId).then((s) => {
            state.data = s;
            renderSidePane();
          });
          return;
        }
        openThreadDirect(f);
      });
      root.appendChild(row);
    });
  }

  function renderHistory(root) {
    if (!state.data.history.length) {
      root.appendChild(emptyState('◷', '閲覧履歴はありません。'));
      return;
    }
    state.data.history.forEach((h) => {
      if (!matchesFilter(h.title)) return;
      const row = document.createElement('div');
      row.className = 'hist-row';
      row.innerHTML = `
        <div class="main">
          <span>${escapeHtml(h.title)}</span>
          <span class="sub">${escapeHtml(h.boardName || '')} ・ ${new Date(h.viewedAt).toLocaleString('ja-JP')}</span>
        </div>`;
      row.addEventListener('click', () => openThreadDirect(h));
      root.appendChild(row);
    });
  }

  function emptyState(mark, text) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.innerHTML = `<div class="mark">${mark}</div><div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
    return d;
  }

  async function openThreadDirect(entry) {
    const board = { name: entry.boardName, url: entry.boardUrl };
    state.currentBoard = board;
    await loadThreadPosts(board, { id: entry.threadId, title: entry.title, datFile: `${entry.threadId}.dat` });
    showPaneNarrow('post');
  }

  // ---------------------------------------------------------------------
  // スレッド一覧(threadPane)
  // ---------------------------------------------------------------------
  async function loadThreadList(board) {
    state.currentBoard = board;
    el('#threadPaneTitle').textContent = board.name;
    el('#threadList').innerHTML = '<div class="empty">読み込み中…</div>';
    try {
      const { threads } = await window.api.fetchSubject(board.url);
      state.currentThreads = threads;
      renderThreadList();
      renderSidePane(); // active状態更新
    } catch (err) {
      el('#threadList').innerHTML = '';
      el('#threadList').appendChild(emptyState('!', '取得に失敗しました。\n' + err.message));
    }
  }

  function renderThreadList() {
    const root = el('#threadList');
    root.innerHTML = '';
    let list = [...state.currentThreads];
    if (state.filterText) list = list.filter((t) => t.title.toLowerCase().includes(state.filterText.toLowerCase()));
    if (state.threadSort === 'momentum') list.sort((a, b) => b.momentum - a.momentum);
    else if (state.threadSort === 'new') list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    else if (state.threadSort === 'res') list.sort((a, b) => b.resCount - a.resCount);

    if (!list.length) {
      root.appendChild(emptyState('—', 'スレッドが見つかりません。'));
      return;
    }
    const maxMomentum = Math.max(...list.map((t) => t.momentum), 1);
    list.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'thread-row';
      if (state.currentThread && state.currentThread.id === t.id) row.classList.add('active');
      const barPct = Math.min(100, Math.round((t.momentum / maxMomentum) * 100));
      row.innerHTML = `
        <div class="idx">${i + 1}</div>
        <div>
          <div class="title">${escapeHtml(t.title)}</div>
          <div class="meta"><span>${t.resCount}res</span><span>勢い ${t.momentum}</span></div>
        </div>
        <div class="momentum-bar"><span style="width:${barPct}%"></span></div>`;
      row.addEventListener('click', () => {
        loadThreadPosts(state.currentBoard, t);
        showPaneNarrow('post');
      });
      root.appendChild(row);
    });
  }

  function renderEmptyThreadPane() {
    el('#threadList').innerHTML = '';
    el('#threadList').appendChild(emptyState('◈', '左のリストから板を選んでください。'));
  }

  // ---------------------------------------------------------------------
  // スレ本文(postPane)
  // ---------------------------------------------------------------------
  async function loadThreadPosts(board, thread, isRefresh) {
    stopAutoUpdate();
    state.currentBoard = board;
    state.currentThread = thread;
    el('#postPaneTitle').textContent = thread.title || '(無題)';
    updateFavButton();

    if (!isRefresh) {
      el('#postList').innerHTML = '<div class="empty">読み込み中…</div>';
      state.knownBytesByThread.delete(thread.id);
    }

    try {
      const known = state.knownBytesByThread.get(thread.id) || 0;
      const result = await window.api.fetchDat(board.url, thread.id, known);
      state.knownBytesByThread.set(thread.id, result.newBytes || known);

      if (result.full || !isRefresh) {
        state.currentPosts = result.posts;
      } else if (result.posts.length) {
        state.currentPosts = state.currentPosts.concat(result.posts);
      }

      if (state.currentPosts[0] && state.currentPosts[0].title) {
        thread.title = state.currentPosts[0].title;
        el('#postPaneTitle').textContent = thread.title;
      }

      renderPosts(isRefresh);
      renderThreadList();

      window.api.pushHistory({
        boardUrl: board.url,
        boardName: board.name,
        threadId: thread.id,
        title: thread.title || '(無題)',
      }).then((s) => (state.data = s));

      if (window.sen2chSetDiscordActivity) {
        window.sen2chSetDiscordActivity(thread.title || '無題スレ', `${state.currentPosts.length}res`);
      }

      startAutoUpdateIfNeeded();
      el('#postStatus').textContent = `${state.currentPosts.length} レス ・ 最終更新 ${new Date().toLocaleTimeString('ja-JP')}`;
    } catch (err) {
      if (!isRefresh) {
        el('#postList').innerHTML = '';
        el('#postList').appendChild(emptyState('!', '取得に失敗しました。\n' + err.message));
      }
    }
  }

  function renderEmptyPostPane() {
    el('#postList').appendChild(emptyState('◈', 'スレッドを選択してください。'));
  }

  function isNgPost(post) {
    const d = state.data;
    if (d.ngIds.length && post.id && d.ngIds.includes(post.id)) return true;
    if (d.ngNames.length && d.ngNames.some((n) => post.name.includes(n))) return true;
    if (d.ngWords.length && d.ngWords.some((w) => post.body.includes(w))) return true;
    return false;
  }

  function renderPosts(keepScroll) {
    const root = el('#postList');
    const prevScroll = root.scrollTop;
    root.innerHTML = '';
    state.currentPosts.forEach((post) => {
      const div = document.createElement('div');
      div.className = 'post';
      div.id = 'post-' + post.resNum;
      if (isNgPost(post)) {
        div.innerHTML = `<div class="post-head">
          <span class="post-num">${post.resNum}</span>
          <span style="color:var(--danger)">NGフィルタにより非表示 (クリックで表示)</span>
        </div>`;
        div.style.opacity = '0.55';
        div.addEventListener('click', () => renderSinglePostFull(div, post), { once: true });
      } else {
        div.innerHTML = renderPostInner(post);
      }
      root.appendChild(div);
    });
    if (keepScroll) root.scrollTop = prevScroll;
  }

  function renderSinglePostFull(div, post) {
    div.style.opacity = '1';
    div.innerHTML = renderPostInner(post);
  }

  function renderPostInner(post) {
    return `
      <div class="post-head">
        <span class="post-num">${post.resNum}</span>
        <span class="post-name">${escapeHtml(post.name)}${post.mail ? ' [' + escapeHtml(post.mail) + ']' : ''}</span>
        <span>${escapeHtml(post.date)}</span>
        ${post.id ? `<span>ID:${escapeHtml(post.id)}</span>` : ''}
      </div>
      <div class="post-body">${linkifyBody(post.body)}</div>`;
  }

  /** 本文中の >>アンカー / URL / 画像URL をリンク化する(常にHTMLエスケープしてから組み立てる) */
  function linkifyBody(text) {
    const re = /(>>(\d+)(?:[-,]\d+)?)|(https?:\/\/[^\s<>"'　]+)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      out += escapeHtml(text.slice(last, m.index));
      if (m[1]) {
        out += `<a href="#" class="anchor-link" data-num="${m[2]}">${escapeHtml(m[1])}</a>`;
      } else if (m[3]) {
        const url = m[3];
        const isImg = /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url);
        out += `<a href="${escapeAttr(url)}" class="ext-link" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
        if (isImg) {
          out += `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer"><img class="post-img-preview" src="${escapeAttr(url)}" loading="lazy" alt="画像"></a>`;
        }
      }
      last = re.lastIndex;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  function jumpToPost(num) {
    const target = el('#post-' + num);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlight');
    setTimeout(() => target.classList.remove('highlight'), 1200);
  }

  let previewPopup = null;
  function showAnchorPreview(anchorEl) {
    const num = parseInt(anchorEl.dataset.num, 10);
    const post = state.currentPosts.find((p) => p.resNum === num);
    if (!post) return;
    hideAnchorPreview();
    previewPopup = document.createElement('div');
    previewPopup.className = 'anchor-preview-popup';
    previewPopup.textContent = `${post.resNum} ${post.name}\n${post.body.slice(0, 300)}`;
    document.body.appendChild(previewPopup);
    const rect = anchorEl.getBoundingClientRect();
    previewPopup.style.left = Math.min(rect.left, window.innerWidth - 440) + 'px';
    previewPopup.style.top = Math.min(rect.bottom + 6, window.innerHeight - 160) + 'px';
  }
  function hideAnchorPreview() {
    if (previewPopup) {
      previewPopup.remove();
      previewPopup = null;
    }
  }

  // ---------------------------------------------------------------------
  // 自動更新
  // ---------------------------------------------------------------------
  function startAutoUpdateIfNeeded() {
    const sec = state.data.settings.autoUpdateSec;
    if (!sec) return;
    state.autoUpdateTimer = setInterval(() => {
      if (state.currentThread) loadThreadPosts(state.currentBoard, state.currentThread, true);
    }, sec * 1000);
  }
  function stopAutoUpdate() {
    if (state.autoUpdateTimer) clearInterval(state.autoUpdateTimer);
    state.autoUpdateTimer = null;
  }

  // ---------------------------------------------------------------------
  // お気に入り
  // ---------------------------------------------------------------------
  function updateFavButton() {
    const btn = el('#favBtn');
    if (!state.currentThread || !state.currentBoard) return;
    const isFav = state.data.favorites.some(
      (f) => f.boardUrl === state.currentBoard.url && f.threadId === state.currentThread.id
    );
    btn.textContent = isFav ? '★' : '☆';
    btn.style.color = isFav ? 'var(--shu)' : '';
  }
  async function toggleFavoriteCurrentThread() {
    if (!state.currentThread || !state.currentBoard) return;
    const isFav = state.data.favorites.some(
      (f) => f.boardUrl === state.currentBoard.url && f.threadId === state.currentThread.id
    );
    if (isFav) {
      state.data = await window.api.removeFavorite(state.currentBoard.url, state.currentThread.id);
    } else {
      state.data = await window.api.addFavorite({
        boardUrl: state.currentBoard.url,
        boardName: state.currentBoard.name,
        threadId: state.currentThread.id,
        title: state.currentThread.title || '(無題)',
      });
    }
    updateFavButton();
  }

  // ---------------------------------------------------------------------
  // モーダル(板追加・BBSMENU追加・NG設定・環境設定)
  // ---------------------------------------------------------------------
  function openModal(html, onMount) {
    const root = el('#modalRoot');
    root.innerHTML = `<div class="modal">${html}</div>`;
    root.classList.remove('hidden');
    root.onclick = (e) => {
      if (e.target === root) closeModal();
    };
    if (onMount) onMount(el('.modal', root));
  }
  function closeModal() {
    el('#modalRoot').classList.add('hidden');
    el('#modalRoot').innerHTML = '';
  }

  function openAddBoardModal() {
    openModal(
      `<h3>板を追加</h3>
       <label>板名</label><input id="mBoardName" placeholder="例: なんでも実況J" />
       <label>板URL</label><input id="mBoardUrl" placeholder="https://example.5ch.net/livejupiter/" />
       <div class="modal-actions">
         <button class="btn-secondary" id="mCancel">キャンセル</button>
         <button class="btn-primary" id="mOk">追加</button>
       </div>`,
      (modal) => {
        el('#mCancel', modal).addEventListener('click', closeModal);
        el('#mOk', modal).addEventListener('click', async () => {
          const name = el('#mBoardName', modal).value.trim();
          const url = el('#mBoardUrl', modal).value.trim();
          if (!name || !url) return;
          state.data = await window.api.addBoard(name, url);
          closeModal();
          renderSidePane();
        });
      }
    );
  }

  function openAddMenuModal() {
    openModal(
      `<h3>BBSMENUを追加</h3>
       <p style="font-size:11px;color:var(--paper-faint)">板一覧ページ(bbsmenu.html)のURLを登録します。</p>
       <label>表示名</label><input id="mMenuName" placeholder="例: Open2ch" />
       <label>URL</label><input id="mMenuUrl" placeholder="https://menu.open2ch.net/bbsmenu.html" />
       <div class="modal-actions">
         <button class="btn-secondary" id="mCancel">キャンセル</button>
         <button class="btn-primary" id="mOk">追加</button>
       </div>`,
      (modal) => {
        el('#mCancel', modal).addEventListener('click', closeModal);
        el('#mOk', modal).addEventListener('click', async () => {
          const name = el('#mMenuName', modal).value.trim();
          const url = el('#mMenuUrl', modal).value.trim();
          if (!name || !url) return;
          state.data = await window.api.addBbsmenu(name, url);
          closeModal();
          renderSidePane();
        });
      }
    );
  }

  function openNgModal() {
    const d = state.data;
    openModal(
      `<h3>NGフィルタ</h3>
       <label>NGワード(本文, 1行1件)</label><textarea id="ngWords">${escapeHtml(d.ngWords.join('\n'))}</textarea>
       <label>NG名前(部分一致, 1行1件)</label><textarea id="ngNames">${escapeHtml(d.ngNames.join('\n'))}</textarea>
       <label>NG ID(完全一致, 1行1件)</label><textarea id="ngIds">${escapeHtml(d.ngIds.join('\n'))}</textarea>
       <div class="modal-actions">
         <button class="btn-secondary" id="mCancel">キャンセル</button>
         <button class="btn-primary" id="mOk">保存</button>
       </div>`,
      (modal) => {
        el('#mCancel', modal).addEventListener('click', closeModal);
        el('#mOk', modal).addEventListener('click', async () => {
          const toLines = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);
          state.data = await window.api.setNg({
            ngWords: toLines(el('#ngWords', modal).value),
            ngNames: toLines(el('#ngNames', modal).value),
            ngIds: toLines(el('#ngIds', modal).value),
          });
          closeModal();
          if (state.currentPosts.length) renderPosts(true);
        });
      }
    );
  }

  function openSettingsModal() {
    const s = state.data.settings;
    openModal(
      `<h3>設定</h3>
       <label>テーマ</label>
       <select id="sTheme" class="mini-select" style="width:100%">
         <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>ダーク(墨)</option>
         <option value="light" ${s.theme === 'light' ? 'selected' : ''}>ライト(紙)</option>
       </select>
       <label>自動更新間隔(秒・0でオフ)</label>
       <input id="sAuto" type="number" min="0" value="${s.autoUpdateSec}" />
       <div class="modal-actions">
         <button class="btn-secondary" id="mCancel">キャンセル</button>
         <button class="btn-primary" id="mOk">保存</button>
       </div>`,
      (modal) => {
        el('#mCancel', modal).addEventListener('click', closeModal);
        el('#mOk', modal).addEventListener('click', async () => {
          const theme = el('#sTheme', modal).value;
          const autoUpdateSec = parseInt(el('#sAuto', modal).value, 10) || 0;
          state.data = await window.api.setSettings({ theme, autoUpdateSec });
          applyTheme();
          closeModal();
          stopAutoUpdate();
          startAutoUpdateIfNeeded();
        });
      }
    );
  }

  // ---------------------------------------------------------------------
  // ユーティリティ
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
