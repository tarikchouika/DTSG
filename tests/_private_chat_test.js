/*
 * Private Telegram chat regression/privacy test.
 * Run: node tests/_private_chat_test.js
 * Telegram is stubbed locally; no network or real token is used.
 */
'use strict';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const privateChat = require('../server-private-chat.js');

process.env.PRIVATE_CHAT_BOT_TOKEN = 'TEST:TOKEN';
process.env.PRIVATE_CHAT_TG_API = 'http://telegram.test';
process.env.PRIVATE_CHAT_BOT_USERNAME = 'dtsgchat_test_bot';
process.env.PRIVATE_CHAT_WEBHOOK_SECRET = 'test-secret';

const calls = [];
global.fetch = async (url, opts) => {
  const payload = opts && opts.body ? JSON.parse(opts.body) : {};
  calls.push({ url: String(url), payload });
  return { ok: true, json: async () => ({ ok: true, result: { message_id: calls.length } }) };
};

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY, username TEXT, role TEXT, admin_id INTEGER,
    banned INTEGER DEFAULT 0, telegram_id TEXT
  );
  CREATE TABLE friends (
    user_id INTEGER, friend_id INTEGER, status TEXT, created_at INTEGER
  );
  INSERT INTO users (id, username, role, banned) VALUES
    (1, 'alice', 'user', 0), (2, 'bob', 'user', 0), (3, 'outsider', 'user', 0);
  INSERT INTO friends (user_id, friend_id, status, created_at)
    VALUES (1, 2, 'accepted', 1), (2, 1, 'accepted', 1);
`);
const users = {
  1: { id: 1, username: 'alice', role: 'user', banned: false, telegram_id: null },
  2: { id: 2, username: 'bob', role: 'user', banned: false, telegram_id: null },
  3: { id: 3, username: 'outsider', role: 'user', banned: false, telegram_id: null }
};
privateChat.initPrivateChat(db);
privateChat.setCtx(db, users, {});

const update = (chatId, text) => ({
  message: { chat: { id: chatId, type: 'private' }, from: { id: chatId }, text }
});
const sentTo = (chatId) => calls.filter(c => c.url.includes('/sendMessage') && String(c.payload.chat_id) === String(chatId));
const lastText = (chatId) => String((sentTo(chatId).pop() || {}).payload?.text || '');

(async () => {
  console.log('═══ Private Telegram chat privacy/scope test ═══');

  const aliceCode = privateChat.makeLinkCode(1);
  const bobCode = privateChat.makeLinkCode(2);
  await privateChat.handleUpdate(update('111111', '/start ' + aliceCode));
  await privateChat.handleUpdate(update('222222', '/start ' + bobCode));
  assert.strictEqual(db.prepare('SELECT telegram_id FROM users WHERE id = 1').get().telegram_id, '111111');
  assert.strictEqual(db.prepare('SELECT telegram_id FROM users WHERE id = 2').get().telegram_id, '222222');
  console.log('  ✅ one-time links bind only the intended platform accounts');

  calls.length = 0;
  await privateChat.handleUpdate(update('111111', '/chat bob'));
  await privateChat.handleUpdate(update('111111', 'رسالة سرية من أليس'));
  const toBob = lastText('222222');
  const toAlice = lastText('111111');
  assert(toBob.includes('alice'), 'recipient should see the platform username');
  assert(toBob.includes('رسالة سرية'), 'recipient should see the message');
  assert(!toBob.includes('111111'), 'recipient must not see sender Telegram id');
  assert(!toBob.includes('222222'), 'recipient must not see Telegram ids');
  assert(toAlice.includes('bob'), 'sender acknowledgement should name the platform target');
  assert(!toAlice.includes('222222'), 'sender acknowledgement must not expose target Telegram id');
  console.log('  ✅ delivered messages expose platform names only, never Telegram ids');

  calls.length = 0;
  await privateChat.handleUpdate(update('333333', 'هل تسمحون بالدخول؟'));
  const guestText = lastText('333333');
  assert(/لا يمكن استعمال هذا البوت|رابطاً جديداً/.test(guestText));
  assert(!guestText.includes('111111') && !guestText.includes('222222'));
  assert.strictEqual(sentTo('222222').length, 0, 'unlinked guests cannot deliver messages');
  console.log('  ✅ unlinked chats are denied without leaking linked-account data');

  console.log('═══ Private chat test passed ═══');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
