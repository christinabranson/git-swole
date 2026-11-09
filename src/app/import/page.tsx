"use client";

import { useState } from "react";
import { parseStrongLiftsCsv } from "@/lib/importer";
import { useWorkoutApp } from "@/context/workout-app-context";

export default function ImportPage() {
  const { importWorkouts } = useWorkoutApp();
  const [csvText, setCsvText] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
  };

  const runImport = async () => {
    setResultMessage(null);
    const parsed = parseStrongLiftsCsv(csvText);
    setIssues(parsed.issues);

    if (parsed.workouts.length === 0) {
      setResultMessage("No importable workouts were found in this CSV.");
      return;
    }

    setIsImporting(true);
    try {
      const result = await importWorkouts(parsed.workouts);
      setResultMessage(
        `Imported ${result.imported} workouts${result.skipped > 0 ? `, skipped ${result.skipped} duplicates.` : "."}`,
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="px-[22px] py-5 desk:px-[26px]">
      <h1 className="num mb-6 text-[56px] uppercase leading-[0.9] desk:text-[64px]">Import</h1>

      <div className="border-b border-line py-5">
        <div className="label text-[9px] text-dim">How your CSV should look</div>
        <ul className="label mt-3 space-y-2 text-[9.5px] font-normal leading-[1.7] text-ink-2">
          <li>Header row must include Date (yyyy/mm/dd), Workout Name, Exercise, SetsxReps, Set 1–5.</li>
          <li>Known exercise names map to the global catalog.</li>
          <li>Unknown names are imported as user-defined exercises when signed in.</li>
        </ul>
      </div>

      <div className="border-b border-line py-5">
        <label className="label block text-[9px] text-dim">Upload CSV file</label>
        <input
          type="file"
          accept=".csv,text/csv"
          className="label mt-3 block w-full border-none px-0 text-[9.5px] font-normal text-ink-2"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void handleFileUpload(file);
          }}
        />
      </div>

      <div className="py-5">
        <label className="label block text-[9px] text-dim">Paste CSV</label>
        <textarea
          className="mt-3 min-h-56 w-full border border-line px-3 py-3 text-[11px] leading-[1.6] text-ink"
          placeholder="Paste CSV contents here, or upload above."
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
        />
        <button
          type="button"
          disabled={!csvText.trim() || isImporting}
          className="label mt-4 h-[58px] w-full bg-green px-6 text-[13px] text-bg disabled:bg-panel disabled:text-off desk:w-[320px]"
          onClick={() => void runImport()}
        >
          {isImporting ? "Importing" : "Import workouts"}
        </button>
      </div>

      {resultMessage ? (
        <div className="label border-t border-line py-5 text-[9.5px] font-normal text-green">{resultMessage}</div>
      ) : null}

      {issues.length > 0 ? (
        <div className="border-t border-amber-line py-5">
          <div className="label text-[9px] text-amber">Import issues</div>
          <ul className="label mt-3 space-y-2 text-[9.5px] font-normal leading-[1.7] text-amber">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
