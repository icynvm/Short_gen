# Short Studio

เว็บแอปทำคลิปสั้นส่วนตัวบน Windows: React + TypeScript + shadcn/ui, FastAPI, SQLite และ FFmpeg

**Gemini 3.8 Flash TTS ใช้ Cloud** และส่งบทพากย์/คำกำกับไป Google อาจมีค่าใช้จ่ายตามบัญชี ส่วนข้อมูลโปรเจกต์ ภาพ local การถอดเสียง และการตัดต่ออยู่ในเครื่อง ไม่มี Cloud API สำหรับเขียนบทหรือสร้างภาพ

## เริ่มบน Windows

ต้องมี Python 3.12 พร้อม Tcl/Tk, Node.js 22.12+ หรือ 24 LTS, และ FFmpeg/ffprobe ที่รองรับ `libx264` กับ `libass` อยู่ใน PATH ดาวน์โหลดจากผู้จัดจำหน่ายที่เชื่อถือได้ ไม่ปิดการตรวจ TLS หรือ checksum

```powershell
.\scripts\setup.ps1
# เปิด .env แล้วใส่ GEMINI_API_KEY (อย่าส่ง key ในแชต/commit)
.\scripts\start.ps1
```

ตัวเปิดโปรแกรม bind เฉพาะ `127.0.0.1:8765` และเปิดเบราว์เซอร์หลัง health check ผ่าน ไม่ต้องเปิด Vite แยกในการใช้งานทั่วไป หน้าต่าง PowerShell ต้องเปิดค้างไว้ ใช้ Ctrl+C เพื่อหยุด

หากเครื่องมี PowerShell policy ไม่อนุญาตสคริปต์ ให้ใช้ตามนโยบายเครื่อง หรือรันคำสั่ง Python/npm ที่อยู่ใน setup.ps1 ด้วยตนเอง ไม่จำเป็นต้องปิด policy ของทั้งเครื่อง

โปรแกรมไม่ดาวน์โหลด runtime/โมเดล local หลาย GB อัตโนมัติ ไปที่ **โมเดลและการตั้งค่า** ใส่ absolute paths ของ executable และ model:

| งาน | Runtime | โมเดลเริ่มต้น |
|---|---|---|
| สรุป/บท/ฉาก | llama.cpp `llama-cli.exe`, Vulkan build | Qwen3-4B GGUF Q4_K_M |
| ภาพ | stable-diffusion.cpp `sd-cli.exe`, Vulkan build | SD 1.5 checkpoint ที่ runtime รองรับ |
| ถอดเสียง/จับเวลาซับ | whisper.cpp `whisper-cli.exe`, Vulkan build | Whisper small multilingual (ไม่ใช่ `.en`) |

โมเดลและ binary ต้องเลือกจากแหล่งทางการ ตรวจ license และ checksum ของรุ่นจริงก่อนใช้ โดยเฉพาะ checkpoint ภาพ แนะนำปิดแอปที่กิน RAM ก่อนงาน AI เครื่องเป้าหมาย RAM 16 GB ยังต้องวัด peak usage จริง รุ่น llama ใช้ context 8192 เพื่อรองรับบทและ JSON; ข้อความ MVP จำกัด 7,000 ตัวอักษร และ runtime/model อาจต้องลด context หรือ GPU layers บนเครื่องจริง

## เริ่มคลิปแรก

1. สร้างโปรเจกต์ หรือใช้ภาพตัวอย่างที่ติดป้ายไว้ เขียนบทหนึ่งฉากในแท็บ **บท**
2. แท็บ **ภาพ**: อัปโหลด PNG/JPEG/WebP หรือสร้างด้วย local SD
3. แท็บ **เสียง**: เลือกเสียง/คำกำกับแล้วสร้าง Gemini TTS หรืออัปโหลดเสียงของคุณ
4. หลังได้เสียง โปรแกรมวัด WAV จริง และสร้าง **ซับทั้งฉาก** เป็นจุดเริ่มต้น ไม่ใช่ word alignment แบ่งช่วงเองในแท็บ **ซับ** หรือใช้ Whisper แล้วตรวจข้อความเทียบกับบท
5. ตั้งหัวข้อ เพลง และ motion จากนั้น **ส่งออกคลิป → ตัดต่อและสร้าง Preview**
6. ตรวจ MP4 แล้วดาวน์โหลด MP4, SRT, หน้าปก หรือเลือกโฟลเดอร์ Windows และบันทึกทั้งชุด

ทุกงานอยู่ในคิวเดียวและ runtime ปิด process หลังจบ งานที่ล้มเหลวไม่ทำให้ไฟล์ก่อนหน้าหาย ลองใหม่ได้จากประวัติ การเปลี่ยนบท/เสียง/คำกำกับยกเลิกเสียงเดิมและเวลาซับที่เกี่ยวข้อง งานที่หยุดกลางทางไม่เรียก Gemini ใหม่อัตโนมัติ (ป้องกันค่าบริการซ้ำ)

## Gemini TTS

ใช้ `gemini-3.8-flash-tts` ผ่าน `google-genai` Interactions API คำพูดอยู่ใน `text`, คำกำกับอยู่ใน `annotations: [{type: "speech_metadata", style: "..."}]`, และ voice อยู่ใน `generation_config.speech_config`.

มีเสียง prebuilt ที่ยืนยันในตัวอย่างทางการ 6 เสียงให้เลือก: Kore, Puck, Charon, Aoede, Fenrir, Enceladus รองรับแท็กเช่น `<short pause>`, `<laugh>`, `<sigh>`; คำกำกับเป็นคำแนะนำ ไม่รับประกันการแสดงอารมณ์หรือสำเนียงตามสั่งทุกครั้ง ไม่มี voice cloning ใน MVP

API key อยู่ใน process backend/.env เท่านั้น ไม่อยู่ใน bundle React, SQLite หรือ API response โปรแกรมไม่รับประกัน free tier, quota, commercial rights หรือ availability ของรุ่นในทุกบัญชี ดูข้อกำหนด Google ปัจจุบันสำหรับการใช้งานจริง

เอกสารที่ตรวจ: [Google TTS Cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_TTS.ipynb), [Google Python SDK](https://github.com/googleapis/python-genai). ลิงก์ [AI Studio guide ของผู้ใช้](https://aistudio.google.com/learn/gemini-tts-prompt-guide-with-tags) ถูกเครือข่าย workspace ปฏิเสธด้วย 403 ระหว่างงานนี้ จึงใช้ตัวอย่างจาก repository ทางการแทน ไม่ได้อ้างว่าอ่านหน้าที่ถูกบล็อกแล้ว

## พัฒนาใน Linux/cloud workspace

```bash
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend
npm ci
npm run build
cd ..
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765
```

สำหรับ hot reload เปิด `npm run dev` ใน frontend (Vite localhost:5173 proxy ไป backend) ใช้ checkout เดิมใน isolated cloud task ไม่ต้องสร้าง Git worktree

```bash
.venv/bin/python -m pytest backend/tests -q
cd frontend
npm run build
# ต้องมี backend เปิดอยู่และ Chromium ในเครื่อง
CHROMIUM_PATH=/usr/bin/chromium npx playwright test
```

## ข้อมูลและข้อจำกัด MVP

- SQLite: `data/studio.sqlite`; ไฟล์: `data/projects/<id>/`; เปลี่ยนรากด้วย `SHORT_STUDIO_DATA` ใน .env
- ไฟล์และชื่อ output ใช้ UUID, ไม่เขียนทับ original โดยอัตโนมัติ สำรอง **ทั้ง data directory** ตอน backend หยุด (ไม่ใช่เฉพาะไฟล์ SQLite เมื่อ WAL ยังใช้งาน)
- เก็บ snapshot JSON ก่อน AI แทน storyboard; ยังไม่มีหน้า restore/history diff
- สูงสุด 12 ฉาก, เสียงไม่เกิน 180 วินาทีต่อฉาก, แหล่งเสียง/YouTube ไม่เกิน 30 นาทีหรือ 250 MB
- URL YouTube อาจล้มเหลวจากสิทธิ์ เครือข่าย หรือข้อจำกัดเว็บไซต์ ใช้ไฟล์/ข้อความแทนได้ ไม่มีการรับประกันทุกลิงก์
- Fade เป็น fade-through-black ภายในระยะฉาก ไม่ overlap เสียง; ความยาวเป้าหมายไม่บังคับตัดเสียง
- Preview ภาพรายฉากเป็นภาพนิ่ง; motion/subtitles/headline ที่ใช้ส่งออกจริงให้ตรวจใน rendered MP4
- หน้าปกดึงจากต้นคลิปพร้อมหัวข้อที่ตั้งไว้ ยังไม่มีตัวแก้หน้าปกแยก
- เสียง Gemini ไม่ได้ทดสอบกับบริการจริงหากยังไม่มี key; AMD/Vulkan และ Windows native folder picker ต้องทดสอบบนเครื่องเป้าหมาย
- แบบทดสอบ SDK ใช้ mocked transport ไม่ใช่การรับรองสิทธิ์เข้า API หรือคุณภาพเสียงไทย

ดู [บันทึกตรวจสอบ](docs/validation.md) และ [แหล่งที่มาและสิทธิ์](docs/third-party.md)
