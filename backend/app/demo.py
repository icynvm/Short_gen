"""Original procedural sample artwork; these images are not AI-generated output."""
import math
from PIL import Image, ImageDraw
from . import store


def artwork(path, variant):
    width, height = 720, 1280
    image = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(image)
    top, bottom = ((73, 104, 104), (246, 208, 147)) if variant != 1 else ((91, 114, 132), (235, 195, 171))
    for y in range(height):
        f = min(1, y / (height * .68))
        color = tuple(int(a * (1-f) + b * f) for a,b in zip(top,bottom))
        draw.line((0,y,width,y), fill=color)
    sx = 490 - variant * 95
    draw.ellipse((sx-70, 290+variant*40, sx+70, 430+variant*40), fill=(250, 224, 171))
    layers = [(660, (151, 162, 139), 80), (785, (110, 139, 124), 100), (905, (69, 107, 98), 110), (1060, (35, 74, 67), 110), (1190, (24, 53, 47), 90)]
    for index, (base, color, amplitude) in enumerate(layers):
        points = [(x, base + int(math.sin(x / (160 + index * 23) + variant + index * 1.7) * amplitude + math.cos(x/85 + index) * amplitude * .22)) for x in range(-10, width+11, 5)]
        draw.polygon([(0,height),*points,(width,height)],fill=color)
    for x,y in [(98,250),(126,270),(568,180)]:
        draw.line((x-8,y+4,x,y,x+8,y+4), fill=(70,91,88),width=2)
    image.save(path)


def seed():
    if store.projects():
        return
    p = store.new_project('เช้าวันใหม่ เริ่มต้นได้เสมอ')
    p.update(source_text='ทุกเช้าคือโอกาสเริ่มต้นใหม่ เราไม่จำเป็นต้องทำทุกอย่างให้สมบูรณ์แบบ แค่เริ่มด้วยสิ่งเล็ก ๆ ที่ทำได้วันนี้', summary='การเริ่มต้นวันใหม่ด้วยความตั้งใจเล็ก ๆ และให้เวลากับตัวเอง', headline='เริ่มต้นใหม่\nในทุกเช้า')
    scripts = [
        ('แสงแรกของวัน', 'ทุกเช้าคือโอกาสที่จะเริ่มต้นใหม่ <short pause> ไม่ว่าวันเมื่อวานจะเป็นอย่างไร', 'A serene sunrise over layered mountains, golden mist, editorial landscape photography, no text'),
        ('พักสักนิด แล้วไปต่อ', 'เราไม่จำเป็นต้องทำทุกอย่างให้สมบูรณ์แบบ แค่ให้เวลากับตัวเองสักนิด', 'Peaceful mountain valley at dawn, soft cinematic teal and warm peach, no text'),
        ('ก้าวเล็ก ๆ ของวันนี้', 'เริ่มจากก้าวเล็ก ๆ ที่ทำได้วันนี้ แล้วปล่อยให้วันพรุ่งนี้ค่อย ๆ เติบโต', 'Warm morning light over green rolling hills, hopeful atmosphere, cinematic, no text')
    ]
    p['scenes'] = []
    for i, (title, narration, prompt) in enumerate(scripts):
        s = store.scene(i)
        path = store.asset_dir(p['id']) / f'sample-{i}.png'
        artwork(path, i)
        s.update(title=title, narration=narration, prompt=prompt, image=store.relative(path), image_origin='sample')
        p['scenes'].append(s)
    store.save_project(p)
