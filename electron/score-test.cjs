const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const ts = require('typescript')
app.disableHardwareAcceleration()
const timeout = setTimeout(() => app.exit(1), 30000)
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1440, height: 1100, webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false, partition: `score-test-${Date.now()}` } })
  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  const source = await fs.readFile(path.join(__dirname, '..', 'src', 'score.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const result = await window.webContents.executeJavaScript(`(() => { try {
    const exports = (() => { const exports = {};
    ${compiled}
    return exports; })();
    const { parseMusicXML, exportMusicXML, exampleScore, validateScore, withPitch } = exports;
    let passed = 0;
    const check = (condition, label) => { if (!condition) throw new Error(label); passed++; };
    const rejects = (source, label) => { let rejected = false; try { parseMusicXML(source); } catch { rejected = true; } check(rejected, label); };
    const example = exampleScore();
    const xml = exportMusicXML(example);
    const imported = parseMusicXML(xml);
    check(JSON.stringify(imported.notes) === JSON.stringify(example.notes), 'roundtrip notes');
    check(JSON.stringify(imported.meters) === JSON.stringify(example.meters), 'roundtrip meters');
    check(imported.notes[0].string === 1 && imported.notes[0].fret === 0, 'open string');
    const tempoXML = exportMusicXML({ ...example, tempo: 90 });
    check(parseMusicXML(tempoXML).tempo === 90, 'tempo roundtrip');
    rejects(tempoXML.replace('tempo="90"', 'tempo="0"'), 'invalid tempo');
    rejects(tempoXML.replace('</part>', '<direction><sound tempo="120"/></direction></part>'), 'unsupported tempo changes');
    const changed = { ...example, title: '<标题 & 测试>', notes: example.notes.map((n, i) => i === 0 ? withPitch(n, 61) : i === 1 ? withPitch(n, null) : n) };
    const changedRead = parseMusicXML(exportMusicXML(changed));
    check(changedRead.title === changed.title && changedRead.notes[0].midi === 61 && changedRead.notes[1].midi === null, 'sharp rest escaping');
    const single = pitch => '<score-partwise><part id="P1"><measure><attributes><divisions>1</divisions><transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose></attributes><note><pitch><step>E</step><octave>' + pitch + '</octave></pitch><duration>1</duration></note></measure></part></score-partwise>';
    check(parseMusicXML(single(3)).notes[0].midi === 40, 'guitar written octave');
    rejects('', 'empty'); rejects('<bad>', 'malformed'); rejects(xml.replace('<note>', '<note><chord/>'), 'chord'); rejects(xml.replace('<note>', '<note><grace/>'), 'grace');
    rejects(xml.replace('<duration>960</duration>', '<duration>-1</duration>'), 'negative duration');
    rejects(xml.replace('<fret>0</fret>', '<fret>5</fret>'), 'invalid tablature');
    rejects(single(0), 'out of range');
    rejects(xml.replace('</score-partwise>', '<part id="P2"/></score-partwise>'), 'multiple parts');
    let invalid = false; try { validateScore({ ...example, notes: [{ ...example.notes[0], ticks: 0 }] }); } catch { invalid = true; } check(invalid, 'invalid saved score');
    const input = document.querySelector('input[type=file]');
    const transfer = new DataTransfer(); transfer.items.add(new File([xml.replace('欢乐颂 · 旋律片段', '导入测试曲')], 'test.musicxml', {type:'application/xml'}));
    input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
    return passed;
    } catch(error) { return error.stack; }
  })()`)
  assert.equal(result, 17)
  const poll = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await window.webContents.executeJavaScript(expression)) return
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    throw new Error(`界面检查超时: ${expression}`)
  }
  await poll(`document.querySelector('[aria-label="曲名"]').value === '导入测试曲'`)
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '曲谱练习').click(); const select = document.querySelector('[aria-label="修改音高"]'); select.value = '65'; select.dispatchEvent(new Event('change', {bubbles:true}));`)
  await poll(`document.querySelector('.target-note').textContent === 'F4'`)
  await window.reload()
  await poll(`document.querySelector('[aria-label="我的曲谱"]').options.length === 2`)
  await window.webContents.executeJavaScript(`const select = document.querySelector('[aria-label="我的曲谱"]'); select.value = '1'; select.dispatchEvent(new Event('change', {bubbles:true})); Array.from(document.querySelectorAll('button')).find(b => b.textContent === '曲谱练习').click();`)
  await poll(`document.querySelector('.target-note').textContent === 'F4'`)
  await new Promise(resolve => setTimeout(resolve, 300))
  window.webContents.invalidate()
  await new Promise(resolve => setTimeout(resolve, 300))
  await fs.writeFile(path.join(__dirname, '..', 'desktop-score-preview.png'), (await window.webContents.capturePage()).toPNG())
  await window.webContents.executeJavaScript(`document.querySelector('[aria-label="修改音高"]').scrollIntoView({block:'center'});`)
  await new Promise(resolve => setTimeout(resolve, 200))
  await fs.writeFile(path.join(__dirname, '..', 'desktop-score-editor.png'), (await window.webContents.capturePage()).toPNG())
  await window.webContents.executeJavaScript(`const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); transfer.items.add(new File(['<broken>'], 'bad.xml')); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));`)
  await poll(`document.querySelector('.score-notice').textContent.includes('有效')`)
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="曲名"]').value`), '导入测试曲')
  console.log(`PASS: ${result} 项曲谱解析检查，以及文件导入、编辑联动、重载恢复和桌面截图`)
  clearTimeout(timeout)
  app.exit(0)
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1) })
