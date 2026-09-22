/* Column schema for the dashboard's data-management editor.
 *
 * Scope: only the app's own configuration data — case types and workflow
 * templates — which today can only be created via a backend seeder
 * (database/seeders/*Seeder.php). Users, patients and cases already have
 * proper flows (login, case intake, the referral wizard) and are
 * deliberately NOT exposed here as generic CRUD.
 *
 * `organizations` stays in this config only as reference data — it's
 * fetched so workflow templates can resolve/pick an organization_id, but
 * it's marked `referenceOnly` so the editor never renders it as an editable
 * tab.
 *
 * Mirrors the Laravel FormRequest rules exactly (see
 * MedFlow_AI_Backend/app/Http/Requests/Api/V1/CaseTypes|WorkflowTemplates/*)
 * so the form never submits something the backend will reject.
 *
 * Column `type`: text | select | boolean | json | textarea | fk
 * `fk` columns reference another table's id — the editor resolves them to a
 * human label (via `rowLabel`) and renders a <select> populated from that
 * table's already-loaded rows.
 */
export const TABLE_CONFIGS = {
  organizations: {
    label: "Organizations",
    referenceOnly: true,
    columns: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "tier", label: "Tier", type: "select", options: ["solo", "clinic-group", "enterprise"] },
    ],
  },
  case_types: {
    label: "Case Types",
    columns: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      {
        key: "category", label: "Category", type: "select", required: true,
        options: [
          "specialist_referral", "disability_assessment", "prior_authorization",
          "insurance_documentation", "return_to_work", "chronic_care", "other",
        ],
      },
      { key: "field_schema", label: "Field schema", type: "json" },
      { key: "is_active", label: "Active", type: "boolean" },
    ],
  },
  workflow_templates: {
    label: "Workflow Templates",
    columns: [
      { key: "organization_id", label: "Organization", type: "fk", fkTable: "organizations", required: true },
      { key: "case_type_id", label: "Case type", type: "fk", fkTable: "case_types", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "pathway_rules", label: "Pathway rules", type: "json" },
      { key: "document_template", label: "Document template", type: "textarea" },
      { key: "is_active", label: "Active", type: "boolean" },
    ],
  },
};

/** Tabs shown in the editor — everything in TABLE_CONFIGS except reference-only tables. */
export const EDITABLE_TABLE_KEYS = Object.keys(TABLE_CONFIGS).filter((k) => !TABLE_CONFIGS[k].referenceOnly);

/** Best-effort human label for a row, used in <select> options and FK cells. */
export function rowLabel(tableKey, row) {
  if (!row) return "—";
  return row.name || row.code || row.id;
}
