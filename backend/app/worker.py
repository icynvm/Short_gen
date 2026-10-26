from __future__ import annotations
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit
from . import store, providers
from .render import render_project

POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix='studio-worker')
MUTEX = threading.RLock()


def busy(pid):
    return any(j['status'] in ('queued', 'running') for j in store.jobs(pid))


def invalidate(p):
    p.update(render=None, cover=None, srt=None, export_path=None)
    p['revision'] += 1


def set_audio(scene, path, duration):
    scene.update(audio=store.relative(path), audio_duration=duration, duration=duration, cues=[], timing_method=None)
    # This is explicitly a whole-scene caption, not word alignment.
    text = providers.plain_narration(scene['narration'])
    if text:
        scene.update(cues=[{'start': 0, 'end': round(duration, 3), 'text': text}], timing_method='whole_scene')
    scene['revision'] += 1


def enqueue(pid, action, scene_id=None, payload=None):
    with MUTEX:
        if busy(pid):
            raise providers.WorkflowError('โปรเจกต์มีงานค้างอยู่ กรุณารอให้เสร็จก่อน')
        p = store.project(pid)
        if scene_id and not any(s['id'] == scene_id for s in p['scenes']):
            raise providers.WorkflowError('ไม่พบฉาก')
        if action in ('tts', 'image', 'align') and not scene_id:
            raise providers.WorkflowError('ต้องเลือกฉากก่อน')
        job = {'id': store.uid(), 'project_id': pid, 'scene_id': scene_id, 'action': action, 'status': 'queued', 'progress': 0, 'message': 'รอคิว', 'error': None, 'created_at': store.now(), 'finished_at': None, 'payload': payload}
        store.save_job(job)
        POOL.submit(execute, job)
        return job


def execute(job):
    def progress(value, message):
        job.update(progress=value, message=message)
        store.save_job(job)
    try:
        job['status'] = 'running'
        progress(3, 'กำลังเตรียมงาน')
        p = store.project(job['project_id'])
        s = next((s for s in p['scenes'] if s['id'] == job['scene_id']), None)
        action = job['action']
        directory = store.asset_dir(p['id'])
        if action == 'plan':
            summary, scenes = providers.plan_project(p)
            # Retain an explicit recoverable snapshot before replacing a storyboard.
            import json
            (directory / f'project-before-plan-{store.uid()}.json').write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding='utf-8')
            p.update(summary=summary, scenes=scenes)
            invalidate(p)
        elif action == 'image':
            path = directory / f'{s["id"]}-{store.uid()}.png'
            providers.generate_image(s, path)
            s.update(image=store.relative(path), image_origin='local_ai', revision=s['revision'] + 1)
            invalidate(p)
        elif action == 'tts':
            progress(15, 'สร้างเสียงด้วย Gemini · บทฉากนี้ส่งไป Google')
            path = directory / f'{s["id"]}-{store.uid()}.wav'
            duration = providers.generate_voice(s, path)
            set_audio(s, path, duration)
            invalidate(p)
        elif action == 'align':
            if not s['audio']:
                raise providers.WorkflowError('สร้างหรืออัปโหลดเสียงพากย์ก่อนจับเวลาซับ')
            cues = providers.transcribe(store.asset_path(s['audio']), directory / ('align-' + store.uid()))
            for cue in cues:
                cue['end'] = min(cue['end'], s['audio_duration'])
            s.update(cues=[c for c in cues if c['end'] > c['start']], timing_method='whisper', revision=s['revision'] + 1)
            invalidate(p)
        elif action == 'source':
            cues = providers.transcribe(store.asset_path(job['payload']['path']), directory / ('source-' + store.uid()), max_duration=1800)
            p['source_text'] = '\n'.join(c['text'] for c in cues)
        elif action == 'youtube':
            providers.local_pair('whisper')
            url = p['source_url']
            parsed = urlsplit(url)
            if parsed.scheme != 'https' or parsed.hostname not in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be') or parsed.username or parsed.password:
                raise providers.WorkflowError('รองรับเฉพาะลิงก์ HTTPS ของ YouTube')
            import sys
            target = directory / ('youtube-' + store.uid())
            target.mkdir()
            providers.run([sys.executable, '-m', 'yt_dlp', '--no-playlist', '--max-downloads', '1', '--max-filesize', '250M', '--match-filter', 'duration <= 1800', '-f', 'bestaudio/best', '-o', str(target / 'source.%(ext)s'), '--', url], timeout=600)
            files = [f for f in target.iterdir() if f.is_file() and f.suffix not in ('.part', '.ytdl')]
            if not files:
                raise providers.WorkflowError('ดึงลิงก์ไม่ได้หรือเกิน 30 นาที ใช้ไฟล์เสียง/ข้อความแทนได้')
            cues = providers.transcribe(files[0], directory / ('source-' + store.uid()), max_duration=1800)
            p['source_text'] = '\n'.join(c['text'] for c in cues)
        elif action == 'render':
            p.update(render_project(p, progress))
        elif action == 'export':
            root = store.settings()['export_dir']
            if not root:
                raise providers.WorkflowError('เลือกโฟลเดอร์ส่งออกบน Windows ก่อน หรือดาวน์โหลดไฟล์จากหน้า Preview')
            if not p['render']:
                raise providers.WorkflowError('สร้าง Preview ก่อนส่งออก')
            destination = Path(root) / f'ShortStudio-{p["id"][:8]}-{store.uid()[:8]}'
            destination.mkdir(parents=True, exist_ok=False)
            for key, name in [('render', 'video.mp4'), ('cover', 'cover.png'), ('srt', 'subtitles.srt')]:
                shutil.copy2(store.asset_path(p[key]), destination / name)
            p['export_path'] = str(destination)
        else:
            raise providers.WorkflowError('ไม่รองรับงานนี้')
        with MUTEX:
            store.save_project(p)
        job.update(status='completed', progress=100, message='เสร็จแล้ว', finished_at=store.now())
    except Exception as error:
        message = str(error) if isinstance(error, providers.WorkflowError) else f'งานหยุด ({type(error).__name__}) ไฟล์ก่อนหน้ายังอยู่ ตรวจ runtime และลองใหม่'
        job.update(status='failed', error=message, message='งานไม่สำเร็จ', finished_at=store.now())
    finally:
        store.save_job(job)
