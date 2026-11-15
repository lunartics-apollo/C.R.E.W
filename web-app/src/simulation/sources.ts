// Source register. Paraphrased summaries live in localization files under `src.<id>`.
// NASA page numbers: "p." = printed page in CubeSat 101 (PDF page = printed page + 8).
import type { Provenance } from './types';

export interface SourceEntry {
  readonly id: string;
  readonly provenance: Provenance;
  readonly title: string;
  readonly location: string;
  readonly url?: string;
}

const NASA = 'NASA CSLI, CubeSat 101: Basic Concepts and Processes for First-Time CubeSat Developers (Oct 2017)';

export const SOURCES: readonly SourceEntry[] = [
  { id: 'nasa-1.1', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§1.1 CubeSats, p.4 (Fig. 2: 3U = 10 x 10 x 34 cm)' },
  { id: 'nasa-1.2', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§1.2–1.2.1 Dispensers / P-POD, pp.4–5' },
  { id: 'nasa-1.3', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§1.3 Launch vehicles, pp.6–8' },
  { id: 'nasa-2.1', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.1 Concept development, p.11 ("flexibility is key")' },
  { id: 'nasa-2.2', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.2 Securing funding, pp.11–14 (reserves ≥10%, Fig. 9 costs incl. travel)' },
  { id: 'nasa-2.3', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.3 Merit and feasibility reviews, pp.14–15' },
  { id: 'nasa-2.4', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.4 CubeSat design, Free Advice, p.16 (envelope, 6.5 mm protrusions, double burn wire, heritage, UL batteries)' },
  { id: 'nasa-2.4-adcs', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.4 sidebar, p.17 (ADCS definition)' },
  { id: 'nasa-2.10', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.10 Ground station, pp.22–23 (radio + antenna, test early, Sun/Moon calibration)' },
  { id: 'nasa-2.11', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.11 Hardware fabrication and testing, pp.23–25 (verification testing; changes require retest)' },
  { id: 'nasa-2.12', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.12 Mission Readiness Review, p.25' },
  { id: 'nasa-2.13', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.13–2.14 Dispenser and launch-vehicle integration, pp.26–28' },
  { id: 'nasa-2.15', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.15 Launch, p.28 (CubeSats do not control the launch date)' },
  { id: 'nasa-2.16', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§2.16 Mission operations, pp.29–30 (TLEs, first contact)' },
  { id: 'nasa-3.5', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§3.5 ISS deployment mission model, p.38' },
  { id: 'nasa-4', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§4.1–4.4 Requirement sources: mission ICDs, LSP-REQ-317.01, CDS, pp.39–41' },
  { id: 'nasa-4.5', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§4.5 Federal statutes (U.S. FCC / NOAA), p.41 — U.S. context only' },
  { id: 'nasa-6.1', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§6.1 Orbital debris mitigation (ODAR), pp.54–55' },
  { id: 'nasa-6.4', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§6.4 Mass properties report, p.56 (mass, CG, margins)' },
  { id: 'nasa-6.5', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§6.5 Battery report, p.57 (protection circuits)' },
  { id: 'nasa-6.6', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§6.6 Dimensional verifications, pp.57–58' },
  { id: 'nasa-6.7', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§6.7 Electrical report, p.58 (RBF pin, separation switches; "a timer is not an independent inhibit")' },
  { id: 'nasa-6.9.1', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§6.9.1 Day In The Life testing, pp.59–60' },
  { id: 'nasa-6.9.2', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§6.9.2 Vibration/shock testing, pp.60–61' },
  { id: 'nasa-6.9.3', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: '§6.9.3 Thermal vacuum bakeout, pp.62–63' },
  { id: 'nasa-appc', provenance: 'NASA_GUIDE_VERIFIED', title: NASA, location: 'App. C.6 sample 3U CubeSat Acceptance Checklist, p.82 (mass < 4.00 kg, 100 ± 0.1 mm, 340.5 ± 0.3 mm, protrusions ≤ 6.5 mm) — sample, not an official template' },
  { id: 'other-orbit', provenance: 'OTHER_REFERENCE_VERIFIED', title: 'Standard two-body orbit + secular J2 node drift (e.g. Vallado, Fundamentals of Astrodynamics and Applications)', location: 'Circular-orbit nodal regression: dΩ/dt = −1.5 n J2 (Re/a)² cos i' },
  { id: 'other-sun', provenance: 'OTHER_REFERENCE_VERIFIED', title: 'Low-precision solar coordinates (U.S. Naval Observatory / Astronomical Almanac approximation)', location: 'Sun longitude & obliquity formulas, ~0.01° accuracy' },
  { id: 'other-pointing', provenance: 'OTHER_REFERENCE_VERIFIED', title: 'Parabolic antenna pointing loss approximation', location: 'L(dB) ≈ 12 (θ / θ3dB)² — standard link-budget textbook approximation' },
  { id: 'other-geo', provenance: 'OTHER_REFERENCE_VERIFIED', title: 'Natural Earth 1:50m / 1:110m vector data (public domain) via world-atlas@2', location: 'Coastlines and country outlines used for maps', url: 'https://www.naturalearthdata.com/' },
  { id: 'other-visible-earth', provenance: 'OTHER_REFERENCE_VERIFIED', title: "NASA Visible Earth: Sarawak's Rajang River Delta (reference imagery, not bundled)", location: 'visibleearth.nasa.gov/images/91787', url: 'https://visibleearth.nasa.gov/images/91787/sarawaks-rajang-river-delta/91789l' },
  { id: 'simp-cloud', provenance: 'EDUCATIONAL_SIMPLIFICATION', title: 'Simulated cloud scenario (seeded)', location: 'Afternoon convection over Borneo modelled as a smooth rise in cloud from ~09:30 to ~15:30 local solar time; verify against climatology before real use' },
  { id: 'simp-power', provenance: 'EDUCATIONAL_SIMPLIFICATION', title: 'Battery energy model', location: 'E(t+dt) = clamp(E + P·dt·η), η_charge = 0.90, η_discharge = 0.95, safe mode < 20%' },
  { id: 'simp-lifetime', provenance: 'EDUCATIONAL_SIMPLIFICATION', title: 'Orbital lifetime table for a ~4 kg 3U', location: '400 km ≈ 1 yr … 600 km ≈ 20 yr (order of magnitude; real decay depends on solar activity and drag area)' },
  { id: 'simp-cg', provenance: 'EDUCATIONAL_SIMPLIFICATION', title: 'Centre-of-gravity tolerance (modelled on the CubeSat Design Specification)', location: '1-D stack model, ±7 cm along Z; check the current CDS / mission ICD' },
  { id: 'game-catalog', provenance: 'GAME_ASSUMPTION', title: 'Component catalog, prices, launch packages, ground stations', location: 'Fictional values with realistic magnitudes; not real product ratings, prices or offers' },
  { id: 'game-policy', provenance: 'GAME_ASSUMPTION', title: 'Academy debris policy: natural decay ≤ 5 years', location: 'Game rule inspired by current international disposal practice; not legal advice for Malaysia' },
];

export function sourceById(id: string | undefined): SourceEntry | undefined {
  return id ? SOURCES.find((s) => s.id === id) : undefined;
}
