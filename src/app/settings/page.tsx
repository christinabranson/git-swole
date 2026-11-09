"use client";

import Link from "next/link";
import { useState } from "react";
import { useWorkoutApp } from "@/context/workout-app-context";
import { ScrollStrip } from "@/components/scroll-strip";
import { WeightUnit } from "@/lib/types";

function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  suffix,
  format,
  tone = "ink",
}: {
  value: number;
  onChange: (next: number) => void;
  step: number;
  min: number;
  max: number;
  suffix?: string;
  format?: (value: number) => string;
  tone?: "ink" | "green" | "amber";
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Number(next.toFixed(2))));
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(clamp(value - step))}
        className="label h-[44px] w-[44px] border border-line text-[14px] text-ink-2 hover:border-amber hover:text-amber"
      >
        −
      </button>
      <span
        className={`num w-[86px] text-center text-[26px] ${
          tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : "text-ink"
        }`}
      >
        {format ? format(value) : value}
        {suffix ? <span className="label ml-1 text-[8px] text-dim">{suffix}</span> : null}
      </span>
      <button
        onClick={() => onChange(clamp(value + step))}
        className="label h-[44px] w-[44px] border border-line text-[14px] text-ink-2 hover:border-green hover:text-green"
      >
        +
      </button>
    </div>
  );
}

function formatRest(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-faint py-4">
      <div>
        <div className="label text-[10px] text-ink">{label}</div>
        {hint ? <div className="label mt-1.5 text-[8.5px] font-normal text-dim">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings, stateLoaded, exerciseCatalog, syncStatus } = useWorkoutApp();
  const [section, setSection] = useState<"preferences" | "plates" | "data">("preferences");

  if (!stateLoaded) {
    return <div className="label px-[22px] py-10 text-[10px] text-dim desk:px-[26px]">Loading</div>;
  }

  const sections = [
    { key: "preferences" as const, label: "Preferences", hint: "Units · rest" },
    { key: "plates" as const, label: "Plate inventory", hint: "Bar · pairs on hand" },
    { key: "data" as const, label: "Exercises & data", hint: "Catalog · import · sync" },
  ];

  return (
    <div className="px-[22px] py-5 desk:px-[26px]">
      {/* The strip already names the section; on a phone the headline is a duplicate. */}
      <h1 className="num mb-6 hidden text-[56px] uppercase leading-[0.9] desk:block desk:text-[64px]">
        {sections.find((item) => item.key === section)?.label ?? "Settings"}
      </h1>

      <div className="-mx-[22px] mb-6 border-y border-line desk:mx-0">
        <ScrollStrip>
          {sections.map((item) => {
          const active = item.key === section;
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`min-w-[170px] shrink-0 border-b-2 px-4 py-3 text-left ${
                active ? "border-green bg-subtle" : "border-transparent hover:bg-hover"
              }`}
            >
              <div className={`label text-[9px] ${active ? "text-ink" : "text-dim"}`}>{item.label}</div>
                <div className="label mt-1 text-[8px] font-normal text-dim">{item.hint}</div>
              </button>
            );
          })}
        </ScrollStrip>
      </div>

      {section === "preferences" ? (
        <>
          <Row label="Weight units" hint="Relabels every unit in the app">
            <div className="flex">
              {(["lb", "kg"] as WeightUnit[]).map((unit) => (
                <button
                  key={unit}
                  onClick={() => updateSettings({ units: unit })}
                  className={`label border px-5 py-3 text-[9.5px] ${
                    settings.units === unit
                      ? "border-green bg-green-wash-tint text-green"
                      : "border-line text-dim hover:text-ink-2"
                  }`}
                >
                  {unit}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Rest after a good set" hint="All reps hit · 15 s steps">
            <Stepper
              value={settings.restAfterHit}
              onChange={(next) => updateSettings({ restAfterHit: next })}
              step={15}
              min={30}
              max={600}
              format={formatRest}
              tone="green"
            />
          </Row>

          <Row label="Rest after a missed set" hint="Reps missed · 15 s steps">
            <Stepper
              value={settings.restAfterMiss}
              onChange={(next) => updateSettings({ restAfterMiss: next })}
              step={15}
              min={60}
              max={900}
              format={formatRest}
              tone="amber"
            />
          </Row>
        </>
      ) : null}

      {section === "plates" ? (
        <>
          {/* The bar is the base of every loaded weight, so it sits with the plates. */}
          <Row label="Bar weight" hint="The base of every loaded weight · 5 lb steps">
            <Stepper
              value={settings.barbellWeight}
              onChange={(next) => updateSettings({ barbellWeight: next })}
              step={5}
              min={15}
              max={65}
              suffix={settings.units}
            />
          </Row>

          <div className="label mt-8 grid grid-cols-[1fr_auto_80px] items-center gap-3 border-b border-line py-3 text-[9px] text-dim">
            <span>Plate</span>
            <span>Pairs</span>
            <span className="text-right">Total</span>
          </div>
          {settings.plateInventory.map((plate, index) => (
            <div
              key={plate.weight}
              className="grid grid-cols-[1fr_auto_80px] items-center gap-3 border-b border-line-faint py-3"
            >
              <div>
                <span className="num text-[26px]">{plate.weight}</span>
                <span className="label ml-2 text-[8px] text-dim">{settings.units}</span>
              </div>
              <Stepper
                value={plate.pairs}
                step={1}
                min={0}
                max={20}
                onChange={(next) =>
                  updateSettings({
                    plateInventory: settings.plateInventory.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, pairs: next } : item,
                    ),
                  })
                }
              />
              <span
                className={`label text-right text-[9px] ${plate.pairs === 0 ? "text-off" : "text-dim"}`}
              >
                {plate.pairs === 0 ? "Not owned" : `${plate.weight * plate.pairs * 2} ${settings.units}`}
              </span>
            </div>
          ))}
        </>
      ) : null}

      {section === "data" ? (
        <>
          <Row label="Import history" hint="StrongLifts CSV export">
            <Link
              href="/import"
              className="label border border-line px-4 py-3 text-[9px] text-ink-2 hover:border-green hover:text-green"
            >
              Open →
            </Link>
          </Row>
          <Row label="Sync" hint="Signed-in sessions sync through Supabase">
            <span className={`label text-[9px] ${syncStatus === "error" ? "text-amber" : "text-dim"}`}>
              {syncStatus}
            </span>
          </Row>
          <Row label="Exercise catalog" hint="Global lifts plus anything you have added">
            <span className="num text-[26px]">{exerciseCatalog.length}</span>
          </Row>

          <div className="mt-6 flex flex-wrap gap-1.5">
            {exerciseCatalog.map((exercise) => (
              <span
                key={exercise.id}
                className={`label border px-2.5 py-2 text-[8.5px] ${
                  exercise.ownership === "user" ? "border-green text-green" : "border-line text-dim"
                }`}
              >
                {exercise.name}
              </span>
            ))}
          </div>

          <div className="label mt-10 border-t border-line pt-5 text-[8.5px] font-normal text-dim">
            Built by Christina Branson ·{" "}
            <a
              href="https://github.com/christinabranson/git-swole"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green hover:underline"
            >
              Repo
            </a>
          </div>
        </>
      ) : null}
    </div>
  );
}
