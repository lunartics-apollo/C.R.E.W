// Mission Rajang definition, launch packages and ground stations.
// Packages and stations are FICTIONAL scenarios, not real launch offers or real facilities.
import type { GroundStation, LaunchPackage, MissionDefinition, ScienceObjective } from './types';

/** Observation zones are areas (~35 km across): the camera may aim this many degrees off the zone centre. */
export const TARGET_AREA_HALF_DEG = 2;

export const OBJECTIVES: readonly ScienceObjective[] = [
  // Land-cover overview: wide context images; any RGB camera with GSD <= 80 m.
  { id: 'landcover', maxGsdM: 80, maxCloud: 0.4, needsNir: false, requiredUsable: 3, requiredZones: 2, provenance: 'GAME_ASSUMPTION' },
  // River and settlement detail: needs a sharp camera (GSD <= 30 m) and clearer skies.
  { id: 'detail', maxGsdM: 30, maxCloud: 0.3, needsNir: false, requiredUsable: 3, requiredZones: 2, provenance: 'GAME_ASSUMPTION' },
  // Vegetation health: needs a near-infrared band (NIR) for vegetation-index style analysis.
  { id: 'vegetation', maxGsdM: 60, maxCloud: 0.3, needsNir: true, requiredUsable: 3, requiredZones: 2, provenance: 'GAME_ASSUMPTION' },
];

export const MISSION_RAJANG: MissionDefinition = {
  id: 'rajang',
  campaignDays: 10,
  // Approximate locations along the Rajang River (stylised; not survey-grade).
  zones: [
    { id: 'delta', latDeg: 2.15, lonDeg: 111.35 },
    { id: 'sibu', latDeg: 2.25, lonDeg: 111.95 },
    { id: 'kapit', latDeg: 2.01, lonDeg: 112.93 },
    { id: 'belaga', latDeg: 2.72, lonDeg: 113.85 },
  ],
  objectives: OBJECTIVES,
  budgetCr: { guided: 1000, engineer: 900 },
  // NASA CubeSat 101 §2.2: "project reserves of at least 10% should be part of the budget".
  reserveFraction: 0.1,
  // NASA CubeSat 101 §2.2 / Fig. 9: travel is a commonly overlooked cost.
  travelCr: 30,
  opsCrPerDay: 5,
  // Fictional campaign epoch (deployment day 0 is offset per package).
  epochIso: '2027-03-15T00:00:00Z',
  utcOffsetHours: 8, // Malaysia Time (MYT)
  scenarioSeed: 2027,
};

export function objectiveById(id: ScienceObjective['id']): ScienceObjective {
  const o = OBJECTIVES.find((x) => x.id === id);
  if (!o) throw new Error(`Unknown objective ${id}`);
  return o;
}

export const LAUNCH_PACKAGES: readonly LaunchPackage[] = [
  {
    // ISS-style deployment (NASA CubeSat 101 §3.5 describes the ISS deployment mission model).
    id: 'station',
    altitudeKm: 410,
    inclinationDeg: 51.6,
    raanDeg: 350,
    ltanHours: null,
    initialArgLatDeg: 120,
    deployOffsetHours: 3,
    costCr: 120,
    maxMassKg: 4.0,
    maxProtrusionMm: 6.5,
    minInhibits: 3,
    minDeployDelayMin: 30,
    minTxDelayMin: 30,
    provenance: 'GAME_ASSUMPTION',
  },
  {
    // Sun-synchronous rideshare, descending node 10:30 local time (ascending 22:30).
    id: 'polar',
    altitudeKm: 500,
    inclinationDeg: 97.4,
    raanDeg: null,
    ltanHours: 22.5,
    initialArgLatDeg: 200,
    deployOffsetHours: 1,
    costCr: 200,
    maxMassKg: 4.0,
    maxProtrusionMm: 6.5,
    minInhibits: 2,
    minDeployDelayMin: 15,
    minTxDelayMin: 45,
    provenance: 'GAME_ASSUMPTION',
  },
  {
    // Low-inclination rideshare: crosses the equatorial belt on every orbit.
    id: 'equatorial',
    altitudeKm: 600,
    inclinationDeg: 12,
    raanDeg: 100,
    ltanHours: null,
    initialArgLatDeg: 300,
    deployOffsetHours: 2,
    costCr: 260,
    maxMassKg: 3.6,
    maxProtrusionMm: 6.5,
    minInhibits: 2,
    minDeployDelayMin: 30,
    minTxDelayMin: 45,
    provenance: 'GAME_ASSUMPTION',
  },
];

export function packageById(id: LaunchPackage['id']): LaunchPackage {
  const p = LAUNCH_PACKAGES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown launch package ${id}`);
  return p;
}

// Fictional ground stations near Sarawak. Locations are game locations, not verified facilities.
export const GROUND_STATIONS: readonly GroundStation[] = [
  { id: 'uhf_club', latDeg: 1.5, lonDeg: 110.4, bands: ['UHF'], costCr: 15, minElevationDeg: 10, beamwidthDeg: 30, provenance: 'GAME_ASSUMPTION' },
  { id: 'sband_dish', latDeg: 1.5, lonDeg: 110.4, bands: ['UHF', 'S'], costCr: 60, minElevationDeg: 10, beamwidthDeg: 4, provenance: 'GAME_ASSUMPTION' },
  { id: 'xband_service', latDeg: 1.5, lonDeg: 110.4, bands: ['UHF', 'S', 'X'], costCr: 140, minElevationDeg: 10, beamwidthDeg: 0.7, provenance: 'GAME_ASSUMPTION' },
];

/** Partner station that can be booked from mission reserves during operations (fictional). */
export const PARTNER_STATION: GroundStation = {
  id: 'partner_miri',
  latDeg: 4.4,
  lonDeg: 114.0,
  bands: ['UHF', 'S', 'X'],
  costCr: 25,
  minElevationDeg: 10,
  beamwidthDeg: 2,
  provenance: 'GAME_ASSUMPTION',
};

export function stationById(id: GroundStation['id']): GroundStation {
  if (id === 'partner_miri') return PARTNER_STATION;
  const s = GROUND_STATIONS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown ground station ${id}`);
  return s;
}

/** Scripted external weather: a thunderstorm over the Kuching ground station (labelled scenario event). */
export const STORM_WINDOW = { startS: 4.0 * 86400, endS: 4.9 * 86400 } as const;

/** Rain attenuation multipliers by band during the storm (higher frequency -> more rain fade). */
export const RAIN_FADE: Record<'UHF' | 'S' | 'X', number> = { UHF: 1.0, S: 0.8, X: 0.35 };
