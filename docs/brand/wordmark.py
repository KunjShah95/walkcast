# Outline "Walkcast" in Schibsted Grotesk 800 -> SVG path data (no font dependency)
import sys,json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
f=TTFont(sys.argv[1]); f=instantiateVariableFont(f,{"wght":int(sys.argv[3])})
gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm
text=sys.argv[2]; track=-0.035*upm
x=0; pen=SVGPathPen(gs)
for i,ch in enumerate(text):
    g=cmap[ord(ch)]
    gs[g].draw(TransformPen(pen,(1,0,0,-1,x,0)))
    x+=gs[g].width+(track if i<len(text)-1 else 0)
os2=f['OS/2']
print(json.dumps({"d":pen.getCommands(),"width":x,"upm":upm,"cap":os2.sCapHeight,"asc":os2.sTypoAscender,"desc":os2.sTypoDescender}))
