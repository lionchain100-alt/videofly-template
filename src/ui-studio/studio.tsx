"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ExternalLink,
  FileUp,
  LayoutGrid,
  Monitor,
  Moon,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  Smartphone,
  Sun,
  Tablet,
  Undo2,
  X,
} from "lucide-react";
import {
  PRESETS,
  SECTIONS,
  defaultConfig,
  uiConfigSchema,
  type DemoState,
  type PresetId,
  type UIConfig,
} from "@/ui-presets/config";
import s from "./studio.module.css";

type Drafts = Record<PresetId, UIConfig>;
const DRAFT_KEY = "laconic-ui-studio-drafts-v1";
const widthMap = { desktop: 1280, tablet: 768, mobile: 390 };
const sectionNames = { examples: "使用步骤", features: "功能介绍", faq: "常见问题" };
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  const child = Children.only(children);
  if (
    isValidElement<{ id?: string }>(child) &&
    typeof child.type === "string" &&
    ["input", "select", "textarea"].includes(child.type)
  )
    return (
      <div className={s.field}>
        <label htmlFor={id}>{label}</label>
        {cloneElement(child, { id })}
        {hint && <small>{hint}</small>}
      </div>
    );
  return (
    <fieldset className={s.field}>
      <legend>{label}</legend>
      {children}
      {hint && <small>{hint}</small>}
    </fieldset>
  );
}

export function Studio({ initialConfig }: { initialConfig: UIConfig }) {
  const [active, setActive] = useState<PresetId>(initialConfig.presetId);
  const [drafts, setDrafts] = useState<Drafts>({
    minimal: defaultConfig("minimal"),
    studio: defaultConfig("studio"),
    portal: defaultConfig("portal"),
    [initialConfig.presetId]: initialConfig,
  });
  const [applied, setApplied] = useState(initialConfig);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [revision, setRevision] = useState("");
  const [device, setDevice] = useState<keyof typeof widthMap>("desktop");
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const [scenario, setScenario] = useState<DemoState>("empty");
  const [tab, setTab] = useState<"style" | "layout" | "content">("style");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageIssue, setStorageIssue] = useState("");
  const [scale, setScale] = useState(0.7);
  const [height, setHeight] = useState(1050);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [historyVersion, bumpHistory] = useState(0);
  const history = useRef<Record<PresetId, { past: UIConfig[]; future: UIConfig[] }>>({
    minimal: { past: [], future: [] },
    studio: { past: [], future: [] },
    portal: { past: [], future: [] },
  });
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const config = drafts[active];
  const current = useRef({ config, locale, scenario });
  current.current = { config, locale, scenario };
  const valid = uiConfigSchema.safeParse(config);
  const dirty = JSON.stringify(config) !== JSON.stringify(applied);

  async function readApplied(replaceDraft = false) {
    const response = await fetch("/api/ui-studio/config", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "无法读取本地配置");
    const clean = uiConfigSchema.parse(data.config);
    setToken(data.token);
    setRevision(data.revision);
    setApplied(clean);
    if (replaceDraft) {
      setDrafts((v) => ({ ...v, [clean.presetId]: clean }));
      setActive(clean.presetId);
      setNotice("已载入站点当前配置。其他方案草稿仍保留。");
    }
  }
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (stored?.schemaVersion === 1 && ["minimal", "studio", "portal"].includes(stored.active)) {
        const clean = Object.fromEntries(
          PRESETS.map((p) => [p.id, uiConfigSchema.parse(stored.drafts[p.id])]),
        );
        setDrafts(clean as Drafts);
        setActive(stored.active);
      }
    } catch {
      setStorageIssue("浏览器草稿无法读取，已使用站点配置。可重新导入 JSON。");
    }
    setReady(true);
    readApplied().catch((e) => setNotice(e.message));
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ schemaVersion: 1, active, drafts }));
    } catch {
      setStorageIssue("浏览器存储不可用。请导出 JSON 或应用到本地站点保存。");
    }
  }, [drafts, active, ready]);
  useEffect(() => {
    const send = () => {
      if (uiConfigSchema.safeParse(current.current.config).success)
        frame.current?.contentWindow?.postMessage(
          { type: "laconic:config", ...current.current },
          window.location.origin,
        );
    };
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      if (event.data?.type === "laconic:ready") send();
      if (event.data?.type === "laconic:height" && Number.isFinite(event.data.height))
        setHeight(Math.min(6000, Math.max(700, event.data.height)));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    if (valid.success)
      frame.current?.contentWindow?.postMessage(
        { type: "laconic:config", config, locale, scenario },
        window.location.origin,
      );
  }, [config, locale, scenario]);
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, Math.max(0.15, (entry.contentRect.width - 56) / widthMap[device]))),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [device]);
  function replace(next: UIConfig) {
    history.current[active].past.push(config);
    history.current[active].past = history.current[active].past.slice(-60);
    history.current[active].future = [];
    setDrafts((v) => ({ ...v, [active]: next }));
    bumpHistory((v) => v + 1);
  }
  function edit(fn: (next: UIConfig) => void) {
    const next = structuredClone(config);
    fn(next);
    replace(next);
  }
  function undo(redo = false) {
    const h = history.current[active];
    const from = redo ? h.future : h.past;
    const to = redo ? h.past : h.future;
    const next = from.pop();
    if (next) {
      to.push(config);
      setDrafts((v) => ({ ...v, [active]: next }));
      bumpHistory((v) => v + 1);
    }
  }
  function exportConfig() {
    const checked = uiConfigSchema.safeParse(config);
    if (!checked.success) {
      setNotice("请先修正配置中的空白或无效字段。");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(checked.data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `laconic-${active}-ui.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("配置已导出。可在另一浏览器或新站导入。");
  }
  async function importConfig(file?: File) {
    if (!file) return;
    try {
      if (file.size > 16384) throw new Error("配置文件不能超过 16KB。");
      const next = uiConfigSchema.parse(JSON.parse(await file.text()));
      history.current[next.presetId].past.push(drafts[next.presetId]);
      history.current[next.presetId].future = [];
      setDrafts((v) => ({ ...v, [next.presetId]: next }));
      setActive(next.presetId);
      bumpHistory((v) => v + 1);
      setNotice("导入成功，已载入草稿。点击应用后才会改变站点。");
    } catch {
      setNotice(
        "导入失败：请使用本 Studio 导出的版本 1 JSON。未知方案、额外字段、脚本及非法尺寸均不接受。",
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  }
  async function apply(rollback = false) {
    if (!token || !revision) {
      setNotice("本地会话尚未就绪，请刷新页面重试。");
      return;
    }
    if (!rollback && !valid.success) {
      setNotice("配置无效，请检查标题、品牌和 Logo 等字段。");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/ui-studio/config", {
        method: rollback ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", "x-ui-studio-token": token },
        body: JSON.stringify(rollback ? { revision } : { revision, config }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      setRevision(data.revision);
      setApplied(data.config);
      if (rollback) {
        setDrafts((v) => ({ ...v, [data.config.presetId]: data.config }));
        setActive(data.config.presetId);
      }
      setNotice(
        rollback
          ? "已恢复上一个应用版本。打开首页即可查看。"
          : "已应用到本地站点，并备份上一版。刷新首页即可查看，重启后仍保留。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败，原配置未改变。");
    } finally {
      setBusy(false);
    }
  }
  const selected = PRESETS.find((p) => p.id === active)!;
  return (
    <div className={s.studio}>
      <header className={s.topbar}>
        <a className={s.logo} href="/" target="_blank" rel="noreferrer">
          <span>L</span>
          <strong>
            Laconic <i>/</i> UI Studio
          </strong>
        </a>
        <span className={s.local}>本地工作室</span>
        <div className={s.topActions}>
          <button
            type="button"
            className={s.iconButton}
            onClick={() => undo()}
            disabled={!history.current[active].past.length}
            aria-label="撤销"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className={s.iconButton}
            onClick={() => undo(true)}
            disabled={!history.current[active].future.length}
            aria-label="重做"
          >
            <Redo2 size={16} />
          </button>
          <span className={s.divider} />
          <button type="button" className={s.outline} onClick={exportConfig}>
            <ArrowDownToLine size={15} />
            <span>导出配置</span>
          </button>
          <button
            type="button"
            className={s.apply}
            onClick={() => apply()}
            disabled={busy || !token || !valid.success}
          >
            <Save size={15} />
            <span>{busy ? "正在保存…" : "应用到本地站点"}</span>
          </button>
        </div>
      </header>
      <div className={s.mobileTools}>
        <button type="button" onClick={() => setLeftOpen((v) => !v)}>
          <LayoutGrid size={15} />
          选择方案
        </button>
        <button type="button" onClick={() => setRightOpen((v) => !v)}>
          <Settings2 size={15} />
          微调配置
        </button>
      </div>
      <div className={s.editor}>
        <aside className={`${s.presets} ${leftOpen ? s.drawerOpen : ""}`}>
          <div className={s.sectionHeading}>
            <div>
              <h1>选择你的起点</h1>
              <p>三种布局，一套工具基础</p>
            </div>
            <button
              type="button"
              className={s.closeDrawer}
              onClick={() => setLeftOpen(false)}
              aria-label="关闭方案选择"
            >
              <X size={18} />
            </button>
          </div>
          <div className={s.presetList}>
            {PRESETS.map((preset, i) => (
              <button
                type="button"
                className={`${s.presetCard} ${active === preset.id ? s.selected : ""}`}
                key={preset.id}
                onClick={() => {
                  setActive(preset.id);
                  setLeftOpen(false);
                }}
                aria-pressed={active === preset.id}
                aria-label={preset.name}
              >
                <div
                  className={`${s.thumbnail} ${s[`thumb_${preset.id}`]}`}
                  style={{ "--thumb-accent": preset.color } as React.CSSProperties}
                >
                  <div className={s.thumbNav}>
                    <b>L</b>
                    <span>Laconic</span>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className={s.thumbBody}>
                    {preset.id === "studio" && (
                      <div className={s.thumbSidebar}>
                        <i />
                        <i />
                        <i />
                      </div>
                    )}
                    <div className={s.thumbContent}>
                      <strong>
                        {preset.id === "minimal"
                          ? "把复杂的事，变简单。"
                          : preset.id === "studio"
                            ? "把灵感，变成作品。"
                            : "好工具，让想法更进一步。"}
                      </strong>
                      <p />
                      {preset.id === "portal" ? (
                        <>
                          <div className={s.thumbSearch} />
                          <div className={s.thumbCards}>
                            <i />
                            <i />
                          </div>
                        </>
                      ) : (
                        <div className={s.thumbWorkspace}>
                          <i />
                          <i />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={s.presetCaption}>
                  <span>
                    <small>0{i + 1}</small>
                    {preset.name}
                  </span>
                  {active === preset.id && <CheckCircle2 size={16} />}
                </div>
                <p>{preset.description}</p>
              </button>
            ))}
          </div>
          <div className={s.presetInfo}>
            <span>这一套适合</span>
            <p>
              {active === "minimal"
                ? "单一任务、即开即用的轻量工具。"
                : active === "studio"
                  ? "需要参数、输入和结果并排的创作流程。"
                  : "拥有多个工具，需要搜索与分类的站点。"}
            </p>
          </div>
          <div className={s.fileActions}>
            <button type="button" onClick={() => fileInput.current?.click()}>
              <FileUp size={15} />
              导入 JSON 配置
            </button>
            <button
              type="button"
              onClick={() => readApplied(true).catch((e) => setNotice(e.message))}
            >
              <RotateCcw size={15} />
              读取已应用配置
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("恢复到上一个已应用版本？当前草稿不会发布。")) apply(true);
              }}
              disabled={busy}
            >
              <Undo2 size={15} />
              恢复上一个应用版本
            </button>
            <a href="/zh" target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              打开本地首页
            </a>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => importConfig(e.target.files?.[0])}
          />
          <p className={s.localNote}>
            草稿留在此浏览器。
            <br />
            应用后写入项目文件，不会部署到远端。
          </p>
        </aside>
        <main className={s.canvasColumn}>
          <div className={s.previewToolbar}>
            <div className={s.previewTitle}>
              <strong>页面预览</strong>
              <span>{selected.en}</span>
            </div>
            <div className={s.devices}>
              {(
                [
                  ["desktop", Monitor, "桌面"],
                  ["tablet", Tablet, "平板"],
                  ["mobile", Smartphone, "手机"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  type="button"
                  key={id}
                  className={device === id ? s.deviceActive : ""}
                  onClick={() => setDevice(id)}
                  aria-label={label}
                  aria-pressed={device === id}
                >
                  <Icon size={17} />
                </button>
              ))}
            </div>
            <div className={s.previewOptions}>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as "zh" | "en")}
                aria-label="预览语言"
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as DemoState)}
                aria-label="页面状态"
              >
                <option value="empty">默认状态</option>
                <option value="loading">加载中</option>
                <option value="success">成功结果</option>
                <option value="error">执行失败</option>
                <option value="credits">积分不足</option>
                <option value="signed-out">未登录</option>
              </select>
            </div>
          </div>
          <div className={s.canvasMeta}>
            <span>
              <span className={s.demoDot} />
              交互演示 · 不调用模型或支付
            </span>
            <span>
              {widthMap[device]}px <b>·</b> {Math.round(scale * 100)}%
            </span>
          </div>
          <div className={s.stage} ref={stage}>
            <div
              className={s.frameSpace}
              style={{ width: widthMap[device] * scale, height: height * scale }}
            >
              <iframe
                ref={frame}
                title="站点实时预览"
                src="/ui-preview"
                className={s.frame}
                style={{ width: widthMap[device], height, transform: `scale(${scale})` }}
              />
            </div>
          </div>
          <footer className={s.statusbar}>
            <span>
              <CheckCircle2 size={14} />
              {storageIssue || (ready ? "草稿已自动保存到此浏览器" : "正在载入草稿…")}
            </span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`恢复「${selected.name}」的默认配置？可以撤销。`))
                  replace(defaultConfig(active));
              }}
            >
              <RotateCcw size={14} />
              恢复方案默认值
            </button>
            <span className={s.appliedState}>{dirty ? "有未应用的更改" : "与已应用配置一致"}</span>
          </footer>
        </main>
        <aside className={`${s.inspector} ${rightOpen ? s.drawerOpen : ""}`}>
          <div className={s.inspectorHeading}>
            <Settings2 size={17} />
            <strong>让它更像你</strong>
            <button
              type="button"
              className={s.closeDrawer}
              onClick={() => setRightOpen(false)}
              aria-label="关闭微调面板"
            >
              <X size={18} />
            </button>
          </div>
          <div className={s.tabs}>
            {(
              [
                ["style", "样式"],
                ["layout", "布局"],
                ["content", "内容"],
              ] as const
            ).map(([id, name]) => (
              <button
                type="button"
                key={id}
                className={tab === id ? s.tabActive : ""}
                onClick={() => setTab(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className={s.controls}>
            {tab === "style" ? (
              <>
                <h2>品牌与外观</h2>
                <Field label="站点名称">
                  <input
                    value={config.brand.name}
                    maxLength={32}
                    onChange={(e) =>
                      edit((v) => {
                        v.brand.name = e.target.value;
                      })
                    }
                  />
                </Field>
                <div className={s.twoFields}>
                  <Field label="品牌标记">
                    <input
                      value={config.brand.mark}
                      maxLength={3}
                      onChange={(e) =>
                        edit((v) => {
                          v.brand.mark = e.target.value;
                        })
                      }
                    />
                  </Field>
                  <Field label="字体">
                    <select
                      value={config.theme.font}
                      onChange={(e) =>
                        edit((v) => {
                          v.theme.font = e.target.value as UIConfig["theme"]["font"];
                        })
                      }
                    >
                      <option value="system">现代无衬线</option>
                      <option value="serif">衬线字体</option>
                      <option value="mono">等宽字体</option>
                    </select>
                  </Field>
                </div>
                <Field label="主题色">
                  <div className={s.colorRow}>
                    <input
                      type="color"
                      aria-label="选择主题色"
                      value={config.theme.accent}
                      onChange={(e) =>
                        edit((v) => {
                          v.theme.accent = e.target.value;
                        })
                      }
                    />
                    <span>{config.theme.accent.toUpperCase()}</span>
                  </div>
                </Field>
                <div className={s.swatches}>
                  {["#5146e5", "#17645b", "#2458b5", "#a0442c", "#292d3e"].map((color) => (
                    <button
                      type="button"
                      key={color}
                      style={{ background: color }}
                      aria-label={`主题色 ${color}`}
                      aria-pressed={config.theme.accent === color}
                      onClick={() =>
                        edit((v) => {
                          v.theme.accent = color;
                        })
                      }
                    >
                      {config.theme.accent === color && <Check size={13} />}
                    </button>
                  ))}
                </div>
                <Field label="浅色背景">
                  <div className={s.colorRow}>
                    <input
                      type="color"
                      aria-label="选择背景色"
                      value={config.theme.background}
                      onChange={(e) =>
                        edit((v) => {
                          v.theme.background = e.target.value;
                        })
                      }
                    />
                    <span>{config.theme.background.toUpperCase()}</span>
                  </div>
                </Field>
                <Field label="颜色模式">
                  <div className={s.segmented}>
                    {(
                      [
                        ["light", Sun, "浅色"],
                        ["dark", Moon, "深色"],
                        ["system", Monitor, "系统"],
                      ] as const
                    ).map(([id, Icon, label]) => (
                      <button
                        type="button"
                        key={id}
                        className={config.theme.mode === id ? s.segmentActive : ""}
                        onClick={(e) => {
                          e.preventDefault();
                          edit((v) => {
                            v.theme.mode = id;
                          });
                        }}
                      >
                        <Icon size={13} />
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={`圆角大小 · ${config.theme.radius}px`}>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    value={config.theme.radius}
                    onChange={(e) =>
                      edit((v) => {
                        v.theme.radius = Number(e.target.value);
                      })
                    }
                  />
                </Field>
                <Field label={`基础字号 · ${config.theme.fontSize}px`}>
                  <input
                    type="range"
                    min={14}
                    max={18}
                    value={config.theme.fontSize}
                    onChange={(e) =>
                      edit((v) => {
                        v.theme.fontSize = Number(e.target.value);
                      })
                    }
                  />
                </Field>
                <Field label="阴影">
                  <select
                    value={config.theme.shadow}
                    onChange={(e) =>
                      edit((v) => {
                        v.theme.shadow = e.target.value as UIConfig["theme"]["shadow"];
                      })
                    }
                  >
                    <option value="none">无阴影</option>
                    <option value="soft">轻柔</option>
                    <option value="medium">明显</option>
                  </select>
                </Field>
                <Field
                  label="自定义 Logo 路径"
                  hint="可选。把图片放到 public，再填写 /my-logo.svg 等本地路径。"
                >
                  <input
                    placeholder="/my-logo.svg"
                    value={config.brand.logoPath}
                    onChange={(e) =>
                      edit((v) => {
                        v.brand.logoPath = e.target.value;
                      })
                    }
                  />
                </Field>
              </>
            ) : tab === "layout" ? (
              <>
                <h2>空间与布局</h2>
                <Field label={`内容最大宽度 · ${config.layout.contentMaxWidth}px`}>
                  <input
                    type="range"
                    min={880}
                    max={1440}
                    step={20}
                    value={config.layout.contentMaxWidth}
                    onChange={(e) =>
                      edit((v) => {
                        v.layout.contentMaxWidth = Number(e.target.value);
                      })
                    }
                  />
                </Field>
                <Field label="界面密度">
                  <select
                    value={config.layout.density}
                    onChange={(e) =>
                      edit((v) => {
                        v.layout.density = e.target.value as UIConfig["layout"]["density"];
                      })
                    }
                  >
                    <option value="comfortable">舒展</option>
                    <option value="compact">紧凑</option>
                  </select>
                </Field>
                <Field label="输入与结果排列">
                  <select
                    value={config.layout.arrangement}
                    onChange={(e) =>
                      edit((v) => {
                        v.layout.arrangement = e.target.value as "split" | "stacked";
                      })
                    }
                  >
                    <option value="split">左右分栏（窄屏自动上下）</option>
                    <option value="stacked">上下排列</option>
                  </select>
                </Field>
                {active === "studio" && (
                  <Field label={`侧栏宽度 · ${config.layout.sidebarWidth}px`}>
                    <input
                      type="range"
                      min={180}
                      max={280}
                      value={config.layout.sidebarWidth}
                      onChange={(e) =>
                        edit((v) => {
                          v.layout.sidebarWidth = Number(e.target.value);
                        })
                      }
                    />
                  </Field>
                )}
                {active === "portal" && (
                  <Field label="工具卡片列数">
                    <select
                      value={config.layout.columns}
                      onChange={(e) =>
                        edit((v) => {
                          v.layout.columns = Number(e.target.value);
                        })
                      }
                    >
                      <option value={1}>1 列</option>
                      <option value={2}>2 列</option>
                      <option value={3}>3 列</option>
                    </select>
                  </Field>
                )}
                <Field label="默认工具">
                  <select
                    value={config.defaultTool}
                    onChange={(e) =>
                      edit((v) => {
                        v.defaultTool = e.target.value as "text" | "video";
                      })
                    }
                  >
                    <option value="text">文本摘要</option>
                    <option value="video">视频生成</option>
                  </select>
                </Field>
                <h2>页面区块</h2>
                <p className={s.help}>工作区始终保留，以下区块可隐藏与排序。</p>
                {SECTIONS.map((id) => {
                  const index = config.sections.indexOf(id);
                  return (
                    <div key={id} className={s.sectionToggle}>
                      <label>
                        <input
                          type="checkbox"
                          checked={index >= 0}
                          onChange={(e) =>
                            edit((v) => {
                              v.sections = e.target.checked
                                ? [...v.sections, id]
                                : v.sections.filter((x) => x !== id);
                            })
                          }
                        />
                        {sectionNames[id]}
                      </label>
                      {index >= 0 && (
                        <span>
                          <button
                            type="button"
                            disabled={index === 0}
                            aria-label={`上移${sectionNames[id]}`}
                            onClick={() =>
                              edit((v) => {
                                [v.sections[index - 1], v.sections[index]] = [
                                  v.sections[index],
                                  v.sections[index - 1],
                                ];
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === config.sections.length - 1}
                            aria-label={`下移${sectionNames[id]}`}
                            onClick={() =>
                              edit((v) => {
                                [v.sections[index + 1], v.sections[index]] = [
                                  v.sections[index],
                                  v.sections[index + 1],
                                ];
                              })
                            }
                          >
                            ↓
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className={s.orderList}>
                  当前顺序：
                  {config.sections.map((id) => sectionNames[id]).join(" → ") || "仅工具工作区"}
                </div>
              </>
            ) : (
              <>
                <h2>内容与文案</h2>
                <p className={s.help}>
                  当前编辑{locale === "zh" ? "中文" : "英文"}
                  。在预览工具栏切换语言，可分别编辑两种文案。
                </p>
                <Field label="主标题">
                  <textarea
                    rows={3}
                    value={config.content.title[locale]}
                    onChange={(e) =>
                      edit((v) => {
                        v.content.title[locale] = e.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="副标题">
                  <textarea
                    rows={4}
                    value={config.content.subtitle[locale]}
                    onChange={(e) =>
                      edit((v) => {
                        v.content.subtitle[locale] = e.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="摘要按钮文案">
                  <input
                    value={config.content.cta[locale]}
                    onChange={(e) =>
                      edit((v) => {
                        v.content.cta[locale] = e.target.value;
                      })
                    }
                  />
                </Field>
                <div className={s.infoBox}>
                  只修改展示内容。这里的设置不会更改模型、计费金额或用户权限。
                </div>
              </>
            )}
            {!valid.success && (
              <div className={s.validation} role="alert">
                {valid.error.issues.map((i) => (
                  <p key={i.path.join(".")}>
                    {i.path.join(".")}：{i.message}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className={s.inspectorFooter}>
            <span className={s.demoDot} />
            仅影响当前方案草稿
          </div>
        </aside>
      </div>
      {notice && (
        <div className={s.toast} aria-live="polite">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button type="button" aria-label="关闭通知" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
