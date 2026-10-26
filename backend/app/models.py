from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

VOICES = ['Kore', 'Puck', 'Charon', 'Aoede', 'Fenrir', 'Enceladus']
TTS_MODEL = 'gemini-3.8-flash-tts'

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')

class CreateProject(Strict):
    title: str = Field(default='โปรเจกต์ใหม่', min_length=1, max_length=150)

class Cue(Strict):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = Field(min_length=1, max_length=500)

class ScenePatch(Strict):
    title: str | None = Field(default=None, max_length=150)
    narration: str | None = Field(default=None, max_length=6000)
    prompt: str | None = Field(default=None, max_length=3000)
    voice: Literal['Kore', 'Puck', 'Charon', 'Aoede', 'Fenrir', 'Enceladus'] | None = None
    style: str | None = Field(default=None, max_length=2000)
    seed: int | None = Field(default=None, ge=0, le=2147483647)
    motion: Literal['still', 'zoom_in', 'zoom_out', 'pan'] | None = None
    duration: float | None = Field(default=None, gt=0, le=180)
    cues: list[Cue] | None = Field(default=None, max_length=200)

class ProjectPatch(Strict):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    source_text: str | None = Field(default=None, max_length=60000)
    source_url: str | None = Field(default=None, max_length=2000)
    target_duration: int | None = Field(default=None, ge=5, le=180)
    image_count: int | None = Field(default=None, ge=1, le=12)
    image_style: str | None = Field(default=None, max_length=1000)
    transition: Literal['cut', 'fade'] | None = None
    music_volume: float | None = Field(default=None, ge=0, le=0.6)
    headline: str | None = Field(default=None, max_length=120)
    burn_subtitles: bool | None = None

class JobRequest(Strict):
    action: Literal['plan', 'image', 'tts', 'align', 'render', 'export', 'youtube']
    scene_id: str | None = None

class SettingsPatch(Strict):
    llama_bin: str = ''
    llama_model: str = ''
    sd_bin: str = ''
    sd_model: str = ''
    whisper_bin: str = ''
    whisper_model: str = ''
    font_name: str = Field(default='Noto Sans Thai', pattern=r'^[\w \-]{1,100}$')
