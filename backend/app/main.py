from __future__ import annotations
import os
import secrets
import shutil
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / '.env')
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from . import store, worker, providers
from .models import CreateProject, ProjectPatch, ScenePatch, JobRequest, SettingsPatch, VOICES, TTS_MODEL
from .render import validate_cues

TOKEN = secrets.token_urlsafe(32)


@asynccontextmanager
async def lifespan(app):
    store.initialize()
    if os.getenv('SHORT_STUDIO_SEED', '1') == '1':
        from .demo import seed
        seed()
    yield


app = FastAPI(title='Short Studio', lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', '[::1]'])


@app.middleware('http')
async def local_only(request: Request, call_next):
    origin = request.headers.get('origin')
    if origin:
        parsed = urlsplit(origin)
        if parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1') or parsed.port not in (5173, 8765):
            return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
    if request.headers.get('sec-fetch-site') == 'cross-site':
        return JSONResponse({'detail': 'Cross-site requests are not allowed'}, status_code=403)
    if request.url.path.startswith('/api/') and request.method not in ('GET', 'HEAD', 'OPTIONS'):
        if not secrets.compare_digest(request.headers.get('x-studio-token', ''), TOKEN):
            return JSONResponse({'detail': 'Session expired. Reload the page.'}, status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    if request.url.path.startswith('/api/') and not request.url.path.startswith('/api/assets/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.exception_handler(providers.WorkflowError)
async def workflow_error(request, error):
    return JSONResponse({'detail': str(error)}, status_code=409)


@app.exception_handler(KeyError)
async def missing(request, error):
    return JSONResponse({'detail': 'ไม่พบโปรเจกต์หรือฉาก'}, status_code=404)


def available(kind):
    cfg = store.settings()
    return all(bool(cfg[k]) and Path(cfg[k]).is_file() for k in (kind + '_bin', kind + '_model'))


def status():
    return {'gemini': bool(os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')), 'tts_model': TTS_MODEL, 'voices': VOICES, 'ffmpeg': bool(shutil.which('ffmpeg') and shutil.which('ffprobe')), 'llama': available('llama'), 'sd': available('sd'), 'whisper': available('whisper'), 'windows': sys.platform == 'win32', 'data_dir': str(store.DATA)}


def mutable(pid):
    if worker.busy(pid):
        raise providers.WorkflowError('กำลังทำงานอยู่ รอให้เสร็จก่อนแก้ไขโปรเจกต์')
    return store.project(pid)


def get_scene(p, sid):
    s = next((s for s in p['scenes'] if s['id'] == sid), None)
    if s is None:
        raise KeyError(sid)
    return s


@app.get('/api/bootstrap')
def bootstrap():
    return {'token': TOKEN, 'status': status(), 'settings': store.settings(), 'projects': store.projects()}


@app.get('/api/health')
def health():
    return status()


@app.get('/api/projects')
def list_projects():
    return store.projects()


@app.post('/api/projects', status_code=201)
def create_project(body: CreateProject):
    return store.new_project(body.title)


@app.get('/api/projects/{pid}')
def read_project(pid: str):
    return store.project(pid)


@app.patch('/api/projects/{pid}')
def patch_project(pid: str, body: ProjectPatch):
    with worker.MUTEX:
        p = mutable(pid)
        changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
        if any(p[k] != v for k, v in changes.items() if k in ('headline', 'transition', 'music_volume', 'burn_subtitles')):
            worker.invalidate(p)
        p.update(changes)
        return store.save_project(p)


@app.post('/api/projects/{pid}/scenes', status_code=201)
def add_scene(pid: str):
    with worker.MUTEX:
        p = mutable(pid)
        if len(p['scenes']) >= 12:
            raise providers.WorkflowError('รองรับสูงสุด 12 ฉากต่อโปรเจกต์')
        p['scenes'].append(store.scene(len(p['scenes'])))
        worker.invalidate(p)
        return store.save_project(p)


@app.patch('/api/projects/{pid}/scenes/{sid}')
def patch_scene(pid: str, sid: str, body: ScenePatch):
    with worker.MUTEX:
        p = mutable(pid)
        s = get_scene(p, sid)
        changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
        if 'duration' in changes and changes['duration'] + .001 < s['audio_duration']:
            raise providers.WorkflowError('ระยะฉากต้องไม่น้อยกว่าระยะเสียงพากย์')
        if 'cues' in changes or 'duration' in changes:
            validate_cues(changes.get('cues', s['cues']), changes.get('duration', s['duration']))
        changed = any(s[k] != v for k, v in changes.items())
        if any(k in changes and changes[k] != s[k] for k in ('narration', 'voice', 'style')):
            s.update(audio=None, audio_duration=0, duration=0, cues=[], timing_method=None)
            # A combined update may not smuggle old cues back after changing narration.
            changes.pop('cues', None)
            changes.pop('duration', None)
        elif 'cues' in changes:
            s['timing_method'] = 'manual'
        s.update(changes)
        if changed:
            s['revision'] += 1
            worker.invalidate(p)
        return store.save_project(p)


@app.delete('/api/projects/{pid}/scenes/{sid}')
def delete_scene(pid: str, sid: str):
    with worker.MUTEX:
        p = mutable(pid)
        get_scene(p, sid)
        if len(p['scenes']) <= 1:
            raise providers.WorkflowError('โปรเจกต์ต้องมีอย่างน้อยหนึ่งฉาก')
        p['scenes'] = [s for s in p['scenes'] if s['id'] != sid]
        for i, s in enumerate(p['scenes']):
            s['order'] = i
        worker.invalidate(p)
        return store.save_project(p)


@app.post('/api/projects/{pid}/uploads/{kind}')
def upload(pid: str, kind: str, file: UploadFile = File(), scene_id: str | None = None):
    if kind not in ('image', 'audio', 'music', 'source'):
        raise HTTPException(400, 'ไม่รองรับชนิดไฟล์นี้')
    with worker.MUTEX:
        p = mutable(pid)
        s = get_scene(p, scene_id) if kind in ('image', 'audio') else None
        suffix = Path(file.filename or '').suffix.lower()
        if suffix not in ('.png', '.jpg', '.jpeg', '.webp', '.wav', '.mp3', '.m4a', '.mp4', '.webm', '.ogg', '.flac', '.mov'):
            raise HTTPException(400, 'ใช้ไฟล์ภาพ เสียง หรือวิดีโอที่รองรับ')
        path = store.asset_dir(pid) / (store.uid() + suffix)
        size = 0
        try:
            with path.open('wb') as destination:
                while chunk := file.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > 250 * 1024 * 1024:
                        raise HTTPException(413, 'ไฟล์ต้องไม่เกิน 250 MB')
                    destination.write(chunk)
            if kind == 'image':
                Image.MAX_IMAGE_PIXELS = 40_000_000
                converted = path.with_name(path.stem + '-image.png')
                with Image.open(path) as image:
                    ImageOps.exif_transpose(image).convert('RGB').save(converted)
                s.update(image=store.relative(converted), image_origin='upload', revision=s['revision'] + 1)
            elif kind == 'audio':
                duration = providers.audio_duration(path)
                converted = path.with_name(path.stem + '-audio.wav')
                providers.run([providers.binary('ffmpeg'), '-y', '-v', 'error', '-i', path, '-vn', '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', converted], timeout=120)
                worker.set_audio(s, converted, duration)
            elif kind == 'music':
                info = providers.probe(path)
                if not any(stream['codec_type'] == 'audio' for stream in info['streams']):
                    raise providers.WorkflowError('ไฟล์เพลงไม่มีแทร็กเสียง')
                p['music'] = store.relative(path)
            else:
                info = providers.probe(path)
                if not any(stream['codec_type'] == 'audio' for stream in info['streams']) or float(info['format'].get('duration', 0)) > 1800:
                    raise providers.WorkflowError('ไฟล์ต้นฉบับต้องมีเสียงและยาวไม่เกิน 30 นาที')
                return worker.enqueue(pid, 'source', payload={'path': store.relative(path)})
            worker.invalidate(p)
            return store.save_project(p)
        except (UnidentifiedImageError, Image.DecompressionBombError):
            raise HTTPException(400, 'ไฟล์ภาพไม่ถูกต้องหรือมีขนาดใหญ่เกินไป') from None
        finally:
            file.file.close()


@app.delete('/api/projects/{pid}/music')
def delete_music(pid: str):
    with worker.MUTEX:
        p = mutable(pid)
        p['music'] = None
        worker.invalidate(p)
        return store.save_project(p)


@app.post('/api/projects/{pid}/jobs', status_code=202)
def queue_job(pid: str, body: JobRequest):
    return worker.enqueue(pid, body.action, body.scene_id)


@app.get('/api/projects/{pid}/jobs')
def list_jobs(pid: str):
    store.project(pid)
    return store.jobs(pid)


@app.post('/api/jobs/{jid}/retry', status_code=202)
def retry(jid: str):
    j = next((j for j in store.jobs() if j['id'] == jid), None)
    if not j or j['status'] not in ('failed', 'interrupted'):
        raise HTTPException(409, 'ลองใหม่ได้เฉพาะงานที่ล้มเหลวหรือถูกขัดจังหวะ')
    return worker.enqueue(j['project_id'], j['action'], j['scene_id'], j['payload'])


@app.put('/api/settings')
def update_settings(body: SettingsPatch):
    if any(j['status'] in ('running', 'queued') for j in store.jobs()):
        raise providers.WorkflowError('รอให้งานในคิวเสร็จก่อนเปลี่ยนการตั้งค่า')
    return store.save_settings(store.settings() | body.model_dump())


@app.post('/api/pick-folder')
def pick_folder():
    if sys.platform != 'win32':
        raise HTTPException(409, 'ตัวเลือกโฟลเดอร์ Windows ใช้ได้เมื่อเปิดโปรแกรมบน Windows เท่านั้น เครื่องนี้ใช้ดาวน์โหลดไฟล์แทนได้')
    # A dedicated short-lived process avoids Tk thread affinity issues in FastAPI.
    picker = store.ROOT / 'scripts' / 'pick_folder.py'
    selected = providers.run([sys.executable, picker], timeout=300).strip()
    if selected:
        path = Path(selected)
        if not path.is_dir():
            raise providers.WorkflowError('โฟลเดอร์ที่เลือกใช้งานไม่ได้')
        store.save_settings(store.settings() | {'export_dir': str(path)})
    return {'export_dir': store.settings()['export_dir']}


@app.get('/api/assets/{asset:path}')
def get_asset(asset: str, download: bool = False):
    if not asset.startswith('projects/') or Path(asset).suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp', '.wav', '.mp3', '.m4a', '.mp4', '.webm', '.ogg', '.flac', '.srt'):
        raise HTTPException(404)
    try:
        path = store.asset_path(asset)
    except ValueError:
        raise HTTPException(404) from None
    return FileResponse(path, filename=path.name if download else None)


DIST = store.ROOT / 'frontend' / 'dist'

@app.get('/{path:path}')
def frontend(path: str):
    if path.startswith('api/'):
        raise HTTPException(404)
    target = (DIST / path).resolve()
    if target.is_relative_to(DIST.resolve()) and target.is_file():
        return FileResponse(target)
    if (DIST / 'index.html').exists():
        return FileResponse(DIST / 'index.html')
    return JSONResponse({'detail': 'Build frontend first: cd frontend && npm ci && npm run build'}, status_code=503)
