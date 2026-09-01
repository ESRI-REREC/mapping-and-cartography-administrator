/* ---------------------------------------------------------------------------
 * assign-designer.js — the "assign cartographer" sheet (Unassigned page).
 *
 * Opened when an Unassigned row is clicked. The cartographer <select> is
 * populated from the cartography_by coded-value domain (codes are portal
 * usernames). On submit it writes cartography_by plus the due date, instructions,
 * assigner (cartography_assigned_by) and assign date to the base
 * electrification_projects record (matched by project_reference_number) and
 * reloads the page.
 * ------------------------------------------------------------------------- */

import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";
import { getUsername } from "./oauth.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

let designerOptions = []; // [{ code, name }]
let assignTarget = null; // { oid, name, ref }
let projectsLayer = null; // base electrification_projects layer (edit target)

/** "YYYY-MM-DD" (or ISO) -> epoch ms (UTC), or null. */
function toEpochMs(dateStr) {
  if (!dateStr) return null;
  const iso = String(dateStr).length <= 10 ? `${dateStr}T00:00:00Z` : dateStr;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Wire the sheet and load the designer list. Call once. */
export async function initAssignSheet() {
  const close = () => ($("assign-sheet").open = false);
  $("assign-close").addEventListener("click", close);
  $("assign-cancel").addEventListener("click", close);
  $("assign-submit").addEventListener("click", submitAssignment);

  projectsLayer = new FeatureLayer({ url: CFG.projectsLayerUrl });
  await loadDesigners();
}

/** Populate the cartographer <select> from the cartography_by coded-value domain. */
async function loadDesigners() {
  const layer = new FeatureLayer({ url: CFG.projectsLayerUrl });
  await layer.load();
  const field = layer.fields.find((f) => f.name === CFG.designerField);
  const coded = (field && field.domain && field.domain.codedValues) || [];
  designerOptions = coded.map((c) => ({ code: c.code, name: c.name }));

  const select = $("assign-designer");
  select.innerHTML = "";
  select.appendChild(makeOption("", "Select a cartographer…"));
  designerOptions.forEach((d) => select.appendChild(makeOption(d.code, d.name)));
}

function makeOption(value, text) {
  const opt = document.createElement("calcite-option");
  opt.value = value;
  opt.textContent = text;
  return opt;
}

function designerName(code) {
  const d = designerOptions.find((x) => x.code === code);
  return d ? d.name : code;
}

/** Open the assign sheet for a project, with a clean form. */
export function openAssignSheet(attrs) {
  const oid = attrs.objectid ?? attrs.OBJECTID;
  assignTarget = {
    oid,
    name: attrs.project_name || "Project #" + oid,
    ref: attrs.project_reference_number || ""
  };
  $("assign-subheading").textContent = assignTarget.name;
  $("assign-designer").value = "";
  $("assign-due").value = "";
  $("assign-instructions").value = "";
  $("assign-sheet").open = true;
}

/** Validate (cartographer required) and write cartography_by, then reload. */
async function submitAssignment() {
  const designer = $("assign-designer").value;
  if (!designer) {
    return alertUser("Cartographer required", "Please select a cartographer to assign.", "warning");
  }
  if (!assignTarget || !assignTarget.ref) {
    return alertUser("Missing reference", "This project has no reference number to match.", "danger");
  }

  const submit = $("assign-submit");
  submit.loading = true;
  try {
    // Resolve the base project objectid from the reference, then set cartography_by.
    await projectsLayer.load();
    const q = await projectsLayer.queryFeatures({
      where: `project_reference_number = '${assignTarget.ref.replace(/'/g, "''")}'`,
      outFields: [projectsLayer.objectIdField],
      returnGeometry: false,
      num: 1
    });
    const feature = (q.features || [])[0];
    const oid = feature ? feature.attributes[projectsLayer.objectIdField] : null;
    if (oid == null) throw new Error("No project record matched the reference.");

    const result = await projectsLayer.applyEdits({
      updateFeatures: [
        {
          attributes: {
            [projectsLayer.objectIdField]: oid,
            cartography_by: designer,
            cartography_due_date: toEpochMs($("assign-due").value),
            cartography_instructions: ($("assign-instructions").value || "").trim() || null,
            cartography_assigned_by: getUsername() || null,
            cartography_assign_date: Date.now()
          }
        }
      ]
    });
    const r = (result.updateFeatureResults || [])[0];
    if (!r || r.error) {
      throw new Error((r && r.error && r.error.message) || "update rejected");
    }

    $("assign-sheet").open = false;
    alertUser(
      "Cartographer assigned",
      `${assignTarget.name} assigned to ${designerName(designer)}.`,
      "success"
    );
    // Refresh the page so the newly-assigned row leaves the Unassigned list.
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) {
    alertUser("Assignment failed", err.message, "danger");
  } finally {
    submit.loading = false;
  }
}

function alertUser(title, message, kind) {
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  const el = $("app-alert");
  el.kind = kind;
  el.open = true;
}
