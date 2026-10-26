from __future__ import annotations
import shutil
from pathlib import Path
from PIL import Image, ImageOps
from . import store
from .providers import WorkflowError, binary, run


def stamp(seconds, ass=False):
    units = 100 if ass else 1000
    ticks = max(0, round(seconds * units))
    whole, fraction = divmod(ticks, units)
    minutes, sec = divmod(whole, 60)
    hour, minute = divmod(minutes, 60)
    return f'{hour}:{minute:02}:{sec:02}.{fraction:02}' if ass else f'{hour:02}:{minute:02}:{sec:02},{fraction:03}'


def validate_cues(cues, duration):
    previous = 0
    for cue in cues:
        if not 0 <= cue['start'] < cue['end'] <= duration + 0.02 or cue['start'] < previous - 0.001:
            raise WorkflowError('เวลาซับต้องเรียง ไม่ซ้อนกัน และไม่เกินระยะฉาก')
        previous = cue['end']


def safe_text(text):
    return text.replace('\\', '＼').replace('{', '｛').replace('}', '｝').replace('\r', '').replace('\n', '\\N')


def ass_document(cues, headline, duration, font):
    header = f'''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},58,&H00FFFFFF,&H00FFFFFF,&H00202020,&H70000000,0,0,0,0,100,100,0,0,1,3,1,2,85,85,220,1
Style: Title,{font},68,&H00FFFFFF,&H00FFFFFF,&H00202020,&H70000000,-1,0,0,0,100,100,0,0,1,2,1,8,75,75,160,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    for cue in cues:
        header += f"Dialogue: 0,{stamp(cue['start'], True)},{stamp(cue['end'], True)},Default,,0,0,0,,{safe_text(cue['text'])}\n"
    if headline:
        header += f'Dialogue: 1,0:00:00.00,{stamp(duration, True)},Title,,0,0,0,,{safe_text(headline)}\n'
    return header


def render_project(project, progress):
    ffmpeg = binary('ffmpeg')
    scenes = project['scenes']
    if not scenes:
        raise WorkflowError('โปรเจกต์ยังไม่มีฉาก')
    for s in scenes:
        if not s['image'] or not s['audio']:
            raise WorkflowError(f"{s['title']}: ต้องมีภาพและเสียงก่อนส่งออก")
        if s['duration'] + .01 < s['audio_duration']:
            raise WorkflowError('ฉากสั้นกว่าเสียงพากย์ กรุณาปรับระยะฉาก')
        if project['burn_subtitles'] and not s['cues']:
            raise WorkflowError(f"{s['title']}: ยังไม่มีซับ เพิ่มซับหรือปิดการฝังซับ")
        validate_cues(s['cues'], s['duration'])
    output = store.asset_dir(project['id']) / ('render-' + store.uid())
    output.mkdir()
    font_source = store.ROOT / 'backend' / 'assets' / 'fonts'
    if font_source.exists():
        shutil.copytree(font_source, output / 'fonts')
    total = sum(s['duration'] for s in scenes)
    subtitle_lines = []
    offset = 0
    number = 1
    for i, s in enumerate(scenes):
        progress(10 + int(i / len(scenes) * 65), f"ตัดต่อฉาก {i + 1}/{len(scenes)}")
        with Image.open(store.asset_path(s['image'])) as image:
            ImageOps.fit(image.convert('RGB'), (1080, 1920), method=Image.Resampling.LANCZOS).save(output / f'{i}.png')
        cues = s['cues'] if project['burn_subtitles'] else []
        (output / f'{i}.ass').write_text(ass_document(cues, project['headline'], s['duration'], store.settings()['font_name']), encoding='utf-8-sig')
        count = max(1, round(s['duration'] * 30))
        motion = s['motion']
        if motion == 'zoom_in':
            zoom = f"zoompan=z='1+0.1*on/{count}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30"
        elif motion == 'zoom_out':
            zoom = f"zoompan=z='1.1-0.1*on/{count}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30"
        elif motion == 'pan':
            zoom = f"zoompan=z=1.1:x='(iw-iw/zoom)*on/{count}':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30"
        else:
            zoom = 'fps=30'
        filters = zoom + f",subtitles=filename={i}.ass:fontsdir=fonts,setsar=1,format=yuv420p"
        if project['transition'] == 'fade':
            fade = min(.2, s['duration'] / 4)
            filters += f',fade=t=in:st=0:d={fade},fade=t=out:st={s["duration"] - fade}:d={fade}'
        run([ffmpeg, '-y', '-v', 'error', '-filter_threads', '2', '-loop', '1', '-framerate', '30', '-i', f'{i}.png', '-i', store.asset_path(s['audio']), '-vf', filters, '-af', 'apad', '-t', str(s['duration']), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-threads', '2', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', f'{i}.mp4'], cwd=output, timeout=1800)
        for cue in s['cues']:
            subtitle_lines.append(f"{number}\n{stamp(offset + cue['start'])} --> {stamp(offset + cue['end'])}\n{cue['text']}\n")
            number += 1
        offset += s['duration']
    (output / 'concat.txt').write_text('\n'.join(f"file '{i}.mp4'" for i in range(len(scenes))), encoding='utf-8')
    progress(80, 'รวมฉากและผสมเสียง')
    run([ffmpeg, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', '-movflags', '+faststart', 'joined.mp4'], cwd=output)
    if project['music']:
        run([ffmpeg, '-y', '-v', 'error', '-filter_complex_threads', '2', '-i', 'joined.mp4', '-stream_loop', '-1', '-i', store.asset_path(project['music']), '-filter_complex', f"[1:a]volume={project['music_volume']}[bg];[0:a][bg]amix=inputs=2:duration=first:normalize=0[a]", '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-t', str(total), '-movflags', '+faststart', 'final.mp4'], cwd=output)
    else:
        (output / 'joined.mp4').replace(output / 'final.mp4')
    run([ffmpeg, '-y', '-v', 'error', '-ss', str(min(.5, total / 2)), '-i', 'final.mp4', '-frames:v', '1', '-threads', '1', 'cover.png'], cwd=output)
    (output / 'subtitles.srt').write_text('\n'.join(subtitle_lines), encoding='utf-8')
    progress(95, 'ตรวจไฟล์ส่งออก')
    from .providers import probe
    metadata = probe(output / 'final.mp4')
    video = next((stream for stream in metadata['streams'] if stream['codec_type'] == 'video'), None)
    if not video or (video['width'], video['height']) != (1080, 1920):
        raise WorkflowError('ไฟล์ส่งออกมีขนาดไม่ถูกต้อง')
    return {'render': store.relative(output / 'final.mp4'), 'cover': store.relative(output / 'cover.png'), 'srt': store.relative(output / 'subtitles.srt')}
