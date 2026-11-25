import {
  BLANK_COLORWAYS,
  PRINT_PLACEMENTS,
  type BlankColorway,
  type PrintPlacement,
} from "@shirtai/shared";

export type InspectMode = "mockup" | "raw" | "alpha" | "separation";

interface GarmentStageProps {
  colorway: BlankColorway;
  placement: PrintPlacement;
  inspectMode: InspectMode;
  showGuides: boolean;
  /** Live transparent RGBA graphic URL (overlaid dynamically onto blank tee in mockup mode) */
  rawTransparentUrl: string | null;
  /** Pre-rendered sharp alpha X-Ray diagnostic image */
  alphaDiagnosticUrl?: string | null;
  /** Pre-rendered sharp quantized ink separation preview */
  inkSeparationUrl?: string | null;
  /** Optional server-rendered garment composite fallback */
  garmentMockupUrl?: string | null;
  altLabel: string;
}

export function GarmentStage({
  colorway,
  placement,
  inspectMode,
  showGuides,
  rawTransparentUrl,
  alphaDiagnosticUrl,
  inkSeparationUrl,
  garmentMockupUrl,
  altLabel,
}: GarmentStageProps) {
  const blank = BLANK_COLORWAYS[colorway];
  const placementSpec = PRINT_PLACEMENTS[placement];
  const rect = placementSpec.overlayRect;

  return (
    <div className={`garment-stage garment-stage--${inspectMode}`}>
      {inspectMode === "mockup" && (
        <div className="garment-canvas-frame">
          <img
            src={blank.blankAssetPath}
            alt={`${blank.label} 300gsm blank tee`}
            className="garment-blank-img"
          />

          {rawTransparentUrl ? (
            <div
              className="garment-print-overlay"
              style={{
                left: `${rect.left * 100}%`,
                top: `${rect.top * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
            >
              <img
                src={rawTransparentUrl}
                alt={altLabel}
                className={`garment-print-art ${
                  blank.isDarkGarment ? "garment-print-art--dark" : "garment-print-art--light"
                }`}
              />
            </div>
          ) : garmentMockupUrl ? (
            <img
              src={garmentMockupUrl}
              alt={altLabel}
              className="garment-blank-img garment-blank-img--composite"
            />
          ) : null}

          {showGuides && (
            <div
              className="garment-guide-box"
              style={{
                left: `${rect.left * 100}%`,
                top: `${rect.top * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
              aria-hidden="true"
            >
              <span className="guide-corner guide-corner--tl" />
              <span className="guide-corner guide-corner--tr" />
              <span className="guide-corner guide-corner--bl" />
              <span className="guide-corner guide-corner--br" />
              <span className="guide-dim tabular">
                {placementSpec.widthInches} × {placementSpec.heightInches} in ·{" "}
                {placementSpec.collarDropInches} in drop
              </span>
            </div>
          )}
        </div>
      )}

      {inspectMode === "raw" && (
        <div className="garment-canvas-frame garment-canvas-frame--checker">
          {rawTransparentUrl ? (
            <img
              src={rawTransparentUrl}
              alt={`${altLabel} transparent RGBA PNG`}
              className="garment-isolated-img"
            />
          ) : (
            <p className="garment-empty-note">Waiting for transparent RGBA render</p>
          )}
        </div>
      )}

      {inspectMode === "alpha" && (
        <div className="garment-canvas-frame garment-canvas-frame--xray">
          {alphaDiagnosticUrl ? (
            <img
              src={alphaDiagnosticUrl}
              alt={`${altLabel} alpha-edge halo diagnostic`}
              className="garment-isolated-img"
            />
          ) : (
            <p className="garment-empty-note">
              Alpha X-Ray renders after deterministic sharp preflight
            </p>
          )}
        </div>
      )}

      {inspectMode === "separation" && (
        <div className="garment-canvas-frame garment-canvas-frame--sep">
          {inkSeparationUrl ? (
            <img
              src={inkSeparationUrl}
              alt={`${altLabel} spot-color ink separation preview`}
              className="garment-isolated-img"
            />
          ) : (
            <p className="garment-empty-note">
              Ink separation preview renders after sharp quantization
            </p>
          )}
        </div>
      )}
    </div>
  );
}
