import '@testing-library/jest-dom'

// Node 26 ships an experimental global localStorage that is undefined unless
// --localstorage-file is passed, and it shadows jsdom's implementation. The
// zustand persist middleware then crashes on setItem. Restore a working
// in-memory Storage when the global is missing or unusable.
if (globalThis.localStorage === undefined) {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, writable: true })
}

// jsdom doesn't implement matchMedia; components using useIsMobile (and any
// media-query hook) call it on mount. Provide a desktop-default stub so those
// components render in their wide layout under test.
if (typeof globalThis.window !== 'undefined' && !globalThis.window.matchMedia) {
  globalThis.window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}
