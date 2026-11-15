// Simplified, physics-based orbit model (EDUCATIONAL_SIMPLIFICATION):
//  - circular two-body orbit with secular J2 drift of the node and argument of latitude
//  - spherical, rotating Earth (GMST), low-precision solar position (Astronomical Almanac style)
//  - cylindrical Earth shadow for eclipse
// Good enough to make orbits differ realistically in coverage, lighting and contacts; NOT a flight-dynamics tool.
import type { ContactWindow, GroundStation, Interval, LaunchPackage, OrbitScenario, TargetPass, ZoneId } from './types';
import { MISSION_RAJANG, GROUND_STATIONS, PARTNER_STATION } from './mission';

export const MU_KM3_S2 = 398600.4418;
export const EARTH_RADIUS_KM = 6378.137;
export const J2 = 1.08262668e-3;
export const EARTH_ROT_RAD_S = 7.2921159e-5;
const DEG = Math.PI / 180;

/** Max off-nadir angle (deg) at which a target pass is recorded geometrically; design capability filters later. */
export const ACCESS_RECORD_LIMIT_DEG = 40;
/** Minimum solar elevation at the target for useful optical imaging (deg). */
export const MIN_SUN_ELEVATION_DEG = 15;
export const SCENARIO_STEP_S = 10;

type Vec3 = readonly [number, number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export function julianDate(iso: string): number {
  return Date.parse(iso) / 86400000 + 2440587.5;
}

export function gmstRad(jd: number): number {
  const deg = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
  return ((deg % 360) + 360) % 360 * DEG;
}

/** Low-precision solar unit vector in ECI and right ascension (rad). */
export function sunVector(jd: number): { s: Vec3; ra: number } {
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const s: Vec3 = [Math.cos(lambda), Math.cos(eps) * Math.sin(lambda), Math.sin(eps) * Math.sin(lambda)];
  return { s, ra: Math.atan2(s[1], s[0]) };
}

export interface OrbitElements {
  readonly aKm: number;
  readonly incRad: number;
  readonly raan0: number;
  readonly u0: number;
  readonly raanDot: number;
  readonly uDot: number;
  readonly jd0: number; // Julian date at deployment (t = 0)
  readonly periodS: number;
}

export function deploymentJd(pkg: LaunchPackage): number {
  return julianDate(MISSION_RAJANG.epochIso) + pkg.deployOffsetHours / 24;
}

export function elementsFor(pkg: LaunchPackage): OrbitElements {
  const a = EARTH_RADIUS_KM + pkg.altitudeKm;
  const n = Math.sqrt(MU_KM3_S2 / a ** 3);
  const inc = pkg.inclinationDeg * DEG;
  const k = J2 * (EARTH_RADIUS_KM / a) ** 2;
  const raanDot = -1.5 * k * n * Math.cos(inc);
  const cos2 = Math.cos(inc) ** 2;
  const uDot = n * (1 + 0.75 * k * (5 * cos2 - 1) + 0.75 * k * (3 * cos2 - 1));
  const jd0 = deploymentJd(pkg);
  let raan0 = (pkg.raanDeg ?? 0) * DEG;
  if (pkg.ltanHours !== null) {
    // Sun-synchronous: node placed at the requested local time of ascending node.
    raan0 = sunVector(jd0).ra + (pkg.ltanHours - 12) * 15 * DEG;
  }
  return { aKm: a, incRad: inc, raan0, u0: pkg.initialArgLatDeg * DEG, raanDot, uDot, jd0, periodS: (2 * Math.PI) / uDot };
}

export function satEci(el: OrbitElements, t: number): Vec3 {
  const raan = el.raan0 + el.raanDot * t;
  const u = el.u0 + el.uDot * t;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cr = Math.cos(raan);
  const sr = Math.sin(raan);
  const ci = Math.cos(el.incRad);
  const si = Math.sin(el.incRad);
  return [el.aKm * (cr * cu - sr * su * ci), el.aKm * (sr * cu + cr * su * ci), el.aKm * su * si];
}

export function groundEci(latDeg: number, lonDeg: number, gmst: number): Vec3 {
  const lat = latDeg * DEG;
  const th = gmst + lonDeg * DEG;
  return [EARTH_RADIUS_KM * Math.cos(lat) * Math.cos(th), EARTH_RADIUS_KM * Math.cos(lat) * Math.sin(th), EARTH_RADIUS_KM * Math.sin(lat)];
}

export function wrapLon(lonDeg: number): number {
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
}

/** Sub-satellite point (deg) at time t (s after deployment). */
export function subSatellitePoint(el: OrbitElements, t: number): { lat: number; lon: number } {
  const r = satEci(el, t);
  const gmst = gmstRad(el.jd0 + t / 86400);
  const lat = Math.asin(r[2] / norm(r)) / DEG;
  const lon = wrapLon((Math.atan2(r[1], r[0]) - gmst) / DEG);
  return { lat, lon };
}

export function inEarthShadow(r: Vec3, s: Vec3): boolean {
  const proj = dot(r, s);
  if (proj >= 0) return false;
  const perp = sub(r, [s[0] * proj, s[1] * proj, s[2] * proj]);
  return norm(perp) < EARTH_RADIUS_KM;
}

export function elevationDeg(r: Vec3, g: Vec3): number {
  const rho = sub(r, g);
  return Math.asin(dot(rho, g) / (norm(rho) * norm(g))) / DEG;
}

export function offNadirDeg(r: Vec3, g: Vec3): number {
  const d = sub(g, r);
  const c = -dot(r, d) / (norm(r) * norm(d));
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

/** Sub-solar point (deg) for the day/night terminator on the map. */
export function subSolarPoint(jd: number): { lat: number; lon: number } {
  const { s } = sunVector(jd);
  const lat = Math.asin(s[2]) / DEG;
  const lon = wrapLon((Math.atan2(s[1], s[0]) - gmstRad(jd)) / DEG);
  return { lat, lon };
}

interface OpenWindow {
  start: number;
  best: number;
  bestT: number;
  extra: number;
}

const ALL_STATIONS: readonly GroundStation[] = [GROUND_STATIONS[0]!, PARTNER_STATION];

const scenarioCache = new Map<string, OrbitScenario>();

/**
 * Pre-computes the orbit scenario for a package: eclipses, ground-station contacts (Kuching + partner)
 * and daylight target passes over each Rajang zone. Deterministic and cached.
 */
export function buildScenario(pkg: LaunchPackage, days = MISSION_RAJANG.campaignDays): OrbitScenario {
  const key = `${pkg.id}:${days}:${pkg.raanDeg}:${pkg.initialArgLatDeg}:${pkg.altitudeKm}`;
  const cached = scenarioCache.get(key);
  if (cached) return cached;

  const el = elementsFor(pkg);
  const durationS = days * 86400;
  const step = SCENARIO_STEP_S;
  const eclipses: Interval[] = [];
  const contacts: ContactWindow[] = [];
  const passes: TargetPass[] = [];
  let eclStart: number | null = null;
  let sunlitSteps = 0;
  const openContacts = new Map<string, OpenWindow>();
  const openPasses = new Map<ZoneId, OpenWindow>();
  const zones = MISSION_RAJANG.zones;

  for (let t = 0; t <= durationS; t += step) {
    const jd = el.jd0 + t / 86400;
    const gmst = gmstRad(jd);
    const { s, ra } = sunVector(jd);
    const r = satEci(el, t);

    const shadow = inEarthShadow(r, s);
    if (!shadow) sunlitSteps++;
    if (shadow && eclStart === null) eclStart = t;
    if (!shadow && eclStart !== null) {
      eclipses.push({ start: eclStart, end: t });
      eclStart = null;
    }

    for (const st of ALL_STATIONS) {
      const g = groundEci(st.latDeg, st.lonDeg, gmst);
      const elv = elevationDeg(r, g);
      const open = openContacts.get(st.id);
      if (elv >= st.minElevationDeg) {
        if (!open) openContacts.set(st.id, { start: t, best: elv, bestT: t, extra: 0 });
        else if (elv > open.best) {
          open.best = elv;
          open.bestT = t;
        }
      } else if (open) {
        contacts.push({ stationId: st.id, start: open.start, end: t, maxElevationDeg: open.best, id: `${st.id}-${open.start}` });
        openContacts.delete(st.id);
      }
    }

    for (const z of zones) {
      const g = groundEci(z.latDeg, z.lonDeg, gmst);
      const eta = offNadirDeg(r, g);
      const up: Vec3 = [g[0] / EARTH_RADIUS_KM, g[1] / EARTH_RADIUS_KM, g[2] / EARTH_RADIUS_KM];
      const sunEl = Math.asin(dot(up, s)) / DEG;
      const visible = eta <= ACCESS_RECORD_LIMIT_DEG && elevationDeg(r, g) > 0 && sunEl >= MIN_SUN_ELEVATION_DEG;
      const open = openPasses.get(z.id);
      if (visible) {
        if (!open) openPasses.set(z.id, { start: t, best: eta, bestT: t, extra: sunEl });
        else if (eta < open.best) {
          open.best = eta;
          open.bestT = t;
          open.extra = sunEl;
        }
      } else if (open) {
        const lst = localSolarHour(gmst + ((open.bestT - t) * EARTH_ROT_RAD_S), ra, z.lonDeg);
        passes.push({
          zoneId: z.id,
          start: open.start,
          end: t,
          tca: open.bestT,
          minOffNadirDeg: open.best,
          sunElevationDeg: open.extra,
          localSolarHour: lst,
          id: `${z.id}-${open.bestT}`,
        });
        openPasses.delete(z.id);
      }
    }
  }
  if (eclStart !== null) eclipses.push({ start: eclStart, end: durationS });

  contacts.sort((a, b) => a.start - b.start);
  passes.sort((a, b) => a.tca - b.tca);
  const scenario: OrbitScenario = {
    packageId: pkg.id,
    durationS,
    stepS: step,
    periodS: el.periodS,
    eclipses,
    contacts,
    targetPasses: passes,
    sunlitFraction: sunlitSteps / (durationS / step + 1),
  };
  scenarioCache.set(key, scenario);
  return scenario;
}

export function localSolarHour(gmst: number, sunRa: number, lonDeg: number): number {
  const hourAngle = gmst + lonDeg * DEG - sunRa; // rad
  const h = 12 + (hourAngle / DEG) / 15;
  return ((h % 24) + 24) % 24;
}

/** Binary search: is time t inside any interval of a sorted list? */
export function inIntervals(list: readonly Interval[], t: number): boolean {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const iv = list[mid]!;
    if (t < iv.start) hi = mid - 1;
    else if (t >= iv.end) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Sunlit seconds inside [t0, t1). */
export function sunlitSeconds(scn: OrbitScenario, t0: number, t1: number): number {
  let shadow = 0;
  for (const e of scn.eclipses) {
    if (e.end <= t0) continue;
    if (e.start >= t1) break;
    shadow += Math.min(t1, e.end) - Math.max(t0, e.start);
  }
  return Math.max(0, t1 - t0 - shadow);
}

/** Contacts for the stations available to the player (selected station position + optional partner). */
export function contactsFor(scn: OrbitScenario, includePartner: boolean): readonly ContactWindow[] {
  return scn.contacts.filter((c) => c.stationId !== 'partner_miri' || includePartner);
}

/** Mission clock helpers (MYT). */
export function missionClock(pkg: LaunchPackage, t: number): { day: number; hh: number; mm: number } {
  const utcMs = Date.parse(MISSION_RAJANG.epochIso) + pkg.deployOffsetHours * 3600000 + t * 1000;
  const local = new Date(utcMs + MISSION_RAJANG.utcOffsetHours * 3600000);
  const startLocal = new Date(Date.parse(MISSION_RAJANG.epochIso) + MISSION_RAJANG.utcOffsetHours * 3600000);
  const day = Math.floor((local.getTime() - Date.UTC(startLocal.getUTCFullYear(), startLocal.getUTCMonth(), startLocal.getUTCDate())) / 86400000) + 1;
  return { day, hh: local.getUTCHours(), mm: local.getUTCMinutes() };
}
