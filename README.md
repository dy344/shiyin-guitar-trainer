# 拾音 v0.8.0

本地吉他单音音准检测、曲谱编辑与跟练工具。Windows、Node.js 24、React、TypeScript、Vite、Electron。

## 启动

双击 `start-shiyin.cmd`，或在项目目录执行：

```powershell
npm install
npm run dev
```

浏览器打开 <http://127.0.0.1:5188/>，保持服务进程运行。麦克风需要浏览器授权。如果终端找不到 npm，本机可临时设置 PATH：

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
npm run dev
```

## 视频辅助扒谱

1. 打开“曲谱练习”，找到“本地视频辅助扒谱”。
2. 选择 MP4、MOV 或 WebM 文件，最多 100 MB、10 分钟。
3. 预览视频，输入起止秒数，或用“当前位置设为起点/终点”；每段 0.25–20 秒，可循环试听。
4. 填写原演奏速度（40–160 BPM），点击“生成视频扒谱草稿”。
5. 检查提示后加入曲谱库，校对音高、指法和时值，试听并导出 MusicXML。

只识别清晰、无伴奏、一次一个音的演奏。读取主音轨，双声道分析片段中能量较高的一侧。不分离伴奏、不识别和弦或画面中的谱子。按 4/4 拍与十六分音符网格生成初稿，BPM 由用户填写；覆盖率不是准确率。

文件在本机处理。浏览器须支持相应编码；画面无法预览时，音轨仍可能可以识别。预览会停止麦克风，练习前需重新开始监听。取消、切换模式和超时不会采纳迟到结果；切页、开始监听或示范播放会暂停视频。

## 已有功能

- 单音音准检测、等音跟练、范围循环、休止计时、合成示范和节拍声。
- 单声部 MusicXML/XML/MXL 导入、全曲六线谱、打印/PDF、音符和指法编辑、撤销重做。
- 本地音频扒谱、练习记录、站外找谱入口、链接收藏和学习笔记。
- 完整备份 v2 包含曲谱、记录与收藏；恢复 v1 时保留本机收藏。

## 数据与版本

曲谱、记录和收藏位于当前浏览器和地址的 localStorage。请在“曲谱练习 → 下载完整备份”保存 JSON；Git 和源码 ZIP 不包含这些数据。原音视频和未加入曲谱库的草稿不进入备份，刷新后须重新选择文件。v0.8 沿用原存储格式，无数据迁移。

公开仓库从 v0.8.0 源码快照开始，不包含此前本地开发提交历史、依赖目录、构建产物或浏览器数据。

## 验证

```powershell
npm run build
npm run lint
npm run test:unit
npm run test:v08
```

音频及收藏回归分别为 `npm run test:v05`、`npm run test:v07`。界面测试使用隐藏窗口和隔离存储，截图写入系统临时目录。

视频测试使用实际编码的合成素材，覆盖 WebM/Opus、MP4/AAC、MOV/AAC、裁剪、双声道、取消和保存；不代表真实吉他录音准确率。

视频解码按需加载 [Mediabunny](https://mediabunny.dev/guide/reading-media-files) 1.61.4，遵循 MPL-2.0，未修改上游库；音轨读取参考 [AudioBufferSink](https://mediabunny.dev/guide/media-sinks)。
