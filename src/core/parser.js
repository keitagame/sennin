'use strict';

/**
 * 2ch/5ch互換掲示板(Open2ch等)のテキストフォーマットを解析するモジュール。
 * 通信は行わず、純粋な文字列変換のみを担当する(テスト・再利用しやすくするため)。
 */

/** 板URLを正規化する。末尾に必ず "/" を付ける。 */
function normalizeBoardUrl(boardUrl) {
  let u = boardUrl.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (!u.endsWith('/')) u += '/';
  return u;
}

/** 板URLから板ID(ディレクトリ名)を取り出す。例: https://a.5ch.net/livejupiter/ -> livejupiter */
function boardIdFromUrl(boardUrl) {
  const u = normalizeBoardUrl(boardUrl);
  const m = u.match(/^https?:\/\/[^/]+\/([^/]+)\/?$/);
  return m ? m[1] : u;
}

/**
 * subject.txt をパースする。
 * 各行フォーマット: "1234567890.dat<>スレタイトル (レス数)"
 */
function parseSubjectTxt(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const now = Date.now() / 1000;
  const threads = [];
  for (const line of lines) {
    const idx = line.indexOf('<>');
    if (idx === -1) continue;
    const datName = line.slice(0, idx); // "1234567890.dat"
    const rest = line.slice(idx + 2);
    const m = rest.match(/^(.*)\s+\((\d+)\)\s*$/);
    let title = rest;
    let resCount = 0;
    if (m) {
      title = m[1];
      resCount = parseInt(m[2], 10);
    }
    const threadId = datName.replace(/\.dat$/, '');
    const startedAt = parseInt(threadId, 10); // dat名 = スレ立てUnix時間(秒)のことが多い
    const elapsedHours = Math.max((now - startedAt) / 3600, 1 / 60);
    // 勢い(いきおい)の簡易近似値: 24時間あたりのレスペースに正規化したもの
    const momentum = Math.round((resCount / elapsedHours) * 24 * 10) / 10;
    threads.push({
      id: threadId,
      datFile: datName,
      title: decodeEntities(title),
      resCount,
      momentum,
      startedAt: Number.isFinite(startedAt) ? startedAt : null,
    });
  }
  return threads;
}

/**
 * dat 1行をパースする。
 * フォーマット: 名前<>メール<>日付ID<>本文<>スレタイトル(1行目のみ)
 */
function parseDatLine(line, index) {
  const fields = line.split('<>');
  const [nameRaw = '', mailRaw = '', dateIdRaw = '', bodyRaw = '', titleRaw = ''] = fields;

  const dateMatch = dateIdRaw.match(/^(.*?)(?:\s+ID:([^\s]+))?\s*$/);
  const date = dateMatch ? dateMatch[1].trim() : dateIdRaw.trim();
  const id = dateMatch && dateMatch[2] ? dateMatch[2] : null;

  const bodyHtml = bodyRaw.trim();
  const body = htmlBodyToPlainText(bodyHtml);

  return {
    resNum: index + 1,
    name: decodeEntities(stripTags(nameRaw)) || '名無しさん',
    mail: decodeEntities(stripTags(mailRaw)),
    date,
    id,
    body,
    bodyRaw: bodyHtml,
    title: index === 0 ? decodeEntities(stripTags(titleRaw)) : undefined,
    anchors: extractAnchors(body),
  };
}

/** dat全体(文字列)をパースしてレス配列を返す */
function parseDat(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((line, i) => parseDatLine(line, i));
}

/** dat本文のHTML的表現をプレーンテキスト(AAはそのまま維持)に変換する */
function htmlBodyToPlainText(html) {
  let s = html;
  // <br> 系を改行に
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // アンカーの <a ...>テキスト</a> は中身のテキストだけ残す
  s = s.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1');
  // 残りのタグは除去(fontタグでの装飾など)
  s = s.replace(/<[^>]+>/g, '');
  return decodeEntities(s);
}

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '');
}

/** HTMLエンティティをデコードする(必要最小限) */
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 本文中の >>1 >>1-5 >>1,3,5 のようなレス番号アンカーを抽出する。
 * 返り値は参照先レス番号の配列(重複除去)。
 */
function extractAnchors(bodyPlain) {
  const nums = new Set();
  const re = />>(\d+)(?:[-,](\d+))?/g;
  let m;
  while ((m = re.exec(bodyPlain))) {
    const a = parseInt(m[1], 10);
    nums.add(a);
    if (m[2]) {
      const b = parseInt(m[2], 10);
      if (b > a && b - a < 200) {
        for (let i = a; i <= b; i++) nums.add(i);
      } else {
        nums.add(b);
      }
    }
  }
  return Array.from(nums).sort((x, y) => x - y);
}

/**
 * BBSMENU(https://menu.2ch.net/bbsmenu.html 相当)をパースする。
 * カテゴリ見出し(<b>...</b>相当)とその配下の板リンクを抽出する。
 */
function parseBbsMenu(html) {
  const categories = [];
  let current = { name: 'その他', boards: [] };
  categories.push(current);

  // 大まかにタグを行単位に分解して走査する
  const tokens = html.split(/(<[^>]+>)/i);
  let pendingCategoryText = null;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/^<b>$/i.test(tok)) {
      pendingCategoryText = '';
      continue;
    }
    if (/^<\/b>$/i.test(tok)) {
      if (pendingCategoryText !== null && pendingCategoryText.trim()) {
        current = { name: decodeEntities(pendingCategoryText.trim()), boards: [] };
        categories.push(current);
      }
      pendingCategoryText = null;
      continue;
    }
    if (pendingCategoryText !== null && !/^<[^>]+>$/.test(tok)) {
      pendingCategoryText += tok;
    }

    const aMatch = tok.match(/^<a\s+href=["']?([^"'\s>]+)["']?[^>]*>$/i);
    if (aMatch) {
      const href = aMatch[1];
      // 板URLらしきものだけ拾う(掲示板のトップURL)
      if (/^https?:\/\//i.test(href)) {
        // 次のトークンがテキスト(板名)のはず
        let name = '';
        for (let j = i + 1; j < tokens.length; j++) {
          if (/^<\/a>$/i.test(tokens[j])) break;
          if (!/^<[^>]+>$/.test(tokens[j])) name += tokens[j];
        }
        name = decodeEntities(name.trim());
        if (name) {
          current.boards.push({ name, url: normalizeBoardUrl(href) });
        }
      }
    }
  }

  return categories.filter((c) => c.boards.length > 0);
}

module.exports = {
  normalizeBoardUrl,
  boardIdFromUrl,
  parseSubjectTxt,
  parseDat,
  parseDatLine,
  parseBbsMenu,
  extractAnchors,
  decodeEntities,
};
