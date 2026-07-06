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
  ScreenShare,
  ScreenShareOff,
  Settings,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333";

type ScreenState = {
  mode: "off" | "boot" | "color" | "media" | "message" | "stream";
  color?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  fit?: "contain" | "stretch";
  animation?: "none" | "pulse" | "scan";
  message?: string;
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
  events: { id: string; type: string; payload: string; createdAt: string }[];
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
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function setAuthCookie(value: boolean) {
  document.cookie = `concert_os_auth=${value ? "1" : ""}; path=/; max-age=${value ? 60 * 60 * 24 * 30 : 0}; SameSite=Lax`;
}

function hasAuthCookie() {
  return document.cookie.split("; ").some((item) => item === "concert_os_auth=1");
}

export default function Home() {
  const [logged, setLogged] = useState(false);
  const [password, setPassword] = useState("concert");
  const [view, setView] = useState("home");
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selected, setSelected] = useState<string[]>([]);
  const [color, setColor] = useState("#ff9f1a");
  const [activeMediaId, setActiveMediaId] = useState("");
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (hasAuthCookie()) setLogged(true);
  }, []);

  useEffect(() => {
    if (!logged) return;
    api("/api/v1/snapshot").then(setSnapshot).catch(console.error);
    const events = new EventSource(`${API}/api/v1/events`);
    events.addEventListener("snapshot", (event) => setSnapshot(JSON.parse((event as MessageEvent).data)));
    return () => events.close();
  }, [logged]);

  const activeConcert = snapshot.concerts.find((concert) => concert.id === snapshot.settings.activeConcertId);
  const screens = snapshot.screens.filter((screen) => screen.concertId === snapshot.settings.activeConcertId);
  const groups = snapshot.groups.filter((group) => group.concertId === snapshot.settings.activeConcertId);
  const selectedScreens = screens.filter((screen) => selected.includes(screen.id));
  const activeMedia = snapshot.media.find((media) => media.id === activeMediaId) || snapshot.media[0];

  async function login(event: FormEvent) {
    event.preventDefault();
    const result = await api("/api/v1/login", { method: "POST", body: JSON.stringify({ password }) });
    if (result.ok) {
      setAuthCookie(true);
      setLogged(true);
    }
  }

  function logout() {
    setAuthCookie(false);
    setLogged(false);
  }

  async function activateConcert(concertId: string) {
    setSnapshot((current) => ({ ...current, settings: { ...current.settings, activeConcertId: concertId } }));
    setSelected([]);
    await api(`/api/v1/concerts/${concertId}/activate`, { method: "POST" });
  }

  async function command(state: ScreenState, action: string = state.mode) {
    if (!selected.length) return;
    await api("/api/v1/command", { method: "POST", body: JSON.stringify({ screenIds: selected, state, action }) });
  }

  async function createScreen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/v1/screens", {
      method: "POST",
      body: JSON.stringify({
        concertId: snapshot.settings.activeConcertId,
        name: form.get("name"),
        id: form.get("id"),
        width: Number(form.get("width")),
        height: Number(form.get("height")),
      }),
    });
    event.currentTarget.reset();
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/v1/groups", {
      method: "POST",
      body: JSON.stringify({
        concertId: snapshot.settings.activeConcertId,
        name: form.get("name"),
        color: form.get("color"),
        screenIds: selected,
      }),
    });
  }

  async function createConcert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/v1/concerts", {
      method: "POST",
      body: JSON.stringify({ name: form.get("name") || "Nouveau concert" }),
    });
    setSelected([]);
    event.currentTarget.reset();
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
    const form = new FormData(event.currentTarget);
    const media = await api("/api/v1/media", { method: "POST", body: form });
    setActiveMediaId(media.id);
    event.currentTarget.reset();
  }

  async function startStream() {
    if (!selected.length) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setStreaming(true);
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
        body: JSON.stringify({ screenIds: selected, frame: canvas.toDataURL("image/jpeg", 0.62) }),
      }).catch(() => {});
      if (streamRef.current) window.setTimeout(sendFrame, 1000 / snapshot.settings.streamFps);
    };
    sendFrame();
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStreaming(false);
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
              <p className="hint">L'identifiant technique est genere automatiquement par le site. Largeur = nombre de blocs horizontal, hauteur = nombre de blocs vertical.</p>
            </Panel>
            <div className="cards">
              {screens.map((screen) => <ScreenCard key={screen.id} screen={screen} selected={selected.includes(screen.id)} onClick={() => toggleScreen(screen.id)} />)}
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
            <Panel title="Uploader image, video ou son" icon={<Upload size={18} />}>
              <form className="uploadRow" onSubmit={uploadMedia}>
                <input name="name" placeholder="Nom visible" />
                <input name="file" type="file" accept="image/*,video/*,audio/*" required />
                <button className="primary"><Upload size={16} /> Uploader</button>
              </form>
            </Panel>
            <div className="mediaLayout">
              <MediaGrid media={snapshot.media} activeId={activeMediaId} onPick={setActiveMediaId} />
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
            <aside className="controlPanel wide">
              <h3><Palette size={18} /> Commandes</h3>
              <div className="selectedBox">{selectedScreens.length} ecran(s) selectionne(s)</div>
              <div className="selectedChips">
                {selectedScreens.map((screen) => <button key={screen.id} onClick={() => toggleScreen(screen.id)}>{screen.name}</button>)}
                {!selectedScreens.length && <span>Aucun ecran selectionne. Va dans Selection live ou choisis un groupe.</span>}
              </div>
              <div className="groupStrip">
                {groups.map((group) => <button key={group.id} onClick={() => setSelected(group.screenIds)} style={{ borderColor: group.color }}>{group.name}</button>)}
                <button onClick={() => setView("live")}><RadioTower size={15} /> Voir les ecrans</button>
              </div>
              <div className="buttonGrid">
                <button onClick={() => command({ mode: "boot" }, "boot")}><Power size={16} /> Boot</button>
                <button onClick={() => command({ mode: "boot", message: "Restarting" }, "restart")}><RotateCw size={16} /> Restart</button>
                <button className="danger" onClick={() => command({ mode: "off" }, "off")}>Off</button>
              </div>
              <label>Couleur</label>
              <div className="inline">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
                <button className="primary" onClick={() => command({ mode: "color", color, animation: "none" }, "color")}><Palette size={16} /> Envoyer</button>
              </div>
              <label>Media</label>
              <select value={activeMedia?.id || ""} onChange={(event) => setActiveMediaId(event.target.value)}>
                {snapshot.media.map((media) => <option key={media.id} value={media.id}>{media.name}</option>)}
              </select>
              <MediaPreview media={activeMedia} />
              <div className="buttonGrid">
                <button className="primary" onClick={() => activeMedia && command({ mode: "media", mediaId: activeMedia.id, mediaUrl: `${API}${activeMedia.url}`, mediaType: activeMedia.type, fit: "contain" }, "media")}><Play size={16} /> Jouer</button>
                <button onClick={() => activeMedia && command({ mode: "media", mediaId: activeMedia.id, mediaUrl: `${API}${activeMedia.url}`, mediaType: activeMedia.type, fit: "stretch" }, "stretch")}>Etendre</button>
              </div>
              <label>Animation</label>
              <div className="buttonGrid">
                <button onClick={() => command({ mode: "color", color, animation: "pulse" }, "pulse")}><WandSparkles size={16} /> Pulse</button>
                <button onClick={() => command({ mode: "color", color, animation: "scan" }, "scan")}>Scan</button>
              </div>
              <label>Stream ecran</label>
              <div className="buttonGrid">
                <button className="primary" onClick={startStream} disabled={streaming}><ScreenShare size={16} /> Stream</button>
                <button className="danger" onClick={stopStream}><ScreenShareOff size={16} /> Stop</button>
              </div>
              <video ref={videoRef} muted autoPlay playsInline />
            </aside>
          </section>
        )}

        {view === "settings" && (
          <section className="page">
            <Panel title="Mot de passe unique" icon={<KeyRound size={18} />}>
              <PasswordForm />
            </Panel>
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

function ScreenCard({ screen, selected, onClick }: { screen: Screen; selected: boolean; onClick: () => void }) {
  return (
    <button className={cx("screenCard", selected && "selected")} onClick={onClick}>
      <div><strong>{screen.name}</strong><span>{screen.id}</span></div>
      <small>{screen.width} x {screen.height} blocs</small>
      <b className={screen.online ? "online" : ""}>{screen.online ? "online" : "offline"}</b>
    </button>
  );
}

function Stage({ screens, selected, onToggle, editable = false }: { screens: Screen[]; selected: string[]; onToggle: (id: string) => void; editable?: boolean }) {
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  async function move(screen: Screen, event: PointerEvent<HTMLButtonElement>) {
    if (!editable || !dragRef.current) return;
    const parent = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const x = Math.max(0, event.clientX - parent.left - dragRef.current.dx);
    const y = Math.max(0, event.clientY - parent.top - dragRef.current.dy);
    await api(`/api/v1/screens/${screen.id}`, { method: "PATCH", body: JSON.stringify({ x, y }) }).catch(() => {});
  }
  return (
    <div className="stage">
      {screens.map((screen) => (
        <button
          key={screen.id}
          className={cx("stageScreen", selected.includes(screen.id) && "selected", screen.online && "online")}
          style={{ left: screen.x, top: screen.y, width: screen.width * 18, height: screen.height * 18 }}
          onClick={() => onToggle(screen.id)}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            dragRef.current = { id: screen.id, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => move(screen, event)}
          onPointerUp={() => (dragRef.current = null)}
        >
          <strong>{screen.name}</strong>
          <span>{screen.width}x{screen.height}</span>
        </button>
      ))}
    </div>
  );
}

function MediaGrid({ media, activeId, onPick }: { media: Media[]; activeId: string; onPick: (id: string) => void }) {
  return (
    <div className="mediaGrid">
      {media.map((item) => (
        <button key={item.id} className={cx("mediaCard", activeId === item.id && "selected")} onClick={() => onPick(item.id)}>
          {item.type === "image" && <img src={`${API}${item.url}`} alt="" />}
          {item.type === "video" && <video src={`${API}${item.url}`} muted />}
          {item.type === "audio" && <div className="audioTile">AUDIO</div>}
          <strong>{item.name}</strong>
          <span>{item.type}</span>
        </button>
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
      {media.type === "image" && <img src={`${API}${media.url}`} alt="" />}
      {media.type === "video" && <video src={`${API}${media.url}`} controls />}
      {media.type === "audio" && <audio src={`${API}${media.url}`} controls />}
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
    const form = new FormData(event.currentTarget);
    await api("/api/v1/settings/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: form.get("currentPassword"), nextPassword: form.get("nextPassword") }),
    });
    setMessage("Mot de passe change.");
    event.currentTarget.reset();
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
