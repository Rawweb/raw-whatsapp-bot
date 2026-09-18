// Local type declaration for qrcode-terminal, replacing @types/qrcode-terminal.
// That package's resolution was failing specifically on Render's build
// (present and correct in package.json/package-lock.json, installed
// fine in a clean-room reproduction locally, still not found there —
// root cause unresolved after several deploy attempts). Since the
// actual API surface we use is tiny, declaring it ourselves removes
// the dependency on that package resolving correctly in any environment.
declare module 'qrcode-terminal' {
  export function generate(
    input: string,
    options?: { small?: boolean },
    callback?: (qrcode: string) => void,
  ): void;
  export function setErrorLevel(level: 'L' | 'M' | 'Q' | 'H'): void;
  export const error: 0 | 1 | 2 | 3;
}
