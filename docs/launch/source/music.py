"""Original launch score for the Walkcast video, synthesized from scratch (royalty-free).
120 BPM, A minor (Am-F-C-G). Sections line up with the video's cuts."""
import numpy as np, wave, sys
SR=44100; BPM=120; B=60/BPM; BAR=4*B; DUR=88.0
N=int(SR*DUR); L=np.zeros(N); R=np.zeros(N)
rng=np.random.default_rng(7)
def t_(d): return np.arange(int(SR*d))/SR
def add(sig, at, gain=1.0, pan=0.0):
    i=int(at*SR); n=min(len(sig), N-i)
    if n<=0: return
    l=np.cos((pan+1)*np.pi/4); r=np.sin((pan+1)*np.pi/4)
    L[i:i+n]+=sig[:n]*gain*l*1.414; R[i:i+n]+=sig[:n]*gain*r*1.414
def lp(x, fc):  # one-pole lowpass, fc may be array
    a=np.exp(-2*np.pi*np.broadcast_to(fc,x.shape)/SR); y=np.empty_like(x); s=0.0
    for i in range(len(x)): s=x[i]*(1-a[i])+s*a[i]; y[i]=s
    return y
def lp_fast(x, fc):
    a=np.exp(-2*np.pi*fc/SR)
    from numpy import zeros
    # vectorised via scipy-free IIR using cumulative trick is unstable; small blocks loop
    y=np.empty_like(x); s=0.0
    for i in range(len(x)): s=x[i]*(1-a)+s*a; y[i]=s
    return y
def hp(x, fc): return x-lp_fast(x,fc)
def env(n, a, d, s=0.0, rel=None):
    t=np.arange(n)/SR; e=np.where(t<a, t/max(a,1e-4), s+(1-s)*np.exp(-(t-a)/max(d,1e-4)))
    return e
def note(m): return 440*2**((m-69)/12)
def saw(f, d, det=0.0):
    t=t_(d); ph=(f*(1+det))*t + rng.random()
    return 2*(ph%1)-1

# --- instruments -------------------------------------------------------------
def kick(d=0.45):
    t=t_(d); f=45+120*np.exp(-t*28); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-t*7)*1.0 + 0.3*np.sin(ph*2)*np.exp(-t*40)
def clap(d=0.35):
    n=int(SR*d); x=rng.standard_normal(n); e=np.zeros(n)
    for k,o in enumerate([0,0.011,0.022]): i=int(o*SR); e[i:]+=np.exp(-np.arange(n-i)/SR*(60 if k<2 else 14))
    return hp(x,900)*e*0.5
def hat(d=0.06, open_=False):
    n=int(SR*(0.25 if open_ else d)); x=hp(hp(hp(rng.standard_normal(n),8000),8000),8000)
    return x*np.exp(-np.arange(n)/SR*(14 if open_ else 70))*0.28
def tick():
    t=t_(0.03); return np.sin(2*np.pi*3200*t)*np.exp(-t*220)*0.25
def crash(d=2.5):
    n=int(SR*d); x=hp(hp(rng.standard_normal(n),5000),5000); return x*np.exp(-np.arange(n)/SR*1.6)*0.22
def impact(d=2.2):  # sub boom + noise burst for power cuts
    t=t_(d); f=30+70*np.exp(-t*6); b=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*2.2)
    nz=lp_fast(rng.standard_normal(len(t)),1800)*np.exp(-t*9)*1.2
    return (b*1.1+nz)*0.9
def whoosh(d=0.6, up=True):
    t=t_(d); x=rng.standard_normal(len(t)); fc=np.linspace(300,6000,len(t)) if up else np.linspace(6000,300,len(t))
    e=np.sin(np.pi*np.minimum(t/d,1))**2
    return lp(x,fc)*e*0.5
def riser(d):
    t=t_(d); x=rng.standard_normal(len(t)); fc=300*(20**(t/d))
    tone=saw(110,d)*0+np.sin(2*np.pi*np.cumsum(220*(4**(t/d)))/SR)*0.15
    return (lp(x,fc)*0.5+tone)*(t/d)**2
def pluck(m, d=0.4, bright=4000):
    x=saw(note(m),d)+saw(note(m),d,0.006)
    return lp_fast(x,bright)*np.exp(-t_(d)*9)*0.22
def pad(ms, d, cutoff=1800):
    x=np.zeros(int(SR*d))
    for m in ms:
        for det in (-0.008,-0.003,0.003,0.008): x+=saw(note(m),d,det)
    x=lp_fast(x/len(ms)/4, cutoff); a=int(0.25*SR); x[:a]*=np.linspace(0,1,a); x[-a:]*=np.linspace(1,0,a)
    return x*0.55
def bass(m, d):
    t=t_(d); f=note(m); x=np.sin(2*np.pi*f*t)+0.35*np.sign(np.sin(2*np.pi*f*t))*0.5
    return lp_fast(x,600)*env(len(t),0.005,d*0.6,0.5)*0.55

# --- arrangement ---------------------------------------------------------------
# chords per bar (root midi for bass, triad for pad), A minor i-VI-III-VII
CH=[(45,[57,60,64,69]),(41,[53,57,60,65]),(48,[55,60,64,67]),(43,[55,59,62,67])]
ARP=[[69,72,76,72],[65,69,72,69],[67,72,76,72],[67,71,74,71]]
def chord(bar): return CH[bar%4]
bars=int(DUR/BAR)
for bar in range(bars):
    t0=bar*BAR; root,tri=chord(bar)
    sec = 'intro' if t0<14 else 'build' if t0<22 else 'drop' if t0<54 else 'break' if t0<60 else 'drop2' if t0<74 else 'climax' if t0<80 else 'outro'
    cutoff={'intro':700,'build':1200,'drop':3200,'break':1500,'drop2':3600,'climax':4500,'outro':1400}[sec]
    padg={'intro':0.55,'build':0.5,'drop':0.42,'break':0.6,'drop2':0.42,'climax':0.45,'outro':0.6}[sec]
    if sec=='outro' and bar>40: continue
    dd = BAR*(4 if sec=='outro' else 1)+0.3
    add(pad(tri,dd,cutoff), t0, padg, -0.2); add(pad([m+12 for m in tri[:2]],dd,cutoff), t0, padg*0.35, 0.3)
    if sec=='outro': continue
    for b in range(4):
        tb=t0+b*B
        if sec=='intro':
            add(tick(), tb, 0.8, 0.4)
            if b%2==0: add(pluck(tri[(bar+b)%4]+12,0.9,2200), tb, 0.5, -0.3)
        if sec in('build','drop','drop2','climax'):
            add(hat(), tb+B/2, 0.8 if sec!='build' else 0.6, 0.35)
            for s8 in range(2): add(bass(root, B/2-0.02), tb+s8*B/2, 0.8 if sec=='build' else 1.0)
        if sec in('drop','drop2','climax'):
            add(kick(), tb, 1.0)
            if b in(1,3): add(clap(), tb, 0.9)
            add(hat(), tb+B/4, 0.35, -0.35); add(hat(), tb+3*B/4, 0.35, -0.35)
        if sec in('drop','break','drop2','climax'):
            arp=ARP[bar%4]
            for s in range(4): add(pluck(arp[s]+(12 if sec=='climax' else 0),0.35,5000 if sec!='break' else 2500), tb+s*B/4, 0.55 if sec!='break' else 0.45, 0.5 if s%2 else -0.5)
        if sec=='break' and bar>=28: add(kick(), tb, 0.5 if b%2==0 else 0)
    if sec in ('drop','drop2','climax') and bar%2==0: add(crash(), t0, 0.5, 0.2)

# build: snare roll into drop
for i,tr in enumerate(np.concatenate([np.arange(18,20,B/2),np.arange(20,21,B/4),np.arange(21,21.75,B/8)])):
    add(clap(0.15), tr, 0.25+0.6*(tr-18)/3.75)
add(riser(4.0), 17.75, 0.9); add(riser(2.0), 72.0, 0.8); add(riser(1.5), 52.5, 0.6)
# power-cut hits (same list the video uses for flashes)
for tc,g in [(4,0.5),(6,0.35),(7,0.35),(8,0.35),(9,0.35),(10,0.6),(14,0.7),(18,0.5),(22,1.0),(30,0.4),(54,0.8),(60,0.5),(74,1.0),(76,0.8),(78,0.8),(80,1.0)]:
    add(impact(), tc, g)
for tw in [3.6,9.6,13.6,17.6,29.6,35.6,47.6,53.6,59.6,67.6,73.6,79.6]: add(whoosh(0.45), tw, 0.5, 0.0)
# final hit chord ring
add(pad([45,57,60,64,69,76],8,2400),80,0.7)

# sidechain ducking from kicks: approximate by gain envelope on kick positions
duck=np.ones(N)
for bar in range(bars):
    t0=bar*BAR
    if 22<=t0<54 or 60<=t0<80:
        for b in range(4):
            i=int((t0+b*B)*SR); n=int(0.3*SR); duck[i:i+n]=np.minimum(duck[i:i+n],1-0.45*np.exp(-np.arange(n)/SR*12)[:max(0,min(n,N-i))])
# simple stereo reverb (comb + allpass) on everything, mixed low
def reverb(x):
    y=np.zeros_like(x)
    for dly,g in [(1557,0.84),(1617,0.83),(1491,0.84),(1422,0.82)]:
        c=np.zeros(len(x)+dly)
        for s in range(0,len(x),dly):  # block-wise feedback comb
            e=min(s+dly,len(x)); c[s+dly:e+dly]=x[s:e]+g*c[s:e]
        y+=c[dly:dly+len(x)]
    return lp_fast(y/4,5000)
L2=L*duck; R2=R*duck
L2+=reverb(L2)*0.18; R2+=reverb(np.roll(R2,300))*0.18
# master: fade, soft clip, normalize
fade=np.ones(N); fi=int(0.05*SR); fade[:fi]=np.linspace(0,1,fi); fo=int(6*SR); fade[-fo:]=np.linspace(1,0,fo)**1.5
mix=np.stack([L2,R2],1)*fade[:,None]; mix/=np.max(np.abs(mix))*0.9
mix=np.tanh(mix*1.6)/np.tanh(1.6); mix*=0.89/np.max(np.abs(mix))
with wave.open(sys.argv[1],'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype('<i2').tobytes())
print('ok')
