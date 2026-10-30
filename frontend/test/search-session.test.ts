import { beforeEach, describe, expect, test, vi } from "vitest";
import { SearchSession } from "../src/state/search-session.js";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};

describe("SearchSession", () => {
  beforeEach(() => vi.useFakeTimers());

  test("keeps foobar when foo resolves later", async () => {
    const foo = deferred<string[]>();
    const foobar = deferred<string[]>();
    const session = new SearchSession<string>(() => undefined, 10);
    session.update("foo", () => foo.promise);
    await vi.advanceTimersByTimeAsync(10);
    session.update("foobar", () => foobar.promise);
    await vi.advanceTimersByTimeAsync(10);
    foobar.resolve(["new"]);
    await Promise.resolve();
    foo.resolve(["stale"]);
    await Promise.resolve();
    expect(session.state).toMatchObject({ query: "foobar", results: ["new"] });
  });

  test("late response after clear cannot restore search mode", async () => {
    const request = deferred<string[]>();
    const session = new SearchSession<string>(() => undefined, 10);
    session.update("foo", () => request.promise);
    await vi.advanceTimersByTimeAsync(10);
    session.clear();
    request.resolve(["stale"]);
    await Promise.resolve();
    expect(session.state).toEqual({
      query: "",
      results: [],
      pending: false,
      error: false,
    });
  });

  test("clear rejects every older generation", async () => {
    const foo = deferred<string[]>();
    const foobar = deferred<string[]>();
    const session = new SearchSession<string>(() => undefined, 10);
    session.update("foo", () => foo.promise);
    await vi.advanceTimersByTimeAsync(10);
    session.update("foobar", () => foobar.promise);
    await vi.advanceTimersByTimeAsync(10);
    session.clear();
    foobar.resolve(["new but late"]);
    foo.resolve(["old and late"]);
    await Promise.resolve();
    expect(session.state.query).toBe("");
    expect(session.state.results).toEqual([]);
  });
});
