import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dotColumns } from '../journey/journey.js';

test('참여한 사람이 10명까지면 점을 한 줄에 놓는다', () => {
  assert.deepEqual([1, 5, 9, 10].map(dotColumns), [1, 5, 9, 10]);
});

test('10명을 넘으면 점을 두 줄로 나누고, 홀수면 윗줄을 하나 더 길게 둔다', () => {
  assert.deepEqual([11, 19, 20].map(dotColumns), [6, 10, 10]);
});
