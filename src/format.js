/* Small pure helpers shared by the mocked wizard and the live extraction tab. */

export function syntaxHighlight(json) {
  const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "mf-json-number";
      if (/^"/.test(match)) cls = /:$/.test(match) ? "mf-json-key" : "mf-json-string";
      else if (/true|false/.test(match)) cls = "mf-json-boolean";
      else if (/null/.test(match)) cls = "mf-json-null";
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

// Flatten a structured object into { path, type, value } rows for a schema table.
export function flattenSchema(value, path = "") {
  if (value === null) return [{ path, type: "null", value: "null" }];
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ path, type: "array", value: "[]" }];
    return value.flatMap((item, i) => flattenSchema(item, `${path}[${i}]`));
  }
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => flattenSchema(v, path ? `${path}.${k}` : k));
  }
  const type = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
  return [{ path, type, value: type === "string" ? `"${value}"` : String(value) }];
}
