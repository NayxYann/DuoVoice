export const DEFAULTS = Object.freeze({ language:"fr", name:"", input:"", output:"", ip:"", lastRemote:"", favorites:[], autoConnectFavorites:false, volume:1, boost:false, muted:false, noise:false, intensity:0.65, trayEnabled:true, closeToTray:true, startHidden:true });
export function normalizePreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  const result = { ...DEFAULTS };
  result.favorites = [];
  for (const key of ["name","input","output","ip"]) if (typeof source[key] === "string") result[key] = source[key];
  if (typeof source.lastRemote === "string" && validIPv4(source.lastRemote)) result.lastRemote = source.lastRemote.trim();
  for (const key of ["boost","muted","noise","trayEnabled","closeToTray","startHidden","autoConnectFavorites"]) if (typeof source[key] === "boolean") result[key] = source[key];
  if (Array.isArray(source.favorites)) {
    const seen = new Set();
    for (const item of source.favorites) {
      if (!item || typeof item.address !== "string") continue;
      const address = item.address.trim();
      if (!validIPv4(address) || seen.has(address)) continue;
      seen.add(address);
      result.favorites.push({ address, name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 64) : address });
      if (result.favorites.length === 32) break;
    }
  }
  result.language = source.language === "en" ? "en" : "fr";
  for (const [key,max] of [["volume",result.boost ? 2 : 1],["intensity",1]]) if (Number.isFinite(source[key])) result[key] = Math.max(0, Math.min(max,source[key]));
  return result;
}
export function validIPv4(value) {
  const parts = value.trim().split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255) && !["0.0.0.0","255.255.255.255"].includes(value.trim());
}
