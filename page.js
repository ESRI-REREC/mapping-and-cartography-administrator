/* ---------------------------------------------------------------------------
 * page.js — shared engine for the design-workflow pages.
 *
 * Each stage is its own page (unassigned/in-progress/completed .html + a tiny
 * .js that calls initPage("<id>")). This module renders that page's
 * <arcgis-feature-table> over the joined Projects × Facilities view, filtered
 * by the page's base where-clause (config.pages), with per-column filters.
 *
 * Row click, by page `action`:
 *   assign   → open the assign-designer sheet (Unassigned)
 *   view     → open the map, read-only (In progress)
 *   approve  → open the map with Approve (Completed)
 * ------------------------------------------------------------------------- */

import esriConfig from "https://js.arcgis.com/4.31/@arcgis/core/config.js";
import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";
import { ensureSignedIn } from "./oauth.js";
import { initAssignSheet, openAssignSheet } from "./assign-designer.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

let pageId = null;
let page = null; // the config.pages entry for this page
let ctrl = null; // { barEl, chipsEl, tableEl, layer, activeFilters }
let filterField = null;

function pageConfig(id) {
  const p = (CFG.pages || []).find((x) => x.id === id);
  if (!p) throw new Error(`Unknown page "${id}".`);
  return p;
}

function columnsFor() {
  return page.columns || [];
}

/* ------------------------------------------------------------------------ *
 * Table construction
 * ------------------------------------------------------------------------ */

function buildPane() {
  const host = $("pane-" + pageId);

  const body = document.createElement("div");
  body.className = "pane-body";

  const bar = document.createElement("div");
  bar.className = "active-filters";
  bar.hidden = true;

  const label = document.createElement("span");
  label.className = "af-label";
  label.textContent = "Filters:";

  const chips = document.createElement("div");
  chips.className = "filter-chips";

  const clearAll = document.createElement("calcite-button");
  clearAll.className = "clear-all-filters";
  clearAll.setAttribute("appearance", "transparent");
  clearAll.setAttribute("kind", "danger");
  clearAll.setAttribute("scale", "s");
  clearAll.setAttribute("icon-start", "x-circle");
  clearAll.textContent = "Clear all";
  clearAll.addEventListener("click", clearAllFilters);

  bar.append(label, chips, clearAll);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("arcgis-feature-table");
  table.setAttribute("hide-selection-column", "");
  table.setAttribute("hide-header", "");
  wrap.appendChild(table);

  body.append(bar, wrap);
  host.appendChild(body);

  ctrl = { barEl: bar, chipsEl: chips, tableEl: table, layer: null, activeFilters: {} };
}

function buildTableTemplate() {
  return {
    columnTemplates: columnsFor().map((c) => {
      const template = {
        type: "field",
        fieldName: c.field,
        label: c.label,
        width: c.width,
        autoWidth: false
      };
      if (c.dateFormat) template.format = { dateFormat: c.dateFormat };
      if (c.filterable !== false) {
        template.menuConfig = {
          items: [
            {
              label: "Filter…",
              iconClass: "esri-icon-filter",
              clickFunction: () => promptFilter(c.field, c.label)
            },
            {
              label: "Clear filter",
              iconClass: "esri-icon-close",
              clickFunction: () => applyFilter(c.field, null)
            }
          ]
        };
      }
      return template;
    })
  };
}

async function initTable() {
  ctrl.layer = new FeatureLayer({
    url: CFG.projectsLayerUrl,
    outFields: ["*"],
    displayField: "project_name",
    definitionExpression: page.where
  });
  await ctrl.layer.load();

  ctrl.tableEl.tableTemplate = buildTableTemplate();
  ctrl.tableEl.layer = ctrl.layer;

  ctrl.tableEl.addEventListener("arcgisCellClick", (event) => {
    const feature = featureFromCellEvent(event);
    const oid = objectIdFromCellEvent(event);
    if (oid == null) return;
    if (page.action === "assign") {
      openAssignSheet((feature && feature.attributes) || { objectid: oid });
    } else if (page.action === "view") {
      goToMap(oid, "readonly");
    } else {
      goToMap(oid, "approve");
    }
  });
}

function goToMap(oid, mode) {
  window.location.href =
    "map.html?oid=" + encodeURIComponent(oid) + "&mode=" + encodeURIComponent(mode);
}

/* ------------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------------ */

function promptFilter(field, label) {
  filterField = field;
  const input = $("filter-input");
  $("filter-dialog-heading").textContent = `Filter — ${label}`;
  $("filter-dialog-label").textContent = `"${label}" contains`;
  input.value = ctrl.activeFilters[field] || "";
  $("filter-dialog").open = true;
  requestAnimationFrame(() => input.setFocus && input.setFocus());
}

function wireFilterDialog() {
  const dialog = $("filter-dialog");
  const input = $("filter-input");
  const apply = () => {
    if (filterField) applyFilter(filterField, input.value.trim() || null);
    dialog.open = false;
  };
  $("filter-apply").addEventListener("click", apply);
  $("filter-cancel").addEventListener("click", () => (dialog.open = false));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") apply();
  });
}

function applyFilter(field, value) {
  if (value) ctrl.activeFilters[field] = value;
  else delete ctrl.activeFilters[field];
  syncFilters();
}

function clearAllFilters() {
  Object.keys(ctrl.activeFilters).forEach((f) => delete ctrl.activeFilters[f]);
  syncFilters();
}

function syncFilters() {
  const base = page.where;
  const clauses = Object.entries(ctrl.activeFilters).map(
    ([f, v]) => `UPPER(${f}) LIKE UPPER('%${v.replace(/'/g, "''")}%')`
  );
  const filterExpr = clauses.join(" AND ");
  ctrl.layer.definitionExpression = filterExpr ? `(${base}) AND (${filterExpr})` : base;
  renderChips();
}

function renderChips() {
  ctrl.chipsEl.innerHTML = "";
  const entries = Object.entries(ctrl.activeFilters);
  ctrl.barEl.hidden = entries.length === 0;
  entries.forEach(([field, value]) => {
    const col = columnsFor().find((c) => c.field === field);
    const chip = document.createElement("calcite-chip");
    chip.setAttribute("closable", "");
    chip.setAttribute("scale", "s");
    chip.setAttribute("appearance", "outline-fill");
    chip.setAttribute("kind", "brand");
    chip.textContent = `${col ? col.label : field}: ${value}`;
    chip.addEventListener("calciteChipClose", () => applyFilter(field, null));
    ctrl.chipsEl.appendChild(chip);
  });
}

/* ------------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------------ */

function featureFromCellEvent(event) {
  const d = event.detail || {};
  return (
    d.feature ||
    d.graphic ||
    (d.item && d.item.feature) ||
    (d.target && d.target.feature) ||
    null
  );
}

function objectIdFromCellEvent(event) {
  const feature = featureFromCellEvent(event);
  if (feature && feature.attributes) {
    const a = feature.attributes;
    return a.objectid ?? a.OBJECTID ?? a.ObjectId ?? null;
  }
  const d = event.detail || {};
  return d.objectId != null ? d.objectId : null;
}

function alertUser(title, message, kind) {
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  const el = $("app-alert");
  el.kind = kind;
  el.open = true;
}

/* ------------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------------ */

async function boot() {
  try {
    esriConfig.portalUrl = CFG.portalUrl;
    await ensureSignedIn();

    await customElements.whenDefined("arcgis-feature-table");
    buildPane();
    wireFilterDialog();

    // The assign sheet only exists on the Unassigned page. It reloads the page
    // on a successful assignment, so no refresh callback is needed here.
    if (page.action === "assign" && $("assign-sheet")) {
      await initAssignSheet();
    }

    await initTable();
  } catch (err) {
    alertUser("Could not load projects", err.message, "danger");
  } finally {
    $("boot-scrim").hidden = true;
  }
}

/** Entry point each page calls. */
export function initPage(id) {
  pageId = id;
  page = pageConfig(id);
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
