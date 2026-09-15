import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, ChevronDown, AlertTriangle } from "lucide-react";
import { tableResources } from "./api.js";
import { TABLE_CONFIGS, EDITABLE_TABLE_KEYS, rowLabel } from "./dataTables.js";

// Fetch every configured table (editable + reference-only, e.g.
// organizations) so FK <select>s always have their options ready, but only
// render tabs for the editable ones.
const FETCH_TABLE_KEYS = Object.keys(TABLE_CONFIGS);

/** Build the default form values for a column set — used for "add new". */
function blankValues(columns) {
  const values = {};
  for (const c of columns) values[c.key] = c.type === "boolean" ? false : "";
  return values;
}

/** Row → editable form values (JSON columns become pretty-printed text). */
function rowToValues(row, columns) {
  const values = {};
  for (const c of columns) {
    const v = row?.[c.key];
    if (c.type === "json") values[c.key] = v ? JSON.stringify(v, null, 2) : "";
    else if (c.type === "boolean") values[c.key] = Boolean(v);
    else values[c.key] = v ?? "";
  }
  return values;
}

/** Form values → API payload (parses JSON columns, drops blank optionals). */
function valuesToPayload(values, columns, { isCreate }) {
  const payload = {};
  for (const c of columns) {
    if (c.createOnly && !isCreate) continue;
    let v = values[c.key];
    if (c.type === "json") {
      if (!v || !v.trim()) continue;
      payload[c.key] = JSON.parse(v); // caller catches SyntaxError
      continue;
    }
    if (c.type === "boolean") {
      payload[c.key] = v;
      continue;
    }
    if (v === "" && !c.required) continue;
    payload[c.key] = v;
  }
  return payload;
}

function Row({ tableKey, columns, row, rowsByTable, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(() => rowToValues(row, columns));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload = valuesToPayload(values, columns, { isCreate: false });
      const updated = await tableResources[tableKey].update(row.id, payload);
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      if (err instanceof SyntaxError) setError("Invalid JSON in one of the fields.");
      else {
        setError(err.message || "Save failed.");
        setFieldErrors(err.errors || {});
      }
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    setSaving(true);
    setError(null);
    try {
      await tableResources[tableKey].remove(row.id);
      onDeleted(row.id);
    } catch (err) {
      setError(err.message || "Delete failed.");
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  if (!editing) {
    return (
      <div className="mf-field-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p className="mf-field-value" style={{ fontWeight: 600, marginBottom: 4 }}>{rowLabel(tableKey, row)}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
            {columns.filter((c) => !c.createOnly).map((c) => (
              <span key={c.key} style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                {c.label}: <b style={{ color: "var(--ink)" }}>{formatCellValue(c, row[c.key], rowsByTable)}</b>
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {confirmingDelete ? (
            <>
              <button className="mf-mini-btn ghost" style={{ color: "var(--clay)" }} onClick={del} disabled={saving}>
                {saving ? "…" : "Confirm delete"}
              </button>
              <button className="mf-mini-btn ghost" onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="mf-mini-btn ghost" onClick={() => setEditing(true)} aria-label="Edit"><Pencil size={13} /></button>
              <button className="mf-mini-btn ghost" onClick={() => setConfirmingDelete(true)} aria-label="Delete"><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mf-card">
      <FieldsForm columns={columns} values={values} set={set} fieldErrors={fieldErrors} rowsByTable={rowsByTable} isCreate={false} />
      {error && <p className="mf-error">{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="mf-primary-btn" onClick={save} disabled={saving}>
          {saving ? "Saving…" : <><Check size={14} /> Save</>}
        </button>
        <button className="mf-ghost-btn" onClick={() => { setEditing(false); setValues(rowToValues(row, columns)); setError(null); }}>
          <X size={14} /> Cancel
        </button>
      </div>
    </div>
  );
}

function NewRow({ tableKey, columns, rowsByTable, onCreated, onCancel }) {
  const [values, setValues] = useState(() => blankValues(columns));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const set = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const create = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload = valuesToPayload(values, columns, { isCreate: true });
      const created = await tableResources[tableKey].create(payload);
      onCreated(created);
    } catch (err) {
      if (err instanceof SyntaxError) setError("Invalid JSON in one of the fields.");
      else {
        setError(err.message || "Create failed.");
        setFieldErrors(err.errors || {});
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mf-card" style={{ borderColor: "var(--blue)" }}>
      <FieldsForm columns={columns} values={values} set={set} fieldErrors={fieldErrors} rowsByTable={rowsByTable} isCreate />
      {error && <p className="mf-error">{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="mf-primary-btn" onClick={create} disabled={saving}>
          {saving ? "Creating…" : <><Check size={14} /> Create</>}
        </button>
        <button className="mf-ghost-btn" onClick={onCancel}><X size={14} /> Cancel</button>
      </div>
    </div>
  );
}

function FieldsForm({ columns, values, set, fieldErrors, rowsByTable, isCreate }) {
  return (
    <div className="mf-field-grid">
      {columns.map((c) => {
        if (c.createOnly && !isCreate) return null;
        return (
          <div className="mf-field" key={c.key} style={{ marginBottom: 10 }}>
            <label className="mf-label">{c.label}{c.required ? " *" : ""}</label>
            <FieldInput column={c} value={values[c.key]} onChange={(v) => set(c.key, v)} rowsByTable={rowsByTable} />
            {fieldErrors[c.key] && <p className="mf-error">{fieldErrors[c.key].join(" ")}</p>}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({ column, value, onChange, rowsByTable }) {
  if (column.type === "boolean") {
    return (
      <label className="mf-attest-row" style={{ padding: "6px 0" }}>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>{value ? "Yes" : "No"}</span>
      </label>
    );
  }
  if (column.type === "fk") {
    const options = rowsByTable[column.fkTable] || [];
    return (
      <div className="mf-select-wrap">
        <select className="mf-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>Select…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{rowLabel(column.fkTable, o)}</option>)}
        </select>
        <ChevronDown size={16} className="mf-select-icon" />
      </div>
    );
  }
  if (column.type === "select") {
    return (
      <div className="mf-select-wrap">
        <select className="mf-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>Select…</option>
          {column.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={16} className="mf-select-icon" />
      </div>
    );
  }
  if (column.type === "textarea" || column.type === "json") {
    return (
      <textarea className="mf-textarea" style={{ minHeight: column.type === "json" ? 90 : 60, fontFamily: column.type === "json" ? "'IBM Plex Mono', monospace" : "inherit" }}
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={column.type === "json" ? "{}" : undefined} />
    );
  }
  if (column.type === "date") {
    return <input type="date" className="mf-input" value={value?.slice?.(0, 10) || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input type={column.type === "password" ? "password" : "text"} className="mf-input"
      value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={column.type === "password" ? "Leave set on create only" : undefined} />
  );
}

function formatCellValue(column, value, rowsByTable) {
  if (value == null || value === "") return "—";
  if (column.type === "fk") {
    const row = (rowsByTable[column.fkTable] || []).find((r) => r.id === value);
    return row ? rowLabel(column.fkTable, row) : value.slice(0, 8) + "…";
  }
  if (column.type === "boolean") return value ? "Yes" : "No";
  if (column.type === "json") return Array.isArray(value) ? `[${value.length}]` : "{…}";
  if (column.type === "password") return "••••••••";
  if (typeof value === "string" && value.length > 60) return value.slice(0, 60) + "…";
  return String(value);
}

export default function TableEditor() {
  const [activeTable, setActiveTable] = useState(EDITABLE_TABLE_KEYS[0]);
  const [rowsByTable, setRowsByTable] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [addingNew, setAddingNew] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const entries = await Promise.all(
        FETCH_TABLE_KEYS.map(async (key) => [key, await tableResources[key].list()]),
      );
      setRowsByTable(Object.fromEntries(entries));
    } catch (err) {
      setLoadError(err.message || "Could not load tables.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const config = TABLE_CONFIGS[activeTable];
  const rows = rowsByTable[activeTable] || [];

  const patch = (key, updater) => setRowsByTable((prev) => ({ ...prev, [key]: updater(prev[key] || []) }));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {EDITABLE_TABLE_KEYS.map((key) => (
          <button type="button" key={key}
            className={`mf-mini-btn${activeTable === key ? "" : " ghost"}`}
            onClick={() => { setActiveTable(key); setAddingNew(false); }}>
            {TABLE_CONFIGS[key].label} <span style={{ opacity: 0.7 }}>({(rowsByTable[key] || []).length})</span>
          </button>
        ))}
      </div>

      {loading && <p className="mf-tiny-note">Loading tables…</p>}
      {loadError && (
        <div className="mf-info-strip"><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{loadError}</div>
      )}

      {!loading && !loadError && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p className="mf-section-label" style={{ margin: 0 }}>{config.label} ({rows.length})</p>
            {!addingNew && (
              <button className="mf-mini-btn" onClick={() => setAddingNew(true)}><Plus size={13} /> Add</button>
            )}
          </div>

          {addingNew && (
            <div style={{ marginBottom: 10 }}>
              <NewRow tableKey={activeTable} columns={config.columns} rowsByTable={rowsByTable}
                onCreated={(created) => { patch(activeTable, (r) => [...r, created]); setAddingNew(false); }}
                onCancel={() => setAddingNew(false)} />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((row) => (
              <Row key={row.id} tableKey={activeTable} columns={config.columns} row={row} rowsByTable={rowsByTable}
                onSaved={(updated) => patch(activeTable, (r) => r.map((x) => (x.id === updated.id ? updated : x)))}
                onDeleted={(id) => patch(activeTable, (r) => r.filter((x) => x.id !== id))} />
            ))}
            {rows.length === 0 && <p className="mf-tiny-note">No {config.label.toLowerCase()} yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
