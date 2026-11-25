import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { strToU8, zipSync } from "fflate";
import {
  BLANK_COLORWAYS,
  PRINT_PLACEMENTS,
  type BlankColorway,
  type BrandBible,
  type LoopIteration,
  type LoopRun,
  type PrintMethod,
  type PrintPlacement,
  type PrintPreflightReport,
  type PrinterProfile,
} from "@shirtai/shared";
import { config } from "../config";

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
      .toUpperCase()
  );
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

/**
 * Deterministic Pre-Critic Alpha Cleanup & Dark-Cotton Knockout:
 * Empirically calibrated against Meshy GPT Image 2.6 transparent outputs:
 * - Removes low-opacity interior cutout mist/shadows (alpha < 110 -> 0)
 * - Hardens solid print pixels (alpha >= 180 -> 255) with a tight crisp ramp
 * - On dark garments in screen_print mode, optionally knocks out flat pure-black
 *   background fills (lum < 14, low saturation) so the 300gsm cotton breathes.
 */
export async function cleanTransparentGraphicForPrint(params: {
  rawPngBuffer: Buffer;
  alphaChokeEnabled: boolean;
  darkGarmentKnockout: boolean;
}): Promise<{
  cleanedBuffer: Buffer;
  rawSemiTransparentPct: number;
  cleanedSemiTransparentPct: number;
  knockedOutBlackPixels: number;
}> {
  const { data, info } = await sharp(params.rawPngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  let rawNonEmpty = 0;
  let rawSemi = 0;
  let cleanNonEmpty = 0;
  let cleanSemi = 0;
  let knockedOutBlackPixels = 0;

  for (let i = 0; i < out.length; i += info.channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    let a = out[i + 3];

    if (a > 4) {
      rawNonEmpty++;
      if (a < 235) rawSemi++;
    }

    if (params.alphaChokeEnabled) {
      if (a < 110) {
        a = 0;
      } else if (a >= 180) {
        a = 255;
      } else {
        a = Math.round(((a - 110) / 70) * 255);
      }
    }

    // Dark-cotton garment knockout: knock out near-pure-black interior fills
    // when printing on Washed Obsidian so the shirt doesn't feel like a rubber slab.
    if (params.darkGarmentKnockout && a > 0) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (lum < 18 && maxC - minC < 12) {
        a = 0;
        knockedOutBlackPixels++;
      }
    }

    out[i + 3] = a;

    if (a > 4) {
      cleanNonEmpty++;
      if (a < 235) cleanSemi++;
    }
  }

  const cleanedBuffer = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return {
    cleanedBuffer,
    rawSemiTransparentPct: Number(
      ((rawSemi / Math.max(1, rawNonEmpty)) * 100).toFixed(1)
    ),
    cleanedSemiTransparentPct: Number(
      ((cleanSemi / Math.max(1, cleanNonEmpty)) * 100).toFixed(1)
    ),
    knockedOutBlackPixels,
  };
}

export interface PreflightArtifactSet {
  preflight: PrintPreflightReport;
  cleanedPngBuffer: Buffer;
  rawTransparentRelPath: string;
  garmentMockupRelPath: string;
  alphaDiagnosticRelPath: string;
  inkSeparationRelPath: string;
  garmentMockupBase64: string;
  alphaDiagnosticBase64: string;
}

/**
 * Deterministic print-engineering preflight built on sharp:
 * 1. Persists raw Meshy PNG and runs deterministic pre-critic alpha cleanup + dark-cotton knockout
 * 2. Computes hue-aware screen-print ink plate counts (treating white/grey halftones as 1 plate!)
 * 3. Composites the cleaned graphic onto the real 300gsm studio blank tee for Vision Critic & UI
 * 4. Renders a magenta Alpha-Edge X-Ray Diagnostic PNG
 * 5. Renders a quantized spot-color screen-print ink separation preview
 */
export async function runPreflightAndRenderArtifacts(params: {
  rawPngBuffer: Buffer;
  colorway: BlankColorway;
  placement: PrintPlacement;
  printMethod: PrintMethod;
  alphaChokeEnabled: boolean;
  maxSpotColors: number;
  loopId: string;
  iterationNumber: number;
}): Promise<PreflightArtifactSet> {
  const dir = path.join(config.storageDir, "loops", params.loopId);
  await fs.mkdir(dir, { recursive: true });

  const prefix = `iter-${params.iterationNumber}`;
  const rawMeshyFileName = `${prefix}-meshy-original.png`;
  const cleanedFileName = `${prefix}-raw.png`;
  const mockupFileName = `${prefix}-mockup.jpg`;
  const alphaFileName = `${prefix}-alpha-xray.png`;
  const sepFileName = `${prefix}-ink-sep.png`;

  // Persist untouched original Meshy output before retention expires
  await fs.writeFile(path.join(dir, rawMeshyFileName), params.rawPngBuffer);

  const blankSpec = BLANK_COLORWAYS[params.colorway];
  const darkKnockout =
    blankSpec.isDarkGarment &&
    params.colorway === "obsidian" &&
    params.printMethod === "screen_print";

  // Upgrade #1: Deterministic alpha cleanup BEFORE Vision Critic inspects the shirt
  const cleaned = await cleanTransparentGraphicForPrint({
    rawPngBuffer: params.rawPngBuffer,
    alphaChokeEnabled: params.alphaChokeEnabled,
    darkGarmentKnockout: darkKnockout,
  });

  await fs.writeFile(path.join(dir, cleanedFileName), cleaned.cleanedBuffer);

  const { data, info } = await sharp(cleaned.cleanedBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const totalPixels = width * height;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let opaqueCount = 0;
  let semiTransparentCount = 0;
  let transparentCount = 0;

  // Upgrade #2: Hue-aware screen-print ink plate clustering
  // Groups chalk/grey halftone values into a single white-halftone plate and clusters chromatic hues cleanly
  const plateBuckets = new Map<
    string,
    { label: string; count: number; rSum: number; gSum: number; bSum: number }
  >();

  const xrayBuf = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      const outIdx = (y * width + x) * 4;

      if (a <= 4) {
        transparentCount++;
        const checker = ((x >> 4) + (y >> 4)) % 2 === 0 ? 17 : 23;
        xrayBuf[outIdx] = checker;
        xrayBuf[outIdx + 1] = checker + 2;
        xrayBuf[outIdx + 2] = checker + 5;
        xrayBuf[outIdx + 3] = 255;
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        if (a >= 235) {
          opaqueCount++;
          const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          const toned = Math.round(55 + (lum / 255) * 145);
          xrayBuf[outIdx] = toned;
          xrayBuf[outIdx + 1] = toned;
          xrayBuf[outIdx + 2] = toned;
          xrayBuf[outIdx + 3] = 255;

          const hsl = rgbToHsl(r, g, b);
          let plateKey: string;
          if (hsl.s < 0.16 || hsl.l < 0.12 || hsl.l > 0.9) {
            if (hsl.l < 0.22) plateKey = "plate_soot";
            else if (hsl.l < 0.6) plateKey = "plate_ash_halftone";
            else plateKey = "plate_chalk_white";
          } else {
            // 12 chromatic hue bins (30 deg each)
            const hueBin = Math.floor(((hsl.h + 15) % 360) / 30);
            plateKey = `plate_hue_${hueBin}`;
          }

          const bucket = plateBuckets.get(plateKey);
          if (bucket) {
            bucket.count++;
            bucket.rSum += r;
            bucket.gSum += g;
            bucket.bSum += b;
          } else {
            plateBuckets.set(plateKey, {
              label: plateKey,
              count: 1,
              rSum: r,
              gSum: g,
              bSum: b,
            });
          }
        } else {
          semiTransparentCount++;
          xrayBuf[outIdx] = 255;
          xrayBuf[outIdx + 1] = 30;
          xrayBuf[outIdx + 2] = 86;
          xrayBuf[outIdx + 3] = 255;
        }
      }
    }
  }

  const nonEmptyPixels = Math.max(1, opaqueCount + semiTransparentCount);
  const opaqueCoveragePct = Number(((opaqueCount / totalPixels) * 100).toFixed(1));
  const semiTransparentRatioPct = Number(
    ((semiTransparentCount / nonEmptyPixels) * 100).toFixed(1)
  );
  const hasCleanTransparency = transparentCount / totalPixels >= 0.08;

  const trimmedWidth = maxX >= minX ? maxX - minX + 1 : width;
  const trimmedHeight = maxY >= minY ? maxY - minY + 1 : height;

  const edgeHaloRisk: "low" | "medium" | "high" =
    semiTransparentRatioPct < 6.0
      ? "low"
      : semiTransparentRatioPct < 14.0
      ? "medium"
      : "high";

  const significantPlates = [...plateBuckets.values()]
    .filter((b) => b.count / Math.max(1, opaqueCount) >= 0.025)
    .sort((a, b) => b.count - a.count);

  const dominantColors = significantPlates.slice(0, 6).map((b) => ({
    hex: toHex(b.rSum / b.count, b.gSum / b.count, b.bSum / b.count),
    coveragePct: Number(((b.count / Math.max(1, opaqueCount)) * 100).toFixed(1)),
  }));

  const warnings: string[] = [];
  if (!hasCleanTransparency) {
    warnings.push(
      "Opaque background detected (<8% transparent pixels). Background removal failed or solid box frame was drawn."
    );
  }
  if (cleaned.rawSemiTransparentPct - cleaned.cleanedSemiTransparentPct >= 5) {
    warnings.push(
      `Alpha-choke cleaned Meshy fringe from ${cleaned.rawSemiTransparentPct}% down to ${cleaned.cleanedSemiTransparentPct}% semi-transparent pixels.`
    );
  }
  if (edgeHaloRisk === "high") {
    warnings.push(
      `Residual semi-transparent fringe (${semiTransparentRatioPct}%) remains high after cleanup.`
    );
  }
  if (significantPlates.length > params.maxSpotColors) {
    warnings.push(
      `Detected ${significantPlates.length} ink plates (brand limit: ${params.maxSpotColors} spot inks).`
    );
  }

  const preflight: PrintPreflightReport = {
    rawWidth: width,
    rawHeight: height,
    trimmedWidth,
    trimmedHeight,
    opaqueCoveragePct,
    semiTransparentRatioPct,
    edgeHaloRisk,
    estimatedColorCount: Math.max(1, significantPlates.length),
    dominantColors,
    hasCleanTransparency,
    warnings,
  };

  // Write Alpha X-Ray Diagnostic PNG
  const alphaPngBuffer = await sharp(xrayBuf, {
    raw: { width, height, channels: 4 },
  })
    .resize({ width: 900, height: 1200, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 8 })
    .toBuffer();
  await fs.writeFile(path.join(dir, alphaFileName), alphaPngBuffer);

  // Trim cleaned graphic cleanly for blank compositing & ink separation
  const trimmedGraphicBuffer =
    maxX > minX && maxY > minY
      ? await sharp(cleaned.cleanedBuffer)
          .extract({
            left: minX,
            top: minY,
            width: trimmedWidth,
            height: trimmedHeight,
          })
          .png()
          .toBuffer()
      : cleaned.cleanedBuffer;

  // Render Garment Mockup composited onto the REAL 300gsm studio blank photograph
  const blankPath = path.join(config.blanksDir, `${params.colorway}.jpg`);
  const blankMeta = await sharp(blankPath).metadata();
  const blankW = blankMeta.width ?? 1024;
  const blankH = blankMeta.height ?? 1365;
  const rect = PRINT_PLACEMENTS[params.placement].overlayRect;

  const targetW = Math.round(blankW * rect.width);
  const targetH = Math.round(blankH * rect.height);
  const resizedPrint = await sharp(trimmedGraphicBuffer)
    .resize({
      width: targetW,
      height: targetH,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const resizedMeta = await sharp(resizedPrint).metadata();
  const printW = resizedMeta.width ?? targetW;
  const printH = resizedMeta.height ?? targetH;

  const compLeft = Math.round(blankW * rect.left + (targetW - printW) / 2);
  const compTop = Math.round(blankH * rect.top + (targetH - printH) / 2);

  const garmentMockupBuffer = await sharp(blankPath)
    .composite([
      {
        input: resizedPrint,
        left: Math.max(0, compLeft),
        top: Math.max(0, compTop),
        blend: "over",
      },
    ])
    .resize({ width: 960, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  await fs.writeFile(path.join(dir, mockupFileName), garmentMockupBuffer);

  // Render quantized spot-color ink separation preview
  const sepBuffer = await sharp(trimmedGraphicBuffer)
    .resize({ width: 900, height: 1200, fit: "inside", withoutEnlargement: true })
    .png({
      palette: true,
      colours: Math.max(3, Math.min(12, params.maxSpotColors + 1)),
      dither: 0.85,
    })
    .toBuffer();
  await fs.writeFile(path.join(dir, sepFileName), sepBuffer);

  const relBase = `/storage/loops/${params.loopId}`;
  return {
    preflight,
    cleanedPngBuffer: cleaned.cleanedBuffer,
    rawTransparentRelPath: `${relBase}/${cleanedFileName}`,
    garmentMockupRelPath: `${relBase}/${mockupFileName}`,
    alphaDiagnosticRelPath: `${relBase}/${alphaFileName}`,
    inkSeparationRelPath: `${relBase}/${sepFileName}`,
    garmentMockupBase64: garmentMockupBuffer.toString("base64"),
    alphaDiagnosticBase64: alphaPngBuffer.toString("base64"),
  };
}

/**
 * Deterministic 300 DPI Print Master Builder:
 * Scales the already-cleaned transparent RGBA graphic cleanly onto the exact
 * physical 300 DPI print canvas with embedded pHYs 300 DPI metadata.
 */
export async function buildPrintMaster300Dpi(params: {
  cleanedPngBuffer: Buffer;
  placement: PrintPlacement;
  loopId: string;
  iterationNumber: number;
}): Promise<{ relPath: string; fullPath: string; widthPx: number; heightPx: number }> {
  const dir = path.join(config.storageDir, "loops", params.loopId);
  await fs.mkdir(dir, { recursive: true });

  const spec = PRINT_PLACEMENTS[params.placement];
  const fileName = `iter-${params.iterationNumber}-print-master-300dpi.png`;
  const fullPath = path.join(dir, fileName);

  const { data, info } = await sharp(params.cleanedPngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      if (data[idx + 3] > 4) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  let pipeline = sharp(params.cleanedPngBuffer).ensureAlpha();
  if (maxX > minX && maxY > minY) {
    pipeline = pipeline.extract({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    });
  }

  const innerW = Math.round(spec.widthPx * 0.96);
  const innerH = Math.round(spec.heightPx * 0.96);

  const scaledGraphic = await pipeline
    .resize({
      width: innerW,
      height: innerH,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 0.75, m1: 1.0, m2: 1.5 })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: spec.widthPx,
      height: spec.heightPx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaledGraphic, gravity: "center" }])
    .withMetadata({ density: spec.dpi })
    .png({ compressionLevel: 6 })
    .toFile(fullPath);

  return {
    relPath: `/storage/loops/${params.loopId}/${fileName}`,
    fullPath,
    widthPx: spec.widthPx,
    heightPx: spec.heightPx,
  };
}

function resolveStoragePath(relUrl: string | null): string | null {
  if (!relUrl || !relUrl.startsWith("/storage/")) return null;
  const sub = relUrl.slice("/storage/".length);
  return path.join(config.storageDir, sub);
}

export async function assembleTechPackZip(params: {
  loop: LoopRun;
  iteration: LoopIteration;
  bible: BrandBible;
  printer: PrinterProfile | null;
}): Promise<{ zipBytes: Uint8Array; filename: string }> {
  const { loop, iteration, bible, printer } = params;
  const placementSpec = PRINT_PLACEMENTS[loop.placement];
  const blankSpec = BLANK_COLORWAYS[loop.blankColorway];

  const entries: Record<string, Uint8Array> = {};

  const fileMappings: Array<[string, string | null]> = [
    [
      "01-print-master-300dpi.png",
      iteration.printMasterUrl ?? iteration.rawTransparentUrl,
    ],
    ["02-garment-mockup.jpg", iteration.garmentMockupUrl],
    ["03-alpha-preflight-xray.png", iteration.alphaDiagnosticUrl],
    ["04-ink-separation-preview.png", iteration.inkSeparationUrl],
  ];

  for (const [zipName, relUrl] of fileMappings) {
    const abs = resolveStoragePath(relUrl);
    if (!abs) continue;
    try {
      const buf = await fs.readFile(abs);
      entries[zipName] = new Uint8Array(buf);
    } catch {
      // Skip optional artifact if missing
    }
  }

  const manifest = {
    schemaVersion: "shirtai.techpack.v1",
    generatedAt: new Date().toISOString(),
    brand: bible.brandName,
    dropTitle: loop.title,
    loopId: loop.id,
    iterationNumber: iteration.iterationNumber,
    printSpecification: {
      method: loop.printMethod,
      placement: placementSpec.label,
      physicalInches: `${placementSpec.widthInches} x ${placementSpec.heightInches} in`,
      pixelCanvas: `${placementSpec.widthPx} x ${placementSpec.heightPx} px`,
      dpi: placementSpec.dpi,
      collarDropInches: placementSpec.collarDropInches,
      alphaChokeApplied: loop.alphaChokeEnabled,
      garmentBlank: {
        colorway: blankSpec.label,
        hex: blankSpec.hex,
        fabric: blankSpec.fabricNote,
        defaultBlankSpec: bible.defaultBlankSpec,
      },
      inkPlates: iteration.preflight?.dominantColors ?? [],
      brandInkPalette: bible.inkPalette,
    },
    qualityVerification: {
      preflight: iteration.preflight,
      criticVerdict: iteration.critic,
    },
    targetPrinter: printer
      ? {
          name: printer.name,
          location: printer.location,
          dispatchEmail: printer.dispatchEmail,
          notes: printer.notes,
        }
      : null,
  };

  entries["06-tech-pack-manifest.json"] = strToU8(
    JSON.stringify(manifest, null, 2)
  );

  const inkRows = (iteration.preflight?.dominantColors ?? [])
    .map(
      (c) =>
        `<tr><td><span style="display:inline-block;width:14px;height:14px;background:${c.hex};border:1px solid #333;vertical-align:middle;margin-right:8px;"></span>${c.hex}</td><td>${c.coveragePct}%</td></tr>`
    )
    .join("");

  const techSheetHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${bible.brandName} · ${loop.title} Print Tech-Pack</title>
<style>
  body { font-family: Inter, -apple-system, sans-serif; color: #111; max-width: 820px; margin: 40px auto; padding: 0 24px; line-height: 1.5; }
  h1 { font-size: 32px; letter-spacing: -0.03em; margin: 0 0 6px; }
  .meta { color: #555; font-size: 14px; margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-size: 14px; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #ddd; }
  th { font-weight: 600; color: #333; width: 34%; }
  h2 { font-size: 18px; margin-top: 28px; border-bottom: 2px solid #111; padding-bottom: 6px; }
</style>
</head>
<body>
  <h1>${bible.brandName} · ${loop.title}</h1>
  <div class="meta">shirtAI Production Tech-Pack · Loop ${loop.id} · Iteration ${iteration.iterationNumber} · Generated ${new Date().toISOString()}</div>
  <h2>Garment & Placement Specification</h2>
  <table>
    <tr><th>Garment blank</th><td>${bible.defaultBlankSpec} (${blankSpec.label}, ${blankSpec.hex})</td></tr>
    <tr><th>Print process</th><td>${loop.printMethod}</td></tr>
    <tr><th>Print placement</th><td>${placementSpec.label}</td></tr>
    <tr><th>Collar drop</th><td>${placementSpec.collarDropInches} inches below bottom of collar seam</td></tr>
    <tr><th>Master file dimensions</th><td>${placementSpec.widthPx} × ${placementSpec.heightPx} px at ${placementSpec.dpi} DPI (RGBA transparent PNG)</td></tr>
    <tr><th>Alpha edge hardening</th><td>${loop.alphaChokeEnabled ? "Applied pre-critic & master (zero translucent underbase halo)" : "Raw alpha preserved"}</td></tr>
    <tr><th>Target print house</th><td>${printer ? `${printer.name} (${printer.location}) · ${printer.dispatchEmail}` : "Unassigned"}</td></tr>
  </table>
  <h2>Detected Ink Plates</h2>
  <table>
    <tr><th>Plate Hex</th><th>Opaque Print Coverage</th></tr>
    ${inkRows || "<tr><td colspan='2'>See 01-print-master-300dpi.png</td></tr>"}
  </table>
  <h2>Quality Control Verification</h2>
  <table>
    <tr><th>Vision Critic Score</th><td>${iteration.critic ? `${iteration.critic.overallScore.toFixed(1)} / 10 (${iteration.critic.decision})` : "Pending"}</td></tr>
    <tr><th>Alpha Halo Risk</th><td>${iteration.preflight ? `${iteration.preflight.edgeHaloRisk} (${iteration.preflight.semiTransparentRatioPct}% semi-transparent edge pixels)` : "N/A"}</td></tr>
    <tr><th>Director Summary</th><td>${iteration.critic?.summary ?? loop.brief}</td></tr>
  </table>
</body>
</html>`;

  entries["05-PRINTER-TECH-PACK.html"] = strToU8(techSheetHtml);

  const safeSlug = loop.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);

  return {
    zipBytes: zipSync(entries, { level: 1 }),
    filename: `${safeSlug || "shirtai-drop"}-iter${iteration.iterationNumber}-techpack.zip`,
  };
}
