"use client";

import Image from "next/image";
import { use, useCallback, useEffect, useState, type CSSProperties } from "react";

const CONFIGURED_API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333").replace(/\/+$/, "");

function apiBase() {
  if (typeof window !== "undefined" && window.location.protocol === "https:" && CONFIGURED_API.startsWith("http://")) {
    return "/api-proxy";
  }
  return CONFIGURED_API;
}

// FX speed is a multiplier used by CSS to divide animation durations.
// Keep it in a sane band so a bad value can never freeze or seizure-flash a screen.
function clampSpeed(value?: number) {
  if (!value || Number.isNaN(value)) return 1;
  return Math.min(4, Math.max(0.25, value));
}

type ScreenState = {
  mode: "off" | "boot" | "color" | "media" | "message" | "stream" | "standby" | "test" | "menu" | "countdown" | "nowplaying" | "ambient";
  color?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  fit?: "contain" | "stretch" | "stage";
  layout?: StageMediaLayout;
  animation?: AnimationMode;
  animationSpeed?: number;
  animationColor?: string;
  fxStyle?: FxStyle;
  message?: string;
  title?: string;
  subtitle?: string;
  countdownTarget?: number;
  countdownLabel?: string;
  artist?: string;
  track?: string;
  artwork?: string;
  spotifyUrl?: string;
  ambient?: AmbientStyle;
  updatedAt?: string;
  startAt?: number;
  test?: ScreenTestInfo;
};

type FxStyle = "neon" | "hard";
type AmbientStyle = "grid" | "waves" | "tunnel" | "particles";

type AnimationMode =
  | "none"
  | "pulse"
  | "scan"
  | "strobe"
  | "flash"
  | "glitch"
  | "wipe"
  | "bars"
  | "zoom"
  | "rise"
  | "fall"
  | "left"
  | "right"
  | "up"
  | "down"
  | "glow"
  | "grid"
  | "pixel"
  | "wave"
  | "drift"
  | "shake"
  | "stair"
  | "tilt"
  | "orbit"
  | "iris"
  | "matrix"
  | "scanline"
  | "lift"
  | "drop";

type ScreenTestInfo = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type StageMediaLayout = {
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  stageX: number;
  stageY: number;
  stageWidth: number;
  stageHeight: number;
};

const bootLines = [
  "[INFO] UEFI v2.80 (American Megatrends, 0x0005001B)",
  "[INFO] CONCERT OS Board Controller 03.11",
  "[INFO] Secure Boot status: Enabled",
  "[INFO] TPM2 device initialized",
  "[INFO] Searching for target partition on boot disk:",
  "[INFO]   PciRoot(0x0)/Pci(0x14,0x0)/USB(0x2,0x0)",
  "[INFO] Found EFI system partition:",
  "[INFO] Opening target partition: CONCERT_OS_STAGE",
  "[INFO] Launching 'efi\\boot\\bootx64.efi'...",
  "[INFO] Loading Linux 6.10.12-concert ...",
  "[INFO] Loading initial ramdisk ...",
  "[    0.000000] Linux version 6.10.12-concert (builder@concert-os)",
  "[    0.057892] secureboot: Secure boot enabled",
  "[    0.781244] systemd[1]: systemd 255.7 running in system mode",
  "[  OK  ] Reached target Local File Systems.",
  "[  OK  ] Started Journal Service.",
  "[  OK  ] Started Network Configuration.",
  "[  OK  ] Reached target Network.",
  "[  OK  ] Started Display Manager.",
  "[  OK  ] Started CONCERT device registry.",
  "[  OK  ] Started CONCERT audio routing service.",
  "[  OK  ] Started CONCERT stage display compositor.",
  "[  OK  ] Started CONCERT C loader service.",
  "[INFO] Switching to graphical target...",
];

const loadingMessages = [
  "Starting graphical target",
  "Loading compositor",
  "Mounting stage assets",
  "Loading C Festival logo",
  "Preparing CONCERT shell",
  "Starting session",
  "Verifying C module",
  "Finalizing boot",
];

export default function ScreenViewer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<ScreenState>({ mode: "message", message: "SCREEN READY" });
  const [frame, setFrame] = useState("");
  const [connected, setConnected] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const applyState = useCallback((nextState: ScreenState) => {
    // startAt is an absolute server timestamp used to sync several screens.
    // We only honor it when it lands in a short, plausible window: this keeps
    // the intended multi-screen sync (a few hundred ms) while preventing a
    // device whose clock is out of sync from stalling every update for
    // seconds or minutes. Anything else is applied immediately.
    const raw = (nextState.startAt || 0) - Date.now();
    const delay = raw > 0 && raw < 2500 ? raw : 0;
    if (!delay) {
      setState(nextState);
      return;
    }
    window.setTimeout(() => setState(nextState), delay);
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase()}/api/v1/screens/${id}/state`, { cache: "no-store" });
      if (response.ok) {
        applyState(await response.json());
        setSyncError("");
        return;
      }
    } catch {
      // Fallback below.
    }

    const snapshotResponse = await fetch(`${apiBase()}/api/v1/snapshot`, { cache: "no-store" });
    if (!snapshotResponse.ok) {
      setSyncError(`API ${snapshotResponse.status}`);
      return;
    }
    const snapshot = await snapshotResponse.json();
    const screen = snapshot.screens?.find((item: { id: string }) => item.id === id);
    if (!screen?.state) {
      setSyncError("Ecran introuvable");
      return;
    }
    applyState(screen.state);
    setSyncError("");
  }, [applyState, id]);

  const contentKey = state.mode === "stream"
    ? `stream:${state.updatedAt || ""}`
    : `${state.mode}:${state.updatedAt || state.mediaUrl || state.mediaId || state.message || state.color || ""}`;

  useEffect(() => {
    setTransitioning(true);
    const timer = window.setTimeout(() => setTransitioning(false), 720);
    return () => window.clearTimeout(timer);
  }, [contentKey]);

  useEffect(() => {
    void (async () => {
      await refreshState();
    })();
    const poll = window.setInterval(() => {
      refreshState().catch(() => {});
    }, 1000);
    const events = new EventSource(`${apiBase()}/api/v1/screens/${id}/events`);
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.addEventListener("state", (event) => {
      applyState(JSON.parse((event as MessageEvent).data));
      setConnected(true);
    });
    events.addEventListener("stream-frame", (event) => setFrame(JSON.parse((event as MessageEvent).data).frame));
    return () => {
      window.clearInterval(poll);
      events.close();
    };
  }, [applyState, id, refreshState]);

  // Frames only arrive over SSE ("stream-frame"). Behind an HTTPS->HTTP proxy
  // (e.g. Vercel rewrites) that stream can be buffered and never reaches us,
  // leaving the screen stuck on "WAITING STREAM". While in stream mode we also
  // poll the last frame directly as a reliable fallback.
  useEffect(() => {
    if (state.mode !== "stream") return;
    let active = true;
    const pollFrame = async () => {
      try {
        const response = await fetch(`${apiBase()}/api/v1/screens/${id}/frame`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active && data.frame) setFrame(data.frame);
      } catch {
        // Ignore: SSE may still be delivering frames.
      }
    };
    pollFrame();
    const timer = window.setInterval(pollFrame, 250);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [state.mode, id]);

  const fxVars = {
    background: state.mode === "color" ? state.color : undefined,
    "--fx-speed": String(clampSpeed(state.animationSpeed)),
    "--fx-color": state.animationColor || "#ff6a00",
  } as CSSProperties;

  return (
    <main className={`viewer ${state.mode} ${state.animation || ""} fx-${state.fxStyle || "neon"}`} style={fxVars}>
      <div className={`viewerStatus ${connected ? "online" : ""}`}>{connected ? "online" : "offline"}</div>
      {state.mode !== "off" && syncError && <div className="viewerSyncError">{syncError}</div>}
      <div className={`viewerTransition ${transitioning ? "active" : ""} ${state.animation || "none"}`} />
      {state.mode === "color" && <div className="viewerColorLabel">{state.color}</div>}
      {state.mode === "boot" && <BootLoader key={state.updatedAt || state.message || "boot"} message={state.message} />}
      {state.mode === "standby" && <StandbyLogo />}
      {state.mode === "message" && <div className="viewerMessage">{state.message}</div>}
      {state.mode === "menu" && <MenuScreen state={state} />}
      {state.mode === "countdown" && <CountdownScreen state={state} />}
      {state.mode === "nowplaying" && <NowPlayingScreen state={state} />}
      {state.mode === "ambient" && <AmbientScreen state={state} />}
      {state.mode === "test" && <ScreenTest test={state.test} />}
      {state.mode === "media" && state.mediaType === "image" && <StageMedia key={contentKey} state={state} kind="image" />}
      {state.mode === "media" && state.mediaType === "video" && <StageMedia key={contentKey} state={state} kind="video" />}
      {state.mode === "media" && state.mediaType === "audio" && <audio src={state.mediaUrl} autoPlay controls />}
      {state.mode === "stream" && frame && <img src={frame} alt="" />}
      {state.mode === "stream" && !frame && <div className="viewerMessage">WAITING STREAM</div>}
    </main>
  );
}

function ScreenTest({ test }: { test?: ScreenTestInfo }) {
  return (
    <section className="viewerTest">
      <div className="testGrid" />
      <div className="testCenter">
        <span>SCREEN TEST</span>
        <strong>{test?.id || "unknown"}</strong>
        <p>{test?.name || "Ecran"}</p>
      </div>
      <div className="testMeta">
        <span>X {test?.x ?? 0}</span>
        <span>Y {test?.y ?? 0}</span>
        <span>{test?.width ?? 0} x {test?.height ?? 0} blocs</span>
      </div>
      <div className="testCorners">
        <i>TL</i><i>TR</i><i>BL</i><i>BR</i>
      </div>
    </section>
  );
}

function StageMedia({ state, kind }: { state: ScreenState; kind: "image" | "video" }) {
  if (state.fit !== "stage" || !state.layout) {
    const className = state.fit === "stretch" ? "stretch" : "";
    const animatedClassName = [className, state.animation || "none"].filter(Boolean).join(" ");
    return kind === "image"
      ? <img className={animatedClassName} src={state.mediaUrl} alt="" />
      : <video className={animatedClassName} src={state.mediaUrl} autoPlay loop muted playsInline />;
  }

  const layout = state.layout;
  const stageStyle = {
    "--stage-media-width": `${(layout.stageWidth / layout.screenWidth) * 100}%`,
    "--stage-media-height": `${(layout.stageHeight / layout.screenHeight) * 100}%`,
    "--stage-media-left": `${-((layout.screenX - layout.stageX) / layout.screenWidth) * 100}%`,
    "--stage-media-top": `${-((layout.screenY - layout.stageY) / layout.screenHeight) * 100}%`,
  } as CSSProperties;

  return (
    <div className={`viewerStageMedia ${state.animation || "none"}`} style={stageStyle}>
      {kind === "image"
        ? <img src={state.mediaUrl} alt="" />
        : <video src={state.mediaUrl} autoPlay loop muted playsInline />}
    </div>
  );
}

function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function MenuScreen({ state }: { state: ScreenState }) {
  const now = useClock(1000);
  const clock = new Date(now).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <section className="viewerMenu">
      <div className="viewerMenuGlow" />
      <div className="viewerMenuScan" />
      <Image className="viewerMenuLogo" src="/logo.svg" alt="" width={280} height={280} priority />
      <p className="viewerMenuEyebrow">CONCERT OS · LIVE</p>
      <h1 className="viewerMenuTitle">{state.title || "CONCERT"}</h1>
      <p className="viewerMenuSubtitle">{state.subtitle || "Le show va commencer"}</p>
      <div className="viewerMenuClock">{clock}</div>
    </section>
  );
}

function CountdownScreen({ state }: { state: ScreenState }) {
  const now = useClock(200);
  const target = state.countdownTarget || now;
  const remaining = Math.max(0, target - now);
  const totalSeconds = Math.round(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const live = remaining <= 0;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return (
    <section className={`viewerCountdown ${live ? "live" : ""}`}>
      <div className="viewerCountdownGlow" />
      <p className="viewerCountdownLabel">{state.countdownLabel || (live ? "" : "DÉBUT DANS")}</p>
      <div className="viewerCountdownDigits">{live ? "LIVE" : `${pad(minutes)}:${pad(seconds)}`}</div>
      {state.title && <p className="viewerCountdownTitle">{state.title}</p>}
    </section>
  );
}

function NowPlayingScreen({ state }: { state: ScreenState }) {
  return (
    <section className="viewerNowPlaying">
      <div className="viewerNowPlayingBg" />
      <div className="viewerNowPlayingBars"><i /><i /><i /><i /><i /><i /><i /></div>
      <div className="viewerNowPlayingCard">
        {state.artwork
          ? <img className="viewerNowPlayingArt" src={state.artwork} alt="" />
          : <div className="viewerNowPlayingArt placeholder"><span>♪</span></div>}
        <div className="viewerNowPlayingText">
          <p className="viewerNowPlayingEyebrow">NOW PLAYING</p>
          <h1 className="viewerNowPlayingTrack">{state.track || "—"}</h1>
          <p className="viewerNowPlayingArtist">{state.artist || "Artiste"}</p>
          {state.spotifyUrl && (
            <div className="viewerNowPlayingSpotify">
              <span className="viewerSpotifyDot" /> Spotify · <code>{state.spotifyUrl.replace(/^https?:\/\//, "")}</code>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AmbientScreen({ state }: { state: ScreenState }) {
  const style = state.ambient || "grid";
  return (
    <section className={`viewerAmbient ambient-${style}`}>
      <div className="ambientLayer a" />
      <div className="ambientLayer b" />
      <div className="ambientLayer c" />
      {state.title && <div className="viewerAmbientTitle">{state.title}</div>}
    </section>
  );
}

function StandbyLogo() {
  return (
    <section className="viewerStandby">
      <Image src="/logo.svg" alt="" width={360} height={360} priority />
      <strong>CONCERT OS</strong>
    </section>
  );
}

function BootLoader({ message }: { message?: string }) {
  const [phase, setPhase] = useState<"firmware" | "os">("firmware");
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      timers.push(timer);
    });

    async function run() {
      setPhase("firmware");
      setLines([]);
      setProgress(0);

      for (const line of bootLines) {
        if (cancelled) return;
        setLines((current) => [...current.slice(-28), line]);
        await wait(line.includes("Loading Linux") ? 340 : 72);
      }

      if (cancelled) return;
      setPhase("os");
      for (let value = 0; value <= 100; value += 1) {
        if (cancelled) return;
        setProgress(value);
        await wait(value > 92 ? 58 : 26);
      }
    }

    run();
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const messageIndex = Math.min(loadingMessages.length - 1, Math.floor((progress / 101) * loadingMessages.length));

  return (
    <div className="concertBoot">
      <section className={`concertFirmware ${phase === "firmware" ? "visible" : ""}`}>
        <div className="concertAddress">&lt;https://concert-os.local/boot&gt;</div>
        <pre>
          {lines.map((line, index) => (
            <span className={line.startsWith("[INFO]") ? "dim" : ""} key={`${line}-${index}`}>{line}{"\n"}</span>
          ))}
        </pre>
        <div className="concertCursor">_</div>
      </section>

      <section className={`concertOs ${phase === "os" ? "visible" : ""}`}>
        <Image src="/logo.svg" alt="" width={180} height={180} priority />
        <strong>CONCERT OS</strong>
        <span>{message || loadingMessages[messageIndex]}</span>
        <div className="concertProgress"><i style={{ width: `${progress}%` }} /></div>
        <small>{progress}%</small>
      </section>
    </div>
  );
}
