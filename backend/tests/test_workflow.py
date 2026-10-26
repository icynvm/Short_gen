import base64
import io
import json
import math
import struct
import time
import wave
from pathlib import Path
import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from backend.app import store, worker, providers
from backend.app.main import app
from backend.app.render import stamp, validate_cues


def wav_bytes(duration=1.2):
    out = io.BytesIO()
    with wave.open(out, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(b''.join(struct.pack('<h', int(1200 * math.sin(2 * math.pi * 440 * i / 24000))) for i in range(int(duration * 24000))))
    return out.getvalue()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(store, 'DATA', tmp_path)
    monkeypatch.setenv('SHORT_STUDIO_SEED', '0')
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.delenv('GOOGLE_API_KEY', raising=False)
    with TestClient(app, base_url='http://localhost:8765') as c:
        bootstrap = c.get('/api/bootstrap').json()
        c.headers['x-studio-token'] = bootstrap['token']
        yield c


def create(client):
    result = client.post('/api/projects', json={'title': 'ทดสอบหนึ่งฉาก'})
    assert result.status_code == 201
    p = result.json()
    s = p['scenes'][0]
    p = client.patch(f'/api/projects/{p["id"]}/scenes/{s["id"]}', json={'narration': 'เริ่มต้นใหม่ ในทุกเช้า', 'title': 'แสงแรก', 'motion': 'zoom_in'}).json()
    return p, p['scenes'][0]


def wait_job(client, pid, jid):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        j = next(j for j in client.get(f'/api/projects/{pid}/jobs').json() if j['id'] == jid)
        if j['status'] not in ('queued', 'running'):
            return j
        time.sleep(.05)
    pytest.fail('Job did not finish')


def upload_scene(client, p, s):
    img = io.BytesIO()
    Image.new('RGB', (360, 640), (45, 100, 80)).save(img, format='PNG')
    result = client.post(f'/api/projects/{p["id"]}/uploads/image?scene_id={s["id"]}', files={'file': ('landscape.png', img.getvalue(), 'image/png')})
    assert result.status_code == 200, result.text
    result = client.post(f'/api/projects/{p["id"]}/uploads/audio?scene_id={s["id"]}', files={'file': ('synthetic-test-tone.wav', wav_bytes(), 'audio/wav')})
    assert result.status_code == 200, result.text
    return result.json()


def test_real_media_render_and_export(client, tmp_path):
    p, s = create(client)
    p = upload_scene(client, p, s)
    assert p['scenes'][0]['timing_method'] == 'whole_scene'
    assert p['scenes'][0]['duration'] == pytest.approx(1.2, abs=.02)
    # A second real scene tests concatenation, audio offsets, and fade duration.
    p = client.post(f'/api/projects/{p["id"]}/scenes').json()
    s2 = p['scenes'][1]
    client.patch(f'/api/projects/{p["id"]}/scenes/{s2["id"]}', json={'narration': 'ก้าวเล็ก ๆ ของวันนี้', 'motion': 'pan'})
    p = upload_scene(client, p, s2)
    client.patch(f'/api/projects/{p["id"]}', json={'headline': 'เช้าวันใหม่', 'transition': 'fade'})
    response = client.post(f'/api/projects/{p["id"]}/uploads/music', files={'file': ('music.wav', wav_bytes(.4), 'audio/wav')})
    assert response.status_code == 200
    result = client.post(f'/api/projects/{p["id"]}/jobs', json={'action': 'render'})
    assert result.status_code == 202, result.text
    job = wait_job(client, p['id'], result.json()['id'])
    assert job['status'] == 'completed', job['error']
    p = client.get(f'/api/projects/{p["id"]}').json()
    data = providers.probe(store.asset_path(p['render']))
    video = next(s for s in data['streams'] if s['codec_type'] == 'video')
    assert (video['width'], video['height'], video['codec_name']) == (1080, 1920, 'h264')
    assert any(s['codec_name'] == 'aac' for s in data['streams'])
    assert float(data['format']['duration']) == pytest.approx(2.4, abs=.15)
    srt = store.asset_path(p['srt']).read_text()
    assert '00:00:01,200 --> 00:00:02,400' in srt
    assert 'เริ่มต้นใหม่' in srt
    assert store.asset_path(p['cover']).stat().st_size > 1000
    assert client.get('/api/assets/' + p['render']).status_code == 200
    store.save_settings(store.settings() | {'export_dir': str(tmp_path / 'exports')})
    job = client.post(f'/api/projects/{p["id"]}/jobs', json={'action': 'export'}).json()
    assert wait_job(client, p['id'], job['id'])['status'] == 'completed'
    p = client.get(f'/api/projects/{p["id"]}').json()
    assert set(f.name for f in Path(p['export_path']).iterdir()) == {'video.mp4', 'subtitles.srt', 'cover.png'}


def test_narration_change_invalidates_voice_and_timing(client):
    p, s = create(client)
    p = upload_scene(client, p, s)
    old_audio = p['scenes'][0]['audio']
    result = client.patch(f'/api/projects/{p["id"]}/scenes/{s["id"]}', json={'narration': 'บทใหม่', 'duration': 1.2, 'cues': [{'start': 0, 'end': 1, 'text': 'เก่า'}]})
    assert result.status_code == 200
    updated = result.json()['scenes'][0]
    assert updated['audio'] is None and updated['cues'] == [] and updated['duration'] == 0
    assert store.asset_path(old_audio).exists(), 'Old source media must remain recoverable'
    assert client.get(f'/api/projects/{p["id"]}').json()['scenes'][0]['narration'] == 'บทใหม่'


def test_failed_voice_preserves_existing_assets_and_can_retry(client, monkeypatch):
    p, s = create(client)
    p = upload_scene(client, p, s)
    original = p['scenes'][0]['audio']
    j = client.post(f'/api/projects/{p["id"]}/jobs', json={'action': 'tts', 'scene_id': s['id']}).json()
    failed = wait_job(client, p['id'], j['id'])
    assert failed['status'] == 'failed' and 'GEMINI_API_KEY' in failed['error']
    assert client.get(f'/api/projects/{p["id"]}').json()['scenes'][0]['audio'] == original
    def fake_tts(scene, path):
        path.write_bytes(wav_bytes(.8))
        return .8
    monkeypatch.setattr(providers, 'generate_voice', fake_tts)
    retry = client.post(f'/api/jobs/{j["id"]}/retry').json()
    assert wait_job(client, p['id'], retry['id'])['status'] == 'completed'
    fresh = client.get(f'/api/projects/{p["id"]}').json()['scenes'][0]
    assert fresh['audio'] != original and fresh['duration'] == .8
    assert fresh['cues'][0]['end'] == .8


def test_mutations_require_token_and_local_origin(client):
    assert client.post('/api/projects', json={'title': 'x'}, headers={'x-studio-token': ''}).status_code == 403
    assert client.post('/api/projects', json={'title': 'x'}, headers={'origin': 'https://evil.example'}).status_code == 403
    assert client.get('/api/bootstrap', headers={'sec-fetch-site': 'cross-site'}).status_code == 403
    assert client.get('/api/health', headers={'host': 'evil.example'}).status_code == 400
    assert 'GEMINI_API_KEY' not in client.get('/api/bootstrap').text


def test_asset_traversal_and_invalid_upload(client):
    p, s = create(client)
    assert client.get('/api/assets/projects/%2e%2e/studio.sqlite').status_code == 404
    assert client.get('/api/assets/projects/../../.env').status_code == 404
    r = client.post(f'/api/projects/{p["id"]}/uploads/image?scene_id={s["id"]}', files={'file': ('bad.png', b'not an image', 'image/png')})
    assert r.status_code == 400


def test_cues_cannot_overlap_or_exceed_audio(client):
    p, s = create(client)
    upload_scene(client, p, s)
    url = f'/api/projects/{p["id"]}/scenes/{s["id"]}'
    assert client.patch(url, json={'duration': .2}).status_code == 409
    assert client.patch(url, json={'cues': [{'start': 0, 'end': 3, 'text': 'ผิด'}]}).status_code == 409
    assert client.patch(url, json={'cues': [{'start': 0, 'end': .8, 'text': 'หนึ่ง'}, {'start': .5, 'end': 1, 'text': 'สอง'}]}).status_code == 409
    r = client.patch(url, json={'cues': [{'start': 0, 'end': .5, 'text': 'หนึ่ง'}, {'start': .5, 'end': 1.2, 'text': 'สอง'}]})
    assert r.status_code == 200 and r.json()['scenes'][0]['timing_method'] == 'manual'
    assert client.patch(url, json={'duration': 2}).status_code == 200
    assert client.patch(url, json={'cues': [{'start': 0, 'end': 2, 'text': 'extended'}]}).status_code == 200
    assert client.patch(url, json={'duration': 1.2}).status_code == 409


def test_sdk_serializes_current_gemini_contract_without_network(tmp_path):
    from google import genai
    seen = []
    payload = wav_bytes(.1)
    def transport(request):
        seen.append(json.loads(request.content))
        assert request.url.path == '/v1beta/interactions'
        return httpx.Response(200, json={'id': 'mock', 'status': 'completed', 'output_audio': {'mime_type': 'audio/wav', 'data': base64.b64encode(payload).decode()}})
    with genai.Client(api_key='mock-not-a-secret', http_options={'httpx_client': httpx.Client(transport=httpx.MockTransport(transport))}) as sdk:
        r = sdk.interactions.create(**providers.tts_request('สวัสดี <short pause> วันนี้', 'Kore', 'Warm natural Thai'))
    body = seen[0]
    assert body['model'] == 'gemini-3.8-flash-tts'
    assert body['generation_config']['speech_config'] == [{'voice': 'Kore'}]
    content = body['input'][0]['content'][0]
    assert content['annotations'] == [{'type': 'speech_metadata', 'style': 'Warm natural Thai'}]
    assert content['text'] == 'สวัสดี <short pause> วันนี้'
    path = tmp_path / 'tts.wav'
    providers.write_audio(base64.b64decode(r.output_audio.data), path)
    assert path.read_bytes() == payload, 'Do not double-wrap the WAV container'


def test_restart_marks_jobs_interrupted(client):
    p, _ = create(client)
    j = {'id': store.uid(), 'project_id': p['id'], 'status': 'running', 'created_at': store.now(), 'action': 'tts'}
    store.save_job(j)
    store.initialize()
    assert store.jobs(p['id'])[0]['status'] == 'interrupted'
    assert not worker.busy(p['id'])


def test_cannot_edit_project_while_job_pending(client):
    p, s = create(client)
    store.save_job({'id': store.uid(), 'project_id': p['id'], 'status': 'queued', 'created_at': store.now(), 'action': 'tts'})
    assert client.patch(f'/api/projects/{p["id"]}/scenes/{s["id"]}', json={'title': 'racing'}).status_code == 409
    assert client.post(f'/api/projects/{p["id"]}/jobs', json={'action': 'render'}).status_code == 409


def test_timestamp_rounding_handles_carry():
    assert stamp(59.9996) == '00:01:00,000'
    assert stamp(59.9996, ass=True) == '0:01:00.00'
    with pytest.raises(providers.WorkflowError):
        validate_cues([{'start': 1, 'end': .5, 'text': 'bad'}], 2)
