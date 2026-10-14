const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { zipSync, strToU8 } = require('fflate')
app.disableHardwareAcceleration()
let stage = '启动'
const timeout = setTimeout(() => { console.error('v0.6 界面测试超时：' + stage); app.exit(1) }, 45000)
function musicXML(measures = 4, dense = false) {
  const notes = dense ? 17 : 4
  return `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>MXL 导入测试 &amp; 曲谱</work-title></work><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${Array.from({ length: measures }, (_, measure) => `<measure number="${measure + 1}"><attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${measure === 0 ? '<direction><sound tempo="90"/></direction>' : ''}${Array.from({ length: notes }, (_, index) => `<note>${index % 4 === 3 ? '<rest/>' : `<pitch><step>${['E', 'F', 'G'][index % 3]}</step><octave>4</octave></pitch>`}<duration>${dense ? 240 : 960}</duration></note>`).join('')}</measure>`).join('')}</part></score-partwise>`
}
function mxl(source, container = '<container><rootfiles><rootfile full-path="scores/旋律.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>', extras = {}) {
  return Buffer.from(zipSync({ mimetype: [strToU8('application/vnd.recordare.musicxml'), { level: 0 }], 'META-INF/container.xml': strToU8(container), 'scores/旋律.musicxml': strToU8(source), ...extras })).toString('base64')
}
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false, partition: `v06-${Date.now()}` } })
  const errors = []
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  if (process.argv.includes('--local-web')) await window.loadURL('http://127.0.0.1:5188/')
  else await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  const evaluate = expression => window.webContents.executeJavaScript(expression, true)
  const poll = async expression => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(expression)) return
      await new Promise(resolve => setTimeout(resolve, 40))
    }
    throw new Error(`界面检查超时: ${expression}; ${await evaluate(`document.querySelector('.score-notice')?.textContent`)}`)
  }
  const click = async text => { await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(text)}).click()`); await new Promise(resolve => setTimeout(resolve, 50)) }
  const upload = async encoded => {
    await evaluate(`(() => { const input = document.querySelector('[aria-label="导入曲谱文件"]'); const data = new DataTransfer(); data.items.add(new File([Uint8Array.from(atob(${JSON.stringify(encoded)}), c => c.charCodeAt(0))], 'test.mxl', {type:'application/vnd.recordare.musicxml'})); input.files = data.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`)
  }
  const capture = async file => { await new Promise(resolve => setTimeout(resolve, 250)); await fs.writeFile(file, (await window.webContents.capturePage()).toPNG()) }
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'shiyin-v06-'))
  stage = '页面与完整预览'
  await poll(`document.querySelector('.app-shell') !== null`)
  assert.ok(window.webContents.getTitle().includes('拾音'))
  assert.equal(await evaluate(`document.querySelector('vite-error-overlay') === null`), true)
  await click('曲谱练习')
  await click('展开完整曲谱')
  assert.equal(await evaluate(`document.querySelectorAll('.full-score-note').length`), 15)
  assert.equal(await evaluate(`document.querySelectorAll('.full-score-measure').length`), 4)
  await evaluate(`document.querySelector('.full-score-note[aria-label^="全谱第 5 音"]').click()`)
  await poll(`document.querySelector('[aria-label="第 5 个音符 G4"]').getAttribute('aria-pressed') === 'true'`)
  await evaluate(`document.querySelector('.full-score').scrollIntoView({block:'start'})`)
  await capture(path.join(output, 'full-score.png'))
  stage = '嵌套 Unicode 路径 MXL 与选音'
  await upload(mxl(musicXML()))
  await poll(`document.querySelector('[aria-label="曲名"]').value === 'MXL 导入测试 & 曲谱'`)
  if (await evaluate(`document.querySelector('.full-score-sheet') === null`)) await click('展开完整曲谱')
  await poll(`document.querySelectorAll('.full-score-note').length === 16`)
  assert.equal(await evaluate(`document.querySelector('[aria-label="示范速度"]').value`), '90')
  assert.equal(await evaluate(`document.querySelectorAll('.full-score-note').length`), 16)
  const saved = await evaluate(`localStorage.getItem('shiyin.scores.v1')`)
  assert.equal(JSON.parse(saved).length, 2)
  for (const invalid of [Buffer.from('bad').toString('base64'), mxl(musicXML(), '<bad/>'), mxl(musicXML(), '<container><rootfiles><rootfile full-path="missing.xml"/></rootfiles></container>'), mxl(musicXML().replace('<note>', '<note><chord/>')), mxl(musicXML(), '<!DOCTYPE container [<!ENTITY x "bad">]><container/>')]) {
    await upload(invalid)
    await poll(`document.querySelector('.score-notice').textContent.includes('MXL 导入失败') && !document.querySelector('[aria-label="我的曲谱"]').disabled`)
    assert.equal(await evaluate(`localStorage.getItem('shiyin.scores.v1')`), saved)
  }
  stage = '密集小节换行与窄屏'
  await upload(mxl(musicXML(1, true)))
  await poll(`document.querySelectorAll('.full-score-note').length === 17`)
  assert.equal(await evaluate(`document.querySelectorAll('.full-score-measure').length`), 3)
  assert.ok(await evaluate(`document.querySelector('.full-score-warning').textContent.includes('1 个小节')`))
  window.setSize(390, 844)
  await evaluate(`document.querySelector('.full-score').scrollIntoView({block:'start'})`)
  await capture(path.join(output, 'mobile.png'))
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`))
  stage = '打印入口与全曲多页 PDF'
  window.setSize(1440, 1000)
  await upload(mxl(musicXML(20)))
  await poll(`document.querySelectorAll('.full-score-note').length === 80`)
  await click('收起完整曲谱')
  await evaluate(`window.print = () => { window.printRequested = true; window.dispatchEvent(new Event('beforeprint')); }; true`)
  await click('打印 / 保存 PDF')
  await poll(`window.printRequested && document.querySelectorAll('.full-score-note').length === 80`)
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.sidebar')).display`), 'none')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.pitch-card')).display`), 'none')
  assert.equal(await evaluate(`getComputedStyle(document.documentElement).backgroundColor`), 'rgb(255, 255, 255)')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.full-score-sheet')).display`), 'block')
  await evaluate(`scrollTo(0, 0)`)
  await capture(path.join(output, 'print-layout.png'))
  await fs.writeFile(path.join(output, 'score.pdf'), await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true, displayHeaderFooter: false }))
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: '' })
  window.webContents.debugger.detach()
  await window.reload()
  await poll(`document.querySelector('.app-shell') !== null`)
  assert.equal(await evaluate(`document.querySelector('[aria-label="我的曲谱"]').options.length`), 4)
  assert.deepEqual(errors, [])
  console.log('PASS: 整曲与选音联动、MXL 嵌套路径/速度导入、损坏及不支持内容保护、密集小节换行、窄屏、打印按钮与多页 PDF、刷新恢复；证据 ' + output)
  clearTimeout(timeout)
  app.exit(0)
}).catch(error => { console.error('失败阶段：' + stage, error); clearTimeout(timeout); app.exit(1) })
