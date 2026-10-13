import sys
from PIL import Image
# usage: cmp.py facing newfile out  -> old (from template body) beside new, 6x
f=sys.argv[1]; order=['s','sw','w','nw','n','ne','e','se']; i=order.index(f)
old=Image.open('out/body_1x.png').crop(((i%4)*48,(i//4)*72,(i%4)*48+48,(i//4)*72+72)); new=Image.open(sys.argv[2])
sheet=Image.new('RGBA',(48*2+8,72),(143,160,122,255)); sheet.paste(old,(0,0),old); sheet.paste(new,(56,0),new)
sheet.resize((sheet.width*6,sheet.height*6),Image.NEAREST).save(sys.argv[3])
