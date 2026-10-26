/**
 * Minimal `bun:test` type shim.
 *
 * The Worker package intentionally has no test-framework dependency (`bun test` is the
 * runner), but `tsc --noEmit` needs to know the module's surface. Keep this in sync with
 * the assertions actually used by the test suite.
 */

declare module 'bun:test' {
	type Awaitable = void | Promise<void>;

	export type Matchers = {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toStrictEqual(expected: unknown): void;
		toBeTruthy(): void;
		toBeFalsy(): void;
		toBeNull(): void;
		toBeUndefined(): void;
		toBeDefined(): void;
		toContain(expected: unknown): void;
		toContainEqual(expected: unknown): void;
		toMatch(expected: RegExp | string): void;
		toMatchObject(expected: unknown): void;
		toBeGreaterThan(expected: number): void;
		toBeGreaterThanOrEqual(expected: number): void;
		toBeLessThan(expected: number): void;
		toBeLessThanOrEqual(expected: number): void;
		toBeCloseTo(expected: number, precision?: number): void;
		toHaveLength(expected: number): void;
		toHaveProperty(path: string, value?: unknown): void;
		toBeInstanceOf(expected: unknown): void;
		toThrow(expected?: string | RegExp | Error): void;
		not: Matchers;
	};

	export function describe(name: string, fn: () => Awaitable): void;
	export function it(name: string, fn: () => Awaitable): void;
	export function test(name: string, fn: () => Awaitable): void;
	export function beforeAll(fn: () => Awaitable): void;
	export function afterAll(fn: () => Awaitable): void;
	export function beforeEach(fn: () => Awaitable): void;
	export function afterEach(fn: () => Awaitable): void;
	export function expect(actual: unknown): Matchers;
}
