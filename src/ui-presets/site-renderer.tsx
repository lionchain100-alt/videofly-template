"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  FileText,
  FolderOpen,
  Layers3,
  LoaderCircle,
  Menu,
  Moon,
  Play,
  Search,
  Sparkles,
  Sun,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { contrastText, readableAccent, type DemoState, type UIConfig } from "./config";
import styles from "./site.module.css";
import { SummaryWorkspace } from "@/tools/text-summary/workspace";
import { VideoWorkspace } from "@/tools/video/workspace";
import { AccountButton } from "@/tools/text-summary/account-button";

export interface SiteProps {
  config: UIConfig;
  locale?: "zh" | "en";
  scenario?: DemoState;
  preview?: boolean;
  studioLink?: boolean;
}
type ToolId = "text" | "video";
const sampleText =
  "一个好的 AI 工具不应该让用户学习复杂的操作。把输入、处理和结果组织清楚，提供可靠的反馈，让每个人都可以更快地完成工作。模板应把界面和业务分开，使新的工具可以复用相同的账户、任务和积分体系。";
const sampleEnglish =
  "A useful AI tool should make complicated work feel simple. Clear inputs, reliable feedback, and accessible results help people focus on their ideas. Separating the interface from business logic allows new tools to share accounts, tasks, and credits.";

export function SiteRenderer({
  config,
  locale = "zh",
  scenario = "empty",
  preview = false,
  studioLink = false,
}: SiteProps) {
  const c = config;
  const en = locale === "en";
  const t = (zh: string, english: string) => (en ? english : zh);
  const [tool, setTool] = useState<ToolId>(c.defaultTool);
  const [inputs, setInputs] = useState({ text: "", video: "" });
  const [state, setState] = useState<DemoState>(scenario);
  const [portalOpen, setPortalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [modal, setModal] = useState<"login" | "pricing" | "history" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [history, setHistory] = useState<{ id: number; tool: ToolId; input: string }[]>([]);
  const [recent, setRecent] = useState<ToolId[]>([]);
  const [feedback, setFeedback] = useState("");
  const [length, setLength] = useState("short");
  const [aspect, setAspect] = useState("16:9");
  const [dark, setDark] = useState(c.theme.mode === "dark");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
  }, [modal]);
  useEffect(() => {
    setTool(c.defaultTool);
  }, [c.defaultTool]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setState(scenario);
    if (timer.current) clearTimeout(timer.current);
  }, [scenario]);
  useEffect(() => {
    setDark(
      c.theme.mode === "dark" ||
        (c.theme.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches),
    );
  }, [c.theme.mode]);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("laconic-recent-v1") ?? "[]");
      if (Array.isArray(saved))
        setRecent(saved.filter((v): v is ToolId => v === "text" || v === "video").slice(0, 2));
    } catch {}
  }, []);
  function openTool(id: ToolId) {
    setTool(id);
    setPortalOpen(true);
    setMobileNav(false);
    const next = [id, ...recent.filter((v) => v !== id)];
    setRecent(next);
    try {
      localStorage.setItem("laconic-recent-v1", JSON.stringify(next));
    } catch {}
  }
  function runDemo() {
    if (!inputs[tool].trim()) {
      setFeedback(
        t("先输入一些内容，或使用下方示例。", "Add some content, or try the example below."),
      );
      return;
    }
    setFeedback("");
    setState("loading");
    if (timer.current) clearTimeout(timer.current);
    const snapshot = { id: Date.now(), tool, input: inputs[tool] };
    timer.current = setTimeout(() => {
      setState("success");
      setHistory((items) => [snapshot, ...items].slice(0, 10));
    }, 850);
  }
  function openLogin() {
    if (preview) setModal("login");
    else window.location.assign(locale === "zh" ? "/zh/login" : "/login");
  }
  function openHistory() {
    if (preview) setModal("history");
    else openTool("text");
  }
  const input = inputs[tool];
  const summary = t(
    "演示结果：清晰的输入、可靠的反馈和独立的业务基础，能帮助工具保持易用，也让新功能更容易复用。",
    "Demo result: Clear inputs, reliable feedback, and shared business services make tools easier to use and extend.",
  );
  const result = input.trim()
    ? `${summary}\n\n${t("原文节选：", "Source excerpt: ")}${input.slice(0, length === "short" ? 90 : 240)}`
    : summary;
  function download() {
    const a = document.createElement("a");
    const url = URL.createObjectURL(new Blob([result], { type: "text/plain;charset=utf-8" }));
    a.href = url;
    a.download = "laconic-demo-summary.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(result);
      setFeedback(t("已复制到剪贴板", "Copied to clipboard"));
    } catch {
      setFeedback(t("复制不可用，请选中文字手动复制。", "Select the text and copy it manually."));
    }
  }
  const tokens = {
    "--site-accent": readableAccent(c.theme.accent, dark ? "#14161d" : c.theme.background),
    "--site-brand": c.theme.accent,
    "--site-on-accent": contrastText(c.theme.accent),
    "--site-bg": dark ? "#14161d" : c.theme.background,
    "--site-text": dark ? "#f0f1f6" : contrastText(c.theme.background),
    "--site-muted": dark
      ? "#b3b9c9"
      : contrastText(c.theme.background) === "#ffffff"
        ? "#d4d7e1"
        : "#626b7b",
    "--site-surface": dark ? "#1d202a" : c.theme.background,
    "--site-soft": dark ? "#232734" : "color-mix(in srgb, var(--site-bg) 95%, var(--site-accent))",
    "--site-border": dark ? "#363b4b" : "color-mix(in srgb, var(--site-text) 13%, var(--site-bg))",
    "--site-radius": `${c.theme.radius}px`,
    "--site-width": `${c.layout.contentMaxWidth}px`,
    "--site-sidebar": `${c.layout.sidebarWidth}px`,
    "--site-space": c.layout.density === "compact" ? "20px" : "32px",
    "--site-size": `${c.theme.fontSize}px`,
    "--site-shadow":
      c.theme.shadow === "none"
        ? "none"
        : c.theme.shadow === "soft"
          ? "0 8px 32px #17213b06"
          : "0 16px 45px #17213b17",
    "--site-font":
      c.theme.font === "serif"
        ? 'Georgia, "Noto Serif SC", "Songti SC", serif'
        : c.theme.font === "mono"
          ? '"Cascadia Code", Consolas, monospace'
          : 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif',
  } as CSSProperties;
  const toolName =
    tool === "text" ? t("文本摘要", "Text summary") : t("视频生成", "Video generation");
  const toolCards = [
    {
      id: "text" as const,
      title: t("文本摘要", "Text summary"),
      category: "text",
      text: t(
        "长文章，短时间读懂。提炼重点，留住值得记住的内容。",
        "Turn long reads into clear, useful takeaways.",
      ),
      icon: FileText,
    },
    {
      id: "video" as const,
      title: t("视频生成", "Video generation"),
      category: "video",
      text: t(
        "把脑海中的画面，变成下一段故事。从一句描述开始。",
        "Give your ideas a new dimension. Start with a prompt.",
      ),
      icon: Video,
    },
  ];
  const filtered = toolCards.filter(
    (card) =>
      (category === "all" || category === card.category) &&
      `${card.title} ${card.text}`.toLowerCase().includes(query.toLowerCase()),
  );
  function resultPanel() {
    if (state === "loading")
      return (
        <div className={styles.empty}>
          <LoaderCircle className={styles.spin} size={30} />
          <h3>{t("正在准备演示结果", "Preparing a demo result")}</h3>
          <p>
            {t(
              "仅模拟界面状态，不会请求模型或扣除积分。",
              "A local simulation. No model calls or credits used.",
            )}
          </p>
        </div>
      );
    if (state === "error" || state === "credits" || state === "signed-out")
      return (
        <div className={styles.empty}>
          <CircleAlert size={30} />
          <h3>
            {state === "error"
              ? t("这次没能完成", "Something went wrong")
              : state === "credits"
                ? t("积分暂时不足", "Not enough credits")
                : t("登录后，继续你的创作", "Sign in to keep creating")}
          </h3>
          <p>
            {t(
              "这是可恢复状态的界面示例，未发生真实业务操作。",
              "This is a preview state. No real transaction took place.",
            )}
          </p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() =>
              state === "signed-out"
                ? openLogin()
                : state === "credits"
                  ? setModal("pricing")
                  : setState("empty")
            }
          >
            {state === "error"
              ? t("返回编辑", "Back to editing")
              : state === "credits"
                ? t("查看方案", "View plans")
                : t("登录", "Sign in")}
          </button>
        </div>
      );
    if (state === "success")
      return (
        <div className={styles.resultContent}>
          <div className={styles.resultHeading}>
            <span>
              <Check size={15} /> {t("演示已完成", "Demo complete")}
            </span>
            {tool === "text" && (
              <div>
                <button type="button" aria-label={t("复制结果", "Copy result")} onClick={copy}>
                  <Copy size={16} />
                </button>
                <button
                  type="button"
                  aria-label={t("下载文本", "Download text")}
                  onClick={download}
                >
                  <ArrowDownToLine size={16} />
                </button>
              </div>
            )}
          </div>
          {tool === "text" ? (
            <>
              <h3>{t("让重点，浮出水面。", "Make the important things clear.")}</h3>
              <p className={styles.summaryText}>{result}</p>
              <div className={styles.resultNote}>
                {t(
                  "固定示例摘要 + 原文节选，未调用 AI。",
                  "Sample summary + source excerpt. No AI was called.",
                )}
              </div>
            </>
          ) : (
            <>
              <div className={styles.storyboard}>
                <div className={styles.sunShape} />
                <div className={styles.hills} />
                <Play size={36} />
                <span>
                  {t("分镜示例 · 非生成视频", "Storyboard example · not a generated video")}
                </span>
              </div>
              <p>
                {input ||
                  t(
                    "清晨，阳光穿过山谷，一段新的故事即将开始。",
                    "Morning light passes through a quiet valley.",
                  )}
              </p>
            </>
          )}
        </div>
      );
    return (
      <div className={styles.empty}>
        <div className={styles.paperArt}>
          <FileText size={32} />
        </div>
        <h3>
          {t("你的下一件作品，", "Your next idea,")}
          <br />
          {t("从这里开始。", "starts right here.")}
        </h3>
        <p>
          {t("在左侧写下内容，或试试示例。", "Add your content, or try an example.")}
          <br />
          {t("给想法一点空间。", "Give your ideas a little space.")}
        </p>
      </div>
    );
  }
  const workspace = !preview ? (
    tool === "text" ? (
      <SummaryWorkspace
        locale={locale}
        text={inputs.text}
        setText={(text) => setInputs((v) => ({ ...v, text }))}
        length={length}
        setLength={setLength}
        arrangement={c.layout.arrangement}
        submitLabel={c.content.cta[locale]}
      />
    ) : (
      <VideoWorkspace
        locale={locale}
        prompt={inputs.video}
        setPrompt={(video) => setInputs((v) => ({ ...v, video }))}
        aspect={aspect}
        setAspect={setAspect}
        arrangement={c.layout.arrangement}
      />
    )
  ) : (
    <section
      className={`${styles.workspace} ${c.layout.arrangement === "stacked" ? styles.stacked : ""}`}
      aria-label={t("工具工作区", "Tool workspace")}
    >
      <div className={styles.inputPanel}>
        <div className={styles.panelHeading}>
          <span>
            <WandSparkles size={17} />
            {t("创作内容", "Your content")}
          </span>
          <button type="button" onClick={() => setInputs((v) => ({ ...v, [tool]: "" }))}>
            {t("清空", "Clear")}
          </button>
        </div>
        <div className={styles.toolTabs}>
          <button
            type="button"
            className={tool === "text" ? styles.activeTab : ""}
            onClick={() => openTool("text")}
          >
            <FileText size={14} />
            {t("文本摘要", "Summary")}
          </button>
          <button
            type="button"
            className={tool === "video" ? styles.activeTab : ""}
            onClick={() => openTool("video")}
          >
            <Video size={14} />
            {t("视频生成", "Video")}
          </button>
        </div>
        <label className={styles.srOnly} htmlFor="tool-content">
          {t("输入内容", "Input content")}
        </label>
        <textarea
          id="tool-content"
          value={input}
          onChange={(e) => setInputs((v) => ({ ...v, [tool]: e.target.value }))}
          placeholder={
            tool === "text"
              ? t(
                  "粘贴一段文章、会议记录，或任何想整理的文字……",
                  "Paste an article, meeting notes, or anything you want to simplify…",
                )
              : t(
                  "描述你想看到的画面：场景、光线、镜头与情绪……",
                  "Describe your scene: the light, camera movement, and mood…",
                )
          }
          maxLength={8000}
        />
        <div className={styles.inputFooter}>
          <span>{input.length.toLocaleString()} / 8,000</span>
          <button
            type="button"
            onClick={() =>
              setInputs((v) => ({
                ...v,
                [tool]:
                  tool === "text"
                    ? en
                      ? sampleEnglish
                      : sampleText
                    : t(
                        "清晨的山谷，薄雾在树梢间流动。镜头缓慢向前推进，阳光洒进森林。",
                        "A quiet valley at dawn. A slow camera moves through sunlit trees.",
                      ),
              }))
            }
          >
            {t("试试示例", "Try an example")} <ArrowRight size={12} />
          </button>
        </div>
        <div className={styles.actionRow}>
          <label className={styles.parameter}>
            {tool === "text" ? t("摘要长度", "Length") : t("画面比例", "Aspect ratio")}
            <select
              value={tool === "text" ? length : aspect}
              onChange={(e) =>
                tool === "text" ? setLength(e.target.value) : setAspect(e.target.value)
              }
            >
              {tool === "text" ? (
                <>
                  <option value="short">{t("简洁", "Short")}</option>
                  <option value="long">{t("详细", "Detailed")}</option>
                </>
              ) : (
                <>
                  <option>16:9</option>
                  <option>9:16</option>
                  <option>1:1</option>
                </>
              )}
            </select>
          </label>
          <button
            type="button"
            className={styles.primary}
            onClick={runDemo}
            disabled={state === "loading"}
          >
            <Sparkles size={15} />
            {tool === "text" ? c.content.cta[locale] : t("预览分镜", "Preview storyboard")}
          </button>
        </div>
        <p className={styles.demoHint}>
          {t("演示模式 · 不调用模型，不扣积分", "Demo mode · no model calls, no credits used")}
        </p>
      </div>
      <div className={styles.resultPanel} aria-live="polite">
        {resultPanel()}
      </div>
    </section>
  );
  return (
    <div
      className={`${styles.site} ${styles[c.presetId]}`}
      style={tokens}
      data-preset={c.presetId}
      data-theme={dark ? "dark" : "light"}
    >
      <header className={styles.header}>
        <button
          type="button"
          className={styles.brand}
          onClick={() => {
            setPortalOpen(false);
          }}
          aria-label={c.brand.name}
        >
          {c.brand.logoPath ? (
            <img
              src={c.brand.logoPath}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span className={styles.brandMark}>{c.brand.mark}</span>
          )}
          <strong>{c.brand.name}</strong>
        </button>
        <nav>
          <button
            type="button"
            onClick={() => {
              setPortalOpen(false);
              setCategory("all");
              setQuery("");
            }}
          >
            {t("探索工具", "Explore")}
          </button>
          <button type="button" onClick={() => preview ? setModal("pricing") : window.location.assign(`${locale === "zh" ? "/zh" : ""}/buy-credits`)}>
            {t("价格", "Pricing")}
          </button>
          <button type="button" onClick={() => openHistory()}>
            {t("最近创作", "Recent work")}
          </button>
        </nav>
        <div className={styles.headerActions}>
          <button
            type="button"
            aria-label={t("切换明暗", "Toggle theme")}
            onClick={() => setDark((v) => !v)}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {preview ? (
            <button type="button" className={styles.secondary} onClick={() => openLogin()}>
              {t("登录", "Sign in")}
              <ArrowRight size={13} />
            </button>
          ) : (
            <AccountButton locale={locale} />
          )}
          <button
            type="button"
            className={styles.mobileMenu}
            aria-label={t("打开导航", "Open navigation")}
            onClick={() => setMobileNav((v) => !v)}
          >
            <Menu size={20} />
          </button>
        </div>
      </header>
      {mobileNav && c.presetId !== "studio" && (
        <nav className={styles.mobileNav}>
          <button
            type="button"
            onClick={() => {
              setPortalOpen(false);
              setMobileNav(false);
            }}
          >
            {t("探索工具", "Explore")}
          </button>
          <button
            type="button"
            onClick={() => {
              openHistory();
              setMobileNav(false);
            }}
          >
            {t("最近创作", "Recent work")}
          </button>
          <button
            type="button"
            onClick={() => {
              openLogin();
              setMobileNav(false);
            }}
          >
            {t("登录", "Sign in")}
          </button>
        </nav>
      )}
      <div className={styles.body}>
        {c.presetId === "studio" && (
          <aside className={`${styles.sidebar} ${mobileNav ? styles.navOpen : ""}`}>
            <div className={styles.sidebarTop}>
              <span>{t("你的工作空间", "YOUR WORKSPACE")}</span>
              <button type="button" className={styles.sidebarActive} onClick={() => setModal(null)}>
                <Layers3 size={17} />
                {t("创作空间", "Workspace")}
              </button>
              <button type="button" onClick={() => openHistory()}>
                <FolderOpen size={17} />
                {t("我的作品", "My creations")}
              </button>
            </div>
            <span className={styles.navCaption}>{t("AI 工具", "AI TOOLS")}</span>
            {toolCards.map((card) => (
              <button
                type="button"
                key={card.id}
                className={tool === card.id ? styles.sidebarSelected : ""}
                onClick={() => openTool(card.id)}
              >
                <card.icon size={17} />
                {card.title}
              </button>
            ))}
            <div className={styles.sidebarBottom}>
              <Sparkles size={20} />
              <strong>{t("留一点时间给灵感", "Make room for ideas")}</strong>
              <p>{t("从小小的尝试，开始新的创作。", "Small experiments. New possibilities.")}</p>
              <button type="button" onClick={() => preview ? setModal("pricing") : window.location.assign(`${locale === "zh" ? "/zh" : ""}/buy-credits`)}>
                {t("了解方案", "Explore plans")}
                <ArrowRight size={13} />
              </button>
            </div>
          </aside>
        )}
        <main className={styles.main}>
          {c.presetId === "portal" && portalOpen ? (
            <button type="button" className={styles.back} onClick={() => setPortalOpen(false)}>
              ← {t("全部工具", "All tools")} / {toolName}
            </button>
          ) : null}
          <div className={styles.hero}>
            <h1>{c.presetId === "portal" && portalOpen ? toolName : c.content.title[locale]}</h1>
            <p>{c.content.subtitle[locale]}</p>
          </div>
          {c.presetId === "portal" && !portalOpen ? (
            <>
              <div className={styles.search}>
                <Search size={20} />
                <input
                  aria-label={t("搜索工具", "Search tools")}
                  placeholder={t(
                    "你想完成什么？搜索工具…",
                    "What would you like to do? Search tools…",
                  )}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span>↵</span>
              </div>
              <div className={styles.categories}>
                {[
                  ["all", t("所有工具", "All tools")],
                  ["text", t("文字处理", "Writing")],
                  ["video", t("影像创作", "Video")],
                ].map(([id, title]) => (
                  <button
                    type="button"
                    key={id}
                    className={category === id ? styles.categoryActive : ""}
                    onClick={() => setCategory(id)}
                  >
                    {title}
                  </button>
                ))}
              </div>
              {recent.length > 0 && (
                <div className={styles.recent}>
                  <Clock3 size={14} />
                  {t("最近使用", "Recently used")}
                  {recent.map((id) => (
                    <button type="button" key={id} onClick={() => openTool(id)}>
                      {toolCards.find((v) => v.id === id)!.title}
                      <ArrowRight size={12} />
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.directoryTitle}>
                <h2>
                  {query
                    ? t("搜索结果", "Search results")
                    : t("给想法一个好帮手", "A useful place to start")}
                </h2>
                <span>
                  {filtered.length} {t("个工具界面", "tool interfaces")}
                </span>
              </div>
              <div
                className={styles.directory}
                style={{ "--columns": c.layout.columns } as CSSProperties}
              >
                {filtered.map((card, i) => (
                  <button
                    type="button"
                    key={card.id}
                    className={styles.toolCard}
                    onClick={() => openTool(card.id)}
                  >
                    <div className={`${styles.cardArt} ${i === 1 ? styles.videoArt : ""}`}>
                      <card.icon size={44} strokeWidth={1.3} />
                      <span>{i === 0 ? "Aa" : "16:9"}</span>
                    </div>
                    <div className={styles.cardCopy}>
                      <span className={styles.cardIcon}>
                        <card.icon size={18} />
                      </span>
                      <h3>{card.title}</h3>
                      <p>{card.text}</p>
                      <span className={styles.cardLink}>
                        {t("打开工具", "Open tool")}
                        <ArrowRight size={15} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {filtered.length === 0 && (
                <div className={styles.noResults}>
                  <Search size={28} />
                  <h3>{t("还没有找到这个工具", "No tools found")}</h3>
                  <p>
                    {t(
                      "换一个关键词，或查看全部工具。",
                      "Try a different word, or explore all tools.",
                    )}
                  </p>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                    }}
                  >
                    {t("清除筛选", "Clear filters")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {!preview && (
                <div className={styles.toolTabs} aria-label={t("切换工具", "Switch tool")}>
                  <button
                    type="button"
                    onClick={() => openTool("text")}
                    className={tool === "text" ? styles.activeTab : ""}
                    aria-label={t("切换到文本摘要", "Switch to text summary")}
                  >
                    {t("文本摘要", "Text summary")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openTool("video")}
                    className={tool === "video" ? styles.activeTab : ""}
                    aria-label={t("切换到视频生成", "Switch to video")}
                  >
                    {t("视频生成", "Video generation")}
                  </button>
                </div>
              )}
              {workspace}
            </>
          )}
          {feedback && (
            <p className={styles.feedback} aria-live="polite">
              {feedback}
              <button
                type="button"
                aria-label={t("关闭提示", "Dismiss")}
                onClick={() => setFeedback("")}
              >
                <X size={13} />
              </button>
            </p>
          )}
          {c.sections.map((section) =>
            section === "examples" ? (
              <section key={section} className={styles.steps}>
                {[
                  [
                    "01",
                    t("写下你的内容", "Start with your content"),
                    t(
                      "粘贴文字，或从一个简单的想法开始。",
                      "Paste your words or start with a simple idea.",
                    ),
                  ],
                  [
                    "02",
                    t("选择合适的工具", "Find your tool"),
                    t("把时间留给思考，让工具完成整理。", "Let the tool handle the small details."),
                  ],
                  [
                    "03",
                    t("继续你的创作", "Make it your own"),
                    t(
                      "复制、保存，再加入自己的表达。",
                      "Copy, save, and add your own perspective.",
                    ),
                  ],
                ].map(([n, title, text]) => (
                  <div key={n}>
                    <span>{n}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                ))}
              </section>
            ) : section === "features" ? (
              <section className={styles.featureStrip} key={section}>
                <div>
                  <h2>{t("好工具，应该轻一点。", "Good tools get out of your way.")}</h2>
                  <p>
                    {t(
                      "清楚的步骤、及时的反馈，还有值得信赖的掌控感。",
                      "Clear steps. Useful feedback. A little more control.",
                    )}
                  </p>
                </div>
                <div>
                  <span>
                    <Check size={15} />
                    {t("清晰的操作流程", "A clear workflow")}
                  </span>
                  <span>
                    <Check size={15} />
                    {t("文本与影像工作区", "Text and video workspaces")}
                  </span>
                  <span>
                    <Check size={15} />
                    {t("随时保存你的想法", "Keep your ideas close")}
                  </span>
                </div>
              </section>
            ) : (
              <section className={styles.faq} key={section}>
                <h2>{t("开始之前，你可能想知道", "A few things before you start")}</h2>
                <details>
                  <summary>
                    {t("这里会调用真实 AI 模型吗？", "Does this call a real AI model?")}
                  </summary>
                  <p>
                    {t(
                      preview
                        ? "当前是 UI 演示，生成按钮仅展示模拟状态，不上传内容、不收款、不扣积分。"
                        : "文本摘要与视频在配置启用后会向模型供应商发送输入，按页面显示的积分执行。Studio 预览始终隔离。积分购买仅开放已配置的支付通道。",
                      preview
                        ? "This is a UI demo. No content is uploaded and no credits are charged."
                        : "Configured text and video tools send inputs to their providers and use the displayed credits. Studio previews stay isolated. Credit purchases use configured payment channels.",
                    )}
                  </p>
                </details>
                <details>
                  <summary>
                    {t("可以保存或切换界面吗？", "Can I customize this interface?")}
                  </summary>
                  <p>
                    {t(
                      "在本地 UI Studio 中选择方案、调整细节，再应用到站点。",
                      "Choose a preset and adjust it in the local UI Studio, then apply it to the site.",
                    )}
                  </p>
                </details>
              </section>
            ),
          )}
        </main>
      </div>
      <footer className={styles.footer}>
        <span>
          © {new Date().getFullYear()} {c.brand.name}
        </span>
        <span>
          {preview
            ? t(
                "界面演示 · 不提供真实生成或收款",
                "Interface demo · no live generation or payments",
              )
            : t(
                "文本摘要与视频 · 真实任务；积分购买需配置支付",
                "Live text and video tasks; configure payments to buy credits",
              )}
        </span>
        {studioLink && !preview && (
          <a href="/ui-studio">
            UI Studio <ArrowRight size={12} />
          </a>
        )}
      </footer>
      {modal && (
        <dialog
          ref={dialogRef}
          className={styles.modalBackdrop}
          onCancel={() => setModal(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
          aria-label={
            modal === "history"
              ? t("最近创作", "Recent work")
              : modal === "login"
                ? t("登录预览", "Sign-in preview")
                : t("方案预览", "Plans preview")
          }
        >
          <div className={styles.modal}>
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setModal(null)}
              aria-label={t("关闭", "Close")}
            >
              <X size={20} />
            </button>
            <h2>
              {modal === "history"
                ? t("最近创作", "Recent work")
                : modal === "login"
                  ? t("欢迎回来", "Welcome back")
                  : t("为你的下一步，留出空间。", "Make room for your next step.")}
            </h2>
            <p>
              {t(
                "仅为界面预览，不连接真实账户或支付。",
                "Interface preview only. No live account or payment connection.",
              )}
            </p>
            {modal === "history" ? (
              history.length ? (
                history.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={styles.historyItem}
                    onClick={() => {
                      setTool(item.tool);
                      setInputs((v) => ({ ...v, [item.tool]: item.input }));
                      setState("success");
                      setPortalOpen(true);
                      setModal(null);
                    }}
                  >
                    <FileText size={16} />
                    <span>{item.input.slice(0, 50)}</span>
                    <ChevronRight size={14} />
                  </button>
                ))
              ) : (
                <p>
                  {t(
                    "还没有演示作品。先试试生成一段摘要。",
                    "No demo results yet. Try creating a summary.",
                  )}
                </p>
              )
            ) : modal === "login" ? (
              <a
                className={styles.primary}
                href={`/${locale === "zh" ? "zh/" : ""}login`}
                target="_blank"
                rel="noreferrer"
              >
                {t("打开真实登录页（需先配置服务）", "Open sign-in page (setup required)")}
                <ArrowRight size={15} />
              </a>
            ) : (
              <div className={styles.planPreview}>
                <strong>{t("积分包 / 订阅", "Credits / subscriptions")}</strong>
                <p>
                  {t(
                    "Stripe · Creem · PayPal · Waffo 接入属于后续业务阶段，此处不会创建订单。",
                    "Payment integration is a separate phase. No order will be created here.",
                  )}
                </p>
              </div>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
