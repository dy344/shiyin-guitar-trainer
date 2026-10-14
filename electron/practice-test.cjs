const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
app.disableHardwareAcceleration()
const timeout = setTimeout(() => { console.error('跟练界面测试超时'); app.exit(1) }, 45000)
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false, partition: `practice-${Date.now()}` } })
  const errors = []
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  if (process.argv.includes('--local-web')) await window.loadURL('http://127.0.0.1:5188/')
  else await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  assert.equal(window.webContents.getTitle(), '拾音 · 吉他练习')
  const evaluate = expression => window.webContents.executeJavaScript(expression)
  const poll = async expression => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return
      await new Promise(resolve => setTimeout(resolve, 40))
    }
    throw new Error(`界面检查超时: ${expression}`)
  }
  const click = async text => { await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(text)}).click()`); await new Promise(resolve => setTimeout(resolve, 60)) }
  await evaluate(`window.testFrequency = null; window.stoppedTracks = 0;
    const track = { stop() { window.stoppedTracks++; }, addEventListener() {} };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => ({getTracks: () => [track], getAudioTracks: () => [track]}) });
    window.AudioContext = class {
      sampleRate = 48000;
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() { return { fftSize: 4096, getFloatTimeDomainData(buffer) { for (let i = 0; i < buffer.length; i++) buffer[i] = window.testFrequency ? 0.2 * Math.sin(2 * Math.PI * window.testFrequency * i / 48000) : 0; } }; }
    };
    true;
  `)
  await click('曲谱练习')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '开始跟练').disabled`), true)
  await click('开始监听')
  await poll(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === '停止监听')`)
  await click('开始跟练')
  await poll(`document.querySelector('.practice-status').textContent.includes('等待目标音')`)
  await evaluate(`window.testFrequency = 329.6276`)
  await poll(`document.querySelector('.practice-stats dd').textContent === '1'`)
  await new Promise(resolve => setTimeout(resolve, 900))
  assert.equal(await evaluate(`document.querySelector('.practice-stats dd').textContent`), '1')
  await evaluate(`window.testFrequency = null`)
  await poll(`document.querySelector('.practice-status').textContent.includes('等待目标音')`)
  await evaluate(`window.testFrequency = 329.6276`)
  await poll(`document.querySelector('.practice-stats dd').textContent === '2'`)
  await poll(`document.querySelector('.target-note').textContent === 'F4'`)
  await click('暂停跟练')
  await poll(`document.querySelector('.practice-status').textContent.includes('已暂停')`)
  await click('继续跟练')
  await click('空弦调音')
  await click('曲谱练习')
  await poll(`document.querySelector('.practice-status').textContent.includes('已暂停')`)
  await evaluate(`const select = document.querySelector('[aria-label="修改音高"]'); select.value = 'rest'; select.dispatchEvent(new Event('change', {bubbles:true}));`)
  await poll(`document.querySelector('.practice-stats dd').textContent === '0'`)
  await evaluate(`for (const [label, value] of [['起始音符','3'],['结束音符','3']]) { const input = document.querySelector('[aria-label="' + label + '"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); } const speed = document.querySelector('[aria-label="休止计时速度"]'); speed.value = '120'; speed.dispatchEvent(new Event('change',{bubbles:true}));`)
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(await evaluate(`document.querySelector('[aria-label="起始音符"]').value`), '3')
  assert.equal(await evaluate(`document.querySelector('[aria-label="结束音符"]').value`), '3')
  await evaluate(`window.testFrequency = null`)
  await click('开始跟练')
  await poll(`document.querySelector('.practice-status').textContent.includes('本段已完成')`)
  assert.equal(await evaluate(`document.querySelectorAll('.practice-stats dd')[2].textContent`), '1')
  await click('停止监听')
  assert.ok(await evaluate(`window.stoppedTracks > 0`))
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'shiyin-practice-'))
  await evaluate(`document.querySelector('.practice-controls').scrollIntoView({block:'center'});`)
  await new Promise(resolve => setTimeout(resolve, 250))
  await fs.writeFile(path.join(output, 'desktop.png'), (await window.webContents.capturePage()).toPNG())
  window.setSize(390, 844)
  await new Promise(resolve => setTimeout(resolve, 250))
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`))
  await fs.writeFile(path.join(output, 'mobile.png'), (await window.webContents.capturePage()).toPNG())
  assert.deepEqual(errors, [])
  console.log('PASS: 麦克风门禁、真实算法合成音驱动、重复音防跳过、暂停与模式切换、编辑重置、休止完成、麦克风释放、窄屏无溢出；截图 ' + output)
  clearTimeout(timeout)
  app.exit(0)
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1) })
