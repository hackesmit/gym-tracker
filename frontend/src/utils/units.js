const LBS_PER_KG = 2.20462;
const SNAP_TOLERANCE_LBS = 0.05;

export function kgToDisplay(kg, units) {
  if (kg == null) return 0;
  if (units === 'lbs') {
    const lbs = +kg * LBS_PER_KG;
    const half = Math.round(lbs * 2) / 2;
    if (Math.abs(lbs - half) < SNAP_TOLERANCE_LBS) return half;
    return +lbs.toFixed(1);
  }
  return +kg;
}

export function displayToKg(value, units) {
  if (value === '' || value == null) return 0;
  if (units === 'lbs') return +(value / LBS_PER_KG).toFixed(4);
  return +value;
}

export function getUnitLabel(units) {
  return units === 'lbs' ? 'lbs' : 'kg';
}
