// node frames.mjs video.html out.mp4|--stills t1,t2,... [fps] [from] [to]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [,, html, out, fpsArg='30', fromArg='0', toArg='88'] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1920,height:1080} });
await p.goto('file://'+html); await p.evaluate(()=>document.fonts.ready);
// warm image cache for the demo frames
await p.waitForTimeout(500);
if (out.startsWith('--stills')) {
  const ts = out.split('=')[1].split(',').map(Number);
  for (const t of ts) { await p.evaluate(t=>window.render(t), t); await p.screenshot({ path: `${process.env.SD}/still-${t}.jpg`, type:'jpeg', quality:85 }); }
} else {
  const fps=+fpsArg, from=+fromArg, to=+toArg;
  const ff = spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p',out],{stdio:['pipe','inherit','inherit']});
  const n=Math.round((to-from)*fps); const t0=Date.now();
  for (let i=0;i<n;i++){ const t=from+i/fps; await p.evaluate(t=>window.render(t), t);
    const buf = await p.screenshot({ type:'jpeg', quality:93 });
    if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));
    if(i%150===0) console.log(`frame ${i}/${n} ${((Date.now()-t0)/1000).toFixed(0)}s`); }
  ff.stdin.end(); await new Promise(r=>ff.on('close',r));
}
await b.close();
