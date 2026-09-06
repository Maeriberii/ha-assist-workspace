export type CopyState = "idle" | "copy-success" | "copy-failure";

export function copyLabel(state: CopyState) {
  if (state === "copy-success") return "✓ Copied";
  if (state === "copy-failure") return "Copy failed";
  return "Copy";
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Embedded HA webviews do not always expose the asynchronous Clipboard API.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();
  try {
    return document.execCommand?.("copy") === true;
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
