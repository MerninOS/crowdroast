import "@testing-library/jest-dom";

// jsdom doesn't implement matchMedia. Stub it so components that read media
// queries (e.g. CommitmentDrawer's useDrawerSide hook) don't throw at mount.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList);
}
