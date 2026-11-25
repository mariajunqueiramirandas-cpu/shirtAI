import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  BLANK_COLORWAYS,
  PRINT_PLACEMENTS,
  type BlankColorway,
  type LoopIteration,
  type LoopRun,
  type PrintPlacement,
} from "@shirtai/shared";
import { GarmentStage, type InspectMode } from "../components/GarmentStage";
import { api } from "../lib/api";
import "../styles/landing.css";

interface PipelineStageDef {
  id: string;
  tabLabel: string;
  title: string;
  copy: string;
  inspectMode: InspectMode;
  showGuides: boolean;
  metrics: Array<[string, string]>;
  showRubric?: boolean;
}

const PIPELINE_STAGES: PipelineStageDef[] = [
  {
    id: "brief",
    tabLabel: "1. Brand brief",
    title: "DeepSeek V4.1 Flash translates your brief against your brand bible",
    copy: "Your label's iconography, ink limits, forbidden tropes, and heavyweight blank silhouette stay pinned in Mistral prompt cache so every prompt starts on-brand with garment-knockout instructions.",
    inspectMode: "mockup",
    showGuides: true,
    metrics: [
      ["Reasoning engine", "DeepSeek V4.1 Flash (Mistral)"],
      ["Prompt cache rate", "$0.007 / 1M cached tokens"],
      ["Target canvas", "14 × 18 in · 3:4 aspect ratio"],
      ["Ink knockout rule", "Obsidian fabric negative space"],
    ],
  },
  {
    id: "render",
    tabLabel: "2. Transparent render",
    title: "Meshy GPT Image 2.6 outputs a native transparent RGBA PNG",
    copy: "Early explorations run on Flare for speed and layout punch, chaining refinements via Meshy image-to-image task IDs before promoting winning graphics to Sunburst.",
    inspectMode: "raw",
    showGuides: false,
    metrics: [
      ["Draft tier", "gpt-image-2-6-flare"],
      ["Master tier", "gpt-image-2-6-sunburst"],
      ["Background cutout", "remove_background: true (RGBA)"],
      ["Refinement path", "Chained input_task_id edits"],
    ],
  },
  {
    id: "preflight",
    tabLabel: "3. Alpha preflight",
    title: "Deterministic pixel inspection catches halos before the printer does",
    copy: "Before any model critiques the artwork, our Bun sharp engine composites the cutout onto real 300gsm cotton and maps semi-transparent fringe pixels that ruin DTG and screen underbases.",
    inspectMode: "alpha",
    showGuides: false,
    metrics: [
      ["Preflight engine", "Deterministic Bun + sharp"],
      ["Alpha-halo X-Ray", "Flags alpha 1..235 fringe pixels"],
      ["Garment composite", "Real 300gsm colorway check"],
      ["Edge hardening", "Optional print-shop alpha choke"],
    ],
  },
  {
    id: "critic",
    tabLabel: "4. Vision critic",
    title: "Bounded 2-image multimodal critique rejects weak prints automatically",
    copy: "DeepSeek V4.1 Flash inspects both the composited garment and the alpha X-Ray against five weighted print criteria. Failing drafts loop automatically via surgical image-to-image edits.",
    inspectMode: "mockup",
    showGuides: false,
    showRubric: true,
    metrics: [
      ["Vision inputs", "Garment composite + Alpha X-Ray"],
      ["Loop policy", "Edit in place or pivot fresh"],
      ["Quality guarantee", "Best-candidate retention per run"],
    ],
  },
  {
    id: "techpack",
    tabLabel: "5. 300 DPI tech-pack",
    title: "Export a complete print-shop ZIP ready for press",
    copy: "Winning artwork is trimmed, edge-choked, scaled to exact physical inches at 300 DPI with embedded pHYs metadata, quantized for spot-ink preview, and bundled with a printable spec sheet.",
    inspectMode: "separation",
    showGuides: false,
    metrics: [
      ["Print master", "4200 × 5400 px at 300 DPI"],
      ["Collar drop spec", "3.5 in standard back drop"],
      ["Deliverable bundle", "PNG + mockup + X-Ray + spec HTML"],
      ["Printer handoff", "ZIP download or webhook dispatch"],
    ],
  },
];

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [colorway, setColorway] = useState<BlankColorway>("obsidian");
  const [placement, setPlacement] = useState<PrintPlacement>("full_back");
  const [showGuides, setShowGuides] = useState(true);
  const [showcaseLoop, setShowcaseLoop] = useState<LoopRun | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let active = true;
    api
      .getSystemStatus()
      .then((status) => api.listLoops(status.foundingWorkspaceId))
      .then((loops) => {
        if (!active) return;
        const backLoops = loops.filter(
          (l) =>
            l.placement === "full_back" &&
            l.iterations.some((i) => Boolean(i.rawTransparentUrl))
        );
        const candidates =
          backLoops.length > 0
            ? backLoops
            : loops.filter((l) =>
                l.iterations.some((i) => Boolean(i.rawTransparentUrl))
              );
        const bestLoop = [...candidates].sort((a, b) => {
          const scoreA =
            Math.max(...a.iterations.map((i) => i.critic?.overallScore ?? 0), 0);
          const scoreB =
            Math.max(...b.iterations.map((i) => i.critic?.overallScore ?? 0), 0);
          return scoreB - scoreA;
        })[0];
        if (bestLoop) setShowcaseLoop(bestLoop);
      })
      .catch(() => {
        // Static specimen fallback remains active if API isn't reachable
      });
    return () => {
      active = false;
    };
  }, []);

  const showcaseIter: LoopIteration | null = showcaseLoop
    ? showcaseLoop.iterations.find((i) => i.id === showcaseLoop.bestIterationId) ??
      showcaseLoop.iterations[showcaseLoop.iterations.length - 1] ??
      null
    : null;

  const rawSpecimenUrl =
    showcaseIter?.rawTransparentUrl ?? "/assets/specimen-archangel.png";
  const alphaSpecimenUrl =
    showcaseIter?.alphaDiagnosticUrl ?? "/assets/specimen-alpha-xray.png";
  const sepSpecimenUrl =
    showcaseIter?.inkSeparationUrl ?? "/assets/specimen-ink-sep.png";

  const activeStage = PIPELINE_STAGES[activeStageIdx];
  const placementSpec = PRINT_PLACEMENTS[placement];
  const blankSpec = BLANK_COLORWAYS[colorway];

  const criticScores = showcaseIter?.critic?.scores ?? {
    brandDna: 9.3,
    composition: 9.1,
    typography: 10.0,
    printContrast: 9.4,
    alphaEdges: 8.9,
  };

  return (
    <div className="landing-page">
      <header className={`site-header ${scrolled ? "site-header--scrolled" : ""}`}>
        <div className="site-header-inner">
          <Link to="/" className="brand-wordmark" aria-label="shirtAI home">
            shirt<span className="brand-wordmark-accent">AI</span>
          </Link>

          <nav className="site-nav" aria-label="Primary navigation">
            <a href="#pipeline" className="site-nav-link">
              Pipeline
            </a>
            <a href="#garment" className="site-nav-link">
              Garment preview
            </a>
            <a href="#specs" className="site-nav-link">
              Print specs
            </a>
          </nav>

          <Link to="/studio" className="btn-primary site-header-cta">
            Open studio
          </Link>
        </div>
      </header>

      <main>
        {/* Opening Hero: Layered Depth & Foreground Occlusion (bleeds to y=0) */}
        <section className="hero-stage" aria-label="Overview">
          <div className="hero-composition">
            <h1 className="hero-headline">
              Print-ready streetwear, forged autonomously
            </h1>

            <div className="hero-specimen-wrap">
              <img
                src="/assets/hero-tee-specimen.jpg"
                alt="Heavyweight washed-black 300gsm streetwear tee featuring a chalk white and cardinal crimson Archangel Michael woodcut back print"
                className="hero-specimen-img"
              />
            </div>

            <div className="hero-action-band">
              <p className="hero-subtitle">
                Autonomous art direction, multimodal vision critique, and 300 DPI print
                preparation built from your brand bible to press.
              </p>
              <Link to="/studio" className="btn-primary">
                Enter the studio
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* Section 2: Interactive 5-Stage Agentic Loop Workbench */}
        <section id="pipeline" className="editorial-section">
          <div className="landing-container">
            <div className="section-header-block">
              <h2 className="section-heading">
                Five autonomous passes from drop brief to press
              </h2>
              <p className="section-body">
                Every run executes as a bounded state machine pairing DeepSeek V4.1 Flash
                with Meshy GPT Image 2.6 and deterministic pixel preflight. Step through an
                actual garment run below.
              </p>
            </div>

            <div className="stage-selector-wrap">
              <div className="segmented" role="tablist" aria-label="Agentic loop stages">
                {PIPELINE_STAGES.map((stage, idx) => (
                  <button
                    key={stage.id}
                    type="button"
                    role="tab"
                    aria-selected={activeStageIdx === idx}
                    className="segmented-option"
                    onClick={() => setActiveStageIdx(idx)}
                  >
                    {stage.tabLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="pipeline-workbench">
              <div className="pipeline-visual-col">
                <GarmentStage
                  colorway="obsidian"
                  placement="full_back"
                  inspectMode={activeStage.inspectMode}
                  showGuides={activeStage.showGuides}
                  rawTransparentUrl={rawSpecimenUrl}
                  alphaDiagnosticUrl={alphaSpecimenUrl}
                  inkSeparationUrl={sepSpecimenUrl}
                  altLabel={showcaseLoop?.title ?? "Archangel Michael concrete back graphic"}
                />
              </div>

              <div className="pipeline-detail-col">
                <div>
                  <h3 className="pipeline-stage-title">{activeStage.title}</h3>
                  <p className="pipeline-stage-copy">{activeStage.copy}</p>
                </div>

                {activeStage.showRubric && (
                  <div className="critic-bar-list" aria-label="Vision critic rubric scores">
                    {(
                      [
                        ["Brand DNA fit", criticScores.brandDna],
                        ["Composition & silhouette", criticScores.composition],
                        ["Typography accuracy", criticScores.typography],
                        ["Print contrast on cotton", criticScores.printContrast],
                        ["Alpha edge cleanliness", criticScores.alphaEdges],
                      ] as const
                    ).map(([label, score]) => (
                      <div key={label} className="critic-bar-item">
                        <span className="critic-bar-label">{label}</span>
                        <span className="critic-bar-score tabular">
                          {score.toFixed(1)} / 10
                        </span>
                        <div className="critic-bar-track">
                          <div
                            className="critic-bar-fill"
                            style={{ width: `${Math.min(100, score * 10)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <ul className="pipeline-meta-list">
                  {activeStage.metrics.map(([key, val]) => (
                    <li key={key} className="pipeline-meta-row">
                      <span className="pipeline-meta-key">{key}</span>
                      <span className="pipeline-meta-val tabular">{val}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Full-Bleed Editorial Lookbook + Interactive Blank Switcher */}
        <section id="garment" className="editorial-section">
          <div className="lookbook-bleed">
            <img
              src="/assets/lookbook-concrete.jpg"
              alt="Skateboarder beside a brutalist concrete ledge wearing a heavyweight black boxy tee with a chalk white and cardinal crimson gothic rose window back print"
              className="lookbook-img"
            />
            <div className="lookbook-overlay">
              <div className="lookbook-copy-wrap">
                <h2 className="lookbook-heading">
                  Critiqued on real cotton before ink ever hits screen
                </h2>
                <p className="lookbook-caption">
                  Inspect how dark-fabric knockout and ink contrast behave across 300gsm
                  heavyweight blanks before committing a single print run.
                </p>
              </div>
            </div>
          </div>

          <div className="landing-container">
            <div className="tactile-bench">
              <div className="tactile-stage-wrap">
                <GarmentStage
                  colorway={colorway}
                  placement={placement}
                  inspectMode="mockup"
                  showGuides={showGuides}
                  rawTransparentUrl={rawSpecimenUrl}
                  altLabel="Live blank placement specimen"
                />
              </div>

              <div className="tactile-controls">
                <div>
                  <h2 className="section-heading">
                    Switch blanks and print zones without regenerating art
                  </h2>
                  <p className="section-body">
                    Every graphic exports as a clean transparent RGBA master sized to exact
                    physical inches and collar-drop guidelines for your print house.
                  </p>
                </div>

                <div className="control-block">
                  <span className="control-label">Blank colorway ({blankSpec.label})</span>
                  <div className="swatch-row">
                    {(Object.keys(BLANK_COLORWAYS) as BlankColorway[]).map((id) => {
                      const spec = BLANK_COLORWAYS[id];
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`swatch-option ${
                            colorway === id ? "swatch-option--active" : ""
                          }`}
                          onClick={() => setColorway(id)}
                          aria-pressed={colorway === id}
                        >
                          <span
                            className="swatch-dot"
                            style={{ backgroundColor: spec.hex }}
                          />
                          <span>{spec.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="control-block">
                  <span className="control-label">Print zone</span>
                  <div className="segmented" role="tablist" aria-label="Print zone">
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

                <label className="guide-toggle">
                  <input
                    type="checkbox"
                    checked={showGuides}
                    onChange={(e) => setShowGuides(e.target.checked)}
                  />
                  <span className="tabular">
                    Show registration crop box ({placementSpec.widthPx} ×{" "}
                    {placementSpec.heightPx} px at 300 DPI)
                  </span>
                </label>

                <div>
                  <Link to="/studio" className="btn-primary">
                    Launch your own brief
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Print-House Technical Guarantee (Clean Hairline Spec Sheet) */}
        <section id="specs" className="editorial-section">
          <div className="landing-container">
            <div className="section-header-block">
              <h2 className="section-heading">
                Prepress deliverables ready for any print house
              </h2>
              <p className="section-body">
                Built first for heavyweight skate and streetwear production, architected
                from commit one as a multi-tenant workspace engine for independent apparel
                brands.
              </p>
            </div>

            <div className="spec-sheet-list">
              <div className="spec-sheet-row">
                <h3 className="spec-row-title">True 300 DPI physical masters</h3>
                <p className="spec-row-desc">
                  Trimmed and scaled with Lanczos3 sharpening onto exact physical print
                  canvases with embedded PNG pHYs resolution metadata.
                </p>
                <span className="spec-row-metric tabular">4200 × 5400 px</span>
              </div>

              <div className="spec-sheet-row">
                <h3 className="spec-row-title">Deterministic alpha-halo hardening</h3>
                <p className="spec-row-desc">
                  Every transparent PNG passes pixel-level alpha-fringe inspection and
                  optional edge choking so white underbases never bleed on dark cotton.
                </p>
                <span className="spec-row-metric tabular">Alpha 1..235 X-Ray</span>
              </div>

              <div className="spec-sheet-row">
                <h3 className="spec-row-title">Chained surgical revisions</h3>
                <p className="spec-row-desc">
                  Leave a one-line art direction note in the studio to run a Meshy
                  image-to-image revision chained directly to your winning task ID.
                </p>
                <span className="spec-row-metric tabular">input_task_id edit</span>
              </div>

              <div className="spec-sheet-row">
                <h3 className="spec-row-title">Multi-brand tenant isolation</h3>
                <p className="spec-row-desc">
                  Each brand workspace stores its own Brand Bible, ink palette, blank
                  specs, credit telemetry, and printer dispatch profiles.
                </p>
                <span className="spec-row-metric tabular">Workspace scoped</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Closing Studio Callout */}
        <section className="closing-band">
          <div className="landing-container">
            <div className="closing-inner">
              <h2 className="section-heading">
                Run your next drop through the loop
              </h2>
              <p className="section-body">
                Open the live production desk to configure your Brand Bible, stream
                autonomous agent iterations in real time, and export a 300 DPI print
                tech-pack.
              </p>
              <Link to="/studio" className="btn-primary">
                Open studio dashboard
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="landing-container site-footer-inner">
          <span className="brand-wordmark">
            shirt<span className="brand-wordmark-accent">AI</span>
          </span>
          <div className="footer-links">
            <a href="#pipeline">Pipeline</a>
            <a href="#garment">Garment preview</a>
            <a href="#specs">Print specs</a>
            <Link to="/studio">Studio</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
