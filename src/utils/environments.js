// ─── Environment store ───────────────────────
// Environments live in localStorage and are small by nature, so they stay
// here rather than in the IndexedDB payload store.
//
// They start empty: shipping invented hosts and keys as "defaults" meant the
// workspace resolved URLs to places that were not the user's.

const STORAGE_KEY = "vizroute_environments";

export const loadEnvironments = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

export const saveEnvironments = (envs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envs));
    return true;
  } catch {
    return false;
  }
};

/**
 * One environment in the shape the variable resolver expects.
 *
 * The manager stores variables as a plain object; resolution wants the
 * `{key, value, enabled}` rows a Postman environment export uses, so that a
 * locally defined environment and one pulled from Postman behave identically.
 */
export const getEnvironmentForResolution = (id) => {
  const env = loadEnvironments().find((e) => e.id === id);
  if (!env) return null;
  return {
    name: env.name,
    variables: Object.entries(env.variables || {}).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
      enabled: true,
    })),
  };
};

/** Store an environment pulled from Postman alongside the local ones. */
export const importEnvironment = ({ name, variables }) => {
  const envs = loadEnvironments();
  const id = `env_${Date.now().toString(36)}`;
  const asObject = {};
  (variables || []).forEach((v) => {
    if (v.enabled !== false) asObject[v.key] = v.value;
  });
  const env = { id, name: name || "Imported", icon: "globe", color: "#a855f7", variables: asObject };
  saveEnvironments([...envs, env]);
  return env;
};
