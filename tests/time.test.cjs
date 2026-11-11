const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeTimestamp, normalizeWindow } = require('../dist/nodes/Bdp/shared/time.js');

test('normalizes an explicit UTC offset to UTC', () => {
	assert.equal(normalizeTimestamp('2025-01-01T01:00:00+01:00', 'Start'), '2025-01-01T00:00:00.000Z');
});

test('rejects local timestamps without an explicit offset', () => {
	assert.throws(() => normalizeTimestamp('2025-01-01T01:00:00', 'Start'), /explicit UTC offset/);
});

test('rejects invalid calendar timestamps', () => {
	assert.throws(() => normalizeTimestamp('2025-02-30T01:00:00Z', 'Start'), /valid ISO 8601/);
});

test('requires a strictly increasing time window', () => {
	assert.throws(
		() => normalizeWindow('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
		/Start must be earlier than End/,
	);
});
