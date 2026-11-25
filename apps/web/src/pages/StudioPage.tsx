import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Plus, Send } from "lucide-react";
import {
  BLANK_COLORWAYS,
  PRINT_PLACEMENTS,
  type BlankColorway,
  type BrandBible,
  type CreateLoopInput,
  type LoopIteration,
  type LoopRun,
  type PrinterProfile,
  type Workspace,
} from "@shirtai/shared";
import { GarmentStage, type InspectMode } from "../components/GarmentStage";
import { NewLoopDrawer } from "../components/NewLoopDrawer";
import { api, type SystemStatus } from "../lib/api";
import "../styles/studio.css";

type StudioTab = "desk" | "vault" | "bible" | "printers";

const ACTIVE_STATUSES = new Set([
  "queued",
  "directing",
  "generating",
  "preflight",
  "critiquing",
  "print_prep",
]);

function formatStatusLabel(loop: LoopRun): { text: string; tone: string } {
  switch (loop.status) {
    case "approved":
      return { text: "Print-ready", tone: "status-text--pass" };
    case "dispatched":
      return { text: "Dispatched", tone: "status-text--pass" };
    case "needs_review":
      return { text: "Needs review", tone: "status-text--warn" };
    case "failed":
      return { text: "Failed", tone: "status-text--fail" };
    default:
      return {
        text: `${loop.status.replace("_", " ")} ${loop.currentProgress}%`,
        tone: "status-text--active",
      };
  }
}

function formatActorLabel(actor: string): string {
  switch (actor) {
    case "art_director":
      return "DeepSeek Art Director";
    case "meshy_generator":
      return "Meshy GPT Image 2.6";
    case "sharp_preflight":
      return "Sharp Preflight";
    case "vision_critic":
      return "DeepSeek Vision Critic";
    case "print_prep":
      return "300 DPI Print Prep";
    case "human_director":
      return "Creative Director";
    default:
      return "System";
  }
}

export function StudioPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<StudioTab>("desk");

  const [loops, setLoops] = useState<LoopRun[]>([]);
  const [selectedLoopId, setSelectedLoopId] = useState<string>("");
  const [selectedIterId, setSelectedIterId] = useState<string>("");

  const [inspectMode, setInspectMode] = useState<InspectMode>("mockup");
  const [previewColorway, setPreviewColorway] = useState<BlankColorway>("obsidian");
  const [showGuides, setShowGuides] = useState(false);

  const [liveProgressMsg, setLiveProgressMsg] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);

  const [brandBible, setBrandBible] = useState<BrandBible | null>(null);
  const [bibleSavedMsg, setBibleSavedMsg] = useState("");
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [printerSavedId, setPrinterSavedId] = useState("");

  // Initial load: system status + multi-tenant workspaces
  useEffect(() => {
    Promise.all([api.getSystemStatus(), api.listWorkspaces()])
      .then(([sys, wsList]) => {
        setStatus(sys);
        setWorkspaces(wsList);
        const initialId =
          wsList.find((w) => w.id === sys.foundingWorkspaceId)?.id ??
          wsList[0]?.id ??
          "";
        setActiveWsId(initialId);
      })
      .catch((err) => console.error("Studio bootstrap failed:", err));
  }, []);

  const loadWorkspaceData = useCallback(async (wsId: string) => {
    if (!wsId) return;
    const [loopList, bible, printerList] = await Promise.all([
      api.listLoops(wsId),
      api.getBrandBible(wsId),
      api.listPrinters(wsId),
    ]);
    setLoops(loopList);
    setBrandBible(bible);
    setPrinters(printerList);
    setSelectedPrinterId(
      printerList.find((p) => p.isDefault)?.id ?? printerList[0]?.id ?? ""
    );

    if (loopList.length > 0) {
      setSelectedLoopId((prev) =>
        loopList.some((l) => l.id === prev) ? prev : loopList[0].id
      );
    } else {
      setSelectedLoopId("");
    }
  }, []);

  useEffect(() => {
    if (activeWsId) {
      loadWorkspaceData(activeWsId).catch((err) =>
        console.error("Workspace load failed:", err)
      );
    }
  }, [activeWsId, loadWorkspaceData]);

  const selectedLoop = useMemo(
    () => loops.find((l) => l.id === selectedLoopId) ?? null,
    [loops, selectedLoopId]
  );

  // Sync default colorway & best iteration when switching loops
  useEffect(() => {
    if (!selectedLoop) {
      setSelectedIterId("");
      return;
    }
    setPreviewColorway(selectedLoop.blankColorway);
    const preferred =
      selectedLoop.bestIterationId ??
      selectedLoop.iterations[selectedLoop.iterations.length - 1]?.id ??
      "";
    setSelectedIterId((prev) =>
      selectedLoop.iterations.some((i) => i.id === prev) ? prev : preferred
    );
  }, [selectedLoop?.id, selectedLoop?.bestIterationId, selectedLoop?.iterations.length]);

  // Live Hono SSE subscription for the currently selected loop
  useEffect(() => {
    if (!activeWsId || !selectedLoopId) return;
    setLiveProgressMsg("");
    const unsubscribe = api.subscribeToLoop(activeWsId, selectedLoopId, {
      onSnapshot: (updated) => {
        setLoops((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      },
      onUpdate: (updated) => {
        setLoops((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        if (!ACTIVE_STATUSES.has(updated.status)) {
          setLiveProgressMsg("");
          api.getSystemStatus().then(setStatus).catch(() => {});
        }
      },
      onProgress: (prog) => {
        setLiveProgressMsg(prog.message);
        setLoops((prev) =>
          prev.map((l) =>
            l.id === selectedLoopId
              ? {
                  ...l,
                  status: prog.status as LoopRun["status"],
                  currentProgress: prog.progress,
                }
              : l
          )
        );
      },
    });
    return unsubscribe;
  }, [activeWsId, selectedLoopId]);

  const activeIteration: LoopIteration | null = useMemo(() => {
    if (!selectedLoop) return null;
    return (
      selectedLoop.iterations.find((i) => i.id === selectedIterId) ??
      selectedLoop.iterations.find((i) => i.id === selectedLoop.bestIterationId) ??
      selectedLoop.iterations[selectedLoop.iterations.length - 1] ??
      null
    );
  }, [selectedLoop, selectedIterId]);

  async function handleCreateLoop(input: CreateLoopInput) {
    if (!activeWsId) return;
    const created = await api.createLoop(activeWsId, input);
    setLoops((prev) => [created, ...prev]);
    setSelectedLoopId(created.id);
    setActiveTab("desk");
  }

  async function handleCreateWorkspacePrompt() {
    const name = window.prompt("New brand workspace name (B2B tenant):");
    if (!name || name.trim().length < 2) return;
    const tagline =
      window.prompt("Short aesthetic tagline for this label:") ||
      "Independent graphic streetwear apparel";
    const created = await api.createWorkspace({
      name: name.trim(),
      tagline: tagline.trim(),
    });
    setWorkspaces((prev) => [...prev, created]);
    setActiveWsId(created.id);
  }

  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWsId || !selectedLoop || feedbackNote.trim().length < 4) return;
    setFeedbackBusy(true);
    try {
      const updated = await api.sendFeedback(activeWsId, selectedLoop.id, {
        note: feedbackNote.trim(),
        useSunburst: true,
        forceFresh: false,
      });
      setLoops((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setFeedbackNote("");
    } catch (err) {
      console.error(err);
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function handleApproveAndDownload(dispatchNow: boolean) {
    if (!activeWsId || !selectedLoop) return;
    setApproveBusy(true);
    try {
      const updated = await api.approveLoop(activeWsId, selectedLoop.id, {
        iterationId: activeIteration?.id,
        printerProfileId: selectedPrinterId || undefined,
        dispatchNow,
      });
      setLoops((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));

      if (!dispatchNow) {
        const url = api.getTechPackUrl(
          activeWsId,
          selectedLoop.id,
          activeIteration?.id
        );
        window.open(url, "_blank");
      }
    } finally {
      setApproveBusy(false);
    }
  }

  async function handleSaveBrandBible(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWsId || !brandBible) return;
    const updated = await api.updateBrandBible(activeWsId, {
      brandName: brandBible.brandName,
      aestheticDna: brandBible.aestheticDna,
      approvedMotifs: brandBible.approvedMotifs,
      forbiddenTropes: brandBible.forbiddenTropes,
      inkPalette: brandBible.inkPalette,
      typographyDirection: brandBible.typographyDirection,
      defaultBlankSpec: brandBible.defaultBlankSpec,
      maxSpotColors: brandBible.maxSpotColors,
    });
    setBrandBible(updated);
    setBibleSavedMsg("Saved to Mistral cached system prefix");
    setTimeout(() => setBibleSavedMsg(""), 3000);
  }

  async function handleSavePrinter(printer: PrinterProfile) {
    if (!activeWsId) return;
    const updated = await api.updatePrinter(activeWsId, printer.id, {
      name: printer.name,
      location: printer.location,
      supportedMethods: printer.supportedMethods,
      maxSpotColors: printer.maxSpotColors,
      requiredDpi: printer.requiredDpi,
      dispatchEmail: printer.dispatchEmail,
      webhookUrl: printer.webhookUrl,
      notes: printer.notes,
      isDefault: printer.isDefault,
    });
    setPrinters((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setPrinterSavedId(updated.id);
    setTimeout(() => setPrinterSavedId(""), 2500);
  }

  const approvedCount = loops.filter(
    (l) => l.status === "approved" || l.status === "dispatched"
  ).length;
  const isSelectedRunning = selectedLoop
    ? ACTIVE_STATUSES.has(selectedLoop.status)
    : false;
  const placementSpec = selectedLoop
    ? PRINT_PLACEMENTS[selectedLoop.placement]
    : PRINT_PLACEMENTS.full_back;

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <div className="studio-topbar-left">
          <Link to="/" className="brand-wordmark" aria-label="shirtAI landing page">
            shirt<span className="brand-wordmark-accent">AI</span>
          </Link>
          <span className="studio-divider" aria-hidden="true">
            /
          </span>
          <select
            aria-label="Active brand workspace"
            className="workspace-select"
            value={activeWsId}
            onChange={(e) => {
              if (e.target.value === "__create__") {
                handleCreateWorkspacePrompt();
                return;
              }
              setActiveWsId(e.target.value);
            }}
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
            <option value="__create__">+ New brand workspace</option>
          </select>
        </div>

        <nav className="studio-tabs" aria-label="Studio workspace views">
          {(
            [
              ["desk", "Production desk"],
              ["vault", "Print-ready vault"],
              ["bible", "Brand bible"],
              ["printers", "Printers"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`studio-tab ${activeTab === id ? "studio-tab--active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="studio-topbar-right">
          {status?.meshyBalance !== null && status?.meshyBalance !== undefined && (
            <span className="studio-credits-note tabular">
              {status.meshyBalance.toLocaleString()} Meshy credits
            </span>
          )}
          <button
            type="button"
            className="btn-primary studio-new-btn"
            onClick={() => setDrawerOpen(true)}
          >
            <Plus size={15} aria-hidden="true" />
            New drop loop
          </button>
        </div>
      </header>

      {/* TAB 1: IMMEDIATE Y=0 3-ZONE PRODUCTION DESK */}
      {activeTab === "desk" && (
        <div className="desk-layout">
          {/* Left Rail: Loop Queue */}
          <aside className="queue-rail" aria-label="Agentic loop queue">
            <div className="rail-header">
              <h1 className="rail-title">Drop loops</h1>
              <span className="rail-metrics tabular">
                {loops.length} runs · {approvedCount} ready
              </span>
            </div>

            <div className="queue-list">
              {loops.length === 0 ? (
                <div className="empty-studio-state">
                  <p>No loops in this workspace yet.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setDrawerOpen(true)}
                  >
                    Launch first loop
                  </button>
                </div>
              ) : (
                loops.map((loop) => {
                  const st = formatStatusLabel(loop);
                  const best =
                    loop.iterations.find((i) => i.id === loop.bestIterationId) ??
                    loop.iterations[loop.iterations.length - 1];
                  return (
                    <button
                      key={loop.id}
                      type="button"
                      className={`queue-item ${
                        loop.id === selectedLoopId ? "queue-item--selected" : ""
                      }`}
                      onClick={() => setSelectedLoopId(loop.id)}
                    >
                      <span className="queue-item-title">{loop.title}</span>
                      <span className="queue-item-meta tabular">
                        <span>
                          {loop.placement.replace("_", " ")} ·{" "}
                          {loop.iterations.length}/{loop.maxIterations} iter
                        </span>
                        <span className={st.tone}>
                          {best?.critic && !ACTIVE_STATUSES.has(loop.status)
                            ? `${best.critic.overallScore.toFixed(1)} · ${st.text}`
                            : st.text}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Center Stage: Live Garment Canvas & Print Inspector */}
          <main className="center-workbench">
            {selectedLoop ? (
              <>
                <div className="workbench-toolbar">
                  <div className="segmented" role="tablist" aria-label="Inspection layer">
                    {(
                      [
                        ["mockup", "Garment mockup"],
                        ["raw", "Transparent PNG"],
                        ["alpha", "Alpha X-Ray"],
                        ["separation", "Ink separation"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={inspectMode === id}
                        className="segmented-option"
                        onClick={() => setInspectMode(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {selectedLoop.iterations.length > 0 && (
                    <div
                      className="segmented"
                      role="tablist"
                      aria-label="Loop iterations"
                    >
                      {selectedLoop.iterations.map((iter) => (
                        <button
                          key={iter.id}
                          type="button"
                          role="tab"
                          aria-selected={activeIteration?.id === iter.id}
                          className="segmented-option tabular"
                          onClick={() => setSelectedIterId(iter.id)}
                        >
                          Iter {iter.iterationNumber}
                          {iter.critic ? ` (${iter.critic.overallScore.toFixed(1)})` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="workbench-canvas-area">
                  <GarmentStage
                    colorway={previewColorway}
                    placement={selectedLoop.placement}
                    inspectMode={inspectMode}
                    showGuides={showGuides}
                    rawTransparentUrl={activeIteration?.rawTransparentUrl ?? null}
                    alphaDiagnosticUrl={activeIteration?.alphaDiagnosticUrl ?? null}
                    inkSeparationUrl={activeIteration?.inkSeparationUrl ?? null}
                    garmentMockupUrl={activeIteration?.garmentMockupUrl ?? null}
                    altLabel={selectedLoop.title}
                  />

                  {inspectMode === "mockup" && (
                    <div className="workbench-subcontrols">
                      <div className="swatch-row">
                        {(Object.keys(BLANK_COLORWAYS) as BlankColorway[]).map((id) => {
                          const spec = BLANK_COLORWAYS[id];
                          return (
                            <button
                              key={id}
                              type="button"
                              className={`swatch-option ${
                                previewColorway === id ? "swatch-option--active" : ""
                              }`}
                              onClick={() => setPreviewColorway(id)}
                              aria-pressed={previewColorway === id}
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

                      <label className="guide-toggle">
                        <input
                          type="checkbox"
                          checked={showGuides}
                          onChange={(e) => setShowGuides(e.target.checked)}
                        />
                        <span>Placement crop guides</span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="workbench-specbar tabular">
                  <div className="specbar-item">
                    <span className="specbar-label">Print master</span>
                    <span className="specbar-value">
                      {placementSpec.widthPx} × {placementSpec.heightPx} px · 300 DPI
                    </span>
                  </div>

                  <div className="specbar-item">
                    <span className="specbar-label">Alpha halo risk</span>
                    <span className="specbar-value">
                      {activeIteration?.preflight
                        ? `${activeIteration.preflight.edgeHaloRisk} (${activeIteration.preflight.semiTransparentRatioPct}%)`
                        : "Pending"}
                    </span>
                  </div>

                  <div className="specbar-item">
                    <span className="specbar-label">Ink plates</span>
                    <span className="specbar-value">
                      {activeIteration?.preflight ? (
                        <>
                          <span>
                            {activeIteration.preflight.estimatedColorCount} plates
                          </span>
                          <span className="ink-dots">
                            {activeIteration.preflight.dominantColors
                              .slice(0, 5)
                              .map((c) => (
                                <span
                                  key={c.hex}
                                  className="ink-dot"
                                  style={{ backgroundColor: c.hex }}
                                  title={`${c.hex} (${c.coveragePct}%)`}
                                />
                              ))}
                          </span>
                        </>
                      ) : (
                        "Pending"
                      )}
                    </span>
                  </div>

                  <div className="specbar-item">
                    <span className="specbar-label">Run telemetry</span>
                    <span className="specbar-value">
                      {selectedLoop.totalMeshyCredits} Meshy cr ·{" "}
                      {(selectedLoop.totalMistralTokens / 1000).toFixed(1)}k Mistral tok
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-studio-state">
                <p>Select a drop loop or start a new autonomous run.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setDrawerOpen(true)}
                >
                  New drop loop
                </button>
              </div>
            )}
          </main>

          {/* Right Inspector: Vision Critic, Human Gate & Agent Trace */}
          <aside className="inspector-rail" aria-label="Critic inspection and actions">
            {selectedLoop && (
              <>
                {isSelectedRunning && (
                  <section className="inspector-section">
                    <div className="inspector-heading-row">
                      <h2 className="inspector-heading">Autonomous loop active</h2>
                      <span className="tabular">{selectedLoop.currentProgress}%</span>
                    </div>
                    <div className="live-progress-block">
                      <div className="live-progress-track">
                        <div
                          className="live-progress-fill"
                          style={{ width: `${selectedLoop.currentProgress}%` }}
                        />
                      </div>
                      <p className="live-progress-msg">
                        {liveProgressMsg || `Stage: ${selectedLoop.status.replace("_", " ")}`}
                      </p>
                    </div>
                  </section>
                )}

                <section className="inspector-section">
                  <div className="inspector-heading-row">
                    <h2 className="inspector-heading">
                      DeepSeek Vision Critic
                      {activeIteration ? ` · Iter ${activeIteration.iterationNumber}` : ""}
                    </h2>
                    {activeIteration?.critic && (
                      <span className="inspector-score-total tabular">
                        {activeIteration.critic.overallScore.toFixed(1)} / 10
                      </span>
                    )}
                  </div>

                  {activeIteration?.critic ? (
                    <>
                      <p className="inspector-summary">
                        {activeIteration.critic.summary}
                      </p>
                      <div className="critic-bar-list">
                        {(
                          [
                            ["Brand DNA fit", activeIteration.critic.scores.brandDna],
                            ["Composition", activeIteration.critic.scores.composition],
                            ["Typography", activeIteration.critic.scores.typography],
                            [
                              "Print contrast",
                              activeIteration.critic.scores.printContrast,
                            ],
                            ["Alpha edges", activeIteration.critic.scores.alphaEdges],
                          ] as const
                        ).map(([label, val]) => (
                          <div key={label} className="critic-bar-item">
                            <span className="critic-bar-label">{label}</span>
                            <span className="critic-bar-score tabular">
                              {val.toFixed(1)}
                            </span>
                            <div className="critic-bar-track">
                              <div
                                className="critic-bar-fill"
                                style={{ width: `${Math.min(100, val * 10)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {activeIteration.critic.defects.length > 0 && (
                        <ul className="defect-list">
                          {activeIteration.critic.defects.map((defect) => (
                            <li key={defect}>{defect}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="inspector-summary">
                      Waiting for sharp preflight and multimodal Vision Critic score.
                    </p>
                  )}
                </section>

                <section className="inspector-section">
                  <div className="inspector-heading-row">
                    <h2 className="inspector-heading">Director gate</h2>
                  </div>

                  <div className="gate-actions">
                    <button
                      type="button"
                      className="btn-primary btn-primary--full"
                      disabled={approveBusy || isSelectedRunning || !activeIteration}
                      onClick={() => handleApproveAndDownload(false)}
                    >
                      <Download size={15} aria-hidden="true" />
                      Approve & export 300 DPI tech-pack
                    </button>

                    <div className="gate-secondary-row">
                      <select
                        aria-label="Target print partner"
                        className="workspace-select"
                        value={selectedPrinterId}
                        onChange={(e) => setSelectedPrinterId(e.target.value)}
                      >
                        {printers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-action-link"
                        disabled={approveBusy || isSelectedRunning || !activeIteration}
                        onClick={() => handleApproveAndDownload(true)}
                      >
                        Mark dispatched
                      </button>
                    </div>

                    <form className="feedback-form" onSubmit={handleFeedbackSubmit}>
                      <label htmlFor="director-note" className="field-label">
                        Send back into Meshy image-to-image loop
                      </label>
                      <div className="feedback-input-row">
                        <input
                          id="director-note"
                          type="text"
                          className="feedback-input"
                          value={feedbackNote}
                          onChange={(e) => setFeedbackNote(e.target.value)}
                          placeholder="e.g. Heavier concrete distress, deeper crimson"
                          disabled={feedbackBusy || isSelectedRunning}
                        />
                        <button
                          type="submit"
                          className="feedback-submit"
                          disabled={
                            feedbackBusy ||
                            isSelectedRunning ||
                            feedbackNote.trim().length < 4
                          }
                        >
                          <Send size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </form>
                  </div>
                </section>

                <section className="inspector-section">
                  <div className="inspector-heading-row">
                    <h2 className="inspector-heading">Agent loop trace</h2>
                    <span className="rail-metrics tabular">
                      {selectedLoop.traceEvents.length} events
                    </span>
                  </div>

                  <ol className="trace-list">
                    {[...selectedLoop.traceEvents].reverse().map((evt) => (
                      <li key={evt.id} className="trace-item">
                        <div className="trace-top">
                          <span className="trace-actor">
                            {formatActorLabel(evt.actor)}
                          </span>
                          <span className="trace-actor tabular">
                            {evt.iterationNumber > 0
                              ? `Iter ${evt.iterationNumber}`
                              : "Setup"}
                          </span>
                        </div>
                        <p className="trace-msg">{evt.message}</p>
                        {evt.detail && <p className="trace-detail">{evt.detail}</p>}
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </aside>
        </div>
      )}

      {/* TAB 2: PRINT-READY VAULT (Dense Tabular Spec Table) */}
      {activeTab === "vault" && (
        <main className="studio-page-pane">
          <div className="pane-header">
            <div>
              <h1 className="pane-title">Print-ready vault</h1>
              <p className="pane-desc">
                Verified 300 DPI masters, preflight telemetry, and instant print-house ZIP
                exports for {brandBible?.brandName}.
              </p>
            </div>
          </div>

          <div className="vault-table-wrap">
            <table className="vault-table tabular">
              <thead>
                <tr>
                  <th>Drop</th>
                  <th>Placement & Canvas</th>
                  <th>Blank & Method</th>
                  <th>Alpha halo</th>
                  <th>Critic score</th>
                  <th>Credits</th>
                  <th>Status</th>
                  <th>Tech-pack</th>
                </tr>
              </thead>
              <tbody>
                {loops.map((loop) => {
                  const iter =
                    loop.iterations.find((i) => i.id === loop.bestIterationId) ??
                    loop.iterations[loop.iterations.length - 1];
                  const pSpec = PRINT_PLACEMENTS[loop.placement];
                  const st = formatStatusLabel(loop);
                  return (
                    <tr key={loop.id}>
                      <td>
                        <div className="vault-drop-cell">
                          {iter?.garmentMockupUrl && (
                            <img
                              src={iter.garmentMockupUrl}
                              alt={loop.title}
                              className="vault-thumb"
                            />
                          )}
                          <div>
                            <div className="vault-drop-title">{loop.title}</div>
                            <div className="vault-drop-sub">
                              {loop.iterations.length} iterations ·{" "}
                              {iter?.aiModel ?? "pending"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {pSpec.widthInches} × {pSpec.heightInches} in ({pSpec.widthPx} ×{" "}
                        {pSpec.heightPx} px)
                      </td>
                      <td>
                        {BLANK_COLORWAYS[loop.blankColorway].label} ·{" "}
                        {loop.printMethod.replace("_", " ")}
                      </td>
                      <td>
                        {iter?.preflight
                          ? `${iter.preflight.edgeHaloRisk} (${iter.preflight.semiTransparentRatioPct}%)`
                          : "N/A"}
                      </td>
                      <td>
                        {iter?.critic
                          ? `${iter.critic.overallScore.toFixed(1)} / 10`
                          : "Pending"}
                      </td>
                      <td>{loop.totalMeshyCredits} cr</td>
                      <td className={st.tone}>{st.text}</td>
                      <td>
                        {iter ? (
                          <a
                            href={api.getTechPackUrl(activeWsId, loop.id, iter.id)}
                            className="text-action-link"
                          >
                            Download ZIP
                          </a>
                        ) : (
                          "Pending"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* TAB 3: TENANT BRAND BIBLE */}
      {activeTab === "bible" && brandBible && (
        <main className="studio-page-pane">
          <div className="pane-header">
            <div>
              <h1 className="pane-title">Brand bible</h1>
              <p className="pane-desc">
                Pinned into Mistral prompt cache ($0.007 / 1M cached tokens) to steer DeepSeek
                Art Direction and Vision Critique on every run.
              </p>
            </div>
            {bibleSavedMsg && <span className="save-feedback">{bibleSavedMsg}</span>}
          </div>

          <form className="bible-grid" onSubmit={handleSaveBrandBible}>
            <div className="field-group">
              <label htmlFor="bb-name" className="field-label">
                Brand name
              </label>
              <input
                id="bb-name"
                className="field-input"
                value={brandBible.brandName}
                onChange={(e) =>
                  setBrandBible({ ...brandBible, brandName: e.target.value })
                }
              />
            </div>

            <div className="field-group">
              <label htmlFor="bb-spots" className="field-label">
                Max plastisol spot inks
              </label>
              <input
                id="bb-spots"
                type="number"
                min={1}
                max={8}
                className="field-input tabular"
                value={brandBible.maxSpotColors}
                onChange={(e) =>
                  setBrandBible({
                    ...brandBible,
                    maxSpotColors: Number(e.target.value),
                  })
                }
              />
            </div>

            <div className="field-group bible-full">
              <label htmlFor="bb-dna" className="field-label">
                Aesthetic DNA
              </label>
              <textarea
                id="bb-dna"
                rows={3}
                className="field-textarea"
                value={brandBible.aestheticDna}
                onChange={(e) =>
                  setBrandBible({ ...brandBible, aestheticDna: e.target.value })
                }
              />
            </div>

            <div className="field-group">
              <label htmlFor="bb-motifs" className="field-label">
                Approved motifs (one per line)
              </label>
              <textarea
                id="bb-motifs"
                rows={6}
                className="field-textarea"
                value={brandBible.approvedMotifs.join("\n")}
                onChange={(e) =>
                  setBrandBible({
                    ...brandBible,
                    approvedMotifs: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>

            <div className="field-group">
              <label htmlFor="bb-forbidden" className="field-label">
                Forbidden tropes (instant Vision Critic rejection)
              </label>
              <textarea
                id="bb-forbidden"
                rows={6}
                className="field-textarea"
                value={brandBible.forbiddenTropes.join("\n")}
                onChange={(e) =>
                  setBrandBible({
                    ...brandBible,
                    forbiddenTropes: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>

            <div className="field-group">
              <label htmlFor="bb-type" className="field-label">
                Typography direction
              </label>
              <input
                id="bb-type"
                className="field-input"
                value={brandBible.typographyDirection}
                onChange={(e) =>
                  setBrandBible({
                    ...brandBible,
                    typographyDirection: e.target.value,
                  })
                }
              />
            </div>

            <div className="field-group">
              <label htmlFor="bb-blank" className="field-label">
                Default garment blank spec
              </label>
              <input
                id="bb-blank"
                className="field-input"
                value={brandBible.defaultBlankSpec}
                onChange={(e) =>
                  setBrandBible({
                    ...brandBible,
                    defaultBlankSpec: e.target.value,
                  })
                }
              />
            </div>

            <div className="bible-full">
              <button type="submit" className="btn-primary">
                Save brand bible
              </button>
            </div>
          </form>
        </main>
      )}

      {/* TAB 4: TENANT PRINTER PROFILES */}
      {activeTab === "printers" && (
        <main className="studio-page-pane">
          <div className="pane-header">
            <div>
              <h1 className="pane-title">Print partners</h1>
              <p className="pane-desc">
                Configure prepress requirements, spot-color caps, and dispatch endpoints for
                each print house linked to this workspace.
              </p>
            </div>
          </div>

          <div className="printer-list">
            {printers.map((printer) => (
              <div key={printer.id} className="printer-row">
                <div>
                  <h2 className="printer-name">{printer.name}</h2>
                  <p className="printer-loc">
                    {printer.location} · {printer.requiredDpi} DPI · max{" "}
                    {printer.maxSpotColors} inks
                  </p>
                </div>

                <div className="bible-grid">
                  <div className="field-group">
                    <label className="field-label">Dispatch email</label>
                    <input
                      className="field-input"
                      value={printer.dispatchEmail}
                      onChange={(e) =>
                        setPrinters((prev) =>
                          prev.map((p) =>
                            p.id === printer.id
                              ? { ...p, dispatchEmail: e.target.value }
                              : p
                          )
                        )
                      }
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Webhook URL (optional)</label>
                    <input
                      className="field-input"
                      value={printer.webhookUrl}
                      onChange={(e) =>
                        setPrinters((prev) =>
                          prev.map((p) =>
                            p.id === printer.id
                              ? { ...p, webhookUrl: e.target.value }
                              : p
                          )
                        )
                      }
                    />
                  </div>

                  <div className="field-group bible-full">
                    <label className="field-label">Prepress instructions</label>
                    <input
                      className="field-input"
                      value={printer.notes}
                      onChange={(e) =>
                        setPrinters((prev) =>
                          prev.map((p) =>
                            p.id === printer.id ? { ...p, notes: e.target.value } : p
                          )
                        )
                      }
                    />
                  </div>

                  <div className="bible-full">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleSavePrinter(printer)}
                    >
                      {printerSavedId === printer.id ? "Saved" : "Save print partner"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      <NewLoopDrawer
        open={drawerOpen}
        liveKeysConfigured={Boolean(status?.liveKeysConfigured)}
        meshyBalance={status?.meshyBalance ?? null}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleCreateLoop}
      />
    </div>
  );
}
