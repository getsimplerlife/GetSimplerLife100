import type { SavingsInputs } from "~/tools/assessment-engine";
import { computeSavings } from "~/tools/assessment-engine";

/**
 * SavingsAssumptions — the visible, editable arithmetic behind every money
 * figure on the assessment and ROI pages.
 *
 * SLICE 187. The rule this component exists to enforce: a number on a public
 * page is honest only when it is arithmetic on an input the visitor supplied,
 * with every assumption shown in the same view and changeable. So there is no
 * constant in here that the visitor cannot see and move, and the arithmetic is
 * printed line by line rather than summarised into a headline.
 *
 * `automationShare` is the one number nobody can know before a pilot, so it is
 * the visitor's to set — the label says so, in those words.
 */
export function SavingsAssumptions({
  value,
  onChange,
  accent = "indigo",
}: {
  value: SavingsInputs;
  onChange: (next: SavingsInputs) => void;
  accent?: "indigo" | "emerald";
}) {
  const breakdown = computeSavings(value);
  const ring = accent === "emerald" ? "accent-emerald-500" : "accent-indigo-500";
  const text = accent === "emerald" ? "text-emerald-400" : "text-indigo-400";
  const border = accent === "emerald" ? "border-emerald-500/20" : "border-indigo-500/20";

  const num = (key: "monthlyVolume" | "minutesPerItem" | "hourlyCost", next: string) => {
    const parsed = Number(next);
    onChange({ ...value, [key]: Number.isFinite(parsed) ? parsed : 0 });
  };

  return (
    <div className={`rounded-2xl border ${border} bg-stone-950/60 p-5 space-y-5`}>
      <div>
        <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-stone-400">
          Your numbers — change any of them
        </h4>
        <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
          Everything below is arithmetic on these four inputs. We have never measured your
          volume, your minutes per item, your labour rate, or how much of the work automation
          takes — so none of them is presented as a result we produced.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
            Items per month
          </span>
          <input
            type="number"
            min={0}
            step={10}
            value={value.monthlyVolume}
            onChange={(e) => num("monthlyVolume", e.target.value)}
            className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-100 outline-none focus:border-stone-600"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
            Minutes per item today
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={value.minutesPerItem}
            onChange={(e) => num("minutesPerItem", e.target.value)}
            className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-100 outline-none focus:border-stone-600"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
            Cost per hour
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={value.hourlyCost}
            onChange={(e) => num("hourlyCost", e.target.value)}
            className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-100 outline-none focus:border-stone-600"
          />
        </label>
      </div>

      <div>
        <div className="flex justify-between items-center text-xs mb-1">
          <span className="font-bold text-stone-300">
            Share of that work automation takes
            <span className="text-stone-500 font-normal"> — your assumption</span>
          </span>
          <span className={`font-black ${text}`}>{Math.round(value.automationShare * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(value.automationShare * 100)}
          onChange={(e) => onChange({ ...value, automationShare: Number(e.target.value) / 100 })}
          className={`w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer ${ring}`}
        />
        <p className="text-[10px] text-stone-500 mt-1">
          Nobody can know this before a pilot. It is the one input that is a guess, and it is
          your guess to set, not a figure we measured.
        </p>
      </div>

      <div className="bg-stone-900/60 border border-stone-800 rounded-xl p-4 space-y-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-2">
          The arithmetic
        </div>
        {breakdown.lines.map((line) => (
          <div key={line} className="text-[11px] font-mono text-stone-300 leading-relaxed">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
