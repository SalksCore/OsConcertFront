"use client";

import {
  Activity,
  Calendar,
  CheckCheck,
  Clapperboard,
  ImageIcon,
  KeyRound,
  Layers3,
  LayoutDashboard,
  LogIn,
  LogOut,
  MonitorCog,
  MonitorUp,
  Move,
  Palette,
  Play,
  Plus,
  Power,
  RadioTower,
  RotateCw,
  Save,
  ScanEye,
  ScreenShare,
  ScreenShareOff,
  Settings,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, PointerEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";

const CONFIGURED_API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333").replace(/\/+$/, "");

function apiBase() {
  if (typeof window !== "undefined" && window.location.protocol === "https:" && CONFIGURED_API.startsWith("http://")) {
    return "/api-proxy";
  }
  return CONFIGURED_API;
}

function apiAsset(url: string) {
  return `${apiBase()}${url}`;
}

type ScreenState = {
  mode: "off" | "boot" | "color" | "media" | "message" | "stream" | "standby" | "test";
  color?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  fit?: "contain" | "stretch" | "stage";
  layout?: StageMediaLayout;
  animation?: AnimationMode;
  message?: string;
  updatedAt?: string;
  startAt?: number;
  test?: ScreenTestInfo;
};

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

type Screen = {
  id: string;
  concertId: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
  state: ScreenState;
  online: boolean;
};

type Group = { id: string; concertId: string; name: string; color: string; screenIds: string[] };
type Media = { id: string; name: string; type: "image" | "video" | "audio"; url: string; mime: string; size: number };
type Concert = { id: string; name: string; createdAt: string };
type Snapshot = {
  settings: { activeConcertId: string; streamFps: number };
  concerts: Concert[];
  screens: Screen[];
  groups: Group[];
  media: Media[];
  events: { id: string; type: string; createdAt: string }[];
};

const emptySnapshot: Snapshot = {
  settings: { activeConcertId: "main", streamFps: 8 },
  concerts: [],
  screens: [],
  groups: [],
  media: [],
  events: [],
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

async function api(path: string, init?: RequestInit) {
  const base = apiBase();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers:
        init?.body instanceof FormData
          ? init.headers
          : { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new Error(`API inaccessible: ${base}`);
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

const MEDIA_EXTS = /\.(jpe?g|png|gif|webp|bmp|svg|avif|mov|qt|mp4|m4v|webm|mkv|avi|ogv|mp3|wav|ogg|oga|m4a|aac|flac)$/i;

function isMediaFile(file: File) {
  return /^(image|video|audio)\//.test(file.type) || MEDIA_EXTS.test(file.name);
}

function setAuthCookie(value: boolean) {
  document.cookie = `concert_os_auth=${value ? "1" : ""}; path=/; max-age=${value ? 60 * 60 * 24 * 30 : 0}; SameSite=Lax`;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("concert-os-auth-change"));
}

function hasAuthCookie() {
  return document.cookie.split("; ").some((item) => item === "concert_os_auth=1");
}

function useAuthCookie() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener("concert-os-auth-change", callback);
      window.addEventListener("focus", callback);
      return () => {
        window.removeEventListener("concert-os-auth-change", callback);
        window.removeEventListener("focus", callback);
      };
    },
    hasAuthCookie,
    () => false
  );
}

export default function Home() {
  const logged = useAuthCookie();
  const [password, setPassword] = useState("concert");
  const [view, setView] = useState("home");
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [apiError, setApiError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [color, setColor] = useState("#ff9f1a");
  const [activeMediaId, setActiveMediaId] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number; failed: number; finished?: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video" | "audio">("image");
  const [mediaFit, setMediaFit] = useState<"contain" | "stretch" | "stage">("contain");
  const [messageText, setMessageText] = useState("CONCERT OS");
  const [streamStatus, setStreamStatus] = useState("Pret a capturer une fenetre, un logiciel ou un ecran.");
  const [copiedScreenId, setCopiedScreenId] = useState("");
  const [commandStatus, setCommandStatus] = useState("");
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!logged) return;
    let active = true;

    const loadSnapshot = async () => {
      try {
        const data = await api("/api/v1/snapshot");
        if (!active) return;
        setSnapshot(data);
        setApiError("");
      } catch (error) {
        if (active) setApiError(error instanceof Error ? error.message : "API inaccessible");
      }
    };

    loadSnapshot();
    const poll = window.setInterval(loadSnapshot, 2000);

    const events = new EventSource(`${apiBase()}/api/v1/events`);
    events.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent).data));
      setApiError("");
    });

    return () => {
      active = false;
      window.clearInterval(poll);
      events.close();
    };
  }, [logged]);

  const activeConcert = snapshot.concerts.find((concert) => concert.id === snapshot.settings.activeConcertId);
  const screens = snapshot.screens.filter((screen) => screen.concertId === snapshot.settings.activeConcertId);
  const groups = snapshot.groups.filter((group) => group.concertId === snapshot.settings.activeConcertId);
  const selectedScreens = screens.filter((screen) => selected.includes(screen.id));
  const monitorColumns = screens.length <= 1 ? 1 : screens.length === 2 ? 2 : screens.length <= 6 ? 3 : 4;
  const activeMedia = snapshot.media.find((media) => media.id === activeMediaId) || snapshot.media[0];
  const filteredMedia = snapshot.media.filter((media) => mediaFilter === "all" || media.type === mediaFilter);
  const animationIsActive = (animation: AnimationMode) =>
    selectedScreens.length > 0 && selectedScreens.every((screen) => (screen.state.animation || "none") === animation);
  async function login(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api("/api/v1/login", { method: "POST", body: JSON.stringify({ password }) });
      if (result.ok) {
        setAuthCookie(true);
        setApiError("");
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Connexion API impossible");
    }
  }

  function logout() {
    setAuthCookie(false);
  }

  async function activateConcert(concertId: string) {
    setSnapshot((current) => ({ ...current, settings: { ...current.settings, activeConcertId: concertId } }));
    setSelected([]);
    await api(`/api/v1/concerts/${concertId}/activate`, { method: "POST" });
  }

  async function command(state: ScreenState, action: string = state.mode) {
    if (!selected.length) {
      setCommandStatus("Aucun ecran selectionne.");
      setView("live");
      return;
    }
    const nextState = { ...state, updatedAt: new Date().toISOString(), startAt: Date.now() + (selected.length > 1 ? 320 : 0) };
    const statesByScreen = state.mode === "media" && state.fit === "stage" && state.mediaType !== "audio"
      ? buildStageMediaStates(nextState)
      : null;
    setSnapshot((current) => ({
      ...current,
      screens: current.screens.map((screen) =>
        selected.includes(screen.id) ? { ...screen, state: statesByScreen?.[screen.id] || nextState } : screen
      ),
    }));
    setCommandStatus(`Envoi ${action} vers ${selected.length} ecran(s)...`);
    await api("/api/v1/command", {
      method: "POST",
      body: JSON.stringify(statesByScreen ? { screenIds: selected, statesByScreen, action } : { screenIds: selected, state: nextState, action }),
    });
    setCommandStatus(`${action} envoye vers ${selected.length} ecran(s).`);
  }

  async function commandStates(statesByScreen: Record<string, ScreenState>, action: string, label: string) {
    setSnapshot((current) => ({
      ...current,
      screens: current.screens.map((screen) =>
        statesByScreen[screen.id] ? { ...screen, state: statesByScreen[screen.id] } : screen
      ),
    }));
    setCommandStatus(`${label} envoye vers ${Object.keys(statesByScreen).length} ecran(s)...`);
    await api("/api/v1/command", { method: "POST", body: JSON.stringify({ screenIds: Object.keys(statesByScreen), statesByScreen, action }) });
    setCommandStatus(`${label} actif sur ${Object.keys(statesByScreen).length} ecran(s).`);
  }

  async function toggleAnimation(animation: AnimationMode) {
    if (!selected.length) {
      setCommandStatus("Aucun ecran selectionne.");
      setView("live");
      return;
    }
    const startAt = Date.now() + (selected.length > 1 ? 320 : 0);
    const updatedAt = new Date().toISOString();
    const statesByScreen = Object.fromEntries(
      selectedScreens.map((screen) => [
        screen.id,
        {
          ...screen.state,
          animation: screen.state.animation === animation ? "none" : animation,
          updatedAt,
          startAt,
        },
      ])
    );
    await commandStates(statesByScreen, `toggle-${animation}`, animation);
  }

  async function screenTest() {
    if (!selected.length) {
      setCommandStatus("Aucun ecran selectionne.");
      setView("live");
      return;
    }
    const startAt = Date.now() + (selected.length > 1 ? 320 : 0);
    const statesByScreen = Object.fromEntries(
      selectedScreens.map((screen) => [
        screen.id,
        {
          mode: "test" as const,
          animation: "none" as const,
          updatedAt: new Date().toISOString(),
          startAt,
          test: {
            id: screen.id,
            name: screen.name,
            x: Math.round(screen.x),
            y: Math.round(screen.y),
            width: screen.width,
            height: screen.height,
          },
        },
      ])
    );
    await commandStates(statesByScreen, "screen-test", "Screen test");
  }

  function buildStageMediaStates(baseState: ScreenState): Record<string, ScreenState> {
    const selectedLayoutScreens = selectedScreens.length ? selectedScreens : screens.filter((screen) => selected.includes(screen.id));
    const rects = selectedLayoutScreens.map((screen) => ({
      id: screen.id,
      x: screen.x,
      y: screen.y,
      width: screen.width * 18,
      height: screen.height * 18,
    }));
    const stageX = Math.min(...rects.map((rect) => rect.x));
    const stageY = Math.min(...rects.map((rect) => rect.y));
    const stageWidth = Math.max(...rects.map((rect) => rect.x + rect.width)) - stageX;
    const stageHeight = Math.max(...rects.map((rect) => rect.y + rect.height)) - stageY;
    return Object.fromEntries(
      rects.map((rect) => [
        rect.id,
        {
          ...baseState,
          layout: {
            screenX: rect.x,
            screenY: rect.y,
            screenWidth: rect.width,
            screenHeight: rect.height,
            stageX,
            stageY,
            stageWidth,
            stageHeight,
          },
        },
      ])
    );
  }

  async function createScreen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await api("/api/v1/screens", {
      method: "POST",
      body: JSON.stringify({
        concertId: snapshot.settings.activeConcertId,
        name: form.get("name"),
        width: Number(form.get("width")),
        height: Number(form.get("height")),
      }),
    });
    formElement.reset();
  }

  async function deleteScreen(screen: Screen) {
    if (!window.confirm(`Supprimer l'ecran "${screen.name}" ?`)) return;
    await api(`/api/v1/screens/${screen.id}`, { method: "DELETE" });
    setSelected((current) => current.filter((id) => id !== screen.id));
  }

  async function copyScreenLink(screen: Screen) {
    const link = `${window.location.origin}/screen/${screen.id}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const input = document.createElement("input");
      input.value = link;
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopiedScreenId(screen.id);
    window.setTimeout(() => setCopiedScreenId((current) => (current === screen.id ? "" : current)), 1600);
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await api("/api/v1/groups", {
      method: "POST",
      body: JSON.stringify({
        concertId: snapshot.settings.activeConcertId,
        name: form.get("name"),
        color: form.get("color"),
        screenIds: selected,
      }),
    });
    formElement.reset();
  }

  async function createConcert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await api("/api/v1/concerts", {
      method: "POST",
      body: JSON.stringify({ name: form.get("name") || "Nouveau concert" }),
    });
    setSelected([]);
    formElement.reset();
  }

  async function renameConcert(concert: Concert) {
    const name = window.prompt("Nouveau nom du concert", concert.name);
    if (!name) return;
    await api(`/api/v1/concerts/${concert.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
  }

  async function deleteConcert(concert: Concert) {
    if (!window.confirm(`Supprimer le concert "${concert.name}" et ses ecrans ?`)) return;
    await api(`/api/v1/concerts/${concert.id}`, { method: "DELETE" });
    setSelected([]);
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const nameInput = formElement.elements.namedItem("name") as HTMLInputElement | null;
    const fileInput = formElement.elements.namedItem("file") as HTMLInputElement | null;
    const files = Array.from(fileInput?.files || []);
    if (!files.length) return;
    const customName = nameInput?.value.trim() || "";
    await uploadFiles(files, customName);
    formElement.reset();
  }

  async function deleteMedia(media: Media) {
    if (!window.confirm(`Supprimer le media "${media.name}" ?`)) return;
    await api(`/api/v1/media/${media.id}`, { method: "DELETE" });
    if (activeMediaId === media.id) setActiveMediaId("");
  }

  async function uploadFiles(files: File[], customName = "") {
    const total = files.length;
    let done = 0;
    let failed = 0;
    let lastId = "";
    setUploadProgress({ done: 0, total, failed: 0 });

    const queue = [...files];
    const concurrency = Math.min(4, total);

    async function worker() {
      for (;;) {
        const file = queue.shift();
        if (!file) return;
        const form = new FormData();
        // Un seul nom personnalise n'a de sens que pour un fichier unique ;
        // sinon on garde le nom d'origine de chaque fichier.
        if (customName && total === 1) form.append("name", customName);
        form.append("file", file);
        try {
          const media = await api("/api/v1/media", { method: "POST", body: form });
          lastId = media.id;
        } catch {
          failed += 1;
        } finally {
          done += 1;
          setUploadProgress({ done, total, failed });
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    if (lastId) setActiveMediaId(lastId);
    setUploadProgress({ done, total, failed, finished: true });
    setTimeout(() => setUploadProgress(null), 4000);
  }

  async function startStream() {
    if (!selected.length) {
      setStreamStatus("Selectionne au moins un ecran avant de lancer le stream.");
      setView("live");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStreamStatus("Capture indisponible: ouvre l'app via http://localhost:3000 dans un navigateur compatible.");
      return;
    }

    try {
      setStreamStatus("Choisis la fenetre, le logiciel ou l'ecran a diffuser...");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", stopStream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
      setStreamStatus("Stream actif. Les frames sont envoyees aux ecrans selectionnes.");
      await command({ mode: "stream" }, "stream");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      const sendFrame = async () => {
        if (!streamRef.current || !videoRef.current || !context) return;
        canvas.width = videoRef.current.videoWidth || 1280;
        canvas.height = videoRef.current.videoHeight || 720;
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        await api("/api/v1/stream/frame", {
          method: "POST",
          body: JSON.stringify({ screenIds: selected, frame: canvas.toDataURL("image/jpeg", 0.68) }),
        }).catch(() => {});
        if (streamRef.current) window.setTimeout(sendFrame, 1000 / snapshot.settings.streamFps);
      };
      sendFrame();
    } catch (error) {
      setStreaming(false);
      setStreamStatus(error instanceof Error ? `Stream annule ou refuse: ${error.message}` : "Stream annule ou refuse.");
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStreaming(false);
    setStreamStatus("Stream arrete.");
  }

  function toggleScreen(screenId: string) {
    setSelected((current) =>
      current.includes(screenId) ? current.filter((id) => id !== screenId) : [...current, screenId]
    );
  }

  if (!logged) {
    return (
      <main className="login">
        <form className="loginCard" onSubmit={login}>
          <Image src="/logo.svg" alt="" width={88} height={88} />
          <p className="eyebrow">CONCERT OS</p>
          <h1>Regie ecrans</h1>
          <p className="muted">Controle professionnel des ecrans Minecraft, medias, sons, groupes et flux live.</p>
          <p className="hint">Mot de passe par defaut: <strong>concert</strong></p>
          {apiError && <p className="apiError">{apiError}</p>}
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          <button className="primary"><LogIn size={18} /> Connexion</button>
        </form>
      </main>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Image src="/logo.svg" alt="" width={46} height={46} />
          <div><strong>Concert OS</strong><span>ADMIN</span></div>
        </div>
        {[
          ["home", LayoutDashboard, "Accueil"],
          ["concerts", Calendar, "Concerts"],
          ["screens", MonitorCog, "Ecrans"],
          ["stage", Move, "Plan scene"],
          ["groups", Layers3, "Groupes"],
          ["media", ImageIcon, "Medias"],
          ["live", RadioTower, "Selection live"],
          ["regie", Palette, "Commandes"],
          ["monitor", ScanEye, "Monitoring"],
          ["settings", Settings, "Parametres"],
        ].map(([id, Icon, label]) => (
          <button key={String(id)} className={cx("nav", view === id && "active")} onClick={() => setView(String(id))}>
            <Icon size={18} /> {String(label)}
          </button>
        ))}
        <button className="logout" onClick={logout}><LogOut size={18} /> Deconnexion</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Administration</p>
            <h2>{activeConcert?.name || "Concert"}</h2>
          </div>
          <div className="topActions">
            <select value={snapshot.settings.activeConcertId} onChange={(e) => activateConcert(e.target.value)}>
              {snapshot.concerts.map((concert) => <option key={concert.id} value={concert.id}>{concert.name}</option>)}
            </select>
            <button className="ghost" onClick={() => setView("concerts")}><Plus size={16} /> Concert</button>
            <span className="badge ok">{screens.filter((screen) => screen.online).length} en ligne</span>
          </div>
        </header>
        {apiError && <div className="apiBanner">{apiError}</div>}

        {view === "home" && (
          <section className="page">
            <div className="hero">
              <div>
                <p className="eyebrow">Regie geante</p>
                <h1>{activeConcert?.name || "Concert DS"}</h1>
                <p className="muted">Selectionne des groupes ou des ecrans seuls, puis envoie couleur, image, video, son ou flux live instantanement.</p>
              </div>
              <button className="primary" onClick={() => setView("live")}><RadioTower size={18} /> Selectionner les ecrans</button>
            </div>
            <div className="stats">
              <Stat label="Ecrans" value={screens.length} />
              <Stat label="Groupes" value={groups.length} />
              <Stat label="Medias" value={snapshot.media.length} />
              <Stat label="Actions" value={snapshot.events.length} />
            </div>
            <div className="split">
              <Panel title="Dernieres actions" icon={<Activity size={18} />}>
                {snapshot.events.slice(0, 8).map((event) => <div className="item" key={event.id}><strong>{event.type}</strong><span>{new Date(event.createdAt).toLocaleTimeString("fr-FR")}</span></div>)}
              </Panel>
              <Panel title="Liens MWebDisplay" icon={<Clapperboard size={18} />}>
                {screens.map((screen) => <div className="item" key={screen.id}><strong>{screen.name}</strong><code>{location.origin}/screen/{screen.id}</code></div>)}
              </Panel>
            </div>
          </section>
        )}

        {view === "concerts" && (
          <section className="page">
            <Panel title="Gestion des concerts" icon={<Calendar size={18} />}>
              <form className="formGrid compact" onSubmit={createConcert}>
                <input name="name" placeholder="Nom du concert" required />
                <button className="primary"><Plus size={16} /> Creer le concert</button>
              </form>
            </Panel>
            <div className="cards">
              {snapshot.concerts.map((concert) => {
                const concertScreens = snapshot.screens.filter((screen) => screen.concertId === concert.id);
                const concertGroups = snapshot.groups.filter((group) => group.concertId === concert.id);
                const active = concert.id === snapshot.settings.activeConcertId;
                return (
                  <article className={cx("concertCard", active && "selected")} key={concert.id}>
                    <div>
                      <p className="eyebrow">{active ? "Actif" : "Concert"}</p>
                      <h3>{concert.name}</h3>
                      <span>{concertScreens.length} ecran(s) - {concertGroups.length} groupe(s)</span>
                    </div>
                    <div className="buttonGrid">
                      <button className={active ? "primary" : ""} onClick={() => activateConcert(concert.id)}>
                        {active ? "Selectionne" : "Activer"}
                      </button>
                      <button onClick={() => renameConcert(concert)}>Renommer</button>
                      <button className="danger" onClick={() => deleteConcert(concert)}><Trash2 size={16} /> Supprimer</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === "screens" && (
          <section className="page">
            <Panel title="Creer un ecran" icon={<MonitorUp size={18} />}>
              <form className="formGrid" onSubmit={createScreen}>
                <input name="name" placeholder="Nom de l'ecran" required />
                <label className="fieldLabel">Largeur en blocs<input name="width" type="number" min="1" defaultValue="8" /></label>
                <label className="fieldLabel">Hauteur en blocs<input name="height" type="number" min="1" defaultValue="5" /></label>
                <button className="primary"><Plus size={16} /> Ajouter</button>
              </form>
              <p className="hint">L&apos;identifiant technique est genere automatiquement par le site. Largeur = nombre de blocs horizontal, hauteur = nombre de blocs vertical.</p>
            </Panel>
            <div className="cards">
              {screens.map((screen) => (
                <ScreenCard
                  key={screen.id}
                  screen={screen}
                  selected={selected.includes(screen.id)}
                  onClick={() => toggleScreen(screen.id)}
                  onDelete={() => deleteScreen(screen)}
                  onCopyLink={() => copyScreenLink(screen)}
                  copied={copiedScreenId === screen.id}
                />
              ))}
            </div>
          </section>
        )}

        {view === "stage" && (
          <section className="page">
            <Panel title="Plan drag and drop" icon={<Move size={18} />}>
              <Stage screens={screens} selected={selected} onToggle={toggleScreen} editable />
            </Panel>
          </section>
        )}

        {view === "groups" && (
          <section className="page">
            <Panel title="Creer un groupe depuis la selection" icon={<Layers3 size={18} />}>
              <form className="formGrid" onSubmit={createGroup}>
                <input name="name" placeholder="Nom du groupe" required />
                <input name="color" type="color" defaultValue="#ff9f1a" />
                <button className="primary"><Plus size={16} /> Creer avec {selected.length} ecran(s)</button>
              </form>
            </Panel>
            <div className="cards">
              {groups.map((group) => (
                <button className="groupCard" key={group.id} onClick={() => setSelected(group.screenIds)}>
                  <span style={{ background: group.color }} />
                  <strong>{group.name}</strong>
                  <small>{group.screenIds.length} ecran(s)</small>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "media" && (
          <section className="page">
            <Panel title="Uploader image, video ou son (plusieurs a la fois)" icon={<Upload size={18} />}>
              <form className="uploadRow" onSubmit={uploadMedia}>
                <input name="name" placeholder="Nom visible (fichier unique)" />
                <input name="file" type="file" accept="image/*,video/*,audio/*,.mov,.qt,.mkv,.m4v,.avi" multiple required />
                <button className="primary"><Upload size={16} /> Uploader</button>
              </form>
              <div
                className={cx("dropZone", dragging && "dragging")}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const files = Array.from(e.dataTransfer.files).filter(isMediaFile);
                  if (files.length) void uploadFiles(files);
                }}
              >
                <Upload size={18} /> Glisse-depose tes fichiers ici (ou selectionne-en plusieurs ci-dessus)
              </div>
              {uploadProgress && (
                <div className="uploadStatus">
                  <div className="uploadBar">
                    <div className="uploadBarFill" style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }} />
                  </div>
                  <p className="muted">
                    {uploadProgress.finished
                      ? `Termine : ${uploadProgress.done - uploadProgress.failed}/${uploadProgress.total} uploades${uploadProgress.failed ? ` — ${uploadProgress.failed} echec(s)` : ""}`
                      : `Upload en cours… ${uploadProgress.done}/${uploadProgress.total}${uploadProgress.failed ? ` (${uploadProgress.failed} echec(s))` : ""}`}
                  </p>
                </div>
              )}
            </Panel>
            <div className="mediaLayout">
              <div className="mediaLibrary">
                <MediaTabs value={mediaFilter} onChange={setMediaFilter} counts={snapshot.media} />
                <MediaGrid media={filteredMedia} activeId={activeMediaId} onPick={setActiveMediaId} onDelete={deleteMedia} />
              </div>
              <Panel title="Previsualisation" icon={<Play size={18} />}>
                <MediaPreview media={activeMedia} />
              </Panel>
            </div>
          </section>
        )}

        {view === "live" && (
          <section className="page">
            <Panel title="Selection live" icon={<RadioTower size={18} />}>
              <div className="groupStrip">
                {groups.map((group) => <button key={group.id} onClick={() => setSelected(group.screenIds)} style={{ borderColor: group.color }}>{group.name}</button>)}
                <button onClick={() => setSelected(screens.map((screen) => screen.id))}><CheckCheck size={15} /> Tous</button>
                <button onClick={() => setSelected([])}>Aucun</button>
              </div>
              <Stage screens={screens} selected={selected} onToggle={toggleScreen} />
              <div className="selectionFooter">
                <strong>{selectedScreens.length} ecran(s) selectionne(s)</strong>
                <button className="primary" onClick={() => setView("regie")}><Palette size={16} /> Aller aux commandes</button>
              </div>
            </Panel>
          </section>
        )}

        {view === "regie" && (
          <section className="page commandPage">
            <div className="commandShell">
              <header className="commandHeader">
                <div className="commandTitleBlock">
                  <p className="eyebrow">Regie</p>
                  <h2>Commandes</h2>
                  <p className="muted">Interface compacte. Tout tient sur l’ecran; seul le choix des medias peut defiler.</p>
                </div>
                <div className="commandHeaderActions">
                  <div className="selectedBox">{selectedScreens.length} ecran(s) selectionne(s)</div>
                  <button onClick={() => setView("live")}><RadioTower size={15} /> Ecrans</button>
                  <button onClick={() => setView("monitor")}><MonitorUp size={15} /> Monitoring</button>
                </div>
              </header>

              <div className="commandWorkspace">
                <aside className="commandSidebar">
                  <section className="commandBlock">
                    <div className="commandBlockHead">
                      <span>Selection</span>
                      <div className="commandBlockActions">
                        <button onClick={() => setSelected(screens.map((screen) => screen.id))}><CheckCheck size={13} /> Tous</button>
                        <button onClick={() => setSelected([])}>Aucun</button>
                      </div>
                    </div>
                    {commandStatus && <div className="commandStatus">{commandStatus}</div>}
                    <div className="selectedChips">
                      {selectedScreens.map((screen) => <button key={screen.id} onClick={() => toggleScreen(screen.id)}>{screen.name}</button>)}
                      {!selectedScreens.length && <span>Aucun ecran selectionne. Choisis un groupe ou un ecran.</span>}
                    </div>
                    <div className="groupStrip compactGroupStrip">
                      {groups.map((group) => <button key={group.id} onClick={() => setSelected(group.screenIds)} style={{ borderColor: group.color }}>{group.name}</button>)}
                      <button onClick={() => setView("live")}><RadioTower size={15} /> Voir les ecrans</button>
                    </div>
                    <div className="screenPicker compactPicker">
                      <div className="screenPickerHead">
                        <span>Ecrans</span>
                      </div>
                      <div className="screenPickerGrid compactGrid">
                        {screens.length === 0 && <span className="muted">Aucun ecran dans ce concert.</span>}
                        {screens.map((screen) => (
                          <button key={screen.id} className={cx("screenPickerKey", selected.includes(screen.id) && "selected")} onClick={() => toggleScreen(screen.id)}>{screen.name}</button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="commandBlock">
                    <p className="moduleTitle"><Power size={16} /> Alimentation</p>
                    <div className="deckGrid commandDeckGrid compactDeckGrid">
                      <button className="deckKey" onClick={() => command({ mode: "boot" }, "boot")}><Power size={22} /><strong>Boot</strong></button>
                      <button className="deckKey" onClick={() => command({ mode: "boot", message: "Restarting" }, "restart")}><RotateCw size={22} /><strong>Restart</strong></button>
                      <button className="deckKey" onClick={() => command({ mode: "standby" }, "standby")}><RadioTower size={22} /><strong>Standby</strong></button>
                      <button className="deckKey" onClick={screenTest}><Clapperboard size={22} /><strong>Screen test</strong></button>
                      <button className="deckKey danger" onClick={() => command({ mode: "off" }, "off")}><ScreenShareOff size={22} /><strong>Off</strong></button>
                    </div>
                  </section>

                  <section className="commandBlock">
                    <p className="moduleTitle"><Palette size={16} /> Couleur directe</p>
                    <div className="colorConsole commandColorConsole">
                      <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
                      <div className="colorPreview" style={{ background: color }} />
                      <button className="primary" onClick={() => command({ mode: "color", color, animation: "none" }, "color")}><Palette size={16} /> Envoyer</button>
                    </div>
                    <div className="presetGrid commandPresetGrid">
                      {["#000000", "#ffffff", "#ff6a00", "#f4b23b", "#ff2f2f", "#13d18d", "#2878ff", "#9b4dff"].map((preset) => (
                        <button key={preset} style={{ background: preset }} onClick={() => setColor(preset)} aria-label={preset} />
                      ))}
                    </div>
                    <div className="messageConsole compactMessageConsole">
                      <input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Message texte" />
                      <button onClick={() => command({ mode: "message", message: messageText }, "message")}>Afficher texte</button>
                    </div>
                  </section>

                  <section className="commandBlock">
                    <p className="moduleTitle"><WandSparkles size={16} /> Animations</p>
                    <div className="deckGrid commandFxGrid">
                      {["none", "pulse", "scan", "strobe", "flash", "glitch", "wipe", "bars", "zoom"].map((animation) => (
                        <button className={cx("deckKey", animationIsActive(animation as AnimationMode) && "activeDeck")} key={`fx-core-${animation}`} onClick={() => toggleAnimation(animation as AnimationMode)}>
                          <WandSparkles size={18} /><strong>{animation}</strong>
                        </button>
                      ))}
                    </div>
                    <div className="deckGrid commandFxGrid advancedDeck">
                      {["rise", "fall", "left", "right", "up", "down", "glow", "grid", "pixel", "wave", "drift", "shake", "stair", "tilt", "orbit", "iris", "matrix", "scanline", "lift", "drop"].map((animation) => (
                        <button className={cx("deckKey", animationIsActive(animation as AnimationMode) && "activeDeck")} key={`fx-${animation}`} onClick={() => toggleAnimation(animation as AnimationMode)}>
                          <WandSparkles size={18} /><strong>{animation}</strong>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="commandBlock">
                    <p className="moduleTitle"><ScreenShare size={16} /> Capture ecran en direct</p>
                    <div className="deckGrid commandDeckGrid compactDeckGrid">
                      <button className="deckKey primaryDeck" onClick={startStream} disabled={streaming}><ScreenShare size={22} /><strong>Choisir source</strong></button>
                      <button className="deckKey danger" onClick={stopStream}><ScreenShareOff size={22} /><strong>Stop</strong></button>
                    </div>
                    <p className="streamStatus compactStreamStatus">{streamStatus}</p>
                    <video className="commandStreamPreview" ref={videoRef} muted autoPlay playsInline />
                  </section>
                </aside>

                <section className="commandMediaPane">
                  <div className="commandMediaShell">
                    <div className="commandMediaHead">
                      <div>
                        <p className="eyebrow">Mediatheque</p>
                        <h3>Choix des medias</h3>
                      </div>
                      <div className="commandMediaActions">
                        <button className={cx(mediaFit === "contain" && "active")} onClick={() => setMediaFit("contain")}>Adapter</button>
                        <button className={cx(mediaFit === "stretch" && "active")} onClick={() => setMediaFit("stretch")}>Etirer</button>
                        <button className={cx(mediaFit === "stage" && "active")} onClick={() => setMediaFit("stage")}>Plan</button>
                      </div>
                    </div>

                    <div className="commandMediaBody">
                      <div className="commandMediaList">
                        <MediaTabs value={mediaFilter} onChange={setMediaFilter} counts={snapshot.media} />
                        <div className="commandMediaScroller">
                          <MediaGrid media={filteredMedia} activeId={activeMediaId} onPick={setActiveMediaId} compact deck />
                        </div>
                      </div>

                      <div className="commandPreviewColumn">
                        <div className="buttonGrid commandActionGrid">
                          <button className="primary" onClick={() => activeMedia && command({ mode: "media", mediaId: activeMedia.id, mediaUrl: apiAsset(activeMedia.url), mediaType: activeMedia.type, fit: mediaFit }, "media")}><Play size={16} /> Envoyer le media</button>
                          <button onClick={() => activeMedia && command({ mode: "media", mediaId: activeMedia.id, mediaUrl: apiAsset(activeMedia.url), mediaType: activeMedia.type, fit: "stage" }, "stretch")}>Plein ecran plan</button>
                        </div>
                        <Panel title="Previsualisation" icon={<Play size={18} />}>
                          <MediaPreview media={activeMedia} />
                        </Panel>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </section>
        )}

        {view === "settings" && (
          <section className="page">
            <Panel title="Mot de passe unique" icon={<KeyRound size={18} />}>
              <PasswordForm />
            </Panel>
          </section>
        )}

        {view === "monitor" && (
          <section className="monitorOnly">
            <div className="monitorDock">
              <button className="monitorDockButton" onClick={() => setView("regie")} aria-label="Retour regie"><Palette size={16} /></button>
              <button className="monitorDockButton" onClick={() => setView("live")} aria-label="Selection live"><RadioTower size={16} /></button>
            </div>
            <div
              className="monitorBoard"
              style={{ gridTemplateColumns: `repeat(${monitorColumns}, minmax(0, 1fr))` }}
            >
              {screens.length === 0 && <div className="monitorEmpty">Aucun ecran dans ce concert.</div>}
              {screens.map((screen) => (
                <article className="monitorTile" key={screen.id}>
                  <div className="monitorFrame">
                    <div className="monitorFrameLabel">
                      <strong>{screen.name}</strong>
                    </div>
                    <iframe
                      src={`/screen/${screen.id}`}
                      title={screen.name}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <article className="stat"><span>{label}</span><strong>{value}</strong></article>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><h3>{icon}{title}</h3>{children}</section>;
}

function ScreenCard({
  screen,
  selected,
  onClick,
  onDelete,
  onCopyLink,
  copied,
}: {
  screen: Screen;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  copied: boolean;
}) {
  return (
    <article className={cx("screenCard", selected && "selected")}>
      <button className="screenSelect" onClick={onClick}>
        <div><strong>{screen.name}</strong><span>{screen.id}</span></div>
        <small>{screen.width} x {screen.height} blocs</small>
        <b className={screen.online ? "online" : ""}>{screen.online ? "online" : "offline"}</b>
      </button>
      <div className="screenActions">
        <button className={cx("screenLink", copied && "copied")} onClick={onCopyLink}>
          <Clapperboard size={16} /> {copied ? "Copie" : "Lien diffusion"}
        </button>
        <button className="screenDelete danger" onClick={onDelete}><Trash2 size={16} /> Supprimer</button>
      </div>
    </article>
  );
}

function Stage({ screens, selected, onToggle, editable = false }: { screens: Screen[]; selected: string[]; onToggle: (id: string) => void; editable?: boolean }) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [focusedId, setFocusedId] = useState("");
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean; x: number; y: number } | null>(null);
  const skipClickRef = useRef(false);
  const focusedScreen = screens.find((screen) => screen.id === focusedId) ?? screens.find((screen) => selected.includes(screen.id));
  const layoutSignature = screens.map((screen) => `${screen.id}:${screen.x}:${screen.y}:${screen.width}:${screen.height}`).join("|");

  useEffect(() => {
    if (dragRef.current) return;
    setPositions((current) => {
      const next = { ...current };
      const screenIds = new Set(screens.map((screen) => screen.id));
      Object.keys(next).forEach((id) => {
        if (!screenIds.has(id)) delete next[id];
      });
      screens.forEach((screen) => {
        next[screen.id] = { x: screen.x, y: screen.y };
      });
      return next;
    });
  }, [layoutSignature]);

  function move(screen: Screen, event: PointerEvent<HTMLButtonElement>) {
    if (!editable || !dragRef.current || dragRef.current.id !== screen.id) return;
    const parent = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const x = Math.max(0, event.clientX - parent.left - dragRef.current.dx);
    const y = Math.max(0, event.clientY - parent.top - dragRef.current.dy);
    dragRef.current = { ...dragRef.current, moved: true, x, y };
    setPositions((current) => ({ ...current, [screen.id]: { x, y } }));
  }

  async function endDrag(screen: Screen) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!editable || !drag || drag.id !== screen.id || !drag.moved) return;
    skipClickRef.current = true;
    window.setTimeout(() => {
      skipClickRef.current = false;
    }, 0);
    await api(`/api/v1/screens/${screen.id}`, { method: "PATCH", body: JSON.stringify({ x: drag.x, y: drag.y }) }).catch(() => {});
  }

  return (
    <div className="stageWrap">
      <div className="stageInspector">
        {focusedScreen ? (
          <>
            <div>
              <span>Ecran selectionne</span>
              <strong>{focusedScreen.name}</strong>
            </div>
            <code>{focusedScreen.id}</code>
            <small>{focusedScreen.width} x {focusedScreen.height} blocs</small>
            <small>
              X {Math.round(positions[focusedScreen.id]?.x ?? focusedScreen.x)} / Y {Math.round(positions[focusedScreen.id]?.y ?? focusedScreen.y)}
            </small>
            <small>{selected.length} selectionne(s)</small>
            <b className={focusedScreen.online ? "online" : ""}>{focusedScreen.online ? "online" : "offline"}</b>
          </>
        ) : (
          <span>Clique sur plusieurs ecrans pour les selectionner. Maintiens et glisse pour deplacer un ecran.</span>
        )}
      </div>
      <div className="stage">
        {screens.map((screen) => (
          <button
            key={screen.id}
            className={cx("stageScreen", selected.includes(screen.id) && "selected", focusedScreen?.id === screen.id && "focused", screen.online && "online")}
            style={{ left: positions[screen.id]?.x ?? screen.x, top: positions[screen.id]?.y ?? screen.y, width: screen.width * 18, height: screen.height * 18 }}
            title={`${screen.name} - ${screen.id} - ${screen.width}x${screen.height} blocs`}
            aria-label={`${screen.name}, ${screen.width} par ${screen.height} blocs`}
            onClick={() => {
              if (skipClickRef.current) return;
              setFocusedId(screen.id);
              onToggle(screen.id);
            }}
            onPointerDown={(event) => {
              if (!editable) return;
              const rect = event.currentTarget.getBoundingClientRect();
              dragRef.current = { id: screen.id, dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false, x: screen.x, y: screen.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => move(screen, event)}
            onPointerUp={() => void endDrag(screen)}
            onPointerCancel={() => void endDrag(screen)}
          >
            <strong>{screen.name}</strong>
            <span>{screen.width}x{screen.height}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MediaTabs({
  value,
  onChange,
  counts,
}: {
  value: "all" | "image" | "video" | "audio";
  onChange: (value: "all" | "image" | "video" | "audio") => void;
  counts: Media[];
}) {
  const count = (type: "all" | "image" | "video" | "audio") =>
    type === "all" ? counts.length : counts.filter((media) => media.type === type).length;
  const tabs: Array<["all" | "image" | "video" | "audio", string]> = [
    ["all", "Tous"],
    ["image", "Images"],
    ["video", "Videos"],
    ["audio", "Audio"],
  ];

  return (
    <div className="mediaTabs">
      {tabs.map(([type, label]) => (
        <button key={type} className={cx(value === type && "active")} onClick={() => onChange(type)}>
          {label}
          <span>{count(type)}</span>
        </button>
      ))}
    </div>
  );
}

function MediaGrid({
  media,
  activeId,
  onPick,
  onDelete,
  compact = false,
  deck = false,
}: {
  media: Media[];
  activeId: string;
  onPick: (id: string) => void;
  onDelete?: (media: Media) => void;
  compact?: boolean;
  deck?: boolean;
}) {
  if (!media.length) {
    return <div className="emptyState">Aucun media dans cette categorie.</div>;
  }

  return (
    <div className={cx("mediaGrid", compact && "compact", deck && "deckMediaGrid")}>
      {media.map((item) => (
        <div key={item.id} className="mediaCardWrap">
          <button className={cx("mediaCard", deck && "deckMediaKey", activeId === item.id && "selected")} onClick={() => onPick(item.id)}>
            {item.type === "image" && <img src={apiAsset(item.url)} alt="" />}
            {item.type === "video" && <video src={apiAsset(item.url)} muted />}
            {item.type === "audio" && <div className="audioTile">AUDIO</div>}
            <strong>{item.name}</strong>
            <span>{item.type}</span>
          </button>
          {onDelete && (
            <button
              className="mediaDelete"
              title="Supprimer ce media"
              onClick={(event) => { event.stopPropagation(); onDelete(item); }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function MediaPreview({ media }: { media?: Media }) {
  if (!media) {
    return <div className="mediaPreview empty">Aucun media selectionne.</div>;
  }

  return (
    <div className="mediaPreview">
      {media.type === "image" && <img src={apiAsset(media.url)} alt="" />}
      {media.type === "video" && <video src={apiAsset(media.url)} controls />}
      {media.type === "audio" && <audio src={apiAsset(media.url)} controls />}
      <div>
        <strong>{media.name}</strong>
        <span>{media.type} - {Math.ceil(media.size / 1024)} Ko</span>
      </div>
    </div>
  );
}

function PasswordForm() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await api("/api/v1/settings/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: form.get("currentPassword"), nextPassword: form.get("nextPassword") }),
    });
    setMessage("Mot de passe change.");
    formElement.reset();
  }
  return (
    <form className="formGrid" onSubmit={submit}>
      <input name="currentPassword" type="password" placeholder="Mot de passe actuel" required />
      <input name="nextPassword" type="password" placeholder="Nouveau mot de passe" required />
      <button className="primary"><Save size={16} /> Changer</button>
      <p className="muted">{message}</p>
    </form>
  );
}
