import json,os
S=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(S,'out'); os.makedirs(OUT,exist_ok=True)
wm=json.load(open(os.path.join(S,'wordmark-path.json')))
INK='#1b1a17'; PAPER='#ffffff'; REC='#c0321c'

PLAY="M25.5 22.3v19.4c0 2.3 2.5 3.7 4.5 2.5l15.6-9.7c1.8-1.2 1.8-3.8 0-5L30 19.8c-2-1.2-4.5.2-4.5 2.5z"
TRAIL="M11 26.5h8M14.5 37.5h4.5"
def mark(id='m', tile=True, mono=None, fg=PAPER):
    """64x64 mark: ochre tile, play glyph with a walk trail, record light."""
    if mono:
        return (f'<rect width="64" height="64" rx="16" fill="{mono}"/>'
                f'<path d="{TRAIL}" stroke="{fg}" stroke-width="3.6" stroke-linecap="round" opacity=".55"/>'
                f'<path d="{PLAY}" fill="{fg}"/><circle cx="48" cy="16" r="5.2" fill="{fg}"/>')
    return (f'<defs><linearGradient id="{id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9c5700"/><stop offset="1" stop-color="#7a4100"/></linearGradient></defs>'
            f'<rect width="64" height="64" rx="16" fill="url(#{id}g)"/>'
            f'<path d="{TRAIL}" stroke="{PAPER}" stroke-width="3.6" stroke-linecap="round" opacity=".5"/>'
            f'<path d="{PLAY}" fill="{PAPER}"/>'
            f'<circle cx="48" cy="16" r="7.4" fill="{PAPER}"/><circle cx="48" cy="16" r="5" fill="{REC}"/>')

def svg(w,h,body,bg=None):
    b=f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{b}{body}</svg>\n'

def lockup(color, bg=None, monomark=None):
    # mark 64 tall; wordmark cap height ~ 0.62 of mark
    s=40/wm['cap']; ww=wm['width']*s; gap=18; W=64+gap+ww+2; H=64
    y=32+wm['cap']*s/2
    body=mark('l'+color[1:],mono=monomark)+f'<path transform="translate({64+gap} {y:.2f}) scale({s:.5f})" d="{wm["d"]}" fill="{color}"/>'
    return svg(round(W),H,body,bg)

def stacked(color):
    s=56/wm['cap']; ww=wm['width']*s; W=max(ww,128)+8; H=128+36+56+14
    body=f'<g transform="translate({(W-128)/2} 0) scale(2)">{mark("s")}</g><path transform="translate({(W-ww)/2:.2f} {128+36+56}) scale({s:.5f})" d="{wm["d"]}" fill="{color}"/>'
    return svg(round(W),H,body)

files={
 'walkcast-mark.svg': svg(64,64,mark()),
 'walkcast-mark-mono-ink.svg': svg(64,64,mark(mono=INK)),
 'walkcast-mark-mono-white.svg': svg(64,64,mark(mono='#ffffff',fg=INK)),
 'walkcast-logo.svg': lockup(INK),
 'walkcast-logo-white.svg': lockup('#ffffff'),
 'walkcast-logo-stacked.svg': stacked(INK),
 'walkcast-wordmark.svg': svg(round(wm['width']*40/wm['cap'])+2,48,f'<path transform="translate(0 {44}) scale({40/wm["cap"]:.5f})" d="{wm["d"]}" fill="{INK}"/>'),
 'favicon.svg': svg(64,64,mark('f')),
}
for k,v in files.items(): open(os.path.join(OUT,k),'w').write(v)
# app icon 1024 with padding (macOS-style safe area)
open(os.path.join(OUT,'walkcast-app-icon.svg'),'w').write(svg(1024,1024,f'<g transform="translate(100 100) scale(12.97)">{mark("a")}</g>'))
print('\n'.join(files))
