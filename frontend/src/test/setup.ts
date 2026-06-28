import '@testing-library/jest-dom'

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
