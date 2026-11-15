// Approximate Rajang River course (lon, lat) from the delta to the Belaga–Bakun area.
// Hand-placed through known towns; stylised and NOT survey-grade.
export const RAJANG_LINE: readonly (readonly [number, number])[] = [
  [111.2, 2.18], // river mouth / delta (Kuala Rajang area)
  [111.35, 2.15],
  [111.52, 2.13], // Sarikei
  [111.65, 2.18],
  [111.83, 2.29], // Sibu
  [111.98, 2.2],
  [112.15, 2.1], // Kanowit
  [112.35, 2.06],
  [112.55, 2.0], // Song
  [112.75, 1.99],
  [112.93, 2.01], // Kapit
  [113.15, 2.15],
  [113.4, 2.35],
  [113.6, 2.55],
  [113.78, 2.7], // Belaga
  [114.06, 2.76], // Bakun area
];

export const TOWNS: readonly { name: string; lon: number; lat: number }[] = [
  { name: 'Kuching', lon: 110.34, lat: 1.55 },
  { name: 'Sibu', lon: 111.83, lat: 2.29 },
  { name: 'Kapit', lon: 112.93, lat: 2.01 },
  { name: 'Bintulu', lon: 113.04, lat: 3.17 },
  { name: 'Miri', lon: 113.99, lat: 4.4 },
];
