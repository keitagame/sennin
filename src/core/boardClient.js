'use strict';

const iconv = require('iconv-lite');
const { normalizeBoardUrl, parseSubjectTxt, parseDat, parseBbsMenu } = require('./parser');

const UA = 'Sen2ch/1.0 (2ch-compatible board viewer; no-posting)';

/** Shift_JIS(CP932含む)のバイト列をUTF-8文字列にデコードする */
function decodeSjis(buffer) {
  return iconv.decode(Buffer.from(buffer), 'Shift_JIS');
}

/** UTF-8で書かれている可能性のある新しめの互換掲示板にも対応するため、BOM等から判定してデコードする */
function smartDecode(buffer, hintEncoding) {
  const buf = Buffer.from(buffer);
  if (hintEncoding === 'utf-8' || hintEncoding === 'utf8') {
    return buf.toString('utf-8');
  }
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf-8');
  }
  // ざっくり判定: Shift_JISとしてデコードして置換文字が大量に出るならUTF-8を試す
  const sjis = iconv.decode(buf, 'Shift_JIS');
  const utf8 = buf.toString('utf-8');
  const badSjis = (sjis.match(/\uFFFD/g) || []).length;
  const badUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  return badUtf8 < badSjis ? utf8 : sjis;
}

async function fetchBuffer(url, opts = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Encoding': 'gzip, deflate',
      ...(opts.headers || {}),
    },
  });
  return res;
}

/** BBSMENU(板一覧ページ)を取得してカテゴリ/板リストを返す */
async function fetchBbsMenu(menuUrl) {
  const res = await fetchBuffer(menuUrl);
  if (!res.ok) throw new Error(`bbsmenu取得失敗: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const text = smartDecode(buf, res.headers.get('content-type'));
  return parseBbsMenu(text);
}

/** 板のスレッド一覧(subject.txt)を取得する */
async function fetchSubject(boardUrl) {
  const base = normalizeBoardUrl(boardUrl);
  const res = await fetchBuffer(base + 'subject.txt');
  if (!res.ok) {
    throw new Error(`スレ一覧の取得に失敗しました (HTTP ${res.status}) : ${base}subject.txt`);
  }
  const buf = await res.arrayBuffer();
  const text = smartDecode(buf);
  return parseSubjectTxt(text);
}

/**
 * スレのdatファイルを取得する。
 * @param {string} boardUrl 板URL
 * @param {string} threadId スレID(datファイル名から.datを除いたもの)
 * @param {object} [opts]
 * @param {number} [opts.knownBytes] 既に取得済みのバイト数(差分取得に使用)
 */
async function fetchDat(boardUrl, threadId, opts = {}) {
  const base = normalizeBoardUrl(boardUrl);
  const url = `${base}dat/${threadId}.dat`;
  const headers = {};
  let isDiff = false;
  if (opts.knownBytes && opts.knownBytes > 0) {
    headers['Range'] = `bytes=${opts.knownBytes}-`;
    isDiff = true;
  }
  const res = await fetchBuffer(url, { headers });

  if (res.status === 416) {
    // 追加レスなし
    return { posts: [], newBytes: opts.knownBytes || 0, notModified: true, full: false };
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`スレ本文の取得に失敗しました (HTTP ${res.status}) : ${url}`);
  }
  const buf = await res.arrayBuffer();
  const text = smartDecode(buf);
  const posts = parseDat(text);
  const totalBytes = isDiff && res.status === 206 ? (opts.knownBytes || 0) + buf.byteLength : buf.byteLength;

  return {
    posts,
    newBytes: totalBytes,
    partial: res.status === 206,
    full: !isDiff,
  };
}

module.exports = {
  fetchBbsMenu,
  fetchSubject,
  fetchDat,
  decodeSjis,
  smartDecode,
};
