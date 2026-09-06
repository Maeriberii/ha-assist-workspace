import createDOMPurify from "dompurify";
import { marked } from "marked";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";

const purifier = () =>
  typeof window === "undefined" ? undefined : createDOMPurify(window);

for (const [name, language] of Object.entries({
  json,
  yaml,
  javascript,
  typescript,
  python,
  bash,
  shell: bash,
  sql,
  css,
  xml,
  html: xml,
}))
  hljs.registerLanguage(name, language);

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    html() {
      return "";
    },
    link({ href, title, text }) {
      return `<a href="${href}"${title ? ` title="${title}"` : ""} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    code({ text, lang }) {
      const language = lang?.toLowerCase();
      const value =
        language && hljs.getLanguage(language)
          ? hljs.highlight(text, { language }).value
          : text;
      return `<pre><code class="hljs language-${language ?? "plaintext"}">${value}</code></pre>`;
    },
  },
});

/** Parse GFM, then sanitize the resulting HTML before Lit inserts it. */
export function renderMarkdown(content: string) {
  try {
    const DOMPurify = purifier();
    if (!DOMPurify) return content;
    return unsafeHTML(
      DOMPurify.sanitize(marked.parse(content, { async: false }), {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["style", "iframe", "object", "embed", "form"],
        FORBID_ATTR: ["style"],
      }),
    );
  } catch {
    return content;
  }
}
