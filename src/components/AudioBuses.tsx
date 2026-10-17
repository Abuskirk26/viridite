import { useEffect, useState } from "react";
import {
  BUS_STEPS,
  getMix,
  isMuted,
  nearestStep,
  playScore,
  previewVoice,
  setMuted,
  sfx,
  setMix,
  subscribeMute,
  unlockAudio,
  type BusName,
  type Mix,
} from "@/game/audio";

const BUSES: { id: BusName; label: string }[] = [
  { id: "music", label: "Music" },
  { id: "voice", label: "Voice" },
  { id: "sfx", label: "SFX" },
];

/**
 * Music, advisor, and guns.
 * `live` is a match already running: changing music must not swap in the menu theme.
 * `showMute` is the master switch. Off kills every bus; the row levels stay put.
 */
export function AudioBuses({ live = false, showMute = false }: { live?: boolean; showMute?: boolean }) {
  const [mix, setLocal] = useState<Mix>({ music: 0.78, voice: 0.78, sfx: 0.78 });
  const [muted, setMutedUi] = useState(false);

  useEffect(() => {
    setLocal(getMix());
    setMutedUi(isMuted());
    return subscribeMute(setMutedUi);
  }, []);

  const pick = (bus: BusName, value: number) => {
    unlockAudio();
    setMix({ [bus]: value });
    setLocal(getMix());
    if (live) {
      if (bus === "sfx" && value > 0 && !isMuted()) sfx("select");
      else if (bus === "voice" && value > 0 && !isMuted()) previewVoice();
      return;
    }
    if (bus === "music" && value > 0) playScore("menu");
    else if (bus === "voice" && value > 0) previewVoice();
    else if (bus === "sfx" && value > 0) sfx("cannon");
  };

  const master = (on: boolean) => {
    unlockAudio();
    setMuted(on);
  };

  return (
    <div className="flex w-full flex-col gap-2" data-testid="audio-buses">
      {showMute && (
        <div className="flex w-full flex-col gap-1" data-testid="bus-mute">
          <span className="font-display text-[10px] uppercase tracking-wide text-brass">All sound</span>
          <div role="group" aria-label="All sound" className="flex w-full">
            <button
              type="button"
              aria-label="All sound off"
              aria-pressed={muted}
              data-testid="mute-off"
              onClick={() => master(true)}
              className={`h-11 min-h-11 min-w-11 flex-1 border border-brass-dim px-1 font-display text-sm uppercase ${
                muted ? "steel-inset text-gold" : "bevel-btn"
              }`}
            >
              Off
            </button>
            <button
              type="button"
              aria-label="All sound on"
              aria-pressed={!muted}
              data-testid="mute-on"
              onClick={() => master(false)}
              className={`h-11 min-h-11 min-w-11 flex-1 border border-brass-dim px-1 font-display text-sm uppercase ${
                !muted ? "steel-inset text-gold" : "bevel-btn"
              }`}
            >
              On
            </button>
          </div>
        </div>
      )}
      {BUSES.map((bus) => {
        const current = nearestStep(mix[bus.id]);
        return (
          <div key={bus.id} className="flex w-full flex-col gap-1" data-testid={`bus-${bus.id}`}>
            <span className="font-display text-[10px] uppercase tracking-wide text-brass">{bus.label}</span>
            <div role="group" aria-label={bus.label} className="flex w-full">
              {BUS_STEPS.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  aria-label={`${bus.label} ${step.label}`}
                  aria-pressed={current === step.id}
                  data-testid={`${bus.id}-${step.id}`}
                  onClick={() => pick(bus.id, step.v)}
                  className={`h-11 min-h-11 min-w-11 flex-1 border border-brass-dim px-1 font-display text-sm uppercase ${
                    current === step.id ? "steel-inset text-gold" : "bevel-btn"
                  }`}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}