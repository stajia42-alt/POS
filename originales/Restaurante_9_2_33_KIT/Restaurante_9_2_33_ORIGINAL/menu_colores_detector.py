"""Detecta anotaciones de contorno coloreado; jamás interpreta ni crea registros SQL.
Entrada: JSON con imagen base64 y colores. Salida: RESTAURANTE_GUIA:{...}.
Usa OpenCV, que también es dependencia de PaddleOCR. No llama a Google.
"""
import sys, json, base64, math

PREFIX = 'RESTAURANTE_GUIA:'
TYPES = ('categoria', 'producto', 'descripcion', 'precio', 'ignorar', 'modificador', 'componente')
DEFAULT = {'categoria':'#e53935','producto':'#facc15','descripcion':'#2563eb','precio':'#16a34a','ignorar':'#6b7280','modificador':'#9333ea','componente':'#0891b2'}

def threshold(hsv, color):
    import cv2, numpy as np
    raw = tuple(int(color[k:k+2],16) for k in (1,3,5))
    ref = cv2.cvtColor(np.uint8([[list(raw)]]),cv2.COLOR_RGB2HSV)[0,0]
    h,s,v = [int(x) for x in ref]
    if s < 70:
        # Gris: neutro y suficientemente contrastado, sin confundir con fondos blancos.
        return cv2.inRange(hsv, (0,0,42),(179,58,190))
    diff = np.abs(hsv[:,:,0].astype(np.int16)-h)
    near = np.minimum(diff,180-diff) <= 12
    return (near & (hsv[:,:,1] >= max(63,int(s*.40))) & (hsv[:,:,2]>=65)).astype('uint8')*255

def find_boxes(image, colors):
    import cv2, numpy as np
    height,width=image.shape[:2]
    hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    all_regions=[]
    for kind,color in colors.items():
        mask=threshold(hsv,color)
        # Junta trazos discontinuos menores sin cubrir el interior del recuadro.
        kernel=cv2.getStructuringElement(cv2.MORPH_RECT,(5,5))
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,kernel,iterations=1)
        contours,_=cv2.findContours(mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        possibles=[]
        for contour in contours:
            x,y,w,h=cv2.boundingRect(contour)
            if w < max(24,width*.018) or h < max(18,height*.011):continue
            if w>width*.97 or h>height*.96:continue
            if w*h < width*height*.00012:continue
            box=mask[y:y+h,x:x+w]
            thickness=max(2,min(8,int(min(w,h)*.055)))
            edges=[float(np.mean(box[:thickness,:]>0)),float(np.mean(box[-thickness:,:]>0)),float(np.mean(box[:,:thickness]>0)),float(np.mean(box[:,-thickness:]>0))]
            if min(edges)<.38:continue
            # No tomar manchas sólidas ni fondos de color como recuadros.
            interior=box[thickness:-thickness,thickness:-thickness]
            if interior.size and float(np.mean(interior>0))>.32:continue
            confidence=round(min(1.0,sum(edges)/4),3)
            possibles.append(dict(tipo=kind,rect=[x,y,w,h],confianzaColor=confidence))
        # Contornos dobles del mismo marco -> conservar el más exterior.
        possibles.sort(key=lambda p:p['rect'][2]*p['rect'][3],reverse=True)
        kept=[]
        for p in possibles:
            x,y,w,h=p['rect']
            if any(abs(x-a['rect'][0])<max(8,w*.08) and abs(y-a['rect'][1])<max(8,h*.10) and abs(w-a['rect'][2])<max(9,w*.11) and abs(h-a['rect'][3])<max(9,h*.28) for a in kept):continue
            kept.append(p)
        all_regions.extend(kept)
    all_regions.sort(key=lambda p:(p['rect'][1],p['rect'][0]))
    if len(all_regions)>120:raise ValueError('Se detectaron más de 120 recuadros. Revisa colores o divide la imagen.')
    for i,r in enumerate(all_regions):
        r['id']='R'+str(i+1)
        x,y,w,h=r.pop('rect')
        r['rect']=[round(x/width,6),round(y/height,6),round(w/width,6),round(h/height,6)]
        r['_pixels']=(x,y,w,h)
    return all_regions

def montage(image,regions):
    import cv2, numpy as np
    # Tres columnas reducen la altura para Gemini; bordes de color no se mezclan con el texto.
    max_w=570; label_h=32; pad=10; cols=2
    tiles=[]
    for region in regions:
        x,y,w,h=region['_pixels'];inner=0 if region.get('_manual') else max(2,min(8,int(min(w,h)*.07)))
        crop=image[min(y+inner,image.shape[0]-1):min(y+h-inner,image.shape[0]),min(x+inner,image.shape[1]-1):min(x+w-inner,image.shape[1])]
        if crop.size==0:crop=image[y:y+h,x:x+w]
        scale=min(2.4,max_w/max(1,crop.shape[1]))
        cw=max(1,round(crop.shape[1]*scale));ch=max(1,round(crop.shape[0]*scale))
        ch=min(ch,300)
        crop=cv2.resize(crop,(cw,ch),interpolation=cv2.INTER_CUBIC if scale>1 else cv2.INTER_AREA)
        tile=np.full((ch+label_h+pad,max_w+pad,3),255,dtype=np.uint8)
        cv2.putText(tile,region['id']+' '+region['tipo'],(9,23),cv2.FONT_HERSHEY_SIMPLEX,.58,(20,20,20),2,cv2.LINE_AA)
        tile[label_h:label_h+ch,3:3+min(max_w,cw)]=crop[:,:min(max_w,cw)]
        tiles.append(tile)
    if not tiles:return None
    rows=[]
    for i in range(0,len(tiles),cols):
        row_tiles=tiles[i:i+cols];h=max(a.shape[0] for a in row_tiles)
        row=np.full((h,(max_w+pad)*cols,3),255,dtype=np.uint8)
        for j,t in enumerate(row_tiles):row[:t.shape[0],j*(max_w+pad):j*(max_w+pad)+t.shape[1]]=t
        rows.append(row)
    sheet=np.vstack(rows)
    if sheet.shape[0]>11000:
        factor=11000/sheet.shape[0]
        sheet=cv2.resize(sheet,(max(1,round(sheet.shape[1]*factor)),11000),interpolation=cv2.INTER_AREA)
    ok,encoded=cv2.imencode('.jpg',sheet,[cv2.IMWRITE_JPEG_QUALITY,91])
    if not ok:raise ValueError('No se pudo crear la imagen de regiones.')
    return base64.b64encode(encoded.tobytes()).decode('ascii')

def run(request):
    import cv2, numpy as np
    val=request.get('imagen','')
    if not isinstance(val,str) or len(val)>9000000:raise ValueError('Imagen inválida o demasiado grande.')
    data=base64.b64decode(val,validate=True)
    if len(data)>7000000:raise ValueError('Imagen superior a 7 MB.')
    image=cv2.imdecode(np.frombuffer(data,dtype=np.uint8),cv2.IMREAD_COLOR)
    if image is None:raise ValueError('No se puede abrir esta imagen.')
    h,w=image.shape[:2]
    if h*w>30000000:raise ValueError('Foto superior a 30 MP.')
    given=request.get('colores',{})
    if not isinstance(given,dict):raise ValueError('Colores inválidos.')
    colors={}
    for kind in TYPES:
        s=given.get(kind,DEFAULT[kind]);
        if not isinstance(s,str) or len(s)!=7 or not s.startswith('#') or any(c not in '0123456789abcdefABCDEF' for c in s[1:]):raise ValueError('El color de '+kind+' no es hexadecimal válido.')
        colors[kind]=s
    if 'regiones' in request:
        incoming=request['regiones']
        if not isinstance(incoming,list) or len(incoming)>120:raise ValueError('Cantidad de cuadros inválida.')
        regions=[]
        for i, r in enumerate(incoming):
            if not isinstance(r,dict) or r.get('tipo') not in TYPES:raise ValueError('Tipo de cuadro inválido.')
            rect=r.get('rect')
            if not isinstance(rect,list) or len(rect)!=4 or any(type(v) not in (int,float) or not math.isfinite(v) for v in rect):raise ValueError('Coordenadas inválidas.')
            x,y,rw,rh=rect
            if min(x,y)>=0 and rw>.003 and rh>.003 and x+rw<=1.00001 and y+rh<=1.00001:
                px=max(0,int(x*w));py=max(0,int(y*h));pw=min(w-px,max(2,int(rw*w)));ph=min(h-py,max(2,int(rh*h)))
                regions.append({'id':'R'+str(i+1),'tipo':r['tipo'],'rect':rect,'_pixels':(px,py,pw,ph),'confianzaColor':1.0,'_manual':True})
            else:raise ValueError('Un cuadro sale de la fotografía.')
    else:
        regions=find_boxes(image,colors)
    result=[]
    for r in regions:result.append({k:v for k,v in r.items() if k!='_pixels'})
    return {'correcto':True,'ancho':w,'alto':h,'regiones':result,'montaje':montage(image,regions) if regions else None}

if __name__=='__main__':
    try:
        req=json.loads(sys.stdin.readline());out=run(req)
    except Exception as e:
        out={'correcto':False,'error':str(e)}
    print(PREFIX+json.dumps(out,ensure_ascii=False),flush=True)
