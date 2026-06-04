"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createChatClient } = require("../src/chat");

const openrouter = { baseUrl: "https://openrouter.ai/api/v1", referer: "https://a1.am", title: "A1" };
const ok = body => ({ ok: true, status: 200, json: async () => body });

test("createChatClient validates its injected deps", () => {
  assert.throws(() => createChatClient({}), /safeFetch/);
  assert.throws(() => createChatClient({ safeFetch: () => {} }), /baseUrl/);
});

test("callModel posts an OpenAI-compatible chat request to /chat/completions and extracts text", async () => {
  let seen = {};
  const chat = createChatClient({ safeFetch: async (url, opts) => { seen = { url, opts }; return ok({ id: "r1", model: "x/y", choices: [{ message: { content: " hi " } }], usage: { total_tokens: 5 } }); }, openrouter });
  const out = await chat.callModel({ instructions: "sys", input: "q", model: "x/y", apiKey: "k" });
  assert.strictEqual(out.text, "hi");
  assert.strictEqual(out.provider, "openrouter");
  assert.strictEqual(out.model, "x/y");
  assert.strictEqual(out.responseId, "r1");
  assert.strictEqual(seen.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.strictEqual(seen.opts.headers.Authorization, "Bearer k");
  const body = JSON.parse(seen.opts.body);
  assert.strictEqual(body.model, "x/y");
  assert.deepStrictEqual(body.messages.map(m => m.role), ["system", "user"]);
});

test("callModel throws AI_NOT_CONFIGURED when no apiKey (no fetch)", async () => {
  let called = false;
  const chat = createChatClient({ safeFetch: async () => { called = true; return ok({}); }, openrouter });
  await assert.rejects(() => chat.callModel({ instructions: "s", input: "i", model: "m" }), err => {
    assert.strictEqual(err.code, "AI_NOT_CONFIGURED");
    assert.strictEqual(err.statusCode, 503);
    return true;
  });
  assert.strictEqual(called, false);
});

test("callModel surfaces OpenRouter HTTP errors with code + status", async () => {
  const chat = createChatClient({ safeFetch: async () => ({ ok: false, status: 429, json: async () => ({ error: { code: "rate_limited", message: "slow down" } }) }), openrouter });
  await assert.rejects(() => chat.callModel({ instructions: "s", input: "i", apiKey: "k" }), err => {
    assert.strictEqual(err.statusCode, 429);
    assert.strictEqual(err.code, "rate_limited");
    return true;
  });
});

test("callModel propagates an egress-blocked safeFetch rejection", async () => {
  const chat = createChatClient({ safeFetch: async () => { const e = new Error("egress blocked"); e.code = "EGRESS_BLOCKED"; throw e; }, openrouter });
  await assert.rejects(() => chat.callModel({ instructions: "s", input: "i", apiKey: "k" }), /egress blocked/);
});

test("callVision sends an OpenAI-compatible image_url message", async () => {
  let body = {};
  const chat = createChatClient({ safeFetch: async (url, opts) => { body = JSON.parse(opts.body); return ok({ choices: [{ message: { content: "a receipt" } }] }); }, openrouter });
  const out = await chat.callVision({ instructions: "read", input: "what is this", imageBase64: "AAAA", mimeType: "image/png", model: "v/m", apiKey: "k" });
  assert.strictEqual(out.text, "a receipt");
  const userParts = body.messages[1].content;
  assert.strictEqual(userParts[0].type, "text");
  assert.strictEqual(userParts[1].type, "image_url");
  assert.ok(userParts[1].image_url.url.startsWith("data:image/png;base64,AAAA"));
});
