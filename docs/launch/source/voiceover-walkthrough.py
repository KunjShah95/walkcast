"""Voice-over for the Walkcast desktop app walkthrough: Kokoro (Apache-2.0, offline), female voice.
One clip per line, each placed at its cue and checked against the window before the next cue.
(target ~60 s, female voice af_heart)"""
import json, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
# (start, end-of-window, text) — windows sized so each line fits at natural speed
LINES=[
 (0.5,  6.5,  "This is Walkcast. A free desktop app that turns one URL into a narrated walkthrough video."),
 (6.7, 10.0,  "Open the app. Paste your link. Press record."),
 (10.2, 14.0, "A real browser walks your site - signs in, follows links, scrolls each page."),
 (14.2, 18.5, "You get the whole visit as an MP4, with captions, chapters and a transcript."),
 (18.7, 23.0, "Every line comes from what actually happened - real browser, real state, real evidence."),
 (23.2, 27.5, "When a page changes, you don't re-film anything. Paste the link again and Walkcast re-records."),
 (27.7, 32.0, "The studio shows your video, transcript and page list side by side - share one link."),
 (32.2, 37.0, "And when your browser agents fail, Walkcast Lab turns the failed run into a replayable regression test."),
 (37.2, 42.0, "Capture the failure, classify the cause, freeze it, replay it - and know if the next version fixed it."),
 (42.2, 47.0, "Pick your voice in settings - Kokoro is free and offline, or bring your own ElevenLabs or OpenAI key."),
 (47.2, 55.0, "One URL. A finished video. Walkcast. Show what actually happened. Free and open source, at walkcast dot kunjshah dot in."),
]
k=Kokoro(sys.argv[1],sys.argv[2]); VOICE=sys.argv[3]; SR=24000
out=np.zeros(int(60*SR),dtype=np.float32); cues=[]
for s,e,text in LINES:
    speed=1.05
    for _ in range(6):
        a,sr=k.create(text,voice=VOICE,speed=speed,lang="en-us")
        nz=np.where(np.abs(a)>0.01)[0]; a=a[max(0,nz[0]-240):nz[-1]+1200]
        d=len(a)/sr
        if d<=e-s or speed>=1.3: break
        speed=round(min(1.3,speed*min(1.25,(d/(e-s))*1.03)),3)
    i=int(s*SR); out[i:i+len(a)]+=a[:len(out)-i]
    cues.append((s,s+d,text)); print(f"{s:6.2f} {d:5.2f}s / {e-s:4.2f} speed {speed} {'OVER' if d>e-s else ''} {text[:40]}")
sf.write(sys.argv[4],out,SR)
def ts(x): return f"{int(x//3600):02d}:{int(x%3600//60):02d}:{x%60:06.3f}"
with open(sys.argv[5],'w',encoding='utf-8') as f:
    f.write("WEBVTT\n\n")
    for n,(a,b,t) in enumerate(cues,1): f.write(f"{n}\n{ts(a)} --> {ts(b)}\n{t.replace('L L M','LLM').replace('walkcast dot kunjshah dot in','walkcast.kunjshah.in')}\n\n")
print("done")
