export type SearchState<T> = {
  query: string;
  results: T[];
  pending: boolean;
  error: boolean;
};

export class SearchSession<T> {
  private generation = 0;
  private timer?: number;
  readonly state: SearchState<T> = {
    query: "",
    results: [],
    pending: false,
    error: false,
  };

  constructor(
    private readonly changed: () => void,
    private readonly delay = 200,
  ) {}

  update(query: string, search: (query: string) => Promise<T[]>) {
    window.clearTimeout(this.timer);
    const generation = ++this.generation;
    this.state.query = query;
    const trimmed = query.trim();
    if (!trimmed) {
      this.state.results = [];
      this.state.pending = false;
      this.state.error = false;
      this.changed();
      return;
    }
    this.state.results = [];
    this.state.pending = true;
    this.state.error = false;
    this.timer = window.setTimeout(
      () => void this.run(trimmed, generation, search),
      this.delay,
    );
    this.changed();
  }

  clear() {
    this.update("", async () => []);
  }

  cancel() {
    ++this.generation;
    window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async run(
    query: string,
    generation: number,
    search: (query: string) => Promise<T[]>,
  ) {
    try {
      const results = await search(query);
      if (generation !== this.generation || !this.state.query.trim()) return;
      this.state.results = results;
      this.state.pending = false;
      this.changed();
    } catch {
      if (generation !== this.generation || !this.state.query.trim()) return;
      this.state.results = [];
      this.state.pending = false;
      this.state.error = true;
      this.changed();
    }
  }
}
