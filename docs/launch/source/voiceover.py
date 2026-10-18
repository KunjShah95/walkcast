"""Voice-over for the launch video: Kokoro (Apache-2.0, offline), one clip per line, each
placed at its cue and checked against the window before the next cue."""
import json, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
# (start, end-of-window, text)
LINES=[
 (0.5, 3.9,  "Every launch needs a walkthrough. Nobody enjoys making it."),
 (4.1, 5.9,  "Write the script."),
 (6.05,7.0,  "Record the screen."),
 (7.0,8.0,   "Retake. Retake."),
 (8.05,9.0,  "Record the voice."),
 (9.05,10.0, "Sync the captions."),
 (10.3,13.9, "Then you ship one update, and it's already out of date."),
 (14.2,17.9, "Meanwhile, your browser agent says: done. The app says otherwise."),
 (18.1,20.35,"Seventy-six said success. The app disagreed."),
 (20.45,21.75,"No repro. Just flaky."),
 (23.1,24.2, "Meet Walkcast."),
 (24.4,29.8, "Paste a link. Get a narrated video walkthrough of your website."),
 (30.4,35.9, "One URL is the whole brief. Confirm you're allowed to test it, and press record."),
 (36.6,40.1, "Walkcast drives a real browser through your site."),
 (40.3,43.1, "Every line of narration comes from what actually happened."),
 (43.3,45.3, "Captions, chapters, and a transcript."),
 (45.4,48.25,"It never bypasses a captcha. It stops, and says so."),
 (48.3,53.8, "One URL in. A finished video out. Pick any voice, or use your own."),
 (54.25,55.3,"Same recorder."),
 (55.45,56.7,"Second job."),
 (56.75,60.3,"Walkcast Lab turns failed agent runs into regression tests."),
 (60.4,64.2, "Capture the failure. Classify the cause. Freeze it. Replay it."),
 (64.4,67.9, "Causes come from the app's real state, not an L L M judge."),
 (68.2,73.8, "Did the next version fix it, or break something else? Now you know."),
 (74.1,76.0, "Real browser."),
 (76.1,78.0, "Real state."),
 (78.1,80.0, "Real evidence."),
 (80.7,87.0, "Walkcast. Show what actually happened. Free and open source, at walkcast dot kunjshah dot in."),
]
k=Kokoro(sys.argv[1],sys.argv[2]); VOICE=sys.argv[3]; SR=24000
out=np.zeros(int(88*SR),dtype=np.float32); cues=[]
for s,e,text in LINES:
    speed=1.05
    for _ in range(6):
        a,sr=k.create(text,voice=VOICE,speed=speed,lang="en-us")
        # trim leading/trailing silence
        nz=np.where(np.abs(a)>0.01)[0]; a=a[max(0,nz[0]-240):nz[-1]+1200]
        d=len(a)/sr
        if d<=e-s or speed>=1.3: break
        speed=round(min(1.3,speed*min(1.25,(d/(e-s))*1.03)),3)
    i=int(s*SR); out[i:i+len(a)]+=a[:len(out)-i]
    cues.append((s,s+d,text)); print(f"{s:6.2f} {d:5.2f}s / {e-s:4.2f} speed {speed} {'OVER' if d>e-s else ''} {text[:40]}")
sf.write(sys.argv[4],out,SR)
def ts(x): return f"{int(x//3600):02d}:{int(x%3600//60):02d}:{x%60:06.3f}"
with open(sys.argv[5],'w') as f:
    f.write("WEBVTT\n\n")
    for n,(a,b,t) in enumerate(cues,1): f.write(f"{n}\n{ts(a)} --> {ts(b)}\n{t.replace('L L M','LLM').replace('walkcast dot kunjshah dot in','walkcast.kunjshah.in')}\n\n")
