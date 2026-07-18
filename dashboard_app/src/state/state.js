const initialState = {
  localAuthorityCode: "All Scotland",
  coarseCategory: "All Categories",
  overallMapMetric: "Company concentration",
  selectedDependency: null,
  selectedPressure: null,
};

const state = { ...initialState };
const subscribers = new Set();
const allowedKeys = new Set(Object.keys(initialState));

export function getState() {
  return { ...state };
}

export function updateState(partialUpdate) {
  if (!partialUpdate || typeof partialUpdate !== "object" || Array.isArray(partialUpdate)) {
    throw new TypeError("updateState expects an object with one or more state keys");
  }

  const updates = Object.entries(partialUpdate);
  if (updates.length === 0) {
    return getState();
  }

  let hasChanges = false;
  const previousState = getState();

  for (const [key, value] of updates) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown state key: ${key}`);
    }

    if (state[key] !== value) {
      state[key] = value;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    const nextState = getState();
    subscribers.forEach((listener) => listener(nextState, previousState));
  }

  return getState();
}

export function subscribe(listener) {
  if (typeof listener !== "function") {
    throw new TypeError("subscribe expects a function listener");
  }

  subscribers.add(listener);
  return () => unsubscribe(listener);
}

export function unsubscribe(listener) {
  subscribers.delete(listener);
}
