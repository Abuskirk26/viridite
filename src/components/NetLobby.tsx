import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { AudioBuses } from "@/components/AudioBuses";
import { Arsenal } from "@/components/Arsenal";
import { FACTION_NAME, type AiDifficulty, type FactionId, type MapId, type MapSizeId } from "@/game/data";
import {
  FACTIONS,
  LOBBY_MAPS,
  SIZE_CHOICES,
  SIZE_LABEL,
  LIMIT_CHOICES,
  listMyMaps,
  netRulesFromSetup,
  resolveMyMap,
  type SkirmishSetup,
} from "@/game/lobby";
import { shareCode } from "@/game/custom";
import {
  NetPlay,
  matchError,
  openLinkSocket,
  openMockSocket,
  openPublicTransport,
  parseRelayHint,
  publicRelayUrl,
  roomInviteUrl,
  seatStatusText,
  smsInviteHref,
  type InviteRelay,
} from "@/game/netplay";
import { makeCode, type LobbyView, type NetRules, type SeatView } from "@/game/relay-room";
import { eraForYear, DEFAULT_YEAR } from "@/game/eras";
import { YearSlider } from "@/components/YearSlider";
import { lobbySize, offersNavy } from "@/game/editor";
import { Sim } from "@/game/sim";

const NAME_KEY = "viridite-commander";
const SEAT_KEY = "viridite-room";

type OpenFn = (
  role: "host" | "guest",
  token?: string,
  overrides?: { code?: string; name?: string; transport?: InviteRelay; url?: string },
) => void;

function errorReason(error: string): string {
  if (error === "The match service is down.") return "down";
  if (error === "No room with that code.") return "code";
  if (error === "That room is full.") return "full";
  if (error === "That match already started.") return "started";
  return "other";
}

function startReason(note: string, linkUp: boolean): string {
  if (!linkUp) return "Relay not connected";
  if (!note) return "";
  const waiting = /^Waiting for (.+)$/.exec(note);
  if (waiting) return `Waiting for ${waiting[1]}`;
  if (/over 250 ms/i.test(note)) return `Waiting for ${note.replace(/ is over 250 ms/i, "").trim()}`;
  if (/is disconnected/i.test(note)) {
    const name = note.replace(/ is disconnected/i, "").trim();
    return name ? `Waiting for ${name}` : "Relay not connected";
  }
  if (/no ping from/i.test(note)) {
    const name = note.replace(/no ping from /i, "").trim();
    return name ? `Waiting for ${name}` : "Relay not connected";
  }
  if (/is empty|need two commanders/i.test(note)) return "Waiting for a friend";
  return note;
}

async function writeText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Private friends lobby. The public relay has to answer a health check and a
 * hello before anyone is called connected. If it is down, same-phone is a choice.
 */
export function NetLobby({
  onBack,
  onMatch,
  invite = "",
  setup,
  autoHost = true,
  showAi = false,
  onShowAi,
}: {
  onBack: () => void;
  onMatch: (sim: Sim, seat: number, net: NetPlay) => void;
  invite?: string;
  setup?: SkirmishSetup;
  autoHost?: boolean;
  showAi?: boolean;
  onShowAi?: (on: boolean) => void;
}) {
  const [name, setName] = useState("Commander");
  const [code, setCode] = useState("");
  const [pane, setPane] = useState<"home" | "join">("home");
  const [net, setNet] = useState<NetPlay | null>(null);
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ code: string; token: string; name: string } | null>(null);
  const [copyNote, setCopyNote] = useState("");
  const [book, setBook] = useState(false);
  const [tune, setTune] = useState(false);
  const [shake, setShake] = useState(0);
  const [clipCode, setClipCode] = useState("");
  const [linkUp, setLinkUp] = useState(false);
  const [transport, setTransport] = useState<InviteRelay>("public");
  const [offerLocal, setOfferLocal] = useState(false);
  const copyTimer = useRef(0);
  const helloTimer = useRef(0);
  const openRef = useRef<OpenFn>(() => {});
  const joinedInvite = useRef(false);
  const hosted = useRef(false);
  const seeded = useRef(false);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const netRef = useRef<NetPlay | null>(null);

  useEffect(() => {
    let nextName = "Commander";
    let seat: { code: string; token: string; name: string } | null = null;
    try {
      nextName = localStorage.getItem(NAME_KEY) || "Commander";
      const raw = localStorage.getItem(SEAT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { code?: string; token?: string; name?: string };
        if (parsed.code && parsed.token) {
          seat = { code: parsed.code, token: parsed.token, name: parsed.name || "Commander" };
          setSaved(seat);
        }
      }
    } catch {
      /* private mode */
    }
    setName(nextName);
    const hint = typeof window !== "undefined" ? parseRelayHint(window.location.search) : { mode: "public" as const, url: "" };
    const fromLink = /^[A-Z0-9]{5}$/.test(invite);
    if (fromLink && !joinedInvite.current) {
      joinedInvite.current = true;
      hosted.current = true;
      setPane("join");
      setCode(invite);
      const token = seat && seat.code.toUpperCase() === invite ? seat.token : "";
      openRef.current("guest", token, {
        code: invite,
        name: token && seat ? seat.name : nextName,
        transport: hint.mode,
        url: hint.url,
      });
    } else if (autoHost && !hosted.current) {
      hosted.current = true;
      openRef.current("host", "", { name: nextName, transport: hint.mode === "local" ? "local" : "public" });
    }
  }, [invite, autoHost]);

  useEffect(() => {
    if (!lobby || lobby.phase !== "lobby") return;
    const onVis = () => {
      const play = netRef.current;
      if (!play) return;
      if (document.visibilityState === "hidden") {
        play.signalAway(true);
        setError("Reconnecting");
      } else {
        play.signalAway(false);
        setError("");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [lobby?.phase, lobby?.code]);

  const readClip = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim().toUpperCase();
      setClipCode(/^[A-Z0-9]{5}$/.test(text) ? text : "");
    } catch {
      setClipCode("");
    }
  };

  const forgetSaved = () => {
    setSaved(null);
    try {
      localStorage.removeItem(SEAT_KEY);
    } catch {
      /* ignore */
    }
  };

  const relayDown = () => {
    setLobby(null);
    setLinkUp(false);
    setOfferLocal(true);
    setError("The match service is down.");
  };

  const open: OpenFn = (role, token = "", overrides) => {
    const who = (overrides?.name ?? name).slice(0, 16) || (role === "host" ? "Host" : "Guest");
    const joinCode = (overrides?.code ?? code).trim().toUpperCase();
    const asked = overrides?.transport;
    setLobby(null);
    setLinkUp(false);
    try {
      localStorage.setItem(NAME_KEY, who);
    } catch {
      /* ignore */
    }
    let seatToken = token;

    const arm = (live: NetPlay, helloMs: number) => {
      window.clearTimeout(helloTimer.current);
      helloTimer.current = window.setTimeout(() => {
        if (live.helloed) return;
        live.hangup();
        if (netRef.current === live) {
          netRef.current = null;
          setNet(null);
        }
        relayDown();
      }, helloMs);
      live.onLobby = (view) => {
        if (!live.helloed) return;
        window.clearTimeout(helloTimer.current);
        setLobby(view);
        setLinkUp(true);
        setOfferLocal(false);
        const me = view.seats.find((s) => s.you);
        setError((prev) => (prev === "Reconnecting" && me?.away ? prev : ""));
        if (role === "host" && !seeded.current && setupRef.current) {
          seeded.current = true;
          const packed = netRulesFromSetup(setupRef.current);
          live.setRules(packed.rules, packed.chart);
          if (packed.commanders !== 2) live.setCommanders(packed.commanders);
          if (packed.rules.teams !== "tvt") {
            for (let seat = 2; seat < packed.commanders; seat++) live.setFill(seat, "ai");
          }
        }
      };
      live.onNet = () => {
        if (live.helloed) {
          window.clearTimeout(helloTimer.current);
          setLinkUp(!live.reconnecting);
        } else setLinkUp(false);
        if (live.reconnecting) setError("Reconnecting");
        if (live.desynced) setError("Out of sync. Rematch from the battle.");
      };
      live.onError = (reason) => {
        if (!live.helloed) window.clearTimeout(helloTimer.current);
        if (seatToken && reason === "That seat is in use") {
          seatToken = "";
          setError("");
          live.join(joinCode, who);
          return;
        }
        const friendly = matchError(reason);
        if (friendly === "No room with that code.") setShake((n) => n + 1);
        if (/Host left|That room closed/.test(friendly)) {
          forgetSaved();
          setPane("home");
        }
        if (/Host left|That room closed|That room is full|No room with that code|That match already started/.test(friendly)) {
          setLobby(null);
          setLinkUp(false);
        }
        if (friendly === "The match service is down.") setOfferLocal(true);
        setError(friendly);
      };
      live.onBye = () => {
        window.clearTimeout(helloTimer.current);
        const wasIn = live.helloed;
        live.hangup();
        if (netRef.current === live) {
          netRef.current = null;
          setNet(null);
        }
        setLobby(null);
        setLinkUp(false);
        if (wasIn) setPane("home");
      };
      live.onRelayDead = () => {
        window.clearTimeout(helloTimer.current);
        live.hangup();
        if (netRef.current === live) {
          netRef.current = null;
          setNet(null);
        }
        relayDown();
      };
      live.onStart = (sim, seat) => {
        window.clearTimeout(helloTimer.current);
        onMatch(sim, seat, live);
      };
    };

    const speak = (live: NetPlay) => {
      setError("");
      if (seatToken) live.join(joinCode || saved?.code || "", who, seatToken);
      else if (role === "host") live.host(who);
      else live.join(joinCode, who);
    };

    const startLocal = () => {
      const roomCode = role === "host" ? makeCode() : joinCode;
      if (role === "guest" && !/^[A-Z0-9]{5}$/.test(roomCode)) {
        setError("Enter the five-character code.");
        setLinkUp(false);
        return;
      }
      const reopen = () => openMockSocket(role === "host" ? "host" : "guest");
      const play = new NetPlay(reopen());
      netRef.current?.hangup();
      netRef.current = play;
      setNet(play);
      setTransport("local");
      setOfferLocal(false);
      setLinkUp(false);
      arm(play, 4000);
      speak(play);
    };

    const startPhone = () => {
      const roomCode = role === "host" ? makeCode() : joinCode;
      if (!/^[A-Z0-9]{5}$/.test(roomCode)) {
        setError(role === "host" ? "Could not open a room. Check signal and try again." : "Enter the five-character code.");
        setLinkUp(false);
        return;
      }
      const guestId = `g${makeCode()}${makeCode()}`;
      const reopen = () => openLinkSocket(role === "host" ? "host" : "guest", roomCode, role === "host" ? "" : guestId);
      const play = new NetPlay(reopen(), { reopen, roomSurvives: role !== "host" });
      netRef.current?.hangup();
      netRef.current = play;
      setNet(play);
      setTransport("phone");
      setLinkUp(false);
      arm(play, 15000);
      speak(play);
    };

    const startPublic = async (target: string) => {
      setTransport("public");
      setLinkUp(false);
      const transport = await openPublicTransport(target);
      if (!transport) {
        relayDown();
        return;
      }
      const play = new NetPlay(transport.sock, { reopen: transport.reopen, roomSurvives: true });
      netRef.current?.hangup();
      netRef.current = play;
      setNet(play);
      arm(play, 8000);
      speak(play);
    };

    if (asked === "local") {
      startLocal();
      return;
    }
    if (asked === "phone") {
      startPhone();
      return;
    }
    const target = asked === "custom" ? overrides?.url || "" : publicRelayUrl();
    if (!target) {
      relayDown();
      return;
    }
    void startPublic(target);
  };
  openRef.current = open;

  const rules = lobby?.rules;
  const helloed = !!net?.helloed;
  const patch = (partial: Partial<NetRules>, chart?: string) => net?.setRules(partial, chart);
  const mine = listMyMaps();
  const startCap = rules?.customStarts && rules.customStarts >= 2 ? rules.customStarts : 4;
  const blocked = lobby ? startReason(lobby.note, linkUp && helloed && !net?.reconnecting) : "";
  const you = lobby?.seats.find((s) => s.you);

  const inviteMode: InviteRelay = transport === "local" ? "local" : transport === "phone" ? "phone" : "public";
  const inviteHref =
    lobby && typeof window !== "undefined" ? roomInviteUrl(lobby.code, { href: window.location.href, mode: inviteMode }) : "";

  useEffect(() => {
    if (!lobby?.code || typeof window === "undefined") return;
    const next = roomInviteUrl(lobby.code, { href: window.location.href, mode: inviteMode });
    if (window.location.href !== next) window.history.replaceState(null, "", next);
  }, [lobby?.code, inviteMode]);

  const copyLink = async () => {
    if (!inviteHref) return;
    const ok = await writeText(inviteHref);
    setCopyNote(ok ? "Copied" : "Could not copy");
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyNote(""), 2000);
  };

  const textHref = inviteHref
    ? smsInviteHref(
        `Join my VIRIDITE match\n${inviteHref}`,
        typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent),
      )
    : "";

  const submitCode = (raw: string) => {
    const next = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    setCode(next);
    if (next.length === 5) open("guest", "", { code: next, transport: transport === "local" ? "local" : "public" });
  };

  const joinInstead = () => {
    hosted.current = true;
    const play = netRef.current;
    if (play?.helloed) play.leave();
    else play?.hangup();
    netRef.current = null;
    setNet(null);
    setLobby(null);
    setLinkUp(false);
    setError("");
    setPane("join");
    setCode("");
    void readClip();
  };

  const pickMode = (mode: "versus" | "coop") => {
    if (!net || !rules) return;
    if (mode === "coop") {
      net.setRules({ teams: "tvt", ...(rules.size === "skirmish" ? { size: "large" } : {}) });
      net.setCommanders(4);
      return;
    }
    net.setRules({ teams: "ffa" });
    net.setCommanders(2);
  };

  const pickCustom = (id: string) => {
    const doc = resolveMyMap(id);
    if (!doc) return;
    patch(
      {
        customId: id,
        customName: doc.name.slice(0, 32),
        customStarts: doc.starts.length,
        mapId: offersNavy(doc) ? "coast" : "dry",
        size: lobbySize(doc),
      },
      shareCode(doc),
    );
  };

  const leaveScreen = () => {
    const play = netRef.current;
    if (play?.helloed) play.leave();
    else play?.hangup();
    netRef.current = null;
    setTransport("public");
    onBack();
  };

  const samePhone = (
    <button
      type="button"
      data-testid="net-same-phone"
      className="bevel-btn flex h-14 items-center justify-center font-display text-sm uppercase tracking-widest"
      onClick={() => open(pane === "join" && code.length === 5 ? "guest" : "host", "", { name, code, transport: "local" })}
    >
      Same-phone local game
    </button>
  );

  if (book) return <Arsenal faction={(rules?.player ?? setup?.player ?? "concord") as FactionId} onBack={() => setBook(false)} />;

  return (
    <main className="h-dvh touch-pan-y overflow-y-auto bg-field">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3">
        <header className="steel flex items-center gap-3 p-3 pr-32">
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs uppercase tracking-widest text-crystal">Skirmish</p>
            <h1 className="font-display text-2xl leading-none text-ink">With friends</h1>
            <button type="button" data-testid="open-arsenal" onClick={() => setBook(true)} className="bevel-btn mt-2 h-11 px-3 font-display text-xs uppercase">
              Troop book
            </button>
          </div>
          <button type="button" className="bevel-btn h-11 px-3 font-display text-xs uppercase" onClick={leaveScreen}>
            Skirmish
          </button>
        </header>

        {!lobby && pane === "home" && (
          <section className="steel flex flex-col gap-3 p-3">
            {error ? (
              <button
                type="button"
                data-testid="net-host"
                className="flex h-16 items-center justify-center bg-crystal font-display text-base uppercase tracking-widest text-crystal-ink"
                onClick={() => open("host", "", { name })}
              >
                Play with friends
              </button>
            ) : (
              <p className="text-sm text-pretty text-ink" data-testid="net-opening">
                Opening this skirmish for friends…
              </p>
            )}
            <button
              type="button"
              data-testid="net-join-open"
              className="bevel-btn flex h-16 items-center justify-center font-display text-base uppercase tracking-widest"
              onClick={joinInstead}
            >
              Join a friend's skirmish
            </button>
            {saved && (
              <button
                type="button"
                data-testid="net-rejoin"
                className="bevel-btn flex h-14 items-center justify-center font-display text-sm uppercase tracking-widest"
                onClick={() => open("guest", saved.token, { code: saved.code, name: saved.name })}
              >
                Rejoin {saved.code}
              </button>
            )}
            <label className="flex flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-wide text-brass">Your name</span>
              <input
                value={name}
                maxLength={16}
                onChange={(e) => setName(e.target.value)}
                className="steel-inset h-11 px-3 font-display text-lg text-ink outline-none"
                data-testid="net-name"
              />
            </label>
            <p className="text-sm text-pretty text-muted">
              Host and join the same skirmish. Credits, power, buildings, units. Bots fill the empty seats.
            </p>
            {samePhone}
            <p className="text-xs text-pretty text-brass">
              Local stays on this phone. Open the link in a second tab. Another phone needs Host, then the code.
            </p>
            {error && (
              <p className="text-sm text-pretty text-danger" data-testid="net-error" data-reason={errorReason(error)}>
                {error}
              </p>
            )}
            <AudioBuses />
          </section>
        )}

        {!lobby && pane === "join" && invite && (
          <section className="steel flex flex-col gap-3 p-3">
            <p className="text-sm text-pretty text-ink" data-testid="net-from-link">
              Opening the skirmish from your link. No code to type.
            </p>
            {error && (
              <p className="text-sm text-pretty text-danger" data-testid="net-error" data-reason={errorReason(error)}>
                {error}
              </p>
            )}
            {offerLocal && samePhone}
          </section>
        )}

        {!lobby && pane === "join" && !invite && (
          <section className="steel flex flex-col gap-3 p-3">
            <button
              type="button"
              className="bevel-btn h-11 self-start px-3 font-display text-xs uppercase"
              onClick={() => {
                setPane("home");
                setError("");
                setShake(0);
                if (autoHost) open("host", "", { name });
              }}
            >
              Cancel
            </button>
            {clipCode && (
              <button
                type="button"
                data-testid="net-join-clip"
                className="flex h-14 items-center justify-center bg-crystal font-display text-base uppercase tracking-widest text-crystal-ink"
                onClick={() => open("guest", "", { code: clipCode })}
              >
                Join {clipCode}
              </button>
            )}
            <label className="flex flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-wide text-brass">Room code</span>
              <input
                key={shake}
                value={code}
                maxLength={5}
                autoFocus
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                aria-label="Room code"
                onChange={(e) => submitCode(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (!text) return;
                  e.preventDefault();
                  submitCode(text);
                }}
                className={`steel-inset h-16 text-center font-display text-4xl tracking-[0.35em] text-gold outline-none select-text ${shake ? "code-shake" : ""}`}
                style={{ userSelect: "text", WebkitUserSelect: "text" }}
                data-testid="net-code-input"
              />
            </label>
            {error && (
              <p className="text-sm text-pretty text-danger" data-testid="net-error" data-reason={errorReason(error)}>
                {error}
              </p>
            )}
            {offerLocal && (
              <>
                {samePhone}
                <p className="text-xs text-pretty text-brass">Use this only for a second tab on this phone.</p>
              </>
            )}
          </section>
        )}

        {lobby && rules && helloed && (
          <section className="steel flex flex-col gap-3 p-3" data-testid="net-room">
            {lobby.host && (
              <>
                <div className="grid grid-cols-2 gap-2" data-testid="net-modes">
                  <button
                    type="button"
                    data-testid="mode-versus"
                    aria-pressed={rules.teams !== "tvt"}
                    onClick={() => pickMode("versus")}
                    className={`flex min-h-16 flex-col items-center justify-center px-2 ${rules.teams !== "tvt" ? "steel-inset text-gold" : "bevel-btn text-ink"}`}
                  >
                    <span className="font-display text-sm uppercase tracking-wide">Versus</span>
                    <span className="text-center text-xs text-pretty">Friends fight each other</span>
                  </button>
                  <button
                    type="button"
                    data-testid="mode-coop"
                    aria-pressed={rules.teams === "tvt"}
                    onClick={() => pickMode("coop")}
                    className={`flex min-h-16 flex-col items-center justify-center px-2 ${rules.teams === "tvt" ? "steel-inset text-gold" : "bevel-btn text-ink"}`}
                  >
                    <span className="font-display text-sm uppercase tracking-wide">Team vs AI</span>
                    <span className="text-center text-xs text-pretty">You and a friend against bots</span>
                  </button>
                </div>
                <p className="text-xs text-pretty text-muted" data-testid="net-team-note">
                  {rules.teams === "tvt"
                    ? "You and a friend against the bots from this skirmish. The open seat is theirs."
                    : transport === "local"
                      ? "Same phone only. Open the link in another tab, then they tap Ready."
                      : "Same skirmish you set. One seat is open for a friend. The rest stay bots until you open them."}
                </p>
              </>
            )}
            <div className="steel-inset flex flex-col gap-2 px-3 py-3" data-testid="net-invite">
              <div className="font-display text-[10px] uppercase tracking-widest text-brass">Invite link</div>
              <p className="text-sm text-pretty text-ink">
                {transport === "local"
                  ? "This match stays on this phone. Open the link in a second tab. Another phone cannot join."
                  : transport === "phone"
                    ? "This phone is the match. Leave it open, then text the link."
                    : "Text this link. A friend opens it and takes the open seat in this skirmish."}
              </p>
              <input
                readOnly
                value={inviteHref}
                aria-label="Invite link"
                data-testid="net-link"
                onFocus={(e) => e.currentTarget.select()}
                className="steel-inset h-11 w-full min-w-0 px-2 text-xs text-ink outline-none select-text"
                style={{ userSelect: "text", WebkitUserSelect: "text" }}
              />
              <div className="flex w-full gap-2">
                {transport !== "local" && (
                  <a
                    href={textHref}
                    data-testid="net-text"
                    className="flex h-12 flex-1 items-center justify-center bg-crystal font-display text-sm uppercase tracking-widest text-crystal-ink no-underline"
                  >
                    Text link
                  </a>
                )}
                <button
                  type="button"
                  data-testid="net-copy"
                  className="bevel-btn flex h-12 flex-1 items-center justify-center font-display text-sm uppercase tracking-widest"
                  onClick={() => void copyLink()}
                >
                  {copyNote === "Copied" ? "Copied" : "Copy link"}
                </button>
              </div>
              {copyNote === "Could not copy" && (
                <p className="text-xs text-brass" data-testid="net-copy-note">
                  Long-press the link to copy it.
                </p>
              )}
              <p className="text-center text-xs text-pretty text-muted">
                Or they type <span className="font-display tracking-widest text-gold" data-testid="net-code">{lobby.code}</span>
              </p>
            </div>

            <div className="flex flex-col gap-2" data-testid="net-seats">
              {lobby.seats.map((s) => (
                <div
                  key={s.seat}
                  className={`flex min-h-11 flex-wrap items-center gap-2 px-2 py-1 ${s.you ? "steel-inset" : "border border-brass-dim"}`}
                  data-testid={`seat-row-${s.seat}`}
                >
                  <span className="w-6 font-display text-xs text-brass">{s.seat + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-display text-sm uppercase">
                    {s.you ? "You" : s.fill === "open" ? "Empty" : s.name}
                    {s.you && s.name ? <span className="text-brass"> · {s.name}</span> : null}
                  </span>
                  {s.fill === "human" && (
                    <span className={`font-display text-xs tabular-nums ${s.rtt != null && s.rtt > 250 ? "text-muted" : "text-gold"}`}>
                      {s.rtt == null ? "—" : `${Math.round(s.rtt)} ms`}
                    </span>
                  )}
                  <span
                    data-testid={`seat-status-${s.seat}`}
                    className={`shrink-0 font-display text-[10px] uppercase ${!helloed || !linkUp || s.away || (s.fill === "human" && !s.connected) ? "text-brass" : "text-crystal"}`}
                  >
                    {seatStatusText(s, helloed, linkUp && !net?.reconnecting)}
                  </span>
                  {lobby.host && s.seat > 0 && s.fill !== "human" && (
                    <button
                      type="button"
                      className="bevel-btn h-11 px-2 font-display text-[10px] uppercase"
                      data-testid={`seat-fill-${s.seat}`}
                      onClick={() => net?.setFill(s.seat, s.fill === "ai" ? "open" : "ai")}
                    >
                      {s.fill === "ai" ? "Open seat" : "Use bot"}
                    </button>
                  )}
                  {lobby.host && s.seat > 0 && s.fill === "human" && (
                    <button type="button" className="bevel-btn h-11 px-2 font-display text-[10px] uppercase" data-testid={`seat-kick-${s.seat}`} onClick={() => net?.kick(s.seat)}>
                      Kick
                    </button>
                  )}
                  {lobby.host && rules.teams !== "tvt" && s.seat === lobby.commanders - 1 && s.seat > 0 && s.fill !== "human" && lobby.commanders > 2 && (
                    <button type="button" className="bevel-btn h-11 px-2 font-display text-[10px] uppercase" data-testid={`seat-close-${s.seat}`} onClick={() => net?.setCommanders(lobby.commanders - 1)}>
                      Close
                    </button>
                  )}
                </div>
              ))}
            </div>
            {lobby.host && rules.teams !== "tvt" && lobby.commanders < Math.min(4, startCap) && (
              <button type="button" data-testid="seat-add" className="bevel-btn flex h-11 items-center justify-center font-display text-xs uppercase" onClick={() => net?.setCommanders(lobby.commanders + 1)}>
                Add seat
              </button>
            )}

            {lobby.host ? (
              <>
                <p className="text-sm text-pretty text-ink" data-testid="net-skirmish">
                  {(rules.customName || LOBBY_MAPS.find((m) => m.id === rules.mapId)?.short || rules.mapId)}
                  {" · "}
                  {rules.teams === "tvt" ? "Team vs AI" : "Versus"}
                  {" · "}
                  {SIZE_LABEL[rules.size]}
                </p>
                <button
                  type="button"
                  data-testid="net-tune"
                  className="h-11 self-start font-display text-xs uppercase text-brass"
                  onClick={() => setTune((v) => !v)}
                >
                  {tune ? "Hide match rules" : "Match rules"}
                </button>
                {tune && (
                  <>
                <Seg label="Map">
                  {LOBBY_MAPS.map((m) => (
                    <SegBtn key={m.id} active={!rules.customId && rules.mapId === m.id} onClick={() => patch({ mapId: m.id as MapId, customId: "", customName: "", customStarts: 0, ...(m.id === "michigan" ? { size: "continent" as const } : {}) }, "")}>
                      {m.short}
                    </SegBtn>
                  ))}
                </Seg>
                <div data-testid="net-my-maps">
                  <span className="font-display text-[10px] uppercase tracking-wide text-brass">My Maps</span>
                  <div className="mt-1 max-h-[46vh] touch-pan-y overflow-y-auto">
                    {mine.map((row, index) => {
                      const active = rules.customId === row.id;
                      const head = index === 0 || mine[index - 1]?.group !== row.group;
                      const headLabel = row.group === "featured" ? "Featured" : row.group === "classic" ? "Classic" : "On this device";
                      return (
                        <Fragment key={row.id}>
                          {head && <p className="mt-2 font-display text-[10px] uppercase tracking-wide text-gold">{headLabel}</p>}
                          <button
                            type="button"
                            data-testid={`net-map-${row.id}`}
                            aria-pressed={active}
                            className={`mb-1 flex h-11 w-full items-center px-2 text-left font-display text-sm uppercase ${active ? "steel-inset text-gold" : "border border-brass-dim text-ink"}`}
                            onClick={() => pickCustom(row.id)}
                          >
                            <span className="min-w-0 flex-1 truncate">{row.name}</span>
                            <span className="shrink-0 text-[11px] text-brass">{row.w}×{row.h}</span>
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
                <Seg label="Size">
                  {SIZE_CHOICES.map((id) => (
                    <SegBtn key={id} active={rules.size === id} onClick={() => patch({ size: id as MapSizeId })}>
                      {SIZE_LABEL[id]}
                    </SegBtn>
                  ))}
                </Seg>
                <Seg label="Credits">
                  {([2000, 5000, 10000] as const).map((n) => (
                    <SegBtn key={n} active={rules.credits === n} onClick={() => patch({ credits: n })}>
                      {n === 10000 ? "10k" : n === 5000 ? "5k" : "2k"}
                    </SegBtn>
                  ))}
                </Seg>
                <Seg label="Fog">
                  <SegBtn active={rules.fog} onClick={() => patch({ fog: true })}>On</SegBtn>
                  <SegBtn active={!rules.fog} onClick={() => patch({ fog: false })}>Off</SegBtn>
                </Seg>
                <Seg label="Walls">
                  <SegBtn active={rules.walls} onClick={() => patch({ walls: true })}>On</SegBtn>
                  <SegBtn active={!rules.walls} onClick={() => patch({ walls: false })}>Off</SegBtn>
                </Seg>
                <Seg label="You">
                  {FACTIONS.map((id) => (
                    <SegBtn key={id} active={rules.player === id} onClick={() => patch({ player: id })}>
                      {FACTION_NAME[id]}
                    </SegBtn>
                  ))}
                </Seg>
                <Seg label="Enemy">
                  {FACTIONS.map((id) => (
                    <SegBtn key={id} active={rules.enemy === id} onClick={() => patch({ enemy: id })}>
                      {FACTION_NAME[id]}
                    </SegBtn>
                  ))}
                </Seg>
                <Seg label="Skill">
                  {(["easy", "normal", "hard"] as AiDifficulty[]).map((id) => (
                    <SegBtn key={id} active={rules.difficulty === id} onClick={() => patch({ difficulty: id })}>
                      {id}
                    </SegBtn>
                  ))}
                </Seg>
                <Seg label="Time">
                  {LIMIT_CHOICES.map((min) => (
                    <SegBtn key={min} active={(rules.limit ?? 60) === min} onClick={() => patch({ limit: min })}>
                      {min === 0 ? "None" : `${min}m`}
                    </SegBtn>
                  ))}
                </Seg>
                <div className="mt-2">
                  <YearSlider dense year={rules.year ?? DEFAULT_YEAR} onChange={(year) => patch({ year })} />
                </div>
                {onShowAi && (
                  <Seg label="AI labels">
                    <SegBtn active={showAi} onClick={() => onShowAi(true)}>On</SegBtn>
                    <SegBtn active={!showAi} onClick={() => onShowAi(false)}>Off</SegBtn>
                  </Seg>
                )}
                  </>
                )}
                <p className={`text-sm text-pretty ${blocked ? "text-danger" : "text-muted"}`} data-testid="net-block">
                  {blocked || "Seats are set. Start this skirmish."}
                </p>
                <button
                  type="button"
                  data-testid="net-start"
                  disabled={!!blocked}
                  className={`flex h-14 items-center justify-center font-display text-sm uppercase ${blocked ? "bg-brass-dim text-muted" : "bg-crystal text-crystal-ink"}`}
                  onClick={() => {
                    const doc = rules.customId ? resolveMyMap(rules.customId) : null;
                    net?.start(doc ? shareCode(doc) : undefined);
                  }}
                >
                  Start skirmish
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-pretty text-muted" data-testid="net-guest-rules">
                  {rules.customName || rules.mapId} · {SIZE_LABEL[rules.size]} · {eraForYear(rules.year ?? DEFAULT_YEAR).label} {eraForYear(rules.year ?? DEFAULT_YEAR).year} · {rules.fog ? "fog" : "no fog"} · {rules.walls ? "walls" : "no walls"} · {rules.credits.toLocaleString("en-US")} · {(rules.limit ?? 60) === 0 ? "no clock" : `${rules.limit ?? 60} min`}
                </p>
                <button
                  type="button"
                  data-testid="net-ready"
                  aria-pressed={!!you?.ready}
                  className={`flex h-14 items-center justify-center font-display text-sm uppercase ${you?.ready ? "steel-inset text-gold" : "bg-crystal text-crystal-ink"}`}
                  onClick={() => net?.ready(!you?.ready)}
                >
                  {you?.ready ? "Ready" : "Tap ready"}
                </button>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Seg({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display text-[10px] uppercase tracking-wide text-brass">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function SegBtn({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`h-11 px-2 font-display text-xs uppercase ${active ? "steel-inset text-gold" : "bevel-btn"}`}>
      {children}
    </button>
  );
}
