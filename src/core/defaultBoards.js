'use strict';

/**
 * 初回起動時に登録しておくBBSMENU(板一覧ページ)のプリセット。
 * ユーザーは設定画面から自由に追加・削除できる。
 */
const DEFAULT_BBSMENUS = [
  { name: 'Open2ch', url: 'https://menu.open2ch.net/bbsmenu.html' },
  { name: '5ch', url: 'https://menu.5ch.net/bbsmenu.html' },
];

/**
 * 板が見つからない場合のフォールバック用に、板を直接URL指定でも登録できるようにする。
 * ここには何も含めず、ユーザーの「板を追加」操作を主経路とする。
 */
const DEFAULT_BOARDS = [];

module.exports = { DEFAULT_BBSMENUS, DEFAULT_BOARDS };
