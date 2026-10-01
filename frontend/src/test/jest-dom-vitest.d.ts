/**
 * Types for the jest-dom matchers under Vitest 5.
 *
 * Vitest 5 changed `Assertion<T>` to `Assertion<R, T>` and stopped reading the
 * global `jest.Matchers`, so neither augmentation shipped by jest-dom 7.0.1
 * merges any more and every DOM matcher drops out of the assertion type. The
 * runtime is unaffected: `src/test/setup.ts` still registers the matchers with
 * `expect.extend`.
 *
 * An augmentation only merges when it repeats Vitest's exact parameter list
 * (TS2428), so both `R` and `T` are declared. `Assertion<R, T>` already extends
 * `Matchers<R, T>`; restating that base keeps `T` referenced and spells out
 * what the merged type is: Vitest's matchers plus jest-dom's.
 *
 * Delete this file once jest-dom ships Vitest 5 types
 * (testing-library/jest-dom#738, #742) and the setup file imports
 * `@testing-library/jest-dom/vitest`.
 */
import 'vitest'
import type { ExpectStatic } from 'vitest'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

type AsymmetricMatcher = ReturnType<ExpectStatic['stringContaining']>

declare module 'vitest' {
  interface Assertion<R, T>
    extends Matchers<R, T>,
      TestingLibraryMatchers<AsymmetricMatcher, R> {}
}
