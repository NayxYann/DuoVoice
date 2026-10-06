export const DEFAULTS = Object.freeze({ language:"fr", name:"", input:"", output:"", ip:"", volume:1, boost:false, muted:false, noise:false, intensity:0.65, trayEnabled:true, closeToTray:true, startHidden:true });
export function normalizePreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  const result = { ...DEFAULTS };
  for (const key of ["name","input","output","ip"]) if (typeof source[key] === "string") result[key] = source[key];
  for (const key of ["boost","muted","noise","trayEnabled","closeToTray","startHidden"]) if (typeof source[key] === "boolean") result[key] = source[key];
  result.language = source.language === "en" ? "en" : "fr";
  for (const [key,max] of [["volume",result.boost ? 2 : 1],["intensity",1]]) if (Number.isFinite(source[key])) result[key] = Math.max(0, Math.min(max,source[key]));
  return result;
}
export function validIPv4(value) {
  const parts = value.trim().split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255) && !["0.0.0.0","255.255.255.255"].includes(value.trim());
}
