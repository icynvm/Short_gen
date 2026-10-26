from __future__ import annotations
import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv('SHORT_STUDIO_DATA', ROOT / 'data')).resolve()
DATA.mkdir(parents=True, exist_ok=True)
LOCK = threading.RLock()


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid.uuid4().hex


def connect():
    connection = sqlite3.connect(DATA / 'studio.sqlite', timeout=30)
    connection.row_factory = sqlite3.Row
    return connection


def initialize():
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)')
        for row in db.execute('SELECT id, body FROM jobs').fetchall():
            j = json.loads(row['body'])
            if j['status'] in ('running', 'queued'):
                j.update(status='interrupted', error='โปรแกรมหยุดก่อนงานเสร็จ กดลองใหม่ได้ ระบบจะไม่เรียก API ซ้ำเอง', finished_at=now())
                db.execute('UPDATE jobs SET body=? WHERE id=?', (json.dumps(j, ensure_ascii=False), row['id']))


def save_project(p):
    p['updated_at'] = now()
    with LOCK, connect() as db:
        db.execute('INSERT OR REPLACE INTO projects VALUES (?, ?, ?)', (p['id'], json.dumps(p, ensure_ascii=False), p['updated_at']))
    return p


def project(pid):
    with connect() as db:
        row = db.execute('SELECT body FROM projects WHERE id=?', (pid,)).fetchone()
    if not row:
        raise KeyError('ไม่พบโปรเจกต์')
    return json.loads(row['body'])


def projects():
    with connect() as db:
        return [json.loads(row['body']) for row in db.execute('SELECT body FROM projects ORDER BY updated DESC')]


def save_job(j):
    with LOCK, connect() as db:
        db.execute('INSERT OR REPLACE INTO jobs VALUES (?, ?, ?, ?)', (j['id'], j['project_id'], json.dumps(j, ensure_ascii=False), j['created_at']))
    return j


def jobs(pid=None):
    with connect() as db:
        rows = db.execute('SELECT body FROM jobs WHERE project_id=? ORDER BY created DESC LIMIT 50', (pid,)) if pid else db.execute('SELECT body FROM jobs ORDER BY created DESC LIMIT 100')
        return [json.loads(row['body']) for row in rows]


def settings():
    defaults = {'llama_bin': '', 'llama_model': '', 'sd_bin': '', 'sd_model': '', 'whisper_bin': '', 'whisper_model': '', 'export_dir': '', 'font_name': 'Noto Sans Thai'}
    with connect() as db:
        row = db.execute('SELECT body FROM settings WHERE id=1').fetchone()
    return defaults | (json.loads(row['body']) if row else {})


def save_settings(value):
    with connect() as db:
        db.execute('INSERT OR REPLACE INTO settings VALUES (1, ?)', (json.dumps(value, ensure_ascii=False),))
    return value


def scene(order=0):
    return {'id': uid(), 'order': order, 'title': f'ฉากที่ {order + 1}', 'narration': '', 'prompt': '', 'voice': 'Kore', 'style': 'Warm, natural Thai narration. Clear pronunciation, measured pace.', 'seed': 42 + order, 'motion': 'zoom_in', 'image': None, 'image_origin': None, 'audio': None, 'audio_duration': 0, 'duration': 0, 'cues': [], 'timing_method': None, 'revision': 1}


def new_project(title='โปรเจกต์ใหม่'):
    p = {'id': uid(), 'title': title, 'created_at': now(), 'updated_at': now(), 'source_text': '', 'source_url': '', 'summary': '', 'target_duration': 30, 'image_count': 3, 'image_style': 'Cinematic photography, warm natural lighting', 'transition': 'cut', 'music': None, 'music_volume': 0.12, 'headline': '', 'burn_subtitles': True, 'scenes': [scene()], 'render': None, 'cover': None, 'srt': None, 'export_path': None, 'revision': 1}
    return save_project(p)


def asset_dir(pid):
    path = DATA / 'projects' / pid
    path.mkdir(parents=True, exist_ok=True)
    return path


def asset_path(relative):
    result = (DATA / relative).resolve()
    if not result.is_relative_to(DATA) or not result.is_file():
        raise ValueError('ไม่พบไฟล์ที่อนุญาต')
    return result


def relative(path):
    return str(Path(path).resolve().relative_to(DATA)).replace('\\', '/')
