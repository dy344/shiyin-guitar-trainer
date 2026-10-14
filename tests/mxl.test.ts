import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { extractMXLScore, inspectMXL } from '../src/mxl.ts'
import { exampleScore, exportMusicXML } from '../src/score.ts'

const xml = exportMusicXML(exampleScore())
const container = '<container><rootfiles><rootfile full-path="scores/song.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'
const archive = (extra: Record<string, Uint8Array> = {}) => zipSync({ 'META-INF/container.xml': strToU8(container), 'scores/song.musicxml': strToU8(xml), ...extra })
test('compressed nested-path MusicXML extracts losslessly, media attachments are not decompressed', () => {
  const opened = inspectMXL(archive({ 'cover.png': new Uint8Array(500_000) }))
  assert.equal(opened.container, container)
  assert.equal(extractMXLScore(opened, 'scores/song.musicxml'), xml)
  assert.equal(opened.entries.get('cover.png')?.originalSize, 500_000)
})
test('uncompressed ZIP entries and Unicode filenames are supported', () => {
  const opened = inspectMXL(zipSync({ 'META-INF/container.xml': strToU8(container), '曲谱/旋律.xml': strToU8(xml) }, { level: 0 }))
  assert.equal(extractMXLScore(opened, '曲谱/旋律.xml'), xml)
})
test('corrupt, empty, truncated and missing-container archives are rejected', () => {
  for (const data of [new Uint8Array(), new Uint8Array(100), archive().slice(0, -10), zipSync({ 'score.xml': strToU8(xml) })]) assert.throws(() => inspectMXL(data))
  assert.throws(() => inspectMXL(archive({ 'META-INF/container.xml': new Uint8Array() })))
  assert.throws(() => inspectMXL(archive({ 'META-INF/container.xml': new Uint8Array(64_001) })))
})
test('unsafe, missing, empty and oversized root documents fail before extraction', () => {
  const opened = inspectMXL(archive())
  for (const path of ['', '../score.xml', '/score.xml', 'C:/score.xml', 'scores\\song.xml', 'scores/./song.xml', 'scores//song.xml', 'score.xml', 'META-INF/container.xml']) assert.throws(() => extractMXLScore(opened, path))
  assert.throws(() => extractMXLScore(inspectMXL(archive({ 'score.xml': new Uint8Array(2_000_001) })), 'score.xml'))
  assert.throws(() => extractMXLScore(inspectMXL(archive({ 'score.xml': new Uint8Array() })), 'score.xml'))
})
test('resource limits and invalid text encodings are rejected', () => {
  const files: Record<string, Uint8Array> = { 'META-INF/container.xml': strToU8(container) }
  for (let index = 0; index < 1000; index++) files[`file-${index}`] = new Uint8Array()
  assert.throws(() => inspectMXL(zipSync(files)))
  assert.throws(() => inspectMXL(archive({ 'META-INF/container.xml': new Uint8Array([255, 255]) })))
  assert.throws(() => extractMXLScore(inspectMXL(archive({ 'score.xml': new Uint8Array([255, 255]) })), 'score.xml'))
})
