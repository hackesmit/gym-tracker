const LBS_PER_KG = 2.20462;

/** Convert kg to display units. */
export function kgToDisplay(kg, units) {
  if (units === 'lbs') return +(kg * LBS_PER_KG).toFixed(1);
  return +kg;
}

/** Convert display units to kg for storage. */
export function displayToKg(value, units) {
  if (units === 'lbs') return +(value / LBS_PER_KG).toFixed(2);
  return +value;
}

/** Unit label string. */
export function getUnitLabel(units) {
  return units === 'lbs' ? 'lbs' : 'kg';
}
