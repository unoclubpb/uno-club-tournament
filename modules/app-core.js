// Shared application foundation for the Reorganization branch.
// Screen extraction and lazy loading will be introduced in later phases.
export const APP_BUILD = Object.freeze({
  version: "0.4.0-reorg.24",
  channel: "Reorganization",
  production: false
});
export const SCREEN_IDS = Object.freeze(["home","players","setup","signup","manage","archives","remote","leaderboard","clock"]);
export function isKnownScreen(screen) {
  return SCREEN_IDS.includes(screen);
}
export function versionLabel() {
  return "REORGANIZATION · v" + APP_BUILD.version;
}
