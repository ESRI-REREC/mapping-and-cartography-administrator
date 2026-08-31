/* ---------------------------------------------------------------------------
 * assign-designer.js — the "assign designer" sheet (Unassigned page).
 *
 * Opened when an Unassigned row is clicked. The designer <select> is populated
 * from the designed_by coded-value domain (codes are portal usernames). On
 * submit it writes designed_by to the base electrification_projects record
 * (matched by project_reference_number) and reloads the page.
 *
 * NOTE: the due-date and instructions fields are collected for the workflow but
 * NOT persisted — the projects layer has no design due-date / instructions
 * field. Only designed_by is written. (Add fields + writes here if needed.)
 * ------------------------------------------------------------------------- */

import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

let designerOptions = []; // [{ code, name }]
let assignTarget = null; // { oid, name, ref }
let projectsLayer = null; // base electrification_projects layer (edit target)

/** Wire the sheet and load the designer list. Call once. */
export async function initAssignSheet() {
  const close = () => ($("assign-sheet").open = false);
  $("assign-close").addEventListener("click", close);
  $("assign-cancel").addEventListener("click", close);
  $("assign-submit").addEventListener("click", submitAssignment);

  projectsLayer = new FeatureLayer({ url: CFG.projectsLayerUrl });
  await loadDesigners();
}

/** Populate the designer <select> from the designed_by coded-value domain. */
async function loadDesigners() {
  const layer = new FeatureLayer({ url: CFG.viewLayerUrl });
  await layer.load();
  const field = layer.fields.find((f) => f.name === CFG.designerField);
  const coded = (field && field.domain && field.domain.codedValues) || [];
  designerOptions = coded.map((c) => ({ code: c.code, name: c.name }));

  const select = $("assign-designer");
  select.innerHTML = "";
  select.appendChild(makeOption("", "Select a designer…"));
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

/** Validate (designer required) and write designed_by, then reload the page. */
async function submitAssignment() {
  const designer = $("assign-designer").value;
  if (!designer) {
    return alertUser("Designer required", "Please select a designer to assign.", "warning");
  }
  if (!assignTarget || !assignTarget.ref) {
    return alertUser("Missing reference", "This project has no reference number to match.", "danger");
  }

  const submit = $("assign-submit");
  submit.loading = true;
  try {
    // Resolve the base project objectid from the reference, then set designed_by.
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
        { attributes: { [projectsLayer.objectIdField]: oid, designed_by: designer } }
      ]
    });
    const r = (result.updateFeatureResults || [])[0];
    if (!r || r.error) {
      throw new Error((r && r.error && r.error.message) || "update rejected");
    }

    $("assign-sheet").open = false;
    alertUser(
      "Designer assigned",
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
