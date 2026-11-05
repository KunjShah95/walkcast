// node render.mjs video.html out.mp4 [fps] [from] [to] [width] [height]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const [,, html, out, fpsArg='30', fromArg='0', toArg='88', wArg='1920', hArg='1080'] = process.argv;
const width = +wArg, height = +hArg;
const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const executablePath = candidates.find(existsSync);
const b = await chromium.launch(executablePath ? { executablePath } : {});
const p = await b.newPage({ viewport:{width,height} });
await p.goto('file://'+html); await p.evaluate(()=>document.fonts.ready);
// warm image cache for the demo frames
await p.waitForTimeout(500);
await p.waitForFunction(() => [...document.querySelectorAll('video')].every((video) => video.readyState >= 1), null, { timeout: 15_000 });
if (out.startsWith('--stills')) {
  const ts = out.split('=')[1].split(',').map(Number);
  for (const t of ts) { await p.evaluate(t=>window.render(t), t); await p.screenshot({ path: `${process.env.SD || '.'}/still-${t}.jpg`, type:'jpeg', quality:85 }); }
} else {
  const fps=+fpsArg, from=+fromArg, to=+toArg;
  const ff = spawn(process.env.LAB_FFMPEG || 'ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p',out],{stdio:['pipe','inherit','inherit']});
  const n=Math.round((to-from)*fps); const t0=Date.now();
  for (let i=0;i<n;i++){ const t=from+i/fps; await p.evaluate(t=>window.render(t), t);
    const buf = await p.screenshot({ type:'jpeg', quality:93 });
    if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));
    if(i%150===0) console.log(`frame ${i}/${n} ${((Date.now()-t0)/1000).toFixed(0)}s`); }
  ff.stdin.end();
  const code = await new Promise((resolve, reject) => { ff.once('error', reject); ff.once('close', resolve); });
  if (code !== 0) throw new Error(`ffmpeg renderer exited ${code}`);
}
await b.close();
