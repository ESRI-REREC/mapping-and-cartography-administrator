# Mapping & Cartography Administration

A no-build HTML/CSS/JS app (Calcite Design System + ArcGIS Map Components, pinned
to SDK 4.31 / Calcite 2.13.2) — the **design-approval** counterpart of
`mapping-and-cartography`. An administrator reviews completed designs and
approves them.

## Screens

- **`index.html` + `list.js`** — table of **completed designs awaiting approval**
  (`implementation_status = 'Design' AND design_completion_date IS NOT NULL AND
  design_approved_date IS NULL`). Not scoped to a single user — an administrator
  reviews everyone's designs. Columns: project name, reference number, designed
  by, design completed, county, constituency, ward. Text columns are filterable
  (⋯ → Filter…). Clicking a row opens the map.
- **`map.html` + `map.js`** — full-page map centred on the project's facility
  point, with the Survey & Design Assets layers (service symbology inherited from
  the portal item), a basemap gallery, a legend, and a left info panel
  (survey/design details + the uploaded design **documents** for review). One
  action:
  - **Approve** — sets `design_approved_by` (the signed-in user) and
    `design_approved_date` on the base `electrification_projects` feature, shows
    an alert, then returns to the list (the row drops out once approved).

## Data

The table + info panels read the joined **`Electrification_Projects_and_Facilities`**
view, keyed by the view's `objectid`. Approvals are written to the **base
`electrification_projects`** feature, matched by `project_reference_number` — the
view itself is read-only display.

## Sign-in (OAuth)

Named-user sign-in (`oauth.js`): the user logs in with their ArcGIS portal
account and is recorded as the approver (`design_approved_by`). Reuses the same
registered **browser** OAuth app as `mapping-and-cartography` (`oauthAppId`) —
its redirect URIs must include this app's serving origin. Approvers need accounts
with **read + edit** access to the layers.
