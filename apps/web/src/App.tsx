import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Clock3,
  Download,
  FileImage,
  Film,
  Globe2,
  Link2,
  LoaderCircle,
  Menu,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { parseInstagramUrl } from "@instafetch/shared";
import {
  ApiClientError,
  mediaUrl,
  resolveInstagram,
  type ResolveData,
  type ResolveMediaItem,
} from "./api";
import { analytics, categoryForSourceType } from "./analytics";
import { applyPageMetadata } from "./metadata";
import { LanguageProvider, useI18n, type Locale } from "./i18n";

const navigation = [
  { key: "nav.video", href: "/#supported-video" },
  { key: "nav.photo", href: "/#supported-photo" },
  { key: "nav.reels", href: "/#supported-reels" },
  { key: "nav.story", href: "/#supported-story" },
  { key: "nav.carousel", href: "/#supported-carousel" },
  { key: "nav.faq", href: "/#faq" },
];
const SLOW_REQUEST_DELAY_MS = 1_500;
const DOWNLOAD_TIMEOUT_MS = 45_000;
type DownloaderState =
  | { status: "empty" | "ready" }
  | { status: "processing"; slow: boolean }
  | { status: "success"; data: ResolveData }
  | { status: "error"; code: string; message: string };

function userMessage(code: string, t: (key: string) => string): string {
  return t(`error.${code}`) === `error.${code}`
    ? t("error.fallback")
    : t(`error.${code}`);
}

function useDownloader() {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [state, setState] = useState<DownloaderState>({ status: "empty" });
  const controller = useRef<AbortController | null>(null);
  const slowTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (slowTimer.current !== null) window.clearTimeout(slowTimer.current);
    },
    [],
  );
  const onChange = (next: string) => {
    controller.current?.abort();
    setValue(next);
    setState({ status: next.trim() ? "ready" : "empty" });
  };
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (state.status === "processing") return;
    let canonicalUrl: string;
    let sourceCategory: ReturnType<typeof categoryForSourceType> = "unknown";
    try {
      const validated = parseInstagramUrl(value.trim());
      canonicalUrl = validated.canonicalUrl;
      sourceCategory = categoryForSourceType(validated.route);
    } catch {
      analytics.track("resolve_failed", "unknown");
      setState({
        status: "error",
        code: "INVALID_INSTAGRAM_URL",
        message: userMessage("INVALID_INSTAGRAM_URL", t),
      });
      return;
    }
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setValue(canonicalUrl);
    setState({ status: "processing", slow: false });
    analytics.track("resolve_started", sourceCategory);
    slowTimer.current = window.setTimeout(() => {
      setState((current) =>
        current.status === "processing" ? { ...current, slow: true } : current,
      );
    }, SLOW_REQUEST_DELAY_MS);
    try {
      const response = await resolveInstagram(
        canonicalUrl,
        nextController.signal,
      );
      if (response.data.items.length === 0) {
        analytics.track("resolve_failed", sourceCategory);
        setState({
          status: "error",
          code: "PROVIDER_MALFORMED_RESPONSE",
          message: userMessage("PROVIDER_MALFORMED_RESPONSE", t),
        });
      } else {
        analytics.track(
          "resolve_success",
          categoryForSourceType(response.data.sourceType),
        );
        setState({ status: "success", data: response.data });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const code =
        error instanceof ApiClientError ? error.code : "NETWORK_FAILURE";
      analytics.track("resolve_failed", sourceCategory);
      setState({ status: "error", code, message: userMessage(code, t) });
    } finally {
      if (slowTimer.current !== null) window.clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
  };
  const clear = () => {
    controller.current?.abort();
    setValue("");
    setState({ status: "empty" });
  };
  return {
    value,
    state,
    onChange,
    submit,
    clear,
    retry: () => {
      void submit();
    },
  };
}

function Header() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          className="brand"
          to="/"
          onClick={close}
          aria-label={t("brand.home")}
        >
          <span className="brand__mark" aria-hidden="true">
            <Camera size={18} strokeWidth={2.5} />
          </span>
          <span>InstaFetch</span>
        </Link>
        <nav aria-label={t("primaryNavigation")} className="desktop-nav">
          {navigation.map((item) => (
            <a href={item.href} key={item.href}>
              {t(item.key)}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <label className="language-picker">
            <Globe2 aria-hidden="true" size={15} />
            <span className="sr-only">{t("language")}</span>
            <select
              aria-label={t("language")}
              value={locale}
              onChange={(event) => {
                const nextLocale = event.target.value as Locale;
                if (nextLocale !== locale) analytics.track("language_changed", "unknown");
                setLocale(nextLocale);
              }}
            >
              <option value="en">EN</option>
              <option value="es">ES</option>
              <option value="fr">FR</option>
            </select>
          </label>
          <button
            aria-controls="mobile-navigation"
            aria-expanded={open}
            aria-label={open ? t("menu.close") : t("menu.open")}
            className="menu-button"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            {open ? (
              <X aria-hidden="true" size={21} />
            ) : (
              <Menu aria-hidden="true" size={21} />
            )}
          </button>
        </div>
      </div>
      {open && (
        <nav
          aria-label={t("mobileNavigation")}
          className="mobile-nav"
          id="mobile-navigation"
        >
          {navigation.map((item) => (
            <a href={item.href} key={item.href} onClick={close}>
              {t(item.key)}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

function DownloaderPanel({
  downloader,
}: {
  downloader: ReturnType<typeof useDownloader>;
}) {
  const { t } = useI18n();
  const { value, state, onChange, submit, clear } = downloader;
  const [pasteMessage, setPasteMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isProcessing = state.status === "processing";
  const hasValue = value.trim().length > 0;
  const paste = async () => {
    try {
      const clipboardValue = await navigator.clipboard.readText();
      onChange(clipboardValue);
      setPasteMessage(
        clipboardValue ? t("input.pasted") : t("input.clipboardEmpty"),
      );
      inputRef.current?.focus();
    } catch {
      setPasteMessage(t("input.clipboardDenied"));
    }
  };
  return (
    <div className="downloader-panel">
      <form onSubmit={submit}>
        <label className="input-label" htmlFor="instagram-url">
          {t("input.label")}
        </label>
        <div
          className={`url-input ${state.status === "error" ? "url-input--error" : ""}`}
        >
          <Link2 aria-hidden="true" size={19} />
          <input
            aria-describedby="url-help"
            aria-invalid={state.status === "error"}
            autoComplete="url"
            id="instagram-url"
            onChange={(event) => {
              onChange(event.target.value);
              setPasteMessage("");
            }}
            placeholder={t("input.placeholder")}
            ref={inputRef}
            spellCheck="false"
            type="url"
            value={value}
          />
          {hasValue && (
            <button
              aria-label={t("input.clearAria")}
              className="icon-button"
              onClick={clear}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          )}
        </div>
        <p className="input-help" id="url-help">
          {t("input.help")}
        </p>
        <div className="form-actions">
          <button className="secondary-button" onClick={paste} type="button">
            <Clipboard aria-hidden="true" size={17} />
            {t("input.paste")}
          </button>
          <button
            className="secondary-button secondary-button--clear"
            disabled={!hasValue || isProcessing}
            onClick={clear}
            type="button"
          >
            <Trash2 aria-hidden="true" size={17} />
            {t("input.clear")}
          </button>
          <button
            className="primary-button primary-button--submit"
            disabled={!hasValue || isProcessing}
            type="submit"
          >
            {isProcessing ? (
              <LoaderCircle aria-hidden="true" className="spin" size={18} />
            ) : (
              <ArrowDownToLine aria-hidden="true" size={18} />
            )}
            {isProcessing ? t("input.resolving") : t("input.download")}
          </button>
        </div>
        {pasteMessage && (
          <p className="micro-feedback" role="status">
            {pasteMessage}
          </p>
        )}
      </form>
      <div className="panel-footnote">
        <ShieldCheck aria-hidden="true" size={16} />
        {t("panel.footnote")}
      </div>
    </div>
  );
}

function StatusMessage({
  state,
  onRetry,
}: {
  state: DownloaderState;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (state.status === "processing")
    return (
      <div aria-live="polite" className="status-card status-card--processing">
        <LoaderCircle aria-hidden="true" className="spin" size={20} />
        <div>
          <span>
            {state.slow ? t("status.waking") : t("status.processing")}
          </span>
          {state.slow && <small>{t("status.keepTab")}</small>}
        </div>
      </div>
    );
  if (state.status === "error")
    return (
      <div aria-live="assertive" className="status-card status-card--error">
        <CircleAlert aria-hidden="true" size={20} />
        <div>
          <strong>{t("status.errorHeading")}</strong>
          <span>{state.message}</span>
          <button className="status-retry" onClick={onRetry} type="button">
            {t("status.tryAgain")}
          </button>
        </div>
      </div>
    );
  return null;
}

function MediaPreview({
  item,
  category,
}: {
  item: ResolveMediaItem;
  category: ReturnType<typeof categoryForSourceType>;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const previewTracked = useRef(false);
  const markLoaded = () => {
    setLoaded(true);
    if (!previewTracked.current) {
      previewTracked.current = true;
      analytics.track("preview_opened", category);
    }
  };
  if (failed)
    return (
      <div className="preview-fallback">
        <CircleAlert aria-hidden="true" size={22} />
        <span>{t("preview.unavailable")}</span>
        <small>{t("preview.hint")}</small>
      </div>
    );
  return (
    <div className="preview-shell">
      {!loaded && (
        <div aria-live="polite" className="preview-loading">
          <LoaderCircle aria-hidden="true" className="spin" size={20} />
          <span>{t("preview.loading")}</span>
        </div>
      )}
      {item.type === "video" ? (
        <video
          aria-label={t("media.video")}
          controls
          onError={() => setFailed(true)}
          onLoadedMetadata={markLoaded}
          preload="metadata"
          src={mediaUrl(item.previewUrl)}
        />
      ) : (
        <img
          alt={t("media.photo")}
          decoding="async"
          onError={() => setFailed(true)}
          onLoad={markLoaded}
          src={mediaUrl(item.previewUrl)}
        />
      )}
    </div>
  );
}

function DownloadLink({
  item,
  category,
}: {
  item: ResolveMediaItem;
  category: ReturnType<typeof categoryForSourceType>;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<
    "idle" | "preparing" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const resetTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );
  const download = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (state === "preparing") return;
    setState("preparing");
    setErrorMessage("");
    analytics.track("download_started", category);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      DOWNLOAD_TIMEOUT_MS,
    );
    try {
      const response = await fetch(mediaUrl(item.downloadUrl), {
        signal: controller.signal,
      });
      if (!response.ok) {
        let code = "DOWNLOAD_FAILED";
        try {
          const payload = (await response.json()) as {
            error?: { code?: string };
          };
          code = payload.error?.code ?? code;
        } catch {
          /* safe fallback */
        }
        throw new ApiClientError(code, userMessage(code, t), response.status);
      }
      const blob = await response.blob();
      if (blob.size === 0)
        throw new ApiClientError(
          "DOWNLOAD_FAILED",
          userMessage("DOWNLOAD_FAILED", t),
        );
      const objectUrl = URL.createObjectURL(blob);
      const trigger = document.createElement("a");
      trigger.href = objectUrl;
      trigger.download = `instafetch-${item.id.slice(0, 12)}.${item.extension}`;
      trigger.rel = "noreferrer";
      document.body.appendChild(trigger);
      trigger.click();
      trigger.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      analytics.track("download_success", category);
      setState("success");
      resetTimer.current = window.setTimeout(() => setState("idle"), 2_500);
    } catch (error) {
      analytics.track("download_failed", category);
      const code =
        error instanceof ApiClientError ? error.code : "DOWNLOAD_FAILED";
      setErrorMessage(userMessage(code, t));
      setState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  };
  const label =
    state === "preparing"
      ? t("download.preparing")
      : state === "success"
        ? t("download.downloaded")
        : state === "error"
          ? t("download.retry")
          : item.type === "video"
            ? t("download.video")
            : t("download.photo");
  return (
    <>
      <a
        aria-busy={state === "preparing"}
        aria-disabled={state === "preparing"}
        aria-label={label}
        className="download-link"
        download
        href={mediaUrl(item.downloadUrl)}
        onClick={download}
      >
        {state === "preparing" ? (
          <LoaderCircle aria-hidden="true" className="spin" size={17} />
        ) : state === "success" ? (
          <Check aria-hidden="true" size={17} />
        ) : state === "error" ? (
          <CircleAlert aria-hidden="true" size={17} />
        ) : (
          <Download aria-hidden="true" size={17} />
        )}
        {label}
      </a>
      {errorMessage && (
        <p aria-live="polite" className="download-feedback">
          {errorMessage}
        </p>
      )}
    </>
  );
}

function MediaCard({
  item,
  index,
  total,
  category,
}: {
  item: ResolveMediaItem;
  index: number;
  total: number;
  category: ReturnType<typeof categoryForSourceType>;
}) {
  const { t } = useI18n();
  return (
    <article className="media-card">
      <div className="media-card__preview">
        <MediaPreview category={category} item={item} />
      </div>
      <div className="media-card__body">
        <div className="media-card__topline">
          <span
            className={`media-badge ${item.type === "video" ? "media-badge--video" : "media-badge--photo"}`}
          >
            {item.type === "video" ? (
              <Film aria-hidden="true" size={14} />
            ) : (
              <FileImage aria-hidden="true" size={14} />
            )}
            {item.type === "video" ? t("media.video") : t("media.photo")}
          </span>
          {total > 1 && (
            <span className="item-number">
              {t("media.item")} {index + 1} {t("media.of")} {total}
            </span>
          )}
        </div>
        <div className="media-card__meta">
          <strong>
            {item.qualityLabel !== "unknown"
              ? item.qualityLabel
              : t("media.originalQuality")}
          </strong>
          <span>
            {item.extension.toUpperCase()}
            {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
          </span>
        </div>
        <DownloadLink item={item} category={category} />
      </div>
    </article>
  );
}

function Results({ data }: { data: ResolveData }) {
  const { t } = useI18n();
  const itemCount = data.itemCount ?? data.items.length;
  const resolvedItemCount = data.resolvedItemCount ?? data.items.length;
  const isPartial = data.partial === true || resolvedItemCount < itemCount;
  return (
    <section
      aria-labelledby="results-heading"
      aria-live="polite"
      className="results-section"
      id="results"
    >
      <div className="results-heading-row">
        <div>
          <p className="eyebrow eyebrow--purple">{t("results.eyebrow")}</p>
          <h2 id="results-heading">
            {data.isCarousel
              ? isPartial
                ? `${resolvedItemCount} ${t("results.of")} ${itemCount} ${t("results.itemsAvailable")}`
                : `${itemCount} ${t("results.itemsFound")}`
              : t("results.mediaReady")}
          </h2>
          <p className="results-subtitle">
            {data.author
              ? `${t("results.sharedBy")} ${data.author}`
              : t("results.publicMedia")}
            {data.title ? ` · ${data.title}` : ""}
          </p>
        </div>
        <span className="result-type">
          <Check aria-hidden="true" size={15} />
          {data.sourceType}
        </span>
      </div>
      {isPartial && (
        <div aria-live="polite" className="partial-warning" role="status">
          <CircleAlert aria-hidden="true" size={18} />
          <span>{data.warning ?? t("results.partial")}</span>
        </div>
      )}
      <div
        className={`media-grid ${data.items.length > 1 ? "media-grid--carousel" : ""}`}
      >
        {data.items.map((item, index) => (
          <MediaCard
            category={categoryForSourceType(data.sourceType)}
            index={index}
            item={item}
            key={item.id}
            total={resolvedItemCount}
          />
        ))}
      </div>
    </section>
  );
}

const benefits = [
  { icon: Zap, title: "benefits.quick.title", text: "benefits.quick.text" },
  {
    icon: Smartphone,
    title: "benefits.screen.title",
    text: "benefits.screen.text",
  },
  {
    icon: Sparkles,
    title: "benefits.quality.title",
    text: "benefits.quality.text",
  },
  {
    icon: ShieldCheck,
    title: "benefits.privacy.title",
    text: "benefits.privacy.text",
  },
];
const supported = [
  {
    id: "supported-video",
    icon: Film,
    status: "supported.video.status",
    title: "supported.video.title",
    text: "supported.video.text",
  },
  {
    id: "supported-photo",
    icon: FileImage,
    status: "supported.photo.status",
    title: "supported.photo.title",
    text: "supported.photo.text",
  },
  {
    id: "supported-reels",
    icon: Play,
    status: "supported.reels.status",
    title: "supported.reels.title",
    text: "supported.reels.text",
  },
  {
    id: "supported-story",
    icon: Clock3,
    status: "supported.story.status",
    title: "supported.story.title",
    text: "supported.story.text",
  },
  {
    id: "supported-carousel",
    icon: Camera,
    status: "supported.carousel.status",
    title: "supported.carousel.title",
    text: "supported.carousel.text",
  },
];
const faqs = Array.from({ length: 9 }, (_, index) => [
  `faq.q${index + 1}`,
  `faq.a${index + 1}`,
]);

function HomePage() {
  const { t } = useI18n();
  const downloader = useDownloader();
  useEffect(() => {
    analytics.track("page_view", "unknown");
  }, []);
  return (
    <>
      <main>
        <section className="hero-section">
          <div className="hero-orb hero-orb--one" aria-hidden="true" />
          <div className="hero-orb hero-orb--two" aria-hidden="true" />
          <div className="hero-content">
            <div className="hero-copy">
              <span className="hero-kicker">
                <span className="pulse-dot" aria-hidden="true" />
                {t("hero.kicker")}
              </span>
              <h1>
                {t("hero.title")}
                <br />
                <em>{t("hero.titleAccent")}</em>
              </h1>
              <p>{t("hero.description")}</p>
              <div className="hero-points">
                <span>
                  <Check aria-hidden="true" size={15} />
                  {t("hero.noLogin")}
                </span>
                <span>
                  <Check aria-hidden="true" size={15} />
                  {t("hero.bestQuality")}
                </span>
                <span>
                  <Check aria-hidden="true" size={15} />
                  {t("hero.otherMedia")}
                </span>
              </div>
            </div>
            <div className="hero-tool-wrap">
              <DownloaderPanel downloader={downloader} />
              <StatusMessage
                onRetry={downloader.retry}
                state={downloader.state}
              />
            </div>
          </div>
        </section>
        {downloader.state.status === "success" && (
          <Results data={downloader.state.data} />
        )}
        <section aria-label={t("principles.label")} className="trust-strip">
          <div>
            <ShieldCheck aria-hidden="true" size={19} />
            <span>
              <strong>{t("principles.public")}</strong>
              <small>{t("principles.publicDetail")}</small>
            </span>
          </div>
          <div>
            <Zap aria-hidden="true" size={19} />
            <span>
              <strong>{t("principles.real")}</strong>
              <small>{t("principles.realDetail")}</small>
            </span>
          </div>
          <div>
            <Globe2 aria-hidden="true" size={19} />
            <span>
              <strong>{t("principles.anywhere")}</strong>
              <small>{t("principles.anywhereDetail")}</small>
            </span>
          </div>
        </section>
        <section className="content-section how-section" id="how-it-works">
          <div className="section-intro">
            <p className="eyebrow">{t("how.eyebrow")}</p>
            <h2>{t("how.heading")}</h2>
            <p>{t("how.intro")}</p>
          </div>
          <div className="steps-grid">
            {[
              ["01", "how.step1.title", "how.step1.text"],
              ["02", "how.step2.title", "how.step2.text"],
              ["03", "how.step3.title", "how.step3.text"],
            ].map(([number, title, text]) => (
              <div className="step-card" key={number}>
                <span className="step-number">{number}</span>
                <div>
                  <h3>{t(title)}</h3>
                  <p>{t(text)}</p>
                </div>
                <ArrowRight
                  aria-hidden="true"
                  className="step-arrow"
                  size={19}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="benefits-section">
          <div className="content-section">
            <div className="section-intro section-intro--light">
              <p className="eyebrow eyebrow--light">{t("benefits.eyebrow")}</p>
              <h2>{t("benefits.heading")}</h2>
              <p>{t("benefits.intro")}</p>
            </div>
            <div className="benefit-grid">
              {benefits.map(({ icon: Icon, title, text }) => (
                <div className="benefit-card" key={title}>
                  <span className="benefit-icon">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <h3>{t(title)}</h3>
                  <p>{t(text)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="content-section supported-section" id="supported">
          <div className="section-intro">
            <p className="eyebrow">{t("supported.eyebrow")}</p>
            <h2>{t("supported.heading")}</h2>
            <p>{t("supported.intro")}</p>
          </div>
          <div className="supported-grid">
            {supported.map(({ id, icon: Icon, title, text, status }) => (
              <article className="supported-card" id={id} key={id}>
                <div className="supported-card__head">
                  <span className="supported-icon">
                    <Icon aria-hidden="true" size={21} />
                  </span>
                  <span
                    className={`support-status ${status === "supported.reels.status" ? "support-status--verified" : "support-status--conditional"}`}
                  >
                    {t(status)}
                  </span>
                </div>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
                <a href="#how-it-works">
                  {t("supported.learn")}{" "}
                  <ArrowRight aria-hidden="true" size={15} />
                </a>
              </article>
            ))}
          </div>
        </section>
        <section className="faq-section" id="faq">
          <div className="content-section faq-layout">
            <div className="section-intro">
              <p className="eyebrow">{t("faq.eyebrow")}</p>
              <h2>{t("faq.heading")}</h2>
              <p>{t("faq.intro")}</p>
            </div>
            <FaqList />
          </div>
        </section>
        <section className="closing-section">
          <div>
            <span className="hero-kicker hero-kicker--dark">
              <Sparkles aria-hidden="true" size={15} />
              {t("closing.kicker")}
            </span>
            <h2>{t("closing.heading")}</h2>
            <p>{t("closing.text")}</p>
          </div>
          <a className="primary-button" href="#top">
            {t("closing.cta")} <ArrowRight aria-hidden="true" size={18} />
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}

function FaqList() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq-list">
      {faqs.map(([question, answer], index) => (
        <div
          className={`faq-item ${open === index ? "faq-item--open" : ""}`}
          key={question}
        >
          <h3>
            <button
              aria-controls={`faq-answer-${index}`}
              aria-expanded={open === index}
              onClick={() => setOpen(open === index ? null : index)}
              type="button"
            >
              <span>{t(question)}</span>
              <ChevronDown aria-hidden="true" size={19} />
            </button>
          </h3>
          <div
            className="faq-answer"
            hidden={open !== index}
            id={`faq-answer-${index}`}
          >
            <p>{t(answer)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div>
          <Link className="brand brand--footer" to="/">
            <span className="brand__mark" aria-hidden="true">
              <Camera size={18} />
            </span>
            <span>InstaFetch</span>
          </Link>
          <p>{t("footer.tagline")}</p>
          <p className="footer-credit">{t("footer.credit")}</p>
        </div>
        <div className="footer-links">
          <div>
            <strong>{t("footer.explore")}</strong>
            {navigation.map((item) => (
              <a href={item.href} key={item.href}>
                {t(item.key)}
              </a>
            ))}
          </div>
          <div>
            <strong>{t("footer.info")}</strong>
            <Link to="/privacy">{t("footer.privacy")}</Link>
            <Link to="/terms">{t("footer.terms")}</Link>
            <Link to="/disclaimer">{t("footer.disclaimer")}</Link>
            <Link to="/contact">{t("footer.contact")}</Link>
          </div>
        </div>
      </div>
      <div className="site-footer__bottom">
        <span>© {new Date().getFullYear()} InstaFetch</span>
        <span>{t("footer.publicNotice")}</span>
      </div>
    </footer>
  );
}

function LegalPage({
  kind,
}: {
  kind: "privacy" | "terms" | "disclaimer" | "contact";
}) {
  const { t, locale } = useI18n();
  const copy =
    kind === "privacy"
      ? {
          title: t("legal.privacy.title"),
          intro: t("legal.privacy.intro"),
          sections: [
            [
              "What we handle",
              "When you submit a link, the service processes that URL to request publicly accessible media metadata. Temporary resolution records and materialized files are kept only for the short download window needed to complete the request.",
            ],
            [
              "What we do not request",
              "We do not ask for Instagram usernames, passwords, browser cookies, private-account access, or authentication tokens. Do not submit confidential information in the URL field.",
            ],
            [
              "Service limits",
              "Public availability can change at any time. Temporary files and tokens expire automatically, and this page does not promise that every public post will be resolvable.",
            ],
          ],
        }
      : kind === "terms"
        ? {
            title: t("legal.terms.title"),
            intro: t("legal.terms.intro"),
            sections: [
              [
                "Public content only",
                "InstaFetch is limited to media that is publicly accessible without authentication. Attempts to access private accounts, bypass controls, or submit credentials are not supported.",
              ],
              [
                "Your responsibility",
                "You are responsible for respecting copyright, privacy, and the rules that apply to the content and the place where you use downloaded files.",
              ],
              [
                "Availability",
                "The service may change as Instagram and public providers change. Download links are temporary and may stop working after their expiry window.",
              ],
            ],
          }
        : kind === "disclaimer"
          ? {
              title: t("legal.disclaimer.title"),
              intro: t("legal.disclaimer.intro"),
              sections: [
                [
                  "Independent service",
                  "InstaFetch is not affiliated with, endorsed by, or sponsored by Instagram or Meta. Instagram and related marks belong to their respective owners.",
                ],
                [
                  "Use content responsibly",
                  "Download only content you have the right or permission to save and use. Respect copyright, privacy, and applicable platform rules.",
                ],
                [
                  "Availability",
                  "Private content is not accessed. A public post is not guaranteed to be anonymously downloadable; results depend on what Instagram exposes without login and can change without notice.",
                ],
              ],
            }
          : {
              title: t("legal.contact.title"),
              intro: t("legal.contact.intro"),
              sections: [
                [
                  "Product feedback",
                  "For this early release, please open an issue in the project repository with the route type, approximate time, and the safe error message you saw. Do not include passwords, cookies, or signed provider URLs.",
                ],
                [
                  "Responsible reports",
                  "If a result appears to expose private content or a provider URL, stop using the flow and report the behavior with a redacted description.",
                ],
                [
                  "Response expectations",
                  "InstaFetch is a small utility and response times are not guaranteed.",
                ],
              ],
            };
  return (
    <>
      <main className="legal-page">
        <div className="legal-page__inner">
          <p className="eyebrow">InstaFetch</p>
          <h1>{copy.title}</h1>
          <p className="legal-intro">{copy.intro}</p>
          {locale !== "en" && (
            <p className="legal-language-note">{t("legal.englishNotice")}</p>
          )}
          {copy.sections.map(([title, text]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{text}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

function SiteMetadata() {
  const { pathname } = useLocation();
  const { locale } = useI18n();
  useEffect(() => {
    applyPageMetadata(pathname, locale);
  }, [pathname, locale]);
  return null;
}

export function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <SiteMetadata />
        <div className="app-shell" id="top">
          <Header />
          <Routes>
            <Route element={<HomePage />} path="/" />
            <Route element={<LegalPage kind="privacy" />} path="/privacy" />
            <Route element={<LegalPage kind="terms" />} path="/terms" />
            <Route
              element={<LegalPage kind="disclaimer" />}
              path="/disclaimer"
            />
            <Route element={<LegalPage kind="contact" />} path="/contact" />
          </Routes>
        </div>
      </BrowserRouter>
    </LanguageProvider>
  );
}
