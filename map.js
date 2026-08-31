/* ---------------------------------------------------------------------------
 * map.js — Design-approval project map view (ES module).
 *
 * Opened from a review-list row (map.html?oid=<view objectid>). Shows a
 * full-page map with:
 *   • a closable left panel of survey/design details (config.detailSections)
 *     plus the uploaded design documents (attachments) for review;
 *   • a basemap gallery + every Survey_and_Design_Assets sublayer (layer list);
 *   • the view centred on the Facilities point whose reference_number matches;
 *   • an "Approve" button that sets design_approved_by (the signed-in user) +
 *     design_approved_date on the base electrification_projects feature, then
 *     returns to the list.
 *
 * The user signs in with their portal account (oauth.js); the SDK attaches their
 * token to every secured request.
 * ------------------------------------------------------------------------- */

import esriConfig from "https://js.arcgis.com/4.31/@arcgis/core/config.js";
import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";
import GroupLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/GroupLayer.js";
import Graphic from "https://js.arcgis.com/4.31/@arcgis/core/Graphic.js";
import { ensureSignedIn, getServerToken } from "./oauth.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

/* field name -> esri field type, so we can format date fields. */
const fieldTypes = {};

let attrs = null; // the joined view row for this project
let projectsLayer = null; // base electrification_projects layer (edit target)
let projectOid = null; // base project objectid (approval target)
let approver = null; // signed-in username, recorded as design_approved_by
let facilityGeometry = null; // matched facility point

/* ------------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------------ */

function getOid() {
  const oid = new URLSearchParams(window.location.search).get("oid");
  return oid ? Number(oid) : null;
}

/** "approve" (from Completed) or "readonly" (from In progress; no action). */
function getMode() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "readonly" ? "readonly" : "approve";
}

async function fetchProject(oid) {
  const layer = new FeatureLayer({ url: CFG.viewLayerUrl, outFields: ["*"] });
  await layer.load();
  layer.fields.forEach((f) => (fieldTypes[f.name] = f.type));

  const result = await layer.queryFeatures({
    objectIds: [oid],
    outFields: ["*"],
    returnGeometry: false
  });
  const feature = (result.features || [])[0];
  if (!feature) throw new Error("Project " + oid + " was not found.");
  return feature.attributes;
}

/** Resolve the base project objectid (attachment target) from its reference. */
async function resolveProjectFeature(ref) {
  projectsLayer = new FeatureLayer({ url: CFG.projectsLayerUrl });
  await projectsLayer.load();
  if (!ref) return;
  const result = await projectsLayer.queryFeatures({
    where: `project_reference_number = '${ref.replace(/'/g, "''")}'`,
    outFields: [projectsLayer.objectIdField],
    returnGeometry: false,
    num: 1
  });
  const feature = (result.features || [])[0];
  projectOid = feature ? feature.attributes[projectsLayer.objectIdField] : null;
}

/* ------------------------------------------------------------------------ *
 * Info panel
 * ------------------------------------------------------------------------ */

function renderInfo() {
  $("info-title").textContent = attrs.project_name || "Untitled project";
  document.title = (attrs.project_name || "Project") + " · Mapping & Cartography";

  const ref = attrs.project_reference_number;
  $("info-ref").textContent = ref ? "Ref: " + ref : "";

  const status = attrs.implementation_status;
  const chip = $("status-chip");
  if (status) {
    chip.textContent = status;
    chip.kind = "brand";
    chip.hidden = false;
  } else {
    chip.hidden = true;
  }

  const container = $("info-sections");
  container.innerHTML = "";
  CFG.detailSections.forEach((section, idx) => {
    const block = document.createElement("calcite-block");
    block.setAttribute("heading", section.title);
    block.setAttribute("collapsible", "");
    if (idx === 0) block.setAttribute("open", "");
    if (section.icon) block.setAttribute("icon-start", section.icon);

    const dl = document.createElement("dl");
    dl.className = "detail-list";
    section.fields.forEach((f) => {
      const dt = document.createElement("dt");
      dt.textContent = f.label;
      const dd = document.createElement("dd");
      dd.textContent = formatValue(attrs[f.field], f.field);
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    block.appendChild(dl);
    container.appendChild(block);
  });
}

function formatValue(value, field) {
  if (value == null || value === "") return "—";
  if (["date", "date-only", "timestamp-offset"].includes(fieldTypes[field])) {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  return String(value);
}

function setInfoOpen(open) {
  if (open) $("info-panel").closed = false;
  $("info-card").hidden = !open;
  $("info-reopen").hidden = open;
}

/* ------------------------------------------------------------------------ *
 * Attachments (project documents)
 * ------------------------------------------------------------------------ */

async function loadAttachments() {
  const listEl = $("attach-list");
  listEl.innerHTML = "";
  if (!projectsLayer || projectOid == null) {
    listEl.innerHTML = '<span class="attach-empty">No project record matched.</span>';
    return;
  }
  try {
    const byOid = await projectsLayer.queryAttachments({ objectIds: [projectOid] });
    const items = (byOid && byOid[projectOid]) || [];
    if (!items.length) {
      listEl.innerHTML = '<span class="attach-empty">No documents uploaded yet.</span>';
      return;
    }
    const token = await getServerToken();
    items.forEach((att) => {
      // Build the URL explicitly (att.url isn't reliably resolved in this SDK
      // build): {layer}/{objectId}/attachments/{attachmentId}?token=…
      const url =
        `${CFG.projectsLayerUrl}/${projectOid}/attachments/${att.id}` +
        `?token=${encodeURIComponent(token)}`;
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = att.name || `Attachment ${att.id}`;
      listEl.appendChild(a);
    });
  } catch (err) {
    listEl.innerHTML = `<span class="attach-empty">Could not load documents: ${err.message}</span>`;
  }
}

/* ------------------------------------------------------------------------ *
 * Approve design
 * ------------------------------------------------------------------------ */

/** Approve the completed design: set design_approved_by (the signed-in user) +
 * design_approved_date on the base electrification_projects record, alert, then
 * return to the list (the row drops out — the table shows only unapproved). */
async function approveDesign() {
  if (!projectsLayer || projectOid == null) {
    return alertUser("No project record", "Could not find the project to update.", "danger");
  }
  const btn = $("approve-btn");
  btn.loading = true;
  try {
    const result = await projectsLayer.applyEdits({
      updateFeatures: [
        {
          attributes: {
            [projectsLayer.objectIdField]: projectOid,
            design_approved_by: approver,
            design_approved_date: Date.now()
          }
        }
      ]
    });
    const r = (result.updateFeatureResults || [])[0];
    if (!r || r.error) {
      throw new Error((r && r.error && r.error.message) || "update rejected");
    }
    alertUser("Design approved", `${attrs.project_name} approved by ${approver}.`, "success");
    setTimeout(() => (window.location.href = "index.html"), 1200);
  } catch (err) {
    alertUser("Approval failed", err.message, "danger");
  } finally {
    btn.loading = false;
  }
}

/* ------------------------------------------------------------------------ *
 * Map
 * ------------------------------------------------------------------------ */

async function loadAssetLayers(map) {
  const token = await getServerToken();
  const res = await fetch(CFG.assetsServiceUrl + "?f=json&token=" + encodeURIComponent(token));
  const svc = await res.json();
  if (svc.error) throw new Error(svc.error.message || "Could not read asset layers.");

  const hiddenPrefixes = CFG.mapHiddenLayerPrefixes || [];
  const startsHidden = (name) => hiddenPrefixes.some((p) => String(name).startsWith(p));
  const group = new GroupLayer({ title: "Survey & Design Assets", visibilityMode: "independent" });
  (svc.layers || []).forEach((l) => {
    // Load each sublayer FROM THE PORTAL ITEM (not the raw service url) so it
    // inherits the symbology saved on the item's visualization. The item id is
    // configured; otherwise fall back to the service url (plain default).
    const props = CFG.assetsItemId
      ? { portalItem: { id: CFG.assetsItemId }, layerId: l.id }
      : { url: CFG.assetsServiceUrl + "/" + l.id };
    const layer = new FeatureLayer({
      ...props,
      title: l.name,
      visible: !startsHidden(l.name),
      outFields: ["*"],
      popupEnabled: true
    });
    // Show a popup of the feature's fields on click. Keep the item's configured
    // popup if it has one; otherwise auto-generate from the layer's fields.
    layer
      .when(() => {
        if (!layer.popupTemplate) layer.popupTemplate = layer.createPopupTemplate();
      })
      .catch(() => {});
    group.add(layer);
  });
  map.add(group);
}

async function centerOnFacility(view, ref) {
  if (!ref) return;
  const facilities = new FeatureLayer({ url: CFG.facilitiesLayerUrl });
  await facilities.load();

  const result = await facilities.queryFeatures({
    where: `reference_number = '${ref.replace(/'/g, "''")}'`,
    outFields: ["objectid", "name"],
    returnGeometry: true,
    num: 1
  });
  const feature = (result.features || [])[0];
  if (!feature || !feature.geometry) {
    alertUser("No facility located", `No facility point matches reference ${ref}.`, "warning");
    return;
  }
  facilityGeometry = feature.geometry;

  view.graphics.add(
    new Graphic({
      geometry: feature.geometry,
      attributes: feature.attributes,
      symbol: {
        type: "simple-marker",
        style: "circle",
        size: 14,
        color: [0, 122, 194, 0.9],
        outline: { color: [255, 255, 255], width: 2 }
      },
      popupTemplate: {
        title: attrs.project_name || "Facility",
        content: `Reference: ${ref}<br>Facility: {name}`
      }
    })
  );
  await view.goTo({ target: feature.geometry, zoom: CFG.mapFacilityZoom || 17 });
}

function initMap() {
  const mapEl = $("map");
  mapEl.basemap = CFG.mapBasemap;
  mapEl.center = CFG.mapFallbackCenter;
  mapEl.zoom = CFG.mapFallbackZoom;

  const onReady = async () => {
    try {
      await loadAssetLayers(mapEl.map);
      await centerOnFacility(mapEl.view, attrs.project_reference_number);
    } catch (err) {
      alertUser("Map error", err.message, "danger");
    }
  };

  if (mapEl.ready) {
    onReady();
  } else {
    mapEl.addEventListener(
      "arcgisViewReadyChange",
      () => {
        if (mapEl.ready) onReady();
      },
      { once: true }
    );
  }
}

/* ------------------------------------------------------------------------ *
 * UI plumbing + boot
 * ------------------------------------------------------------------------ */

function alertUser(title, message, kind) {
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  const el = $("app-alert");
  el.kind = kind;
  el.open = true;
}

async function boot() {
  const mode = getMode();
  const backHref = mode === "readonly" ? "in-progress.html" : "completed.html";
  $("back-btn").addEventListener("click", () => {
    window.location.href = backHref;
  });
  $("info-panel").addEventListener("calcitePanelClose", () => setInfoOpen(false));
  $("info-reopen").addEventListener("click", () => setInfoOpen(true));

  // Approve only on the Completed flow; In progress is read-only.
  if (mode === "approve") {
    $("approve-btn").addEventListener("click", approveDesign);
  } else {
    $("approve-btn").hidden = true;
  }

  try {
    const oid = getOid();
    if (oid == null) throw new Error("No project id in the URL (?oid=…).");

    esriConfig.portalUrl = CFG.portalUrl;
    approver = await ensureSignedIn();

    attrs = await fetchProject(oid);
    renderInfo();

    await resolveProjectFeature(attrs.project_reference_number);
    await loadAttachments();

    await customElements.whenDefined("arcgis-map");
    initMap();
  } catch (err) {
    $("info-title").textContent = "Could not load project";
    alertUser("Error", err.message, "danger");
  } finally {
    $("boot-scrim").hidden = true;
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
