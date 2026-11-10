// Native framebuffer sizes (portrait) for each Kindle model codename.
export const PRESETS = {
  KT:   { width: 600,  height: 800,  name: 'Kindle Touch (2011)' },
  KT2:  { width: 600,  height: 800,  name: 'Kindle 7th gen (2014)' },
  KT3:  { width: 600,  height: 800,  name: 'Kindle 8th gen (2016)' },
  KT4:  { width: 600,  height: 800,  name: 'Kindle 10th gen (2019)' },
  KT5:  { width: 1072, height: 1448, name: 'Kindle 11th gen (2022)' },
  KT6:  { width: 1072, height: 1448, name: 'Kindle 11th gen (2024)' },
  PW1:  { width: 758,  height: 1024, name: 'Paperwhite 1 (2012)' },
  PW2:  { width: 758,  height: 1024, name: 'Paperwhite 2 (2013)' },
  PW3:  { width: 1072, height: 1448, name: 'Paperwhite 3 (2015)' },
  PW4:  { width: 1072, height: 1448, name: 'Paperwhite 4 (2018)' },
  PW5:  { width: 1236, height: 1648, name: 'Paperwhite 5 (2021)' },
  PW6:  { width: 1236, height: 1648, name: 'Paperwhite 6 (2024)' },
  KV:   { width: 1072, height: 1448, name: 'Voyage (2014)' },
  KOA1: { width: 1072, height: 1448, name: 'Oasis 1 (2016)' },
  KOA2: { width: 1264, height: 1680, name: 'Oasis 2 (2017)' },
  KOA3: { width: 1264, height: 1680, name: 'Oasis 3 (2019)' },
  KS1:  { width: 1860, height: 2480, name: 'Scribe (2022)' },
  KS2:  { width: 1860, height: 2480, name: 'Scribe (2024)' },
  CS:   { width: 1264, height: 1680, name: 'Colorsoft (2024)' },
};

// Resolve the render size from config: explicit width/height win, else the preset.
export function resolveDevice(device) {
  const base = device.width && device.height
    ? { width: device.width, height: device.height }
    : PRESETS[device.preset] ?? PRESETS.PW4;
  const landscape = device.orientation === 'landscape';
  return {
    // size of the HTML page we render
    pageWidth:  landscape ? base.height : base.width,
    pageHeight: landscape ? base.width  : base.height,
    // size of the PNG the Kindle expects (always its native portrait framebuffer)
    fbWidth: base.width,
    fbHeight: base.height,
    // rotate the rendered page into the framebuffer: 90 = clockwise
    rotate: landscape ? (device.rotate ?? 90) : 0,
    landscape,
  };
}
