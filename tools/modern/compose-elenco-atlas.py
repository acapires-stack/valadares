from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, sys
root=Path(r'C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/revisao-elenco')
refs=sys.argv[1:] or ['81b618b','5373640']
rows=json.loads((root/refs[0]/'metrics.json').read_text())['types']
names={'RAT':'Rato','SNAKE':'Cobra','SPIDER':'Aranha','WOLF':'Lobo','ORC':'Orc','ORC_LIDER':'Líder orc','BAT':'Morcego','MINOTAUR':'Minotauro','SKELETON':'Esqueleto','TROLL':'Troll','LIZARD':'Lagarto','DRAKE':'Drake','DRAKE_LIDER':'Drake Ancião','GOLEM':'Golem','GOLEM_REI':'Rei Golem','SCORPION':'Escorpião','CACADOR':'Caçador','SOMBRA':'Sombra','CARRASCO':'Carrasco','SENHOR_PROFUNDEZAS':'Senhor das Profundezas','SENHOR_VALADARES':'Senhor de Valadares','ARAUTO':'Arauto'}
font=ImageFont.truetype(r'C:/Windows/Fonts/arial.ttf',21)
small=ImageFont.truetype(r'C:/Windows/Fonts/arial.ttf',16)
for direction in ('front','side'):
 for start in range(0,len(rows),4):
  batch=rows[start:start+4];im=Image.new('RGB',(640*len(refs),62+342*len(batch)+30),'#12291f');draw=ImageDraw.Draw(im)
  for i,ref in enumerate(refs):draw.text((i*640+16,12),{'81b618b':'Anterior 81b618b','5373640':'Publicado 5373640','candidate':'Candidato local'}[ref],font=font,fill='#f4dfb5')
  for j,row in enumerate(batch):
   y=62+j*342;type=row['type']
   for i,ref in enumerate(refs):
    im.paste(Image.open(root/ref/(type+'-'+direction+'.png')).crop((0,0,640,310)),(i*640,y+28))
    draw.text((i*640+16,y),names[type]+' · '+type,font=small,fill='#f6edcf')
  draw.text((16,im.height-26),'Câmera/luz comuns. Cavaleiro de referência com altura1,42. Recortes sem distorção ou ajuste de escala por criatura.',font=small,fill='#d5ddcf')
  im.save(root/('atlas-'+direction+'-'+str(start//4+1)+('-candidate' if 'candidate' in refs else '')+'.png'))
print('atlas pages:',len(range(0,len(rows),4))*2)
if 'candidate' in refs:
 for start in range(0,len(rows),4):
  batch=rows[start:start+4]; im=Image.new('RGB',(1920,62+342*len(batch)+30),'#12291f'); draw=ImageDraw.Draw(im)
  phases=[('walk-1','Corrida: amostra 2'),('attack-0','Golpe: amostra 1'),('attack-2','Golpe/retorno: amostra 3')]
  for i,(_,label) in enumerate(phases):draw.text((i*640+16,12),label,font=font,fill='#f4dfb5')
  for j,row in enumerate(batch):
   y=62+j*342; type=row['type']
   for i,(phase,_) in enumerate(phases):
    source=root/'candidate'/(type+'-'+phase+'.png')
    if source.exists():im.paste(Image.open(source).crop((0,0,640,310)),(i*640,y+28))
    draw.text((i*640+16,y),names[type]+' · '+type,font=small,fill='#f6edcf')
  draw.text((16,im.height-26),'Candidato em movimento. Amostras reais de quadros; nao sao tempos exatos de contacto. Mesma camera e referencia.',font=small,fill='#d5ddcf')
  im.save(root/('atlas-motion-'+str(start//4+1)+'.png'))
