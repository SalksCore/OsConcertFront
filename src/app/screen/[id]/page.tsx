"use client";

import Image from "next/image";
import { use, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333";

type ScreenState = {
  mode: "off" | "boot" | "color" | "media" | "message" | "stream";
  color?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  fit?: "contain" | "stretch";
  animation?: "none" | "pulse" | "scan";
  message?: string;
};

export default function ScreenViewer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<ScreenState>({ mode: "off" });
  const [frame, setFrame] = useState("");

  useEffect(() => {
    const events = new EventSource(`${API}/api/v1/screens/${id}/events`);
    events.addEventListener("state", (event) => setState(JSON.parse((event as MessageEvent).data)));
    events.addEventListener("stream-frame", (event) => setFrame(JSON.parse((event as MessageEvent).data).frame));
    return () => events.close();
  }, [id]);

  return (
    <main className={`viewer ${state.mode} ${state.animation || ""}`} style={{ background: state.mode === "color" ? state.color : undefined }}>
      {state.mode === "boot" && <Boot message={state.message || "Starting system services"} />}
      {state.mode === "message" && <div className="viewerMessage">{state.message}</div>}
      {state.mode === "media" && state.mediaType === "image" && <img className={state.fit === "stretch" ? "stretch" : ""} src={state.mediaUrl} alt="" />}
      {state.mode === "media" && state.mediaType === "video" && <video className={state.fit === "stretch" ? "stretch" : ""} src={state.mediaUrl} autoPlay loop muted playsInline />}
      {state.mode === "media" && state.mediaType === "audio" && <audio src={state.mediaUrl} autoPlay controls />}
      {state.mode === "stream" && frame && <img src={frame} alt="" />}
    </main>
  );
}

function Boot({ message }: { message: string }) {
  return (
    <div className="boot">
      <Image src="/logo.svg" alt="" width={180} height={180} priority />
      <strong>CONCERT OS</strong>
      <span>{message}</span>
      <i />
    </div>
  );
}
