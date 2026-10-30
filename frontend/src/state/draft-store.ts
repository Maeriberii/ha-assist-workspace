type PersistedUi = {
  sidebarCollapsed?: boolean;
  drafts?: Record<string, string>;
};

export class DraftStore {
  private drafts: Record<string, string>;
  private timer?: number;

  constructor(
    private readonly storage: Storage,
    private readonly key: string,
    private readonly preferences: () => Omit<PersistedUi, "drafts">,
    private persistDrafts = true,
    private readonly delay = 200,
  ) {
    this.drafts = persistDrafts ? (this.read().drafts ?? {}) : {};
    if (!persistDrafts) this.flush();
  }
  setPersistence(enabled: boolean) {
    this.persistDrafts = enabled;
    this.flush();
  }

  get(id: string) {
    return this.drafts[id] ?? "";
  }

  set(id: string, value: string) {
    this.drafts = { ...this.drafts, [id]: value };
    this.schedule();
  }

  clear(id: string, persistNow = false) {
    const next = { ...this.drafts };
    delete next[id];
    this.drafts = next;
    if (persistNow) this.flush();
    else this.schedule();
  }

  rekey(from: string, to: string, persistNow = false) {
    if (from === to) return;
    const next = { ...this.drafts };
    if (next[from] !== undefined) {
      next[to] = next[from];
      delete next[from];
    }
    this.drafts = next;
    if (persistNow) this.flush();
    else this.schedule();
  }

  schedule() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), this.delay);
  }

  flush() {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.storage.setItem(
      this.key,
      JSON.stringify({
        ...this.preferences(),
        ...(this.persistDrafts ? { drafts: this.drafts } : {}),
      }),
    );
  }

  cancel() {
    window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private read(): PersistedUi {
    try {
      return JSON.parse(this.storage.getItem(this.key) ?? "{}");
    } catch {
      return {};
    }
  }
}
