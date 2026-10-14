const { test } = require('node:test')
const assert = require('node:assert/strict')
const { externalURL } = require('../electron/external.cjs')
test('external desktop links allow normalized HTTPS pages', () => {
  assert.equal(externalURL('https://EXAMPLE.com'), 'https://example.com/')
  assert.equal(externalURL('https://example.com/中文'), 'https://example.com/%E4%B8%AD%E6%96%87')
})
test('external desktop links reject unsafe schemes, credentials and malformed URLs', () => {
  for (const value of [null, 1, '', 'javascript:alert(1)', 'http://example.com', 'file:///C:/secret', 'https://user:pass@example.com', 'https://', 'https://example.com/\npage']) assert.equal(externalURL(value), null)
})
test('external desktop links reject oversized raw and percent-encoded URLs', () => {
  assert.equal(externalURL(`https://example.com/${'a'.repeat(2048)}`), null)
  assert.equal(externalURL(`https://example.com/${'中'.repeat(400)}`), null)
})
