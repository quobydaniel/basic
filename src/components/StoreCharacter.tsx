import { useEffect, useId, useRef, useState } from "react";

/* Tiny 3D-style AI shopkeeper for the storefront (Pro). Replaces the plain
   emoji pill with an animated chibi that has its own personality: idle bob,
   blinks, random actions from a per-character pool, eyes that follow the
   buyer's pointer, and speech bubbles that judge what they're doing.
   Pure CSS/SVG: no models, no extra payload beyond this file. */

type ActionId =
  | "wave" | "hop" | "shimmy" | "spin" | "nod" | "chop" | "flap" | "pounce" | "turn" | "stretch"
  | "run" | "flip" | "dance" | "cartwheel"
  | "jump" | "wiggle" | "moonwalk" | "cheer";
type Zone = "body" | "head" | "arm";
const ACTION_ZONE: Record<ActionId, Zone> = {
  wave: "arm", chop: "arm", flap: "arm", cheer: "arm",
  nod: "head", turn: "head",
  hop: "body", shimmy: "body", spin: "body", pounce: "body", stretch: "body",
  run: "body", flip: "body", dance: "body", cartwheel: "body",
  jump: "body", wiggle: "body", moonwalk: "body",
};
const ACTION_MS: Record<ActionId, number> = {
  wave: 1400, hop: 800, shimmy: 1200, spin: 950, nod: 1000,
  chop: 1000, flap: 1100, pounce: 800, turn: 1600, stretch: 1200,
  run: 1300, flip: 1100, dance: 1800, cartwheel: 1200,
  jump: 950, wiggle: 900, moonwalk: 1400, cheer: 1300,
};

type Spec = {
  kind: "human" | "robot" | "cat" | "owl";
  skin: [string, string];
  outfit: [string, string];
  hat?: "wrap" | "toque";
  glasses?: boolean;
  actions: ActionId[];
  hoverLines: string[];   // pointer comes close
  actionLines: string[];  // narrating its own action, occasionally
};

/* One spec per AI_CHARACTERS id — each shopkeeper has its own body variant
   AND its own temperament: akua dances, kofi chops, ama nods sternly,
   nkoso recalibrates, sardine pounces, owusu turns its whole head. */
const SPECS: Record<string, Spec> = {
  akua: {
    kind: "human", skin: ["#b0744e", "#8a5436"], outfit: ["#7a1f35", "#571524"], hat: "wrap",
    actions: ["dance", "shimmy", "cheer", "wave", "flip", "hop", "jump"],
    hoverLines: ["Ah, you found me! 👀", "Come closer — the goods are sweet."],
    actionLines: ["Market dance! 💃🏾", "Fresh goods, fresh moves!", "Watch the wrap! 🕺🏾"],
  },
  kofi: {
    kind: "human", skin: ["#96603d", "#714529"], outfit: ["#2c4a3a", "#1d3328"], hat: "toque",
    actions: ["chop", "run", "nod", "stretch", "hop", "jump"],
    hoverLines: ["Careful, hot pan! 🔥", "You smell that? Fresh stock."],
    actionLines: ["Chop chop! 🔪", "Order up!", "Express delivery! 🏃🏾‍🍳"],
  },
  ama: {
    kind: "human", skin: ["#a86e4a", "#7f5436"], outfit: ["#262b33", "#14171d"], glasses: true,
    actions: ["nod", "spin", "flip", "wave", "stretch", "moonwalk"],
    hoverLines: ["I see you. The cart is empty. 😐", "Yes? The deals won't click themselves."],
    actionLines: ["Approved. For now.", "A nod from the board. 😐", "You saw nothing. 😐"],
  },
  nkoso: {
    kind: "robot", skin: ["#d3d9e3", "#98a1b1"], outfit: ["#39414f", "#232935"],
    actions: ["spin", "cartwheel", "hop", "wave", "flip", "wiggle"],
    hoverLines: ["SCANNING BUYER… RESULT: CURIOUS.", "BOOP."],
    actionLines: ["RECALIBRATING…", "SYSTEMS NOMINAL.", "GYRO TEST: PASS."],
  },
  sardine: {
    kind: "cat", skin: ["#454952", "#282b31"], outfit: ["#454952", "#282b31"],
    actions: ["pounce", "run", "stretch", "spin", "dance", "jump", "wiggle"],
    hoverLines: ["*tracks your cursor*", "Hmph. Humans."],
    actionLines: ["*pounces on your cursor*", "mrrp.", "ZOOMIES."],
  },
  owusu: {
    kind: "owl", skin: ["#96633a", "#6f4627"], outfit: ["#7c5230", "#5c3c22"],
    actions: ["turn", "flap", "dance", "spin", "cartwheel", "cheer", "moonwalk"],
    hoverLines: ["Hoot! You moved.", "My eyes are bigger than your cart. 👀"],
    actionLines: ["Hoot. I see everything.", "Wisdom loading…", "Hoot hoot hoot! 🦉"],
  },
};

const LINES: Record<"idle" | "scroll" | "click", string[]> = {
  idle: [
    "Judging silently. 👀",
    "Still deciding? The good ones don't wait.",
    "I could place that order for you. Just saying.",
    "Take your time. I have forever. 😌",
    "The seller said don't stare at buyers. I'm staring. 😐",
  ],
  scroll: [
    "So much scrolling, so little buying.",
    "You've seen everything. Twice. Pick one.",
    "Keep going — I'll judge the whole catalogue with you. 👀",
  ],
  click: [
    "Interesting choice. Bold. 😐",
    "That one? Good taste. I'll allow it.",
    "Ooh. {name} approves. Barely.",
    "Yes — tap it. The seller pays me to be persuasive.",
  ],
};

export function StoreCharacter({
  characterId,
  characterName,
  greeting,
  open,
  onActivate,
}: {
  characterId: string;
  characterName: string;
  greeting?: string | null;
  open: boolean;
  onActivate: () => void;
}) {
  const spec = SPECS[characterId] ?? SPECS.ama;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [bubble, setBubble] = useState<string | null>(null);
  const [judge, setJudge] = useState(false);
  const [action, setAction] = useState<ActionId | null>(null);
  const activity = useRef({ scrolled: false, clicked: false });
  const hideRef = useRef<number | undefined>(undefined);
  const clearActionRef = useRef<number | undefined>(undefined);
  const eyeRef = useRef<SVGGElement | null>(null);
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const hoverUntil = useRef(0);

  // Shared bubble helper — judge=true also tilts the head.
  function showLine(line: string, judging: boolean, ms = 4600) {
    window.clearTimeout(hideRef.current);
    setBubble(line);
    setJudge(judging);
    hideRef.current = window.setTimeout(() => {
      setBubble(null);
      setJudge(false);
    }, ms);
  }

  // Random one-shot action; occasionally narrates itself.
  function runAction(a: ActionId, narrate = true) {
    window.clearTimeout(clearActionRef.current);
    setAction(a);
    clearActionRef.current = window.setTimeout(() => setAction(null), ACTION_MS[a]);
    if (narrate && Math.random() < 0.3) showLine(spec.actionLines[Math.floor(Math.random() * spec.actionLines.length)], false, 3200);
  }

  useEffect(() => {
    // Opening line: the seller's custom greeting if set, else a default.
    const g = greeting?.trim();
    showLine(g ? (g.length > 110 ? `${g.slice(0, 110).trimEnd()}…` : g) : `Hi! I'm ${characterName} — ask me anything in this store 👋`, false, 5200);

    // Judge loop — reacts to what the buyer did since last time.
    let loop: number | undefined;
    const start = window.setTimeout(() => {
      setBubble(null);
      setJudge(false);
      loop = window.setInterval(() => {
        const bucket = activity.current.clicked ? "click" : activity.current.scrolled ? "scroll" : "idle";
        activity.current = { scrolled: false, clicked: false };
        const pool = LINES[bucket];
        showLine(pool[Math.floor(Math.random() * pool.length)].replace("{name}", characterName), bucket !== "idle");
      }, 11000 + Math.random() * 5000);
    }, 5400);

    // Personality loop — a random action from this character's pool.
    let actionTimer: number | undefined;
    let stop = false;
    const tick = () => {
      if (stop) return;
      const pool = spec.actions;
      runAction(pool[Math.floor(Math.random() * pool.length)], true);
      actionTimer = window.setTimeout(tick, 6000 + Math.random() * 6000);
    };
    actionTimer = window.setTimeout(tick, 6500 + Math.random() * 3000);

    // Pointer awareness — eyes track the cursor; getting close provokes a
    // reaction (line + action), throttled so it feels alive, not twitchy.
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = rootRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy);
        const nx = Math.max(-1, Math.min(1, dx / 240));
        const ny = Math.max(-1, Math.min(1, dy / 240));
        const near = dist < 150;
        if (eyeRef.current) {
          eyeRef.current.style.transform = `translate(${(nx * 2.6).toFixed(2)}px, ${(ny * 2.2).toFixed(2)}px)${near && !reduceMotion ? " scale(1.18)" : ""}`;
        }
        if (near && Date.now() >= hoverUntil.current && !reduceMotion) {
          hoverUntil.current = Date.now() + 9000;
          if (Math.random() < 0.55) showLine(spec.hoverLines[Math.floor(Math.random() * spec.hoverLines.length)], true);
          runAction(spec.actions[Math.floor(Math.random() * spec.actions.length)], false);
        }
      });
    };
    const onScroll = () => { activity.current.scrolled = true; };
    const onClick = () => { activity.current.clicked = true; };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    return () => {
      stop = true;
      window.clearTimeout(start);
      window.clearTimeout(hideRef.current);
      window.clearTimeout(clearActionRef.current);
      window.clearTimeout(actionTimer);
      if (loop) window.clearInterval(loop);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterName, greeting, characterId]);

  const s = spec.skin;
  const o = spec.outfit;
  const zone = action ? ACTION_ZONE[action] : null;
  const bodyAction = zone === "body" ? `storechar-${action}` : undefined;
  const headAction = zone === "head" ? `storechar-${action}` : undefined;
  const armAction = zone === "arm" ? `storechar-${action}` : undefined;
  const showBubble = bubble && !open;

  return (
    <div
      className="fixed bottom-5 right-4 z-50 flex flex-col items-center md:right-6"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Speech bubble — the judging */}
      {showBubble && (
        <div className="storechar-pop relative mb-2 w-max max-w-[230px] rounded-2xl rounded-br-sm border border-border bg-card px-3 py-2 text-xs leading-snug text-foreground shadow-[0_18px_40px_-16px_rgba(0,0,0,0.75)]">
          {bubble}
          <span aria-hidden className="absolute -bottom-[7px] right-7 h-3 w-3 rotate-45 border-b border-r border-border bg-card" />
        </div>
      )}

      <button
        ref={rootRef}
        onClick={onActivate}
        aria-label={open ? `Close ${characterName} chat` : `Ask ${characterName}`}
        title={`Ask ${characterName}`}
        className="group -mb-1 block cursor-pointer bg-transparent"
      >
        <svg
          viewBox="0 0 120 120"
          className="h-20 w-20 drop-shadow-[0_12px_16px_rgba(0,0,0,0.45)] transition-transform group-hover:scale-105 group-active:scale-95"
          aria-hidden
        >
          <defs>
            <linearGradient id={`sk${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s[0]} />
              <stop offset="1" stopColor={s[1]} />
            </linearGradient>
            <linearGradient id={`ou${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={o[0]} />
              <stop offset="1" stopColor={o[1]} />
            </linearGradient>
          </defs>

          {/* ground shadow */}
          <ellipse className="storechar-shadow" cx="60" cy="113" rx="24" ry="5" fill="rgba(0,0,0,0.4)" />

          <g className="storechar-bob">
            <g className={bodyAction}>
              {/* cat tail behind everything */}
              {spec.kind === "cat" && (
                <path
                  className="storechar-tail"
                  style={{ transformBox: "view-box", transformOrigin: "84px 92px" }}
                  d="M84 92 Q106 88 103 66"
                  fill="none"
                  stroke={s[1]}
                  strokeWidth="7"
                  strokeLinecap="round"
                />
              )}
              {/* legs — pump in opposite phases while running */}
              <rect
                x="47" y="84" width="10" height="24" rx="5" fill={o[1]}
                className={action === "run" ? "storechar-runleg-l" : undefined}
              />
              <rect
                x="63" y="84" width="10" height="24" rx="5" fill={o[1]}
                className={action === "run" ? "storechar-runleg-r" : undefined}
              />
              {/* left arm — flaps with the owl, otherwise a resting stub */}
              <rect
                x="31" y="62" width="9" height="22" rx="4.5" fill={s[1]}
                transform="rotate(16 35.5 64)"
                className={action === "flap" ? "storechar-flap" : undefined}
                style={action === "flap" ? { transformBox: "view-box", transformOrigin: "35.5px 64px" } : undefined}
              />
              {/* body */}
              <rect x="36" y="58" width="48" height="38" rx="18" fill={`url(#ou${uid})`} />
              {/* 3D highlight on the body */}
              <ellipse cx="46" cy="68" rx="9" ry="11" fill="rgba(255,255,255,0.14)" />
              {spec.kind === "owl" && <ellipse cx="60" cy="80" rx="16" ry="13" fill="#c9a06a" opacity="0.45" />}
              {spec.kind === "robot" && (
                <>
                  <rect x="52" y="70" width="16" height="6" rx="3" fill="rgba(255,255,255,0.16)" />
                  <circle className="storechar-glow" cx="60" cy="86" r="3" fill="#39e6a0" />
                </>
              )}
              {/* waving / chopping arm */}
              <g className={armAction} style={{ transformBox: "view-box", transformOrigin: "86px 64px" }}>
                <rect x="81.5" y="40" width="9" height="24" rx="4.5" fill={s[1]} />
              </g>

              {/* head — tilts when judging; nods/turns on action */}
              <g className="storechar-head" data-judge={judge}>
                <g className={headAction}>
                  {spec.kind === "robot" ? (
                    <>
                      <line x1="60" y1="18" x2="60" y2="9" stroke="#98a1b1" strokeWidth="3" />
                      <circle className="storechar-glow" cx="60" cy="7" r="4.5" fill="var(--gold)" />
                      <rect x="40" y="18" width="40" height="34" rx="11" fill={`url(#sk${uid})`} />
                      <ellipse cx="51" cy="25" rx="9" ry="5" fill="rgba(255,255,255,0.3)" />
                      <g ref={eyeRef} className="storechar-eyes">
                        <g className="storechar-blink" style={{ transformBox: "view-box", transformOrigin: "60px 36px" }}>
                          <rect x="46.5" y="30" width="7" height="11" rx="3" fill="#39e6ff" />
                          <rect x="66.5" y="30" width="7" height="11" rx="3" fill="#39e6ff" />
                        </g>
                      </g>
                      <rect x="53.5" y="45" width="3" height="5" rx="1.5" fill="#6b7280" />
                      <rect x="58.5" y="45" width="3" height="5" rx="1.5" fill="#6b7280" />
                      <rect x="63.5" y="45" width="3" height="5" rx="1.5" fill="#6b7280" />
                    </>
                  ) : spec.kind === "owl" ? (
                    <>
                      <path d="M42 22 L48 10 L53 21 Z" fill={s[1]} />
                      <path d="M78 22 L72 10 L67 21 Z" fill={s[1]} />
                      <circle cx="60" cy="38" r="22" fill={`url(#sk${uid})`} />
                      <circle cx="51" cy="36" r="9" fill="#f3efe6" />
                      <circle cx="69" cy="36" r="9" fill="#f3efe6" />
                      <g ref={eyeRef} className="storechar-eyes">
                        <g className="storechar-blink" style={{ transformBox: "view-box", transformOrigin: "60px 36px" }}>
                          <circle cx="51" cy="36" r="4.2" fill="#e6a23c" />
                          <circle cx="69" cy="36" r="4.2" fill="#e6a23c" />
                          <circle cx="51" cy="36" r="1.8" fill="#1c1710" />
                          <circle cx="69" cy="36" r="1.8" fill="#1c1710" />
                        </g>
                      </g>
                      <path d="M55 44 L65 44 L60 51 Z" fill="#e08a3c" />
                    </>
                  ) : (
                    <>
                      {spec.kind === "cat" && (
                        <>
                          <path d="M42 24 L47 9 L55 20 Z" fill={s[1]} />
                          <path d="M78 24 L73 9 L65 20 Z" fill={s[1]} />
                        </>
                      )}
                      <circle cx="60" cy="38" r="22" fill={`url(#sk${uid})`} />
                      {/* 3D highlight on the head */}
                      <ellipse cx="52" cy="26" rx="9" ry="6" fill="rgba(255,255,255,0.2)" transform="rotate(-18 52 26)" />
                      {/* hats / hair */}
                      {spec.hat === "wrap" && (
                        <>
                          <path d="M38.5 38 A21.5 21.5 0 0 1 81.5 38" fill="none" stroke="#7a1f35" strokeWidth="12" strokeLinecap="round" />
                          <path d="M41 32 A19 19 0 0 1 79 32" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" />
                          <circle cx="82" cy="25" r="4" fill="#7a1f35" />
                        </>
                      )}
                      {spec.hat === "toque" && (
                        <>
                          <circle cx="52" cy="14" r="8" fill="#f7f6f1" />
                          <circle cx="68" cy="14" r="8" fill="#f7f6f1" />
                          <rect x="44" y="12" width="32" height="16" rx="8" fill="#f7f6f1" />
                          <rect x="45" y="24" width="30" height="7" rx="3" fill="#e5e3db" />
                        </>
                      )}
                      {characterId === "ama" && !spec.hat && (
                        <>
                          <path d="M38.5 34 A21.5 21.5 0 0 1 81.5 34" fill="none" stroke="#221610" strokeWidth="7" strokeLinecap="round" />
                          <circle cx="80" cy="20" r="5" fill="#221610" />
                        </>
                      )}
                      {/* eyes (track pointer, blink) + suspicious brows */}
                      <g ref={eyeRef} className="storechar-eyes">
                        <g className="storechar-blink" style={{ transformBox: "view-box", transformOrigin: "60px 36px" }}>
                          {spec.kind === "cat" ? (
                            <>
                              <ellipse cx="52" cy="36" rx="1.8" ry="4.6" fill="#15120f" />
                              <ellipse cx="68" cy="36" rx="1.8" ry="4.6" fill="#15120f" />
                            </>
                          ) : (
                            <>
                              <ellipse cx="52" cy="36" rx="3.2" ry="4.4" fill="#26221e" />
                              <ellipse cx="68" cy="36" rx="3.2" ry="4.4" fill="#26221e" />
                              <circle cx="51" cy="34" r="1.2" fill="rgba(255,255,255,0.85)" />
                              <circle cx="67" cy="34" r="1.2" fill="rgba(255,255,255,0.85)" />
                            </>
                          )}
                        </g>
                      </g>
                      <path d="M48 28.6 L56 27.8" stroke="#26221e" strokeWidth="2" strokeLinecap="round" />
                      <path d="M64 27.8 L72 28.9" stroke="#26221e" strokeWidth="2" strokeLinecap="round" />
                      {/* mouth — cat gets the little w */}
                      {spec.kind === "cat" ? (
                        <path d="M54 46 Q57 49 60 46 Q63 49 66 46" fill="none" stroke="#15120f" strokeWidth="2" strokeLinecap="round" />
                      ) : (
                        <path d="M53 46 Q60 51.5 67 46" fill="none" stroke="#26221e" strokeWidth="2.2" strokeLinecap="round" />
                      )}
                      {/* blush */}
                      <circle cx="45.5" cy="44.5" r="3.2" fill="#e58f7a" opacity="0.45" />
                      <circle cx="74.5" cy="44.5" r="3.2" fill="#e58f7a" opacity="0.45" />
                      {/* glasses (ama) */}
                      {spec.glasses && (
                        <g stroke="#1c1e24" strokeWidth="2.4" fill="none">
                          <circle cx="52" cy="36" r="8" />
                          <circle cx="68" cy="36" r="8" />
                          <path d="M44 35 L38 33" />
                          <path d="M76 35 L82 33" />
                        </g>
                      )}
                      {/* whiskers (sardine) */}
                      {spec.kind === "cat" && (
                        <g stroke="#9aa0aa" strokeWidth="1.2" strokeLinecap="round">
                          <path d="M39 41 L27 39" />
                          <path d="M39 45 L27 46" />
                          <path d="M81 41 L93 39" />
                          <path d="M81 45 L93 46" />
                        </g>
                      )}
                    </>
                  )}
                </g>
              </g>
            </g>
          </g>
        </svg>
      </button>

      <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
        Ask {characterName}
      </span>
    </div>
  );
}
