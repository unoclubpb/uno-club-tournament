// Lazy screen loader foundation. No existing screen is routed here in Phase 1.
// Phase 2 will register extracted screens and switch navigation to loadScreen.
const screenLoaders = new Map();
const pending = new Map();
export function registerScreen(name, load) {
  if (typeof name !== "string" || !name || typeof load !== "function") throw new TypeError("Invalid screen registration");
  screenLoaders.set(name, load);
}
export async function loadScreen(name) {
  const load = screenLoaders.get(name);
  if (!load) throw new Error("Screen is not registered: " + name);
  if (!pending.has(name)) {
    const promise = Promise.resolve().then(load).catch(error => { pending.delete(name); throw error; });
    pending.set(name, promise);
  }
  return pending.get(name);
}
export function registeredScreens() { return [...screenLoaders.keys()]; }
