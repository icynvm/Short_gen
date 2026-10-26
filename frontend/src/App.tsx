import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AudioLines,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Clock3,
  Cloud,
  Download,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Mic2,
  MoreHorizontal,
  Music2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Subtitles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api, asset, seconds, setToken } from "@/lib/api";
import type {
  Bootstrap,
  Project,
  Scene,
  Status,
  Settings,
  Job,
} from "@/lib/api";

const labels: Record<string, string> = {
  plan: "สรุปและเขียนบท",
  image: "สร้างภาพ Local",
  tts: "พากย์เสียง Gemini",
  align: "จับเวลาซับ",
  render: "สร้าง Preview / MP4",
  export: "บันทึกลงโฟลเดอร์",
  source: "ถอดเสียงต้นฉบับ",
  youtube: "นำเข้า YouTube",
};
const voiceNotes: Record<string, string> = {
  Kore: "หนักแน่น",
  Puck: "สดใส",
  Charon: "เล่าเรื่องชัดเจน",
  Aoede: "ผ่อนคลาย",
  Fenrir: "มีพลัง",
  Enceladus: "นุ่ม เบา",
};
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <Label>{label}</Label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
function Notice({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={cn("notice", warning && "notice-warning")}>{children}</div>
  );
}
function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}
function Choice({
  value,
  onChange,
  choices,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  choices: [string, string][];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map(([id, name]) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Scene | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [modal, setModal] = useState<
    | "projects"
    | "new"
    | "source"
    | "settings"
    | "options"
    | "export"
    | "help"
    | "jobs"
    | null
  >(null);
  const [editorTab, setEditorTab] = useState("script");
  const [newTitle, setNewTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [options, setOptions] = useState<Partial<Project>>({});
  const [config, setConfig] = useState<Settings | null>(null);
  const [confirmAction, setConfirmAction] = useState<"delete" | "plan" | null>(
    null,
  );
  const [showRender, setShowRender] = useState(false);
  const seenJobs = useRef(new Map<string, string>());
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playTime, setPlayTime] = useState(0);
  const scene =
    project?.scenes.find((s) => s.id === selected) ?? project?.scenes[0];
  const busyJob = jobs.find((j) => ["queued", "running"].includes(j.status));
  const busy = working || !!busyJob;
  const dirty =
    !!draft && !!scene && JSON.stringify(draft) !== JSON.stringify(scene);
  const total = project?.scenes.reduce((sum, s) => sum + s.duration, 0) ?? 0;
  const ready = project?.scenes.filter((s) => s.image && s.audio).length ?? 0;

  const applyProject = useCallback((p: Project) => {
    setProject(p);
    setProjects((old) => [p, ...old.filter((q) => q.id !== p.id)]);
  }, []);
  const boot = useCallback(async () => {
    try {
      const data = await api<Bootstrap>("/bootstrap");
      setToken(data.token);
      setStatus(data.status);
      setSettings(data.settings);
      setProjects(data.projects);
      setProject(data.projects[0] ?? null);
      setSelected(data.projects[0]?.scenes[0]?.id ?? "");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    if (scene) {
      setDraft(structuredClone(scene));
      setPlayTime(0);
    }
  }, [scene?.id, scene?.revision, project?.id]); // Persisted revisions intentionally reset the editor.
  useEffect(() => {
    if (!project?.id) return;
    let alive = true;
    const pid = project.id;
    const poll = async () => {
      try {
        const list = await api<Job[]>(`/projects/${pid}/jobs`);
        if (!alive) return;
        setJobs(list);
        const p = await api<Project>(`/projects/${pid}`);
        if (alive)
          setProject((old) =>
            old?.id === pid && old.updated_at !== p.updated_at ? p : old,
          );
      } catch {
        /* A temporary poll failure must not discard the open editor. */
      }
    };
    setJobs([]);
    void poll();
    const interval = window.setInterval(poll, 1800);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [project?.id]);
  useEffect(() => {
    if (project?.render) setShowRender(true);
  }, [project?.render]);

  useEffect(() => {
    for (const job of jobs) {
      const previous = seenJobs.current.get(job.id);
      if (previous && previous !== job.status) {
        if (job.status === "failed")
          toast.error(job.error || "งานไม่สำเร็จ", {
            duration: 8000,
            action: { label: "ดูงาน", onClick: () => setModal("jobs") },
          });
        if (job.status === "completed")
          toast.success(`${labels[job.action] ?? job.action} เสร็จแล้ว`);
      }
      seenJobs.current.set(job.id, job.status);
    }
  }, [jobs]);

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  async function perform(fn: () => Promise<void>) {
    setWorking(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function saveScene() {
    if (!draft || !scene || !project || !dirty) return;
    const keys: (keyof Scene)[] = [
      "title",
      "narration",
      "prompt",
      "voice",
      "style",
      "seed",
      "motion",
      "duration",
      "cues",
    ];
    const changes = Object.fromEntries(
      keys
        .filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(scene[k]))
        .map((k) => [k, draft[k]]),
    );
    const p = await api<Project>(
      `/projects/${project.id}/scenes/${scene.id}`,
      "PATCH",
      changes,
    );
    applyProject(p);
  }
  async function runJob(action: string, perScene = false) {
    if (!project) return;
    await perform(async () => {
      await saveScene();
      const job = await api<Job>(`/projects/${project.id}/jobs`, "POST", {
        action,
        ...(perScene ? { scene_id: scene?.id } : {}),
      });
      setJobs((old) => [job, ...old]);
      toast.success("เพิ่มงานในคิวแล้ว");
      if (action === "render" || action === "export") setModal("jobs");
    });
  }
  async function upload(kind: string, file: File | undefined) {
    if (!file || !project) return;
    await perform(async () => {
      await saveScene();
      const form = new FormData();
      form.append("file", file);
      const result = await api<Project | Job>(
        `/projects/${project.id}/uploads/${kind}${["image", "audio"].includes(kind) ? `?scene_id=${scene?.id}` : ""}`,
        "POST",
        form,
      );
      if ("scenes" in result) applyProject(result);
      else {
        setJobs((old) => [result, ...old]);
        setModal("jobs");
      }
      toast.success(kind === "source" ? "เพิ่มงานถอดเสียงแล้ว" : "อัปโหลดแล้ว");
    });
  }
  function uploadControl(
    kind: string,
    accept: string,
    text: string,
    icon: ReactNode = <Upload />,
  ) {
    return (
      <Button
        variant="outline"
        className="upload-button"
        asChild
        disabled={busy}
      >
        <label aria-disabled={busy}>
          {icon}
          {text}
          <input
            aria-label={text}
            type="file"
            accept={accept}
            disabled={busy}
            onChange={(e) => {
              void upload(kind, e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </Button>
    );
  }
  function openModal(which: typeof modal) {
    if (which === "source") {
      setSourceText(project?.source_text ?? "");
      setSourceUrl(project?.source_url ?? "");
    }
    if (which === "settings") setConfig(settings ? { ...settings } : null);
    if (which === "options" && project)
      setOptions({
        title: project.title,
        target_duration: project.target_duration,
        image_count: project.image_count,
        image_style: project.image_style,
        transition: project.transition,
        headline: project.headline,
        burn_subtitles: project.burn_subtitles,
        music_volume: project.music_volume,
      });
    setModal(which);
  }
  async function switchScene(id: string) {
    await perform(async () => {
      await saveScene();
      setSelected(id);
      setShowRender(false);
    });
  }
  const activeCue = scene?.cues.find(
    (c) => playTime >= c.start && playTime < c.end,
  );

  if (loading || error)
    return (
      <main className="boot-screen">
        <div className="brand-mark">
          <Clapperboard />
        </div>
        <h1>Short Studio</h1>
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            <p>กำลังเปิดพื้นที่สร้างสรรค์ของคุณ…</p>
          </>
        ) : (
          <>
            <p role="alert">{error}</p>
            <Button
              onClick={() => {
                setLoading(true);
                void boot();
              }}
            >
              เชื่อมต่อใหม่
            </Button>
          </>
        )}
      </main>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            openModal("projects");
          }}
        >
          <span className="brand-mark">
            <Clapperboard size={21} />
          </span>
          <span>
            short<span className="brand-light">studio</span>
            <small>YOUR LOCAL CREATIVE SPACE</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <button
          className="nav-item active"
          aria-label="สตูดิโอของฉัน"
          title="สตูดิโอของฉัน"
          onClick={() => setModal(null)}
        >
          <Layers3 size={18} />
          <span>สตูดิโอของฉัน</span>
          <span className="nav-count">{projects.length}</span>
        </button>
        <button
          className="nav-item"
          aria-label="โปรเจกต์ทั้งหมด"
          title="โปรเจกต์ทั้งหมด"
          onClick={() => openModal("projects")}
        >
          <FolderOpen size={18} />
          <span>โปรเจกต์ทั้งหมด</span>
        </button>
        <button
          className="nav-item"
          aria-label="ประวัติการสร้าง"
          title="ประวัติการสร้าง"
          onClick={() => openModal("jobs")}
        >
          <Clock3 size={18} />
          <span>ประวัติการสร้าง</span>
          {busyJob && <span className="live-dot" />}
        </button>
        <div className="sidebar-divider" />
        <div className="workspace-label">YOUR TOOLS</div>
        <button
          className="nav-item"
          aria-label="โมเดลและการตั้งค่า"
          title="โมเดลและการตั้งค่า"
          onClick={() => openModal("settings")}
        >
          <SlidersHorizontal size={18} />
          <span>โมเดลและการตั้งค่า</span>
        </button>
        <button
          className="nav-item"
          aria-label="เริ่มต้นใช้งาน"
          title="เริ่มต้นใช้งาน"
          onClick={() => openModal("help")}
        >
          <CircleHelp size={18} />
          <span>เริ่มต้นใช้งาน</span>
        </button>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-orb">
              <Layers3 size={16} />
            </span>
            <strong>สร้างสรรค์บนเครื่องคุณ</strong>
            <p>
              โปรเจกต์และไฟล์อยู่ในเครื่อง
              <br />
              เฉพาะเสียง Gemini ใช้ Cloud
            </p>
            <div>
              <span className="live-dot" /> Local workspace
            </div>
          </div>
          <div className="user-row">
            <div className="avatar">Y</div>
            <div>
              <strong>Your workspace</strong>
              <small>Personal · Windows ready</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Layers3 size={16} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>Short Studio</strong>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <span className="live-dot" /> บันทึกในเครื่อง
            </span>
            <Button variant="ghost" size="sm" onClick={() => openModal("help")}>
              <CircleHelp />
              คู่มือ
            </Button>
            <div className="avatar mini">Y</div>
          </div>
        </header>
        {!project ? (
          <section className="empty-project">
            <Sparkles size={42} />
            <h1>เรื่องต่อไป เริ่มที่นี่</h1>
            <p>สร้างโปรเจกต์แรก แล้วเปลี่ยนไอเดียเป็นคลิปของคุณ</p>
            <Button onClick={() => setModal("new")}>
              <Plus />
              สร้างโปรเจกต์
            </Button>
          </section>
        ) : (
          <>
            <section className="project-heading">
              <div>
                <div className="eyebrow">CREATE SOMETHING WORTH SHARING</div>
                <div className="project-title">
                  <h1>{project.title}</h1>
                  <Badge variant="secondary">ฉบับร่าง</Badge>
                </div>
                <p>เปลี่ยนเรื่องเล่าให้มีภาพ เสียง และจังหวะที่เป็นคุณ</p>
              </div>
              <div className="heading-actions">
                <Button variant="outline" onClick={() => openModal("options")}>
                  <Settings2 />
                  ตั้งค่าคลิป
                </Button>
                <Button onClick={() => openModal("export")}>
                  <ArrowDownToLine />
                  ส่งออกคลิป
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </section>
            <section className="workflow-strip" aria-label="ขั้นตอนการสร้าง">
              <button onClick={() => openModal("source")}>
                <span
                  className={cn("step-number", project.source_text && "done")}
                >
                  {project.source_text ? <Check size={13} /> : "1"}
                </span>
                <span>แหล่งข้อมูล</span>
              </button>
              <ChevronRight />
              <button
                onClick={() => {
                  setEditorTab("script");
                  setShowRender(false);
                }}
              >
                <span
                  className={cn(
                    "step-number",
                    project.scenes.some((s) => s.narration) && "done",
                  )}
                >
                  {project.scenes.some((s) => s.narration) ? (
                    <Check size={13} />
                  ) : (
                    "2"
                  )}
                </span>
                <span>บทและเรื่องราว</span>
              </button>
              <ChevronRight />
              <button className="current" onClick={() => setEditorTab("image")}>
                <span className="step-number">3</span>
                <span>ภาพและเสียง</span>
                <span className="you-are-here">กำลังสร้าง</span>
              </button>
              <ChevronRight />
              <button onClick={() => setEditorTab("captions")}>
                <span className="step-number">4</span>
                <span>ซับและจังหวะ</span>
              </button>
              <ChevronRight />
              <button onClick={() => openModal("export")}>
                <span className={cn("step-number", project.render && "done")}>
                  {project.render ? <Check size={13} /> : "5"}
                </span>
                <span>พร้อมแชร์</span>
              </button>
            </section>
            <div className="studio-topline">
              <div className="studio-title">
                <span className="studio-tab">
                  <Film size={16} />
                  Storyboard
                </span>
                <span className="muted">{project.scenes.length} ฉาก</span>
              </div>
              <div className="project-metrics">
                <span>
                  <Clock3 size={14} />
                  เป้าหมาย {project.target_duration} วินาที
                </span>
                <i />
                <span>9:16 · 1080p</span>
                <i />
                <span>
                  <CheckCheck size={14} />
                  {dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้ว"}
                </span>
              </div>
            </div>
            <section className="studio-grid">
              <div className="scene-panel">
                <div className="panel-heading">
                  <strong>ฉากทั้งหมด</strong>
                  <IconButton
                    label="เพิ่มฉาก"
                    disabled={busy}
                    onClick={() => {
                      void perform(async () => {
                        await saveScene();
                        const p = await api<Project>(
                          `/projects/${project.id}/scenes`,
                          "POST",
                        );
                        applyProject(p);
                        setSelected(p.scenes.at(-1)!.id);
                      });
                    }}
                  >
                    <Plus size={16} />
                  </IconButton>
                </div>
                <div className="scene-list">
                  {project.scenes.map((s, i) => (
                    <button
                      key={s.id}
                      className={cn(
                        "scene-card",
                        s.id === scene?.id && "selected",
                      )}
                      disabled={busy}
                      onClick={() => {
                        void switchScene(s.id);
                      }}
                    >
                      <div className="scene-thumbnail">
                        {s.image ? (
                          <img src={asset(s.image)} alt={s.title} />
                        ) : (
                          <div className="no-image">
                            <ImageIcon />
                          </div>
                        )}
                        <span className="scene-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="scene-duration">
                          {s.audio ? `${s.duration.toFixed(1)}s` : "รอเสียง"}
                        </span>
                        {s.id === scene?.id && (
                          <span className="selected-check">
                            <Check size={11} />
                          </span>
                        )}
                      </div>
                      <div className="scene-card-label">
                        <strong>{s.title}</strong>
                        <span
                          className={cn(
                            "scene-readiness",
                            s.image && s.audio && "ready",
                          )}
                        >
                          <span />
                          {s.image && s.audio
                            ? "ภาพและเสียงพร้อม"
                            : s.image
                              ? "มีภาพแล้ว · รอเสียง"
                              : "พร้อมเริ่มสร้าง"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="add-scene"
                  disabled={busy}
                  onClick={() => {
                    void perform(async () => {
                      await saveScene();
                      const p = await api<Project>(
                        `/projects/${project.id}/scenes`,
                        "POST",
                      );
                      applyProject(p);
                      setSelected(p.scenes.at(-1)!.id);
                    });
                  }}
                >
                  <Plus />
                  เพิ่มฉาก
                </Button>
              </div>

              <div className="preview-panel">
                <div className="panel-heading">
                  <div className="preview-label">
                    <span className="live-dot" />
                    <strong>
                      {showRender && project.render
                        ? "คลิปที่ตัดต่อแล้ว"
                        : "ตัวอย่างฉาก"}
                    </strong>
                  </div>
                  <div className="preview-dimensions">
                    9:16
                    <IconButton
                      label="ตัวเลือกคลิป"
                      onClick={() => openModal("options")}
                    >
                      <MoreHorizontal />
                    </IconButton>
                  </div>
                </div>
                <div className="preview-stage">
                  <div className="portrait-frame">
                    {showRender && project.render ? (
                      <video
                        key={project.render}
                        src={asset(project.render)}
                        controls
                        playsInline
                        poster={
                          project.cover ? asset(project.cover) : undefined
                        }
                        aria-label="Preview คลิปที่ส่งออก"
                      />
                    ) : (
                      <>
                        {scene?.image ? (
                          <img
                            src={asset(scene.image)}
                            alt={`ตัวอย่าง ${scene.title}`}
                          />
                        ) : (
                          <div className="portrait-empty">
                            <ImageIcon size={36} />
                            <h3>เติมภาพให้เรื่องราว</h3>
                            <p>อัปโหลดภาพ หรือสร้างด้วยโมเดล Local</p>
                          </div>
                        )}
                        <div className="portrait-shade" />
                        <div className="portrait-top">
                          <span>SHORT STORY</span>
                          <span>0{(scene?.order ?? 0) + 1}</span>
                        </div>
                        {project.headline && (
                          <div className="portrait-headline">
                            {project.headline}
                          </div>
                        )}
                        {activeCue && (
                          <div className="portrait-caption">
                            {activeCue.text}
                          </div>
                        )}
                        <div className="portrait-bottom">
                          <span>MAKE ROOM FOR A NEW BEGINNING</span>
                          <div className="portrait-rule" />
                        </div>
                        {scene?.image_origin === "sample" && (
                          <span className="sample-badge">
                            ภาพตัวอย่าง · ไม่ใช่ภาพ AI
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="preview-footer">
                  {scene?.audio && !showRender ? (
                    <audio
                      ref={audioRef}
                      src={asset(scene.audio)}
                      controls
                      onTimeUpdate={(e) =>
                        setPlayTime(e.currentTarget.currentTime)
                      }
                      aria-label="เสียงพากย์ฉากที่เลือก"
                    />
                  ) : (
                    <div className="preview-info">
                      <span>
                        <Mic2 size={14} />
                        {showRender && project.render
                          ? "ไฟล์จริง พร้อมตรวจภาพและเสียง"
                          : "สร้างหรืออัปโหลดเสียงเพื่อฟังตัวอย่าง"}
                      </span>
                      <span>
                        {seconds(total)}{" "}
                        <span className="muted">
                          / {seconds(project.target_duration)}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="preview-nav">
                    <IconButton
                      label="ฉากก่อนหน้า"
                      disabled={!scene || scene.order === 0 || busy}
                      onClick={() => {
                        if (scene)
                          void switchScene(project.scenes[scene.order - 1].id);
                      }}
                    >
                      <ArrowLeft size={15} />
                    </IconButton>
                    <span>
                      {showRender && project.render
                        ? "MP4 · 1080 × 1920"
                        : `ฉาก ${(scene?.order ?? 0) + 1} จาก ${project.scenes.length}`}
                    </span>
                    <IconButton
                      label="ฉากถัดไป"
                      disabled={
                        !scene ||
                        scene.order === project.scenes.length - 1 ||
                        busy
                      }
                      onClick={() => {
                        if (scene)
                          void switchScene(project.scenes[scene.order + 1].id);
                      }}
                    >
                      <ArrowRight size={15} />
                    </IconButton>
                  </div>
                </div>
              </div>

              {draft && scene && (
                <div className="editor-panel">
                  <div className="panel-heading">
                    <div>
                      <strong>ปรับแต่งฉาก</strong>
                      <span className="editor-scene-number">
                        {String(scene.order + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <IconButton
                      label="ลบฉาก"
                      disabled={busy || project.scenes.length <= 1}
                      onClick={() => setConfirmAction("delete")}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                  <Tabs
                    value={editorTab}
                    onValueChange={setEditorTab}
                    className="editor-tabs"
                  >
                    <TabsList className="editor-tab-list">
                      <TabsTrigger value="script">
                        <FileText />
                        บท
                      </TabsTrigger>
                      <TabsTrigger value="image">
                        <ImageIcon />
                        ภาพ
                      </TabsTrigger>
                      <TabsTrigger value="voice">
                        <AudioLines />
                        เสียง
                      </TabsTrigger>
                      <TabsTrigger value="captions">
                        <Subtitles />
                        ซับ
                      </TabsTrigger>
                    </TabsList>
                    <div className="editor-content">
                      <TabsContent value="script">
                        <Field label="ชื่อฉาก">
                          <Input
                            aria-label="ชื่อฉาก"
                            value={draft.title}
                            disabled={busy}
                            onChange={(e) =>
                              setDraft({ ...draft, title: e.target.value })
                            }
                          />
                        </Field>
                        <Field
                          label="บทพากย์"
                          hint="เขียนอย่างเป็นธรรมชาติ เหมือนเล่าให้ใครสักคนฟัง"
                        >
                          <Textarea
                            aria-label="บทพากย์"
                            className="narration-input"
                            value={draft.narration}
                            disabled={busy}
                            onChange={(e) =>
                              setDraft({ ...draft, narration: e.target.value })
                            }
                          />
                          <div className="input-counter">
                            {draft.narration.length.toLocaleString()} / 6,000
                            ตัวอักษร
                          </div>
                        </Field>
                        <div className="tag-header">
                          <Sparkles size={13} />
                          <span>เติมจังหวะให้เสียง</span>
                        </div>
                        <div className="vocal-tags">
                          {[
                            ["<short pause>", "เว้นจังหวะ"],
                            ["<laugh>", "หัวเราะ"],
                            ["<sigh>", "ถอนหายใจ"],
                          ].map(([tag, label]) => (
                            <button
                              key={tag}
                              disabled={busy}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  narration: `${draft.narration} ${tag} `,
                                })
                              }
                            >
                              {label}
                              <Plus size={11} />
                            </button>
                          ))}
                        </div>
                        <Notice>
                          <Sparkles size={16} />
                          <div>
                            <strong>เรื่องเล่าที่ดี เริ่มจากบทที่ใช่</strong>
                            <p>
                              แก้บทแล้วสร้างเสียงใหม่ได้เฉพาะฉากนี้
                              ซับและเวลาจะอิงจากเสียงใหม่
                            </p>
                          </div>
                        </Notice>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => openModal("source")}
                        >
                          <WandSparkles />
                          เขียนบทจากแหล่งข้อมูล
                        </Button>
                      </TabsContent>
                      <TabsContent value="image">
                        <Field label="คำอธิบายภาพ (Prompt)">
                          <Textarea
                            aria-label="คำอธิบายภาพ"
                            rows={5}
                            value={draft.prompt}
                            disabled={busy}
                            onChange={(e) =>
                              setDraft({ ...draft, prompt: e.target.value })
                            }
                          />
                        </Field>
                        <div className="field-row">
                          <Field label="Seed">
                            <Input
                              aria-label="Seed"
                              type="number"
                              min={0}
                              value={draft.seed}
                              disabled={busy}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  seed: Number(e.target.value),
                                })
                              }
                            />
                          </Field>
                          <Field label="การเคลื่อนภาพ">
                            <Choice
                              label="การเคลื่อนภาพ"
                              value={draft.motion}
                              onChange={(v) =>
                                setDraft({
                                  ...draft,
                                  motion: v as Scene["motion"],
                                })
                              }
                              choices={[
                                ["zoom_in", "ซูมเข้าเบา ๆ"],
                                ["zoom_out", "ซูมออก"],
                                ["pan", "เลื่อนภาพ"],
                                ["still", "ภาพนิ่ง"],
                              ]}
                            />
                          </Field>
                        </div>
                        <Button
                          className="w-full"
                          disabled={busy || !draft.prompt.trim()}
                          onClick={() => {
                            void runJob("image", true);
                          }}
                        >
                          <Sparkles />
                          สร้างภาพด้วย Local AI
                        </Button>
                        <div className="or-divider">
                          <span>หรือใช้ภาพของคุณ</span>
                        </div>
                        {uploadControl(
                          "image",
                          "image/png,image/jpeg,image/webp",
                          "อัปโหลดภาพ",
                        )}
                        <p className="field-hint">
                          SD 1.5 · 512×896 → ปรับขนาดตอนส่งออก
                        </p>
                        {!status?.sd && (
                          <Notice warning>
                            <ImageIcon size={16} />
                            <p>
                              ยังไม่ได้ตั้งค่า stable-diffusion.cpp
                              คุณอัปโหลดภาพใช้ก่อนได้
                            </p>
                          </Notice>
                        )}
                        <p className="field-hint">
                          การซูมและเลื่อนจะแสดงใน Preview ที่ตัดต่อแล้ว
                        </p>
                      </TabsContent>
                      <TabsContent value="voice">
                        <div className="provider-card">
                          <div className="gemini-icon">
                            <Sparkles />
                          </div>
                          <div>
                            <strong>Gemini 3.8 Flash TTS</strong>
                            <span>
                              <Cloud size={11} />
                              Cloud · ใช้ API key ของคุณ
                            </span>
                          </div>
                          <Badge variant="outline">TTS</Badge>
                        </div>
                        <Field label="เสียงพากย์">
                          <Choice
                            label="เสียงพากย์"
                            value={draft.voice}
                            onChange={(v) => setDraft({ ...draft, voice: v })}
                            choices={(status?.voices ?? ["Kore"]).map((v) => [
                              v,
                              `${v} · ${voiceNotes[v] ?? ""}`,
                            ])}
                          />
                        </Field>
                        <Field
                          label="คำกำกับการพูด"
                          hint="ส่งเป็น speech_metadata แยกจากบท ไม่อ่านคำกำกับออกเสียง"
                        >
                          <Textarea
                            aria-label="คำกำกับการพูด"
                            rows={3}
                            value={draft.style}
                            disabled={busy}
                            onChange={(e) =>
                              setDraft({ ...draft, style: e.target.value })
                            }
                          />
                        </Field>
                        <Button
                          className="w-full"
                          disabled={busy || !draft.narration.trim()}
                          onClick={() => {
                            void runJob("tts", true);
                          }}
                        >
                          <AudioLines />
                          {scene.audio
                            ? "สร้างเสียงฉากนี้ใหม่"
                            : "สร้างเสียงพากย์"}
                        </Button>
                        <p className="cloud-disclosure">
                          บทและคำกำกับฉากนี้จะส่งไป Google
                          อาจมีค่าใช้จ่ายตามบัญชีของคุณ
                        </p>
                        {!status?.gemini && (
                          <Notice warning>
                            <Cloud size={16} />
                            <div>
                              <strong>ยังไม่ได้เชื่อมต่อ API key</strong>
                              <p>เพิ่ม GEMINI_API_KEY แล้วเริ่ม backend ใหม่</p>
                              <button
                                className="text-link"
                                onClick={() => openModal("settings")}
                              >
                                ดูวิธีตั้งค่า <ArrowRight size={12} />
                              </button>
                            </div>
                          </Notice>
                        )}
                        <div className="or-divider">
                          <span>หรือใช้เสียงที่มีอยู่</span>
                        </div>
                        {uploadControl(
                          "audio",
                          "audio/*,video/mp4",
                          "อัปโหลดเสียงพากย์",
                          <Mic2 />,
                        )}
                      </TabsContent>
                      <TabsContent value="captions">
                        <div className="timing-summary">
                          <Clock3 />
                          <div>
                            <span>ระยะเสียงจริง</span>
                            <strong>
                              {scene.audio_duration
                                ? `${scene.audio_duration.toFixed(2)} วินาที`
                                : "ยังไม่มีเสียง"}
                            </strong>
                          </div>
                        </div>
                        <Field
                          label="ระยะฉาก (วินาที)"
                          hint="เพิ่มเวลาพักได้ แต่ห้ามสั้นกว่าเสียงพากย์"
                        >
                          <Input
                            aria-label="ระยะฉาก"
                            type="number"
                            step="0.1"
                            min={scene.audio_duration || 0.1}
                            max={180}
                            value={draft.duration || ""}
                            disabled={busy || !scene.audio}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                duration: Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={busy || !scene.audio}
                          onClick={() => {
                            void runJob("align", true);
                          }}
                        >
                          <Subtitles />
                          จับเวลาจากเสียงด้วย Whisper
                        </Button>
                        <p className="field-hint">
                          {scene.timing_method === "whole_scene"
                            ? "ตอนนี้เป็นซับทั้งฉากตามระยะเสียง ไม่ใช่การจับเวลารายคำ"
                            : scene.timing_method === "whisper"
                              ? "เวลาจาก Whisper · ตรวจคำถอดเสียงกับบทอีกครั้ง"
                              : scene.timing_method === "manual"
                                ? "เวลาซับที่ปรับด้วยตัวเอง"
                                : "สร้างเสียงก่อน แล้วแบ่งช่วงซับได้ที่นี่"}
                        </p>
                        <div className="cue-list">
                          {draft.cues.map((cue, i) => (
                            <div className="cue-item" key={i}>
                              <div className="cue-times">
                                <Input
                                  aria-label={`ซับ ${i + 1} เริ่ม`}
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={cue.start}
                                  disabled={busy}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      cues: draft.cues.map((c, index) =>
                                        index === i
                                          ? {
                                              ...c,
                                              start: Number(e.target.value),
                                            }
                                          : c,
                                      ),
                                    })
                                  }
                                />
                                <span>→</span>
                                <Input
                                  aria-label={`ซับ ${i + 1} จบ`}
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={cue.end}
                                  disabled={busy}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      cues: draft.cues.map((c, index) =>
                                        index === i
                                          ? {
                                              ...c,
                                              end: Number(e.target.value),
                                            }
                                          : c,
                                      ),
                                    })
                                  }
                                />
                                <IconButton
                                  label={`ลบซับ ${i + 1}`}
                                  disabled={busy}
                                  onClick={() =>
                                    setDraft({
                                      ...draft,
                                      cues: draft.cues.filter(
                                        (_, index) => index !== i,
                                      ),
                                    })
                                  }
                                >
                                  <X size={12} />
                                </IconButton>
                              </div>
                              <Textarea
                                aria-label={`ข้อความซับ ${i + 1}`}
                                rows={2}
                                value={cue.text}
                                disabled={busy}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    cues: draft.cues.map((c, index) =>
                                      index === i
                                        ? { ...c, text: e.target.value }
                                        : c,
                                    ),
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          className="w-full"
                          disabled={busy || !scene.audio}
                          onClick={() => {
                            const start = draft.cues.at(-1)?.end ?? 0;
                            if (start >= draft.duration) {
                              toast.info(
                                "ปรับเวลาจบซับก่อนหน้าให้เหลือพื้นที่ แล้วเพิ่มช่วงใหม่",
                              );
                              return;
                            }
                            setDraft({
                              ...draft,
                              cues: [
                                ...draft.cues,
                                {
                                  start,
                                  end: draft.duration,
                                  text: "ข้อความซับ",
                                },
                              ],
                            });
                          }}
                        >
                          <Plus />
                          เพิ่มช่วงซับ
                        </Button>
                      </TabsContent>
                    </div>
                  </Tabs>
                  <div className="editor-footer">
                    <span>
                      <span className={cn("status-dot", dirty && "unsaved")} />
                      {dirty ? "ยังไม่บันทึก" : "พร้อมแก้ไข"}
                    </span>
                    <Button
                      size="sm"
                      disabled={busy || !dirty}
                      onClick={() => {
                        void perform(async () => {
                          await saveScene();
                          toast.success("บันทึกฉากแล้ว");
                        });
                      }}
                    >
                      <Save />
                      บันทึกฉาก
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <section className="timeline-panel">
              <div className="timeline-heading">
                <div>
                  <Layers3 size={16} />
                  <strong>ภาพรวมคลิป</strong>
                  <span>
                    {ready}/{project.scenes.length} ฉากพร้อม
                  </span>
                </div>
                <button onClick={() => openModal("options")}>
                  <Music2 size={14} />
                  {project.music ? "มีเพลงประกอบแล้ว" : "เพิ่มเพลงประกอบ"}
                  <Plus size={12} />
                </button>
              </div>
              <div className="timeline-track">
                <div className="track-icon">
                  <Film size={16} />
                  <span>ภาพ</span>
                </div>
                <div className="timeline-clips">
                  {project.scenes.map((s) => (
                    <button
                      key={s.id}
                      className={cn(
                        "timeline-clip",
                        s.id === scene?.id && "active",
                      )}
                      style={{ flex: s.duration || 5 }}
                      disabled={busy}
                      onClick={() => {
                        void switchScene(s.id);
                      }}
                    >
                      {s.image && <img src={asset(s.image)} alt="" />}
                      <span>
                        {String(s.order + 1).padStart(2, "0")} · {s.title}
                      </span>
                      <small>
                        {s.duration ? `${s.duration.toFixed(1)}s` : "—"}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="timeline-track audio-track">
                <div className="track-icon">
                  <AudioLines size={16} />
                  <span>เสียง</span>
                </div>
                <div className="timeline-clips">
                  {project.scenes.map((s) => (
                    <button
                      key={s.id}
                      className={cn("audio-clip", s.audio && "has-audio")}
                      style={{ flex: s.duration || 5 }}
                      disabled={busy}
                      onClick={() => {
                        void switchScene(s.id);
                        setEditorTab("voice");
                      }}
                    >
                      <AudioLines size={14} />
                      {s.audio
                        ? `${s.voice} · ${s.duration.toFixed(1)}s`
                        : "เพิ่มเสียงพากย์"}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <footer className="workspace-footer">
              <span>
                <span className="live-dot" />
                ทุกความคืบหน้า เก็บไว้ในเครื่องคุณ
              </span>
              <span>
                Short Studio <span className="version">v0.1</span>
              </span>
            </footer>
          </>
        )}
      </main>

      {busyJob && (
        <button className="job-toast" onClick={() => openModal("jobs")}>
          <Loader2 className="animate-spin" size={18} />
          <div>
            <strong>{labels[busyJob.action] ?? busyJob.action}</strong>
            <span>{busyJob.message}</span>
            <Progress value={busyJob.progress} />
          </div>
          <span>{busyJob.progress}%</span>
          <ChevronRight size={16} />
        </button>
      )}

      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent
          className={cn(
            "studio-dialog",
            ["source", "settings"].includes(modal ?? "") && "wide-dialog",
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {
                {
                  projects: "โปรเจกต์ของคุณ",
                  new: "เริ่มเรื่องราวใหม่",
                  source: "แหล่งข้อมูลและบท",
                  settings: "โมเดลและการตั้งค่า",
                  options: "ตั้งค่าคลิป",
                  export: "พร้อมให้เรื่องราวออกเดินทาง",
                  help: "จากไอเดียสู่คลิปแรก",
                  jobs: "ประวัติการสร้าง",
                }[modal ?? "help"]
              }
            </DialogTitle>
            <DialogDescription>
              {
                {
                  projects: "เปิดงานเดิมแล้วทำต่อได้ทุกเมื่อ",
                  new: "เริ่มจากชื่อ แล้วค่อยเติมเรื่องราวของคุณ",
                  source:
                    "ข้อมูลต้นฉบับประมวลผลในเครื่อง · ไม่ส่งไป Gemini เพื่อเขียนบท",
                  settings:
                    "ไฟล์และโมเดล Local อยู่บนเครื่อง ส่วน Gemini ใช้ API ผ่าน backend",
                  options: "ปรับรูปแบบให้เหมาะกับเรื่องที่อยากเล่า",
                  export: "ตรวจ Preview ก่อนบันทึก MP4, SRT และภาพหน้าปก",
                  help: "สร้างหนึ่งฉากให้ครบก่อน แล้วค่อยขยายเรื่องราว",
                  jobs: "งานทำทีละขั้น และลองใหม่ได้เฉพาะขั้นที่ล้มเหลว",
                }[modal ?? "help"]
              }
            </DialogDescription>
          </DialogHeader>
          {modal === "projects" && (
            <>
              <div className="project-list">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="project-list-item"
                    onClick={() => {
                      void perform(async () => {
                        await saveScene();
                        const current = await api<Project>(`/projects/${p.id}`);
                        applyProject(current);
                        setSelected(current.scenes[0].id);
                        setModal(null);
                        setShowRender(false);
                      });
                    }}
                  >
                    <div className="project-list-art">
                      {p.scenes[0]?.image ? (
                        <img src={asset(p.scenes[0].image)} alt="" />
                      ) : (
                        <Film />
                      )}
                    </div>
                    <div>
                      <strong>{p.title}</strong>
                      <small>
                        {p.scenes.length} ฉาก ·{" "}
                        {new Date(p.updated_at).toLocaleDateString("th-TH")}
                      </small>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
              <Button onClick={() => setModal("new")}>
                <Plus />
                สร้างโปรเจกต์ใหม่
              </Button>
            </>
          )}
          {modal === "new" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  await saveScene();
                  const p = await api<Project>("/projects", "POST", {
                    title: newTitle.trim() || "โปรเจกต์ใหม่",
                  });
                  applyProject(p);
                  setSelected(p.scenes[0].id);
                  setModal(null);
                  setNewTitle("");
                  setShowRender(false);
                });
              }}
            >
              <Field label="ชื่อโปรเจกต์">
                <Input
                  autoFocus
                  aria-label="ชื่อโปรเจกต์ใหม่"
                  maxLength={150}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="วันนี้อยากเล่าเรื่องอะไร?"
                />
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  <Plus />
                  สร้างโปรเจกต์
                </Button>
              </DialogFooter>
            </form>
          )}
          {modal === "source" && project && (
            <>
              <Tabs defaultValue="text">
                <TabsList>
                  <TabsTrigger value="text">
                    <FileText />
                    ข้อความ
                  </TabsTrigger>
                  <TabsTrigger value="youtube">YouTube</TabsTrigger>
                  <TabsTrigger value="file">
                    <Upload />
                    ไฟล์เสียง / วิดีโอ
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="text">
                  <Textarea
                    aria-label="ข้อความต้นฉบับ"
                    className="source-input"
                    placeholder="วางบทความ บันทึก หรือไอเดียที่อยากเล่า…"
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    maxLength={60000}
                  />
                  <p className="field-hint">
                    เขียนบทอัตโนมัติรองรับครั้งละไม่เกิน 7,000 ตัวอักษร
                  </p>
                </TabsContent>
                <TabsContent value="youtube">
                  <Field label="ลิงก์ YouTube">
                    <Input
                      aria-label="ลิงก์ YouTube"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=…"
                    />
                  </Field>
                  <Notice warning>
                    <CircleHelp size={16} />
                    <p>
                      บางลิงก์อาจดาวน์โหลดไม่ได้ รองรับไม่เกิน 30 นาที และต้องมี
                      whisper.cpp เพื่อถอดเสียง
                    </p>
                  </Notice>
                  <Button
                    disabled={busy || !sourceUrl.trim()}
                    onClick={() => {
                      void perform(async () => {
                        applyProject(
                          await api<Project>(
                            `/projects/${project.id}`,
                            "PATCH",
                            { source_url: sourceUrl },
                          ),
                        );
                        const j = await api<Job>(
                          `/projects/${project.id}/jobs`,
                          "POST",
                          { action: "youtube" },
                        );
                        setJobs((old) => [j, ...old]);
                        setModal("jobs");
                      });
                    }}
                  >
                    <Download />
                    นำเข้าและถอดเสียง
                  </Button>
                </TabsContent>
                <TabsContent value="file">
                  <div className="source-upload">
                    <Upload size={30} />
                    <h3>ให้เสียงเป็นจุดเริ่มต้นของเรื่อง</h3>
                    <p>MP3, WAV, M4A, MP4, WEBM · สูงสุด 250 MB / 30 นาที</p>
                    {uploadControl(
                      "source",
                      "audio/*,video/*",
                      "เลือกไฟล์ต้นฉบับ",
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              {project.summary && (
                <div className="summary-box">
                  <strong>สรุปล่าสุด</strong>
                  <p>{project.summary}</p>
                </div>
              )}
              <Notice>
                <Layers3 size={16} />
                <p>
                  {status?.llama
                    ? "พบไฟล์ runtime และโมเดลแล้ว การใช้งานจริงจะตรวจเมื่อเริ่มสร้างบท"
                    : "ยังไม่ได้ตั้งค่า llama.cpp คุณเขียนและแบ่งฉากเองได้ หรือเพิ่มโมเดลในหน้าตั้งค่า"}
                </p>
              </Notice>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void perform(async () => {
                      applyProject(
                        await api<Project>(`/projects/${project.id}`, "PATCH", {
                          source_text: sourceText,
                          source_url: sourceUrl,
                        }),
                      );
                      toast.success("บันทึกต้นฉบับแล้ว");
                      setModal(null);
                    });
                  }}
                >
                  <Save />
                  บันทึกต้นฉบับ
                </Button>
                <Button
                  disabled={busy || !sourceText.trim()}
                  onClick={() => setConfirmAction("plan")}
                >
                  <WandSparkles />
                  สรุปและสร้างบท
                </Button>
              </DialogFooter>
            </>
          )}
          {modal === "settings" && config && (
            <>
              <div className="settings-provider">
                <div className="gemini-icon">
                  <Sparkles />
                </div>
                <div>
                  <strong>Gemini 3.8 Flash TTS</strong>
                  <p>ส่งเฉพาะบทและคำกำกับเสียงไป Google</p>
                </div>
                <Badge variant={status?.gemini ? "secondary" : "outline"}>
                  {status?.gemini ? "พบ API key" : "ยังไม่มี API key"}
                </Badge>
              </div>
              <Notice warning>
                <Cloud size={17} />
                <div>
                  <strong>ตั้งค่า key ฝั่ง backend เท่านั้น</strong>
                  <p>
                    Windows: คัดลอก .env.example เป็น .env แล้วใส่
                    GEMINI_API_KEY จากนั้นเริ่มโปรแกรมใหม่ ใน Cloud workspace
                    ให้ใส่ผ่าน Environment secrets ไม่ใส่ key ในแชตหรือบทพากย์
                  </p>
                </div>
              </Notice>
              <p className="field-hint">
                การพบ key ไม่ยืนยันสิทธิ์รุ่น ราคา หรือโควตา
                ต้องทดสอบสร้างเสียงจริงด้วยบัญชีของคุณ
              </p>
              <div className="settings-section-title">
                LOCAL RUNTIMES <span>Vulkan · AMD</span>
              </div>
              {(
                [
                  ["llama", "บทและสรุป · llama.cpp", "llama-cli.exe"],
                  ["sd", "ภาพ · stable-diffusion.cpp", "sd-cli.exe"],
                  [
                    "whisper",
                    "ถอดเสียงและซับ · whisper.cpp",
                    "whisper-cli.exe",
                  ],
                ] as const
              ).map(([key, title, exe]) => (
                <div className="runtime-config" key={key}>
                  <strong>{title}</strong>
                  <Input
                    aria-label={`${key} runtime`}
                    placeholder={`C:\\ShortStudio\\runtimes\\${exe}`}
                    value={config[`${key}_bin`]}
                    onChange={(e) =>
                      setConfig({ ...config, [`${key}_bin`]: e.target.value })
                    }
                  />
                  <Input
                    aria-label={`${key} model`}
                    placeholder="พาธเต็มของไฟล์โมเดล"
                    value={config[`${key}_model`]}
                    onChange={(e) =>
                      setConfig({ ...config, [`${key}_model`]: e.target.value })
                    }
                  />
                </div>
              ))}
              <p className="field-hint">
                ระบบเปิดทีละโมเดลและปิด process เมื่อจบงาน ไม่ดาวน์โหลดโมเดลหลาย
                GB ให้อัตโนมัติ
              </p>
              <div className="runtime-status">
                <span
                  className={cn("status-dot", !status?.ffmpeg && "unsaved")}
                />
                FFmpeg {status?.ffmpeg ? "พร้อมใช้งาน" : "ยังไม่พบใน PATH"}
                <span>ข้อมูล: {status?.data_dir}</span>
              </div>
              <DialogFooter>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void perform(async () => {
                      const { export_dir: _dir, ...body } = config;
                      void _dir;
                      const next = await api<Settings>(
                        "/settings",
                        "PUT",
                        body,
                      );
                      setSettings(next);
                      setStatus(await api<Status>("/health"));
                      setModal(null);
                      toast.success("บันทึกการตั้งค่าแล้ว");
                    });
                  }}
                >
                  <Save />
                  บันทึกการตั้งค่า
                </Button>
              </DialogFooter>
            </>
          )}
          {modal === "options" && project && (
            <>
              <Field label="ชื่อโปรเจกต์">
                <Input
                  aria-label="ชื่อโปรเจกต์"
                  value={options.title ?? ""}
                  onChange={(e) =>
                    setOptions({ ...options, title: e.target.value })
                  }
                />
              </Field>
              <div className="field-row">
                <Field label="ความยาวเป้าหมาย (วินาที)">
                  <Input
                    aria-label="ความยาวเป้าหมาย"
                    type="number"
                    min={5}
                    max={180}
                    value={options.target_duration}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        target_duration: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="จำนวนภาพตอนสร้างบท">
                  <Input
                    aria-label="จำนวนภาพ"
                    type="number"
                    min={1}
                    max={12}
                    value={options.image_count}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        image_count: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="สไตล์ภาพ">
                <Input
                  aria-label="สไตล์ภาพ"
                  value={options.image_style ?? ""}
                  onChange={(e) =>
                    setOptions({ ...options, image_style: e.target.value })
                  }
                />
              </Field>
              <Field label="รูปแบบตัดต่อ">
                <Choice
                  label="รูปแบบตัดต่อ"
                  value={options.transition ?? "cut"}
                  onChange={(v) =>
                    setOptions({
                      ...options,
                      transition: v as Project["transition"],
                    })
                  }
                  choices={[
                    ["cut", "ตัดตรง · Cut"],
                    ["fade", "เฟดผ่านสีดำ · รักษาระยะเสียง"],
                  ]}
                />
              </Field>
              <Field label="หัวข้อบนคลิปและหน้าปก">
                <Textarea
                  aria-label="หัวข้อบนคลิป"
                  rows={2}
                  value={options.headline ?? ""}
                  maxLength={120}
                  onChange={(e) =>
                    setOptions({ ...options, headline: e.target.value })
                  }
                />
              </Field>
              <div className="toggle-row">
                <Label htmlFor="burn-subtitles">ฝังซับไทยลงวิดีโอ</Label>
                <Switch
                  id="burn-subtitles"
                  checked={options.burn_subtitles}
                  onCheckedChange={(v) =>
                    setOptions({ ...options, burn_subtitles: v })
                  }
                />
              </div>
              <Field
                label={`เพลงประกอบ · ${Math.round((options.music_volume ?? 0.12) * 100)}%`}
              >
                <Slider
                  aria-label="ระดับเสียงเพลงประกอบ"
                  value={[(options.music_volume ?? 0.12) * 100]}
                  min={0}
                  max={60}
                  step={1}
                  onValueChange={(v) =>
                    setOptions({ ...options, music_volume: v[0] / 100 })
                  }
                />
              </Field>
              <div className="music-actions">
                {uploadControl(
                  "music",
                  "audio/*",
                  project.music ? "เปลี่ยนเพลง" : "เพิ่มเพลง",
                  <Music2 />,
                )}
                {project.music && (
                  <IconButton
                    label="ลบเพลงประกอบ"
                    disabled={busy}
                    onClick={() => {
                      void perform(async () => {
                        applyProject(
                          await api<Project>(
                            `/projects/${project.id}/music`,
                            "DELETE",
                          ),
                        );
                      });
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </div>
              <p className="field-hint">
                ความยาวจริงอิงเสียงพากย์
                การเปลี่ยนจำนวนภาพมีผลกับการสร้างบทครั้งถัดไป
              </p>
              <DialogFooter>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void perform(async () => {
                      applyProject(
                        await api<Project>(
                          `/projects/${project.id}`,
                          "PATCH",
                          options,
                        ),
                      );
                      setModal(null);
                      toast.success("บันทึกตั้งค่าคลิปแล้ว");
                    });
                  }}
                >
                  <Save />
                  บันทึก
                </Button>
              </DialogFooter>
            </>
          )}
          {modal === "export" && project && (
            <>
              <div className="export-spec">
                <div className="export-icon">
                  <Film />
                </div>
                <div>
                  <strong>Vertical video</strong>
                  <p>1080 × 1920 · 30 fps · H.264 / AAC</p>
                </div>
                <Badge variant="secondary">MP4</Badge>
              </div>
              <div className="export-checks">
                <div>
                  <Check className="text-primary" />
                  <span>{project.scenes.length} ฉาก</span>
                  <span>
                    {ready}/{project.scenes.length} ภาพและเสียงพร้อม
                  </span>
                </div>
                <div>
                  <Clock3 />
                  <span>ความยาวจริง</span>
                  <span>{total.toFixed(1)} วินาที</span>
                </div>
                <div>
                  <Subtitles />
                  <span>ซับไทย</span>
                  <span>
                    {project.burn_subtitles
                      ? "ฝังในคลิป + SRT"
                      : "ไฟล์ SRT แยก"}
                  </span>
                </div>
              </div>
              {ready !== project.scenes.length && (
                <Notice warning>
                  <CircleHelp size={16} />
                  <p>เพิ่มภาพและเสียงให้ครบทุกฉากก่อนสร้าง Preview</p>
                </Notice>
              )}
              <Button
                className="w-full"
                disabled={busy || ready !== project.scenes.length}
                onClick={() => {
                  void runJob("render");
                }}
              >
                <Clapperboard />
                {project.render
                  ? "ตัดต่อ Preview ใหม่"
                  : "ตัดต่อและสร้าง Preview"}
              </Button>
              {project.render && (
                <>
                  <div className="download-grid">
                    {(
                      [
                        ["render", "MP4", Film],
                        ["srt", "SRT", Subtitles],
                        ["cover", "หน้าปก", ImageIcon],
                      ] as const
                    ).map(([key, label, Icon]) => (
                      <Button variant="outline" asChild key={key}>
                        <a href={asset(project[key]!, true)} download>
                          <Icon />
                          {label}
                          <Download className="size-3" />
                        </a>
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowRender(true);
                      setModal(null);
                    }}
                  >
                    ดู Preview ในสตูดิโอ <ArrowRight />
                  </Button>
                </>
              )}
              <div className="export-folder">
                <FolderOpen size={17} />
                <div>
                  <strong>โฟลเดอร์ส่งออก</strong>
                  <p>{settings?.export_dir || "ยังไม่ได้เลือกโฟลเดอร์"}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void perform(async () => {
                      const r = await api<{ export_dir: string }>(
                        "/pick-folder",
                        "POST",
                      );
                      if (settings)
                        setSettings({ ...settings, export_dir: r.export_dir });
                    });
                  }}
                >
                  เลือก
                </Button>
              </div>
              {!status?.windows && (
                <p className="field-hint">
                  Windows folder picker ใช้บนเครื่อง Windows;
                  ในเครื่องนี้ดาวน์โหลดไฟล์ด้านบนได้
                </p>
              )}
              <Button
                disabled={busy || !project.render || !settings?.export_dir}
                onClick={() => {
                  void runJob("export");
                }}
              >
                <FolderOpen />
                บันทึกทั้งชุดลงโฟลเดอร์
              </Button>
              {project.export_path && (
                <Notice>
                  <Check size={16} />
                  <p>บันทึกแล้ว: {project.export_path}</p>
                </Notice>
              )}
            </>
          )}
          {modal === "jobs" && (
            <div className="job-list">
              {jobs.length === 0 ? (
                <div className="empty-state">
                  <Clock3 size={32} />
                  <h3>ยังไม่มีงานในคิว</h3>
                  <p>เริ่มสร้างภาพ เสียง หรือตัดต่อจากฉากของคุณ</p>
                </div>
              ) : (
                jobs.map((j) => (
                  <div
                    className={cn(
                      "job-card",
                      j.status === "failed" && "failed",
                    )}
                    key={j.id}
                  >
                    <div className="job-card-title">
                      {["queued", "running"].includes(j.status) ? (
                        <Loader2 className="animate-spin" size={17} />
                      ) : j.status === "completed" ? (
                        <Check size={17} />
                      ) : (
                        <CircleHelp size={17} />
                      )}
                      <strong>{labels[j.action] ?? j.action}</strong>
                      <Badge variant="outline">
                        {
                          {
                            queued: "รอคิว",
                            running: "กำลังทำ",
                            completed: "เสร็จแล้ว",
                            failed: "ไม่สำเร็จ",
                            interrupted: "ถูกขัดจังหวะ",
                          }[j.status]
                        }
                      </Badge>
                    </div>
                    <p>{j.error || j.message}</p>
                    {["running", "queued"].includes(j.status) && (
                      <Progress value={j.progress} />
                    )}
                    {["failed", "interrupted"].includes(j.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          void perform(async () => {
                            const result = await api<Job>(
                              `/jobs/${j.id}/retry`,
                              "POST",
                            );
                            setJobs((old) => [result, ...old]);
                          });
                        }}
                      >
                        <RefreshCw />
                        ลองขั้นนี้ใหม่
                      </Button>
                    )}
                    <small>
                      {new Date(j.created_at).toLocaleString("th-TH")}
                    </small>
                  </div>
                ))
              )}
            </div>
          )}
          {modal === "help" && (
            <>
              <div className="help-steps">
                {[
                  [
                    "01",
                    "เริ่มจากบทหนึ่งฉาก",
                    "เขียนบทเอง หรือตั้งค่า llama.cpp เพื่อสรุปจากต้นฉบับ",
                  ],
                  [
                    "02",
                    "เติมภาพและเสียง",
                    "อัปโหลดไฟล์ได้ทันที หรือตั้งค่าโมเดล Local และ Gemini API key",
                  ],
                  [
                    "03",
                    "ตรวจซับกับเสียงใหม่",
                    "ซับเริ่มต้นแสดงทั้งฉาก แบ่งเวลาเองหรือใช้ Whisper แล้วตรวจคำ",
                  ],
                  [
                    "04",
                    "ตัดต่อและส่งออก",
                    "เพิ่มหัวข้อ เพลง และการเคลื่อนภาพ แล้วสร้าง MP4 พร้อมหน้าปก",
                  ],
                ].map(([n, title, body]) => (
                  <div key={n}>
                    <span>{n}</span>
                    <div>
                      <strong>{title}</strong>
                      <p>{body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Notice>
                <Cloud size={17} />
                <p>
                  เฉพาะการพากย์ Gemini ใช้ Cloud และอาจมีค่าใช้จ่าย โมเดล Local
                  ต้องดาวน์โหลดและตั้งค่าแยก
                </p>
              </Notice>
              <a
                className="text-link"
                href="https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_TTS.ipynb"
                target="_blank"
                rel="noreferrer"
              >
                คู่มือ Gemini TTS ทางการ <ArrowRight size={13} />
              </a>
              <Button onClick={() => openModal("settings")}>
                ตั้งค่าพื้นที่ทำงาน <ArrowRight />
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "delete"
                ? "ลบฉากนี้?"
                : "สร้างบทและฉากชุดใหม่?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "delete"
                ? "ฉากจะถูกนำออกจากคลิป ไฟล์ต้นฉบับยังอยู่ในโฟลเดอร์ข้อมูล"
                : "ฉากปัจจุบันจะถูกแทนที่หลังสร้างสำเร็จ ระบบเก็บ snapshot เดิมไว้ในโฟลเดอร์โปรเจกต์"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              ยกเลิก
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                void perform(async () => {
                  if (!project) return;
                  if (action === "delete") {
                    const p = await api<Project>(
                      `/projects/${project.id}/scenes/${scene?.id}`,
                      "DELETE",
                    );
                    applyProject(p);
                    setSelected(p.scenes[0].id);
                  } else {
                    await saveScene();
                    applyProject(
                      await api<Project>(`/projects/${project.id}`, "PATCH", {
                        source_text: sourceText,
                        source_url: sourceUrl,
                      }),
                    );
                    const j = await api<Job>(
                      `/projects/${project.id}/jobs`,
                      "POST",
                      { action: "plan" },
                    );
                    setJobs((old) => [j, ...old]);
                    setModal("jobs");
                  }
                });
              }}
            >
              {confirmAction === "delete" ? "ลบฉาก" : "สร้างบทใหม่"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
