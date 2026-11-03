import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const ffmpeg = "C:/Users/jksha/.local/ffmpeg/bin/ffmpeg.exe";
const capture = resolve(root, "recordings/walkcast.kunjshah.in-mw02rcpq01640f");
const sourceVideo = resolve(capture, "recording.mp4");
const sourceVtt = resolve(capture, "captions.vtt");
const logo = resolve(root, "apps/web/public/assets/logo.png");
const score = resolve(root, "docs/launch/source/score.wav");
const whoosh = resolve(root, "videos/walkcast-launch/assets/sfx/whoosh.mp3");
const click = resolve(root, "videos/walkcast-launch/assets/sfx/click-soft.mp3");
const chime = resolve(root, "videos/walkcast-launch/assets/sfx/chime.mp3");

const intro = resolve(here, "intro.mp4");
const outro = resolve(here, "outro.mp4");
const shiftedVtt = resolve(here, "Walkcast-Fresh-Walkthrough.vtt");
const output = resolve(here, "Walkcast-Fresh-Walkthrough.mp4");
const poster = resolve(here, "Walkcast-Fresh-Walkthrough-poster.jpg");

const mainDuration = 82.36;
const cardDuration = 3.5;
const transition = 0.5;
const mainStart = cardDuration - transition;
const outroStart = mainStart + mainDuration - transition;
const finalDuration = cardDuration + mainDuration + cardDuration - transition * 2;

function run(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(ffmpeg, args, { cwd: root, stdio: "inherit", windowsHide: true });
    child.once("error", rejectRun);
    child.once("exit", (code) => code === 0 ? resolveRun() : rejectRun(new Error(`ffmpeg exited ${code}`)));
  });
}

function secondsOf(timestamp) {
  const [h, m, rest] = timestamp.split(":");
  const [s, fraction = "0"] = rest.split(".");
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${fraction}`);
}

function timestampOf(seconds) {
  const ms = Math.round(seconds * 1000);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const whole = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function shiftVtt(vtt, offset) {
  return vtt.replace(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/g,
    (_match, start, end) => `${timestampOf(secondsOf(start) + offset)} --> ${timestampOf(secondsOf(end) + offset)}`);
}

mkdirSync(here, { recursive: true });
writeFileSync(shiftedVtt, shiftVtt(readFileSync(sourceVtt, "utf8"), mainStart), "utf8");

const introGraph = `
[0:v]drawbox=x=1260:y=0:w=660:h=1080:color=0x15352F@0.5:t=fill,
drawbox=x=1220:y=0:w=2:h=1080:color=0x36C9B2@0.32:t=fill,
drawbox=x=200:y=855:w=720:h=3:color=0x28443F@1:t=fill,
drawbox=x=200:y=855:w='min(720,max(0,(t-0.25)*620))':h=3:color=0x52D5BE@1:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='WALKCAST':x=324:y=270:fontsize=26:fontcolor=0xC2D0CD:alpha='min(1,max(0,(t-0.25)/0.3))',
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='One link.':x=200:y=400:fontsize=82:fontcolor=white:alpha='min(1,max(0,(t-0.45)/0.3))',
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='A real browser.':x=200:y=500:fontsize=82:fontcolor=0x52D5BE:alpha='min(1,max(0,(t-0.75)/0.3))',
drawtext=fontfile='C\:/Windows/Fonts/segoeui.ttf':text='A complete walkthrough.':x=200:y=620:fontsize=56:fontcolor=white:alpha='min(1,max(0,(t-1.05)/0.3))',
drawtext=fontfile='C\:/Windows/Fonts/segoeui.ttf':text='Walkcast  /  live product tour':x=200:y=730:fontsize=30:fontcolor=0xB8C8C4:alpha='min(1,max(0,(t-1.3)/0.3))',
drawbox=x=1570:y=70:w=172:h=48:color=0x182A27@0.92:t=fill,
drawbox=x=1593:y=89:w=12:h=12:color=0xF0524A@1:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='REC':x=1617:y=81:fontsize=22:fontcolor=white
`;
await run([
  "-y", "-f", "lavfi", "-i", `color=c=0x0B1715:s=1920x1080:r=30:d=${cardDuration}`,
  "-loop", "1", "-i", logo, "-t", String(cardDuration),
  "-filter_complex", `${introGraph};[1:v]scale=96:96,format=rgba[logo];[0:v][logo]overlay=x=200:y=245:format=auto,format=yuv420p[v]`,
  "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-r", "30", "-pix_fmt", "yuv420p", intro,
]);

const outroGraph = `
[0:v]drawbox=x=1260:y=0:w=660:h=1080:color=0x15352F@0.5:t=fill,
drawbox=x=1220:y=0:w=2:h=1080:color=0x36C9B2@0.32:t=fill,
drawbox=x=200:y=810:w=720:h=3:color=0x28443F@1:t=fill,
drawbox=x=200:y=810:w='min(720,max(0,(t-0.2)*720))':h=3:color=0x52D5BE@1:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='Walkcast':x=322:y=265:fontsize=72:fontcolor=white:alpha='min(1,max(0,(t-0.3)/0.35))',
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='Show what actually happened.':x=200:y=440:fontsize=58:fontcolor=0x52D5BE:alpha='min(1,max(0,(t-0.55)/0.35))',
drawtext=fontfile='C\:/Windows/Fonts/segoeui.ttf':text='Free and open source  /  No watermark':x=200:y=565:fontsize=32:fontcolor=0xC3CFCC:alpha='min(1,max(0,(t-0.85)/0.35))',
drawbox=x=200:y=685:w=440:h=62:color=0x1B3933@1:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='walkcast.kunjshah.in':x=224:y=700:fontsize=26:fontcolor=white:alpha='min(1,max(0,(t-1.05)/0.35))'
`;
await run([
  "-y", "-f", "lavfi", "-i", `color=c=0x0B1715:s=1920x1080:r=30:d=${cardDuration}`,
  "-loop", "1", "-i", logo, "-t", String(cardDuration),
  "-filter_complex", `${outroGraph};[1:v]scale=88:88,format=rgba[logo];[0:v][logo]overlay=x=200:y=250:format=auto,format=yuv420p[v]`,
  "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-r", "30", "-pix_fmt", "yuv420p", outro,
]);

const mainStartText = mainStart.toFixed(2);
const homeEnd = (mainStart + 32.19).toFixed(2);
const downloadEnd = (mainStart + 50.36).toFixed(2);
const mainEnd = (mainStart + mainDuration).toFixed(2);
const outroStartText = outroStart.toFixed(2);
const filterGraph = `
[0:v]settb=AVTB,setpts=PTS-STARTPTS,fps=30,format=yuv420p[intro];
[1:v]settb=AVTB,setpts=PTS-STARTPTS,fps=30,format=yuv420p[main];
[2:v]settb=AVTB,setpts=PTS-STARTPTS,fps=30,format=yuv420p[outro];
[intro][main]xfade=transition=wipeleft:duration=${transition}:offset=${mainStart.toFixed(2)}[joined1];
[joined1][outro]xfade=transition=fade:duration=${transition}:offset=${outroStartText}[joined2];
[joined2]vignette=angle=PI/16,
drawbox=x=54:y=112:w=426:h=48:color=0x0B1715@0.84:t=fill:enable='between(t,${mainStartText},${mainEnd})',
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='WALKCAST  /  LIVE SITE TOUR':x=74:y=123:fontsize=21:fontcolor=white:enable='between(t,${mainStartText},${mainEnd})',
drawbox=x=1560:y=112:w=300:h=48:color=0x0B1715@0.84:t=fill:enable='between(t,${mainStartText},${homeEnd})',
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='01  /  HOME':x=1582:y=123:fontsize=21:fontcolor=0x52D5BE:enable='between(t,${mainStartText},${homeEnd})',
drawbox=x=1560:y=112:w=300:h=48:color=0x0B1715@0.84:t=fill:enable='between(t,${homeEnd},${downloadEnd})',
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='02  /  DOWNLOAD':x=1582:y=123:fontsize=21:fontcolor=0x52D5BE:enable='between(t,${homeEnd},${downloadEnd})',
drawbox=x=1560:y=112:w=300:h=48:color=0x0B1715@0.84:t=fill:enable='between(t,${downloadEnd},${mainEnd})',
drawtext=fontfile='C\:/Windows/Fonts/segoeuib.ttf':text='03  /  LAB':x=1582:y=123:fontsize=21:fontcolor=0x52D5BE:enable='between(t,${downloadEnd},${mainEnd})',
drawbox=x=0:y=1072:w='min(1920,max(0,(t-${mainStartText})*23.31))':h=8:color=0x52D5BE@0.96:t=fill:enable='between(t,${mainStartText},${mainEnd})',
subtitles=filename='videos/walkcast-demo/Walkcast-Fresh-Walkthrough.vtt':force_style='FontName=Segoe UI,FontSize=11,PrimaryColour=&H000B1715,OutlineColour=&H00FFFFFF,BorderStyle=1,Outline=2,Shadow=1,MarginV=36,WrapStyle=0',
format=yuv420p[vout];
[1:a]highpass=f=90,lowpass=f=10500,acompressor=threshold=0.12:ratio=2.8:attack=12:release=180:makeup=3,alimiter=limit=0.92,adelay=${Math.round(mainStart * 1000)}|${Math.round(mainStart * 1000)},asplit=2[voice][voicekey];
[3:a]atrim=duration=${finalDuration.toFixed(2)},volume=0.19,afade=t=in:st=0:d=1.2,afade=t=out:st=${(finalDuration - 3.2).toFixed(2)}:d=3.2[music];
[music][voicekey]sidechaincompress=threshold=0.025:ratio=5:attack=20:release=280[musicduck];
[4:a]volume=0.14,adelay=2750|2750[whoosh1];
[4:a]volume=0.12,adelay=${Math.round(outroStart * 1000)}|${Math.round(outroStart * 1000)}[whoosh2];
[5:a]asplit=2[clicka][clickb];
[clicka]volume=0.08,adelay=${Math.round((mainStart + 32.19) * 1000)}|${Math.round((mainStart + 32.19) * 1000)}[click1];
[clickb]volume=0.08,adelay=${Math.round((mainStart + 50.36) * 1000)}|${Math.round((mainStart + 50.36) * 1000)}[click2];
[6:a]volume=0.12,adelay=${Math.round((outroStart + 0.2) * 1000)}|${Math.round((outroStart + 0.2) * 1000)}[chime];
[musicduck][voice][whoosh1][whoosh2][click1][click2][chime]amix=inputs=7:duration=longest:dropout_transition=0.4,alimiter=limit=0.97,afade=t=out:st=${(finalDuration - 2.8).toFixed(2)}:d=2.8[aout]
`;
const graphPath = resolve(here, "render.ffgraph");
writeFileSync(graphPath, filterGraph, "utf8");

await run([
  "-y", "-i", intro, "-i", sourceVideo, "-i", outro,
  "-stream_loop", "-1", "-i", score,
  "-i", whoosh, "-i", click, "-i", chime, "-i", shiftedVtt,
  "-filter_complex_script", graphPath,
  "-map", "[vout]", "-map", "[aout]", "-map", "7:s:0",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
  "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-c:s", "mov_text",
  "-t", finalDuration.toFixed(2), "-movflags", "+faststart",
  "-metadata", "title=Walkcast | Fresh product walkthrough", "-metadata", "artist=Walkcast",
  output,
]);

await run(["-y", "-ss", "12", "-i", output, "-frames:v", "1", "-q:v", "2", poster]);
console.log(JSON.stringify({ output, poster, captions: shiftedVtt, duration: finalDuration, capture }));
