const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
app.disableHardwareAcceleration()
const timeout = setTimeout(() => { console.error('v0.3 界面测试超时'); app.exit(1) }, 45000)
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false, partition: `v03-${Date.now()}` } })
  window.webContents.setAudioMuted(true)
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
    throw new Error(`界面检查超时: ${expression}`)
  }
  const click = async text => { await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(text)}).click()`); await new Promise(resolve => setTimeout(resolve, 70)) }
  await evaluate(`window.toneLog = []; window.testInputs = []; const nativeOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() { const oscillator = nativeOscillator.call(this); const start = oscillator.start.bind(oscillator); oscillator.start = at => { window.toneLog.push({frequency: oscillator.frequency.value, at, type: oscillator.type}); start(at); }; return oscillator; };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const context = new AudioContext(); await context.resume();
      const destination = context.createMediaStreamDestination();
      const tone = nativeOscillator.call(context); tone.frequency.value = 329.6276;
      const gain = context.createGain(); gain.gain.value = 0; tone.connect(gain); gain.connect(destination); tone.start();
      window.testInputs.push({context, gain, stream: destination.stream}); return destination.stream;
    } }); true;
  `)
  await click('曲谱练习')
  await click('开始监听')
  await poll(`document.body.textContent.includes('停止监听')`)
  await click('开始跟练')
  await poll(`document.querySelector('.practice-status').textContent.includes('等待目标音')`)
  await evaluate(`window.testInputs[0].gain.gain.value = 0.2`)
  await poll(`document.querySelector('.practice-stats dd').textContent === '1'`)
  await click('暂停跟练')
  await click('保存本次记录')
  await poll(`document.querySelector('.history-message').textContent.includes('已保存')`)
  await click('保存本次记录')
  await click('查看历史（1）')
  assert.equal(await evaluate(`document.querySelectorAll('.history-list li').length`), 1)
  assert.ok(await evaluate(`document.querySelector('.history-list').textContent.includes('命中 1')`))
  await evaluate(`document.querySelector('[aria-label="示范节拍声"]').click()`)
  await click('播放所选片段')
  await poll(`document.querySelector('.preview-status').textContent.includes('正在示范')`)
  assert.equal(await evaluate(`window.testInputs[0].stream.getTracks()[0].readyState`), 'ended')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '继续跟练').disabled`), true)
  await poll(`window.toneLog.some(t => t.type === 'triangle') && window.toneLog.some(t => t.frequency === 1200)`)
  await poll(`document.querySelector('[aria-label="第 2 个音符 E4"]').getAttribute('aria-pressed') === 'true'`)
  await click('开始监听')
  await poll(`document.body.textContent.includes('停止监听')`)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '停止示范').disabled`), true)
  await click('停止监听')
  await click('听当前音')
  await poll(`document.querySelector('.preview-status').textContent.includes('示范结束')`)
  await click('播放所选片段')
  await click('停止示范')
  assert.ok(await evaluate(`document.querySelector('.preview-status').textContent.includes('已停止')`))
  await evaluate(`Promise.all(window.testInputs.map(input => input.context.close())).then(() => true)`)
  await window.reload()
  await poll(`document.querySelector('.app-shell') !== null`)
  await click('曲谱练习')
  await click('查看历史（1）')
  assert.ok(await evaluate(`document.querySelector('.history-list').textContent.includes('命中 1')`))
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'shiyin-v03-'))
  await evaluate(`document.querySelector('.preview-controls').scrollIntoView({block:'center'})`)
  await new Promise(resolve => setTimeout(resolve, 250))
  await fs.writeFile(path.join(output, 'preview.png'), (await window.webContents.capturePage()).toPNG())
  await evaluate(`document.querySelector('.practice-history').scrollIntoView({block:'center'})`)
  await new Promise(resolve => setTimeout(resolve, 250))
  await fs.writeFile(path.join(output, 'history.png'), (await window.webContents.capturePage()).toPNG())
  window.setSize(390, 844)
  await new Promise(resolve => setTimeout(resolve, 250))
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`))
  await fs.writeFile(path.join(output, 'mobile.png'), (await window.webContents.capturePage()).toPNG())
  assert.deepEqual(errors, [])
  console.log('PASS: 原生音频合成跟练、记录保存去重及刷新恢复、旋律与节拍节点调度、播放麦克风互斥、自然结束和停止、播放游标、窄屏；截图 ' + output)
  clearTimeout(timeout)
  app.exit(0)
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1) })
