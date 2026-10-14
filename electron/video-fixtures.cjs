const fs = require('node:fs/promises')
const path = require('node:path')
module.exports = async function videoFixtures(window) {
  const bundle = await fs.readFile(path.join(__dirname, '..', 'node_modules', 'mediabunny', 'dist', 'bundles', 'mediabunny.cjs'), 'utf8')
  return window.webContents.executeJavaScript(`(async () => {
    ${bundle}
    const { Output, BufferTarget, WebMOutputFormat, Mp4OutputFormat, MovOutputFormat, CanvasSource, AudioBufferSource, canEncodeAudio, canEncodeVideo } = Mediabunny;
    const aac = await canEncodeAudio('aac', {sampleRate:48000, numberOfChannels:2});
    const avc = await canEncodeVideo('avc', {width:160, height:90});
    const make = async (format, sound, silent = false) => {
      const mp4 = format !== 'webm';
      const target = new BufferTarget();
      const output = new Output({format:format === 'mov' ? new MovOutputFormat() : mp4 ? new Mp4OutputFormat() : new WebMOutputFormat(), target});
      const canvas = new OffscreenCanvas(160, 90), context = canvas.getContext('2d');
      const video = new CanvasSource(canvas, {codec:mp4 && avc ? 'avc' : mp4 ? 'vp9' : 'vp8', bitrate:100000});
      output.addVideoTrack(video);
      const audio = sound ? new AudioBufferSource({codec:mp4 && aac ? 'aac' : 'opus', bitrate:96000}) : null;
      if (audio) output.addAudioTrack(audio);
      await output.start();
      if (audio) {
        const buffer = new AudioBuffer({length:48000*3, sampleRate:48000, numberOfChannels:2});
        const samples = buffer.getChannelData(1);
        if (!silent) for (let i=0;i<samples.length;i++) {
          const time=i/48000;
          const midi=time>=0.25 && time<0.75 ? 64 : time>=1 && time<1.5 ? 67 : time>=1.75 && time<2.25 ? 69 : null;
          if (midi !== null) samples[i]=0.3*Math.sin(2*Math.PI*440*2**((midi-69)/12)*time);
        }
        await audio.add(buffer); audio.close();
      }
      for (let frame=0;frame<30;frame++) {
        context.fillStyle='#1b3326';context.fillRect(0,0,160,90);
        context.fillStyle='#e6ad45';context.font='16px sans-serif';context.fillText('E4 G4 A4',30,44);
        await video.add(frame/10,0.1);
      }
      video.close(); await output.finalize();
      return Array.from(new Uint8Array(target.buffer));
    };
    return {webm:await make('webm',true),mp4:await make('mp4',true),mov:await make('mov',true),noAudio:await make('webm',false),silent:await make('webm',true,true),aac,avc};
  })()`, true)
}
