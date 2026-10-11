import { test } from 'node:test'; import assert from 'node:assert'; import { add } from './add.mjs';
test('add', () => { assert.equal(add(2, 2), 4); });
