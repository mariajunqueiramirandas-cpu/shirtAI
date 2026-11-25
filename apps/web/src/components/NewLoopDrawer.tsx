import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  BLANK_COLORWAYS,
  type BlankColorway,
  type CreateLoopInput,
  type PrintMethod,
  type PrintPlacement,
  type RunMode,
} from "@shirtai/shared";

interface NewLoopDrawerProps {
  open: boolean;
  liveKeysConfigured: boolean;
  meshyBalance: number | null;
  onClose: () => void;
  onSubmit: (input: CreateLoopInput) => Promise<void>;
}

const BRIEF_TEMPLATES: Array<{ label: string; brief: string }> = [
  {
    label: "Custom drop brief",
    brief: "",
  },
  {
    label: "St. Michael cathedral ledge (back hit)",
    brief:
      "Full back streetwear graphic of Archangel Michael descending inside a Gothic cathedral rose window above cracked concrete skate ledge geometry, distressed chalk white and liturgical crimson woodcut engraving ink, zero text",
  },
  {
    label: "Rosary concrete curb crest (chest hit)",
    brief:
      "Minimal symmetrical pocket chest crest combining carved cathedral stone arch, rosary beads draped across a raw skate truck silhouette, crisp chalk white and cardinal red plastisol woodcut lines, zero text",
  },
  {
    label: "Sacred Heart thorn woodcut (front print)",
    brief:
      "Bold distressed baroque Sacred Heart encircled by architectural thorns and sharp cathedral sun rays in vintage 90s skate-zine halftone engraving, two-color chalk white and cardinal crimson ink, zero text",
  },
];

export function NewLoopDrawer({
  open,
  liveKeysConfigured,
  meshyBalance,
  onClose,
  onSubmit,
}: NewLoopDrawerProps) {
  const [templateIdx, setTemplateIdx] = useState(1);
  const [brief, setBrief] = useState(BRIEF_TEMPLATES[1].brief);
  const [placement, setPlacement] = useState<PrintPlacement>("full_back");
  const [printMethod, setPrintMethod] = useState<PrintMethod>("screen_print");
  const [blankColorway, setBlankColorway] = useState<BlankColorway>("obsidian");
  const [maxIterations, setMaxIterations] = useState(3);
  const [targetScore, setTargetScore] = useState(8.5);
  const [escalateToSunburst, setEscalateToSunburst] = useState(true);
  const [alphaChokeEnabled, setAlphaChokeEnabled] = useState(true);
  const [mode, setMode] = useState<RunMode>(liveKeysConfigured ? "live" : "dry_run");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (liveKeysConfigured) {
      setMode("live");
    }
  }, [liveKeysConfigured]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (brief.trim().length < 6) {
      setError("Describe your drop concept in at least 6 characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        brief: brief.trim(),
        placement,
        printMethod,
        blankColorway,
        maxIterations,
        targetScore,
        escalateToSunburst,
        alphaChokeEnabled,
        mode,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch loop");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        aria-label="Launch new agentic drop loop"
      >
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title">New drop loop</h2>
            <p className="drawer-sub">
              DeepSeek V4.1 Flash art direction and critique paired with Meshy GPT Image 2.6.
            </p>
          </div>
          <button
            type="button"
            className="icon-close-btn"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        <form className="drawer-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="brief-template" className="field-label">
              Starting brief
            </label>
            <select
              id="brief-template"
              className="field-select"
              value={templateIdx}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setTemplateIdx(idx);
                if (BRIEF_TEMPLATES[idx].brief) {
                  setBrief(BRIEF_TEMPLATES[idx].brief);
                }
              }}
            >
              {BRIEF_TEMPLATES.map((t, i) => (
                <option key={t.label} value={i}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="drop-brief" className="field-label">
              Creative brief
            </label>
            <textarea
              id="drop-brief"
              className="field-textarea"
              rows={4}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe iconography, composition, mood, ink contrast, and whether lettering should appear."
              required
            />
          </div>

          <div className="field-group">
            <span className="field-label">Placement & physical canvas</span>
            <div className="segmented segmented--full" role="tablist">
              {(
                [
                  ["full_back", "Full back (14×18\")"],
                  ["full_front", "Full front (12×16\")"],
                  ["left_chest", "Chest (4×4\")"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={placement === id}
                  className="segmented-option"
                  onClick={() => setPlacement(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row-2">
            <div className="field-group">
              <span className="field-label">Print method</span>
              <div className="segmented segmented--full" role="tablist">
                {(
                  [
                    ["screen_print", "Screen print"],
                    ["dtg", "DTG"],
                    ["dtf", "DTF"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={printMethod === id}
                    className="segmented-option"
                    onClick={() => setPrintMethod(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">Target blank colorway</span>
              <div className="swatch-row">
                {(Object.keys(BLANK_COLORWAYS) as BlankColorway[]).map((id) => {
                  const spec = BLANK_COLORWAYS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`swatch-option ${
                        blankColorway === id ? "swatch-option--active" : ""
                      }`}
                      onClick={() => setBlankColorway(id)}
                      aria-pressed={blankColorway === id}
                    >
                      <span
                        className="swatch-dot"
                        style={{ backgroundColor: spec.hex }}
                      />
                      <span>{spec.label.split(" ").pop()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="field-row-2">
            <div className="field-group">
              <label htmlFor="max-iterations" className="field-label tabular">
                Max auto-iterations ({maxIterations})
              </label>
              <input
                id="max-iterations"
                type="range"
                min={1}
                max={5}
                step={1}
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
                className="field-range"
              />
            </div>

            <div className="field-group">
              <label htmlFor="target-score" className="field-label tabular">
                Vision critic pass bar ({targetScore.toFixed(1)} / 10)
              </label>
              <input
                id="target-score"
                type="range"
                min={7.0}
                max={9.5}
                step={0.1}
                value={targetScore}
                onChange={(e) => setTargetScore(Number(e.target.value))}
                className="field-range"
              />
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">Execution mode</span>
            <div className="segmented segmented--full" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "live"}
                className="segmented-option"
                onClick={() => setMode("live")}
                disabled={!liveKeysConfigured}
              >
                Live API{meshyBalance !== null ? ` (${meshyBalance} cr)` : ""}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "dry_run"}
                className="segmented-option"
                onClick={() => setMode("dry_run")}
              >
                Dry run (0 credits)
              </button>
            </div>
          </div>

          <div className="switch-stack">
            <label className="switch-row">
              <input
                type="checkbox"
                checked={escalateToSunburst}
                onChange={(e) => setEscalateToSunburst(e.target.checked)}
              />
              <span>
                Promote passing Flare draft to Sunburst master render
              </span>
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={alphaChokeEnabled}
                onChange={(e) => setAlphaChokeEnabled(e.target.checked)}
              />
              <span>
                Apply deterministic alpha-choke during 300 DPI print-prep
              </span>
            </label>
          </div>

          {error && <p className="field-error">{error}</p>}

          <div className="drawer-footer">
            <button
              type="submit"
              className="btn-primary btn-primary--full"
              disabled={submitting}
            >
              {submitting ? "Starting loop..." : "Launch agentic loop"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
