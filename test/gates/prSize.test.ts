import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPrSize, DEFAULT_PR_SIZE } from "../../src/gates/prSize.ts";

const T = DEFAULT_PR_SIZE;

test("at or under warn is ok", () => {
  assert.equal(classifyPrSize(400, T, false), "ok");
  assert.equal(classifyPrSize(0, T, false), "ok");
});

test("between warn and error is warn", () => {
  assert.equal(classifyPrSize(401, T, false), "warn");
  assert.equal(classifyPrSize(800, T, false), "warn");
});

test("over error is error without the override token", () => {
  assert.equal(classifyPrSize(801, T, false), "error");
});

test("the override token flips over-error from error to advisory warn", () => {
  assert.equal(classifyPrSize(5000, T, true), "warn");
});

test("custom thresholds are honoured", () => {
  assert.equal(classifyPrSize(250, { warn: 200, error: 500 }, false), "warn");
  assert.equal(classifyPrSize(501, { warn: 200, error: 500 }, false), "error");
});
