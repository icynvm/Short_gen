# Short Studio — Handoff

อัปเดต: 26 ตุลาคม 2026 (Asia/Bangkok)

## เป้าหมายและเครื่องผู้ใช้

เว็บแอปสร้างคลิป Short ภาษาไทย ใช้ส่วนตัวบน Windows:

- Ryzen 5 5600X, RAM 16 GB 3200, AMD RX 6700 XT 12 GB
- รับข้อความ / ไฟล์เสียงหรือวิดีโอ / YouTube → สรุป → บทไทย → ฉาก → ภาพ → เสียง → ซับ → ตัดต่อ → หน้าปก → บันทึก
- เดิมต้องการ AI local ทั้งหมด ต่อมาผู้ใช้อนุญาตให้ใช้ **Gemini 3.8 Flash TTS ผ่าน Cloud สำหรับเสียง** ส่วนสรุป ภาพ ถอดเสียง และตัดต่อยังออกแบบให้ทำในเครื่อง
- ใช้ shadcn/ui ตามที่ผู้ใช้ระบุ เปิดบริการเฉพาะ localhost

## Repository และสถานะส่งมอบ

Repository: https://github.com/icynvm/Short_gen — branch `main`

โค้ด MVP ก่อนเอกสารนี้อยู่ที่ commit `a7b9d009646c3da02608e21b2bcf86feee07608e` และ push แล้ว เริ่มต้น repository ว่าง ไม่มี application code เดิมที่ต้องรักษา

**พร้อมทดลอง workflow ด้วยภาพ/เสียงที่อัปโหลดเอง** พร้อมตัวเชื่อม AI แต่ยังไม่ใช่การยืนยันว่า AI ทุกตัวทำงานบน Windows เป้าหมายแล้ว

| ส่วน | สถานะ |
|---|---|
| Studio, storyboard, editor รายฉาก, หน้าจอมือถือ | ทำแล้ว |
| บันทึกโปรเจกต์ SQLite, คิวงานเดียว, retry งานล้มเหลว | ทำแล้วและมี tests |
| อัปโหลดภาพ/เสียง, ตรวจเวลา, แก้ซับรายช่วง | ทำแล้วและมี tests |
| FFmpeg: motion, fade ผ่านสีดำ, เพลง, หัวข้อ, ซับไทย | ตัดต่อไฟล์จริงผ่านแล้ว |
| MP4 1080×1920 / 30 fps / H.264 + AAC, SRT, หน้าปก | ส่งออกจริงผ่านแล้ว |
| Gemini TTS | ต่อ SDK แล้ว; ตรวจ payload ด้วย mocked transport; **ยังไม่มี live test** |
| llama.cpp / stable-diffusion.cpp / whisper.cpp | มี subprocess adapters; **ยังไม่มี runtime/weights และยังไม่ทดสอบ inference** |
| Windows launcher / folder picker / AMD Vulkan | มี implementation; **ยังไม่ทดสอบบน Windows จริง** |
| YouTube importer | มี yt-dlp adapter; ยังไม่ทดสอบลิงก์จริงและไม่รับประกันทุกลิงก์ |

## วิธีรันบน Windows

ติดตั้ง Git, Python **3.12 x64** พร้อม Python Launcher และ Tcl/Tk, Node.js **24 LTS** และ FFmpeg/ffprobe ที่รองรับ `libx264` กับ `libass` ใน PATH รวมทั้งไดรเวอร์ AMD ที่รองรับ GPU รุ่นนี้

```powershell
git clone https://github.com/icynvm/Short_gen.git
cd Short_gen
.\scripts\setup.ps1
```

สคริปต์ติดตั้ง dependencies จาก `backend/requirements.txt` และ `frontend/package-lock.json`, build frontend และสร้าง `.env` จาก `.env.example` หากยังไม่มี

ใส่ `GEMINI_API_KEY` ใน `.env` ด้วยตนเอง ห้าม commit หรือส่งค่า key ในแชต แล้วรัน:

```powershell
.\scripts\start.ps1
```

Launcher ตรวจ health ก่อนเปิดเบราว์เซอร์ที่ `http://127.0.0.1:8765` เปิด PowerShell ค้างไว้ ใช้ Ctrl+C เพื่อหยุด ไม่ต้องเปิด Vite แยกสำหรับการใช้งานปกติ

หาก PowerShell policy ไม่อนุญาต ให้ทำตามนโยบายเครื่องหรือรันคำสั่ง Python/npm จากสคริปต์ด้วยตนเอง ไม่ต้องปิด policy ทั้งเครื่อง

ยังไม่ตั้งค่า Gemini ก็ใช้อัปโหลดเสียงเองได้ โมเดล local ไม่ได้ติดตั้งหรือดาวน์โหลดอัตโนมัติ

## AI ที่ต้องเตรียม

| งาน | Runtime ทางการ | Model ที่ออกแบบไว้ |
|---|---|---|
| สรุป / บท / แบ่งฉาก | [llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases), `llama-cli.exe` | [Qwen3-4B-GGUF](https://huggingface.co/Qwen/Qwen3-4B-GGUF/tree/main), Q4_K_M `.gguf` |
| ภาพ | [stable-diffusion.cpp releases](https://github.com/leejet/stable-diffusion.cpp/releases), `sd-cli.exe` | [SD 1.5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/tree/main), `v1-5-pruned-emaonly.safetensors` |
| ถอดเสียง / ซับ | [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases), `whisper-cli.exe` | [whisper.cpp models](https://huggingface.co/ggerganov/whisper.cpp/tree/main), `ggml-small.bin` multilingual ไม่ใช่ `.en` |
| เสียง | Google GenAI Python SDK ติดตั้งพร้อม backend | `gemini-3.8-flash-tts`, ไม่โหลด weights; [API key](https://aistudio.google.com/apikey) |

เลือก Windows x64 **Vulkan** สำหรับ AMD เก็บ DLL ที่มากับ runtime ไว้ด้วย หาก release ไม่มี Vulkan build ต้อง build ตามเอกสารต้นทาง ไม่เลือก CUDA มาแทน Vulkan SDK จำเป็นเมื่อ build เอง ไม่ใช่ข้อกำหนดเสมอสำหรับ prebuilt binaries

กรอก absolute paths ของ executable และ model ในหน้า **โมเดลและการตั้งค่า** ตรวจ license/hash/version ของไฟล์จริงและจดรุ่นที่ผ่าน smoke test ก่อนใช้ระยะยาว ลิงก์ Hugging Face ถูกเครือข่าย workspace ปฏิเสธระหว่างตรวจ จึงยังไม่ได้ยืนยันไฟล์ล่าสุดหรือ checksum

ค่าเริ่มต้นใน adapter: ภาพ 512×896, 20 steps; llama context 8192 และ GPU layers 99; source text สำหรับสร้างบทจำกัด 7,000 ตัวอักษร ต้องวัด RAM/VRAM และปรับหากเครื่องจริงไม่พอ ยังไม่มีระบบปรับ GPU layers หรือ CPU fallback อัตโนมัติ

## Gemini TTS: API และค่าใช้จ่ายอ้างอิง

ใช้ Interactions API โดยแยก:

- คำพูดและ vocal tags อยู่ใน `text`
- คำกำกับอยู่ใน `annotations: [{"type": "speech_metadata", "style": "..."}]`
- เสียงอยู่ใน `generation_config.speech_config`
- `response_format: {"type": "audio"}`; รับ WAV โดยไม่ใส่ header ซ้ำ
- UI เลือก prebuilt voices 6 เสียง: Kore, Puck, Charon, Aoede, Fenrir, Enceladus ไม่มี voice cloning ใน MVP
- ตัวอย่าง tags: `<short pause>`, `<long pause>`, `<laugh>`, `<sigh>`; คำกำกับไม่รับประกันผลทุกครั้ง
- ไม่ retry API อัตโนมัติ เพื่อหลีกเลี่ยงการคิดค่าบริการซ้ำเมื่อไม่ทราบผลคำขอ

เอกสาร: [Google TTS Cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_TTS.ipynb), [Python SDK](https://github.com/googleapis/python-genai), [คู่มือที่ผู้ใช้ส่ง](https://aistudio.google.com/learn/gemini-tts-prompt-guide-with-tags)

ลิงก์ AI Studio guide ถูกบล็อกเมื่อทำ implementation จึงอ้างอิง cookbook ทางการแทน ต่อมาหน้าราคา Google เปิดตรวจได้

ราคา **Standard** ที่อ่านจาก [Google Pricing](https://ai.google.dev/gemini-api/docs/pricing) เมื่อ 26 ต.ค. 2026:

| รายการ | ถึง 31 ธ.ค. 2026 | ตั้งแต่ 1 ม.ค. 2027 ตามหน้าที่ตรวจ |
|---|---:|---:|
| Text input / 1M tokens | $0.50 | $1.00 |
| Audio output / 1M tokens | $9.00 | $18.00 |
| เทียบ audio output / 10 วินาที | $0.00225 | $0.0045 |

ตัวอย่างเสียงออก 60 วินาที = $0.0135 หรือประมาณ 0.47 บาท **เมื่อสมมติ 35 บาท/USD** ไม่ใช่อัตราแลกเปลี่ยนสด ไม่รวม text input, ภาษี และการสร้างซ้ำ มี Free Tier ตามโควตา/สิทธิ์บัญชี ต้องตรวจราคาปัจจุบันก่อนเปิด billing ตัวแอปยังไม่มีระบบคำนวณต้นทุนหรือจำกัดงบ

AI local ไม่มีค่า API รายครั้ง แต่มีค่าไฟ/พื้นที่เก็บ และต้องปฏิบัติตามสิทธิ์ของโมเดลจริง ไม่อนุมานสิทธิ์โมเดลจาก license ของ runtime

## โครงสร้างสำคัญ

| ไฟล์ / โฟลเดอร์ | หน้าที่ |
|---|---|
| `frontend/src/App.tsx` | Studio, editor, dialogs, jobs, export |
| `frontend/src/components/ui/` | shadcn/ui จาก registry ทางการ + Radix |
| `frontend/src/lib/api.ts` | TypeScript types และ local API client |
| `backend/app/main.py` | FastAPI, upload, settings, folder picker, serve frontend |
| `backend/app/store.py` | SQLite และ asset paths |
| `backend/app/worker.py` | คิวเดียว, retry, invalidation, checkpoints |
| `backend/app/providers.py` | Gemini และ local runtime adapters |
| `backend/app/render.py` | ASS/SRT, FFmpeg, ตรวจ output |
| `scripts/` | ติดตั้ง, launcher, Windows folder picker |
| `docs/validation.md` | หลักฐานและขอบเขตผลทดสอบ |

ข้อมูลอยู่ใน `data/studio.sqlite` และ `data/projects/<id>/` เปลี่ยนรากได้ด้วย `SHORT_STUDIO_DATA` ใน `.env` สำรองทั้ง data directory ขณะ backend หยุด เพื่อไม่ตกหล่น SQLite WAL

`.env`, `data/`, `.local/`, models, runtimes, dependencies และ build output ถูก gitignore ภาพตัวอย่างสร้างเมื่อเริ่มแอปครั้งแรกและติดป้ายว่าไม่ใช่ภาพ AI

## กฎ dependency และ timing ที่ต้องรักษา

1. AI ทำทีละงาน/โมเดล เปิด subprocess แล้วปิดเมื่อจบเพื่อคืนหน่วยความจำ
2. ระยะฉากและซับอิง **เสียงพากย์ที่สร้าง/นำเข้าใหม่** ไม่ใช้เวลาจาก source ต้นฉบับ
3. ซับเริ่มต้นเป็น **whole-scene caption** ตามระยะเสียง ไม่ใช่ word alignment ให้แบ่งเองหรือใช้ Whisper แล้วตรวจคำอีกครั้ง
4. เปลี่ยนบท/voice/style ต้องยกเลิก active audio, cues, timing และ rendered outputs; เก็บ original files ไว้
5. ห้ามทำฉากสั้นกว่าเสียง ซับต้องไม่ซ้อนและไม่เกินฉาก Fade ผ่านสีดำไม่ overlap timeline
6. งานที่หยุดกลางทางเป็น interrupted และให้ retry เอง ไม่เรียก Gemini ซ้ำเมื่อเปิดโปรแกรม
7. เก็บ JSON snapshot ก่อน AI สร้าง storyboard ทับของเดิม ยังไม่มีหน้า restore snapshot
8. Session token, Host/Origin checks และ localhost binding ต้องคงไว้ Key อยู่ backend เท่านั้น

## ผลทดสอบที่มีจริง

ตรวจใน **Linux cloud workspace**:

- ติดตั้ง dependencies แบบ lockfile และ build frontend ผ่าน; ทดลองติดตั้งซ้ำ
- Backend pytest **10 ผ่าน**
- Chromium integration **3 ผ่าน**: desktop persistence, mobile/editor, upload → captions → ดาวน์โหลด MP4 จริง
- ffprobe ยืนยัน MP4 สองฉาก 1080×1920 H.264/AAC พร้อมเพลง motion fade ซับไทย SRT และหน้าปก
- ตรวจ Gemini SDK ผ่าน MockTransport ไม่ใช่การเรียกบริการจริง
- ทดสอบ missing key, retry, invalidation, interrupted jobs, cue bounds และ local API protection
- Python launcher เริ่ม backend ใหม่และตรวจ health/frontend ได้บน Linux

เสียงใน media tests เป็น synthetic test tone ไม่ใช่เสียงพากย์ AI ผลเหล่านี้ไม่ยืนยันคุณภาพภาษาไทยของโมเดล

**ยังไม่ทดสอบ:** Gemini live, local model inference, Windows PowerShell/folder picker, AMD Vulkan และ YouTube download จริง มี warning ที่ไม่ทำให้ tests ล้มจาก Starlette TestClient เรื่อง httpx deprecation

## งานถัดไปตามลำดับ

1. รัน setup/start บน Windows จริง ตรวจ FFmpeg/font/folder picker โดยใช้ชื่อโฟลเดอร์ไทย
2. ติดตั้ง runtime + model ทีละชุด ตรวจ CLI flags ให้ตรงรุ่น บันทึก version/hash และวัด peak RAM/VRAM บน RX 6700 XT
3. ใส่ Gemini key อย่างปลอดภัย ทดลองหนึ่งฉากที่มีภาษาไทย ตัวเลข และคำอังกฤษ ตรวจสิทธิ์รุ่น/โควตา/ต้นทุนจริง
4. ทดสอบครบหนึ่งฉาก: ภาพ → เสียงจริง → ซับ → MP4 ตรวจคุณภาพและ timing ด้วยคน ก่อนขยายหลายฉาก
5. ทดสอบ regenerate เสียงให้สั้น/ยาวกว่าเดิม ยืนยันซับ timeline และ render อัปเดตทั้งหมด
6. ทดสอบ YouTube แบบไม่รับประกันทุกลิงก์ และเส้นทาง fallback เป็นไฟล์/ข้อความ

ข้อจำกัด MVP: สูงสุด 12 ฉาก, เสียงต่อฉากไม่เกิน 180 วินาที, source ไม่เกิน 30 นาที/250 MB, ไม่มี chunked summarization สำหรับเอกสารยาว, ยังไม่มีตัวแก้หน้าปกแยก (ใช้เฟรมต้นคลิป), preview รายฉากเป็นภาพนิ่ง ต้องดู motion จริงใน rendered MP4

## หมายเหตุสำหรับผู้รับช่วง / agent ถัดไป

อ่าน `README.md`, `docs/validation.md` และเอกสารนี้ก่อนแก้ไข ใช้ checkout เดิมใน isolated cloud task ไม่สร้าง worktree เว้นแต่ผู้ใช้ขอ ไม่ใส่ key/ข้อมูลผู้ใช้ใน Git และไม่อ้างว่า Windows/AI ผ่านแล้วจากผลทดสอบจำลอง

Cloud onboarding draft ได้บันทึก `install_script`, `start_skill`, requirement ของ `GEMINI_API_KEY` และ domains `aistudio.google.com`, `ai.google.dev`, `generativelanguage.googleapis.com` แล้ว การ save draft ไม่ใช่การ apply หรือ publish ผู้ใช้ต้อง Review/Save/Publish ใน Environment settings เองหากต้องการเก็บ cloud environment

การ clone GitHub บน Windows ไม่ได้พา dependencies, runtime/models, secret, data หรือ process ที่รันใน cloud ไปด้วย ต้องทำ setup และตั้งค่าบนเครื่องนั้นใหม่
