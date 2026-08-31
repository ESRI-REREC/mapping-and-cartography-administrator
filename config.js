/* ---------------------------------------------------------------------------
 * config.js — settings for the Mapping & Cartography Administration UI.
 *
 * The design workflow admin for the electrification pipeline. Three pages share
 * one engine (page.js):
 *   • Unassigned  — Design stage, no designer yet. Row → assign a designer.
 *   • In progress — designer assigned, design not completed/approved. Row → map
 *                   (read-only, no action).
 *   • Completed   — design completed, awaiting approval. Row → map + Approve.
 *
 * The table + detail/map panels read the joined Projects × Facilities view;
 * assignments/approvals are written to the base electrification_projects layer.
 * The user signs in with their own portal account (oauth.js).
 * ------------------------------------------------------------------------- */

window.APP_CONFIG = {
	portalUrl: "https://development.esriea.com/portal",
	serverRestUrl: "https://development.esriea.com/server/rest/services",

	// OAuth 2.0 app id (client_id) for named-user sign-in. The signed-in user is
	// recorded as the approver (design_approved_by). Reuses the same registered
	// browser app as mapping-and-cartography (redirect URIs must include this
	// app's serving origin).
	oauthAppId: "pi2SVsyvcepvOgLt",

	// Joined Projects × Facilities view (non-spatial). Source for the tables and
	// the detail/map info panels. Its own `objectid` keys the map lookup.
	viewLayerUrl:
		"https://development.esriea.com/server/rest/services/Hosted/Electrification_Projects_and_Facilities/FeatureServer/0",

	// Base Projects table. Assignments (designed_by) and approvals are written
	// here (matched by project_reference_number).
	projectsLayerUrl:
		"https://development.esriea.com/server/rest/services/Hosted/electrification_projects/FeatureServer/0",

	// Facilities layer — the map centres on the facility point whose
	// reference_number matches the project's.
	facilitiesLayerUrl:
		"https://development.esriea.com/server/rest/services/Hosted/Facilities/FeatureServer/0",

	// Survey & Design Assets feature service — every sublayer is added to the map
	// view and toggled through the layer list.
	assetsServiceUrl:
		"https://development.esriea.com/server/rest/services/Hosted/Survey_and_Design_Assets/FeatureServer",
	// The portal ITEM for that service. Sublayers are loaded from the item (not
	// the raw service url) so they inherit the symbology saved on the item's
	// visualization — the FeatureServer's own drawingInfo is the plain default.
	assetsItemId: "10ee7f0af04f49288240eb8a1c12a6f5",

	// Token server (../server) — used for a federated server token when building
	// attachment URLs. Serve these pages from an origin registered on the OAuth
	// app above.
	serverUrl: "https://dev-server-rerec-poc.vercel.app",

	// The designer <select> in the Unassigned assign sheet is populated from this
	// field's coded-value domain (codes are portal usernames).
	designerField: "designed_by",

	// Map view settings (map.html).
	mapBasemap: "gray-vector", // Light Gray Canvas (vector)
	mapFallbackCenter: [36.79037290204911, -1.2597187025957526],
	mapFallbackZoom: 12,
	mapFacilityZoom: 17,
	// Survey & Design Assets sublayers all start visible EXCEPT those whose name
	// begins with one of these prefixes (the suggested_* design outputs).
	mapHiddenLayerPrefixes: ["suggested_"],

	/* Workflow pages. `where` is the base definitionExpression; column filters are
	 * AND-ed on top. `action` sets the row-click behaviour (page.js). */
	pages: [
		{
			id: "unassigned",
			label: "Unassigned",
			action: "assign",
			// Reached the Design stage but no designer assigned yet.
			where: "implementation_status = 'Design' AND designed_by IS NULL",
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{ field: "project_reference_number", label: "Reference No.", width: 150 },
				{ field: "survey_approved_by", label: "Survey Approved By", width: 170 },
				{ field: "county", label: "County", width: 130 },
				{ field: "constituency", label: "Constituency", width: 150 },
				{ field: "ward", label: "Ward", width: 150 }
			]
		},
		{
			id: "in-progress",
			label: "In progress",
			action: "view", // open the map, no action
			// Designer assigned; design not completed or approved.
			where:
				"implementation_status = 'Design' AND designed_by IS NOT NULL AND " +
				"design_completion_date IS NULL AND design_approved_by IS NULL AND " +
				"design_approved_date IS NULL",
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{ field: "project_reference_number", label: "Reference No.", width: 150 },
				{ field: "designed_by", label: "Designed By", width: 150 },
				{ field: "county", label: "County", width: 130 },
				{ field: "constituency", label: "Constituency", width: 150 },
				{ field: "ward", label: "Ward", width: 150 }
			]
		},
		{
			id: "completed",
			label: "Completed",
			action: "approve", // open the map + Approve
			// Design completed, awaiting approval.
			where:
				"implementation_status = 'Design' AND design_completion_date IS NOT NULL AND " +
				"design_approved_date IS NULL AND design_approved_by IS NULL",
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{ field: "project_reference_number", label: "Reference No.", width: 150 },
				{ field: "designed_by", label: "Designed By", width: 150 },
				{
					field: "design_completion_date",
					label: "Design Completed",
					width: 150,
					filterable: false,
					dateFormat: "short-date"
				},
				{ field: "county", label: "County", width: 130 },
				{ field: "constituency", label: "Constituency", width: 150 },
				{ field: "ward", label: "Ward", width: 150 }
			]
		}
	],

	/* Collapsible panels shown in the map's side panel. */
	detailSections: [
		{
			title: "Project Details",
			icon: "information",
			fields: [
				{ field: "project_reference_number", label: "Reference Number" },
				{ field: "funding_year", label: "Funding Year" },
				{ field: "initiator_category", label: "Initiator Category" },
				{ field: "funding_category", label: "Funding Category" }
			]
		},
		{
			title: "Survey Details",
			icon: "compass",
			fields: [
				{ field: "surveyed_by", label: "Surveyed By" },
				{ field: "survey_completion_date", label: "Survey Completion Date" },
				{ field: "survey_approved_by", label: "Survey Approved By" },
				{ field: "survey_approved_date", label: "Survey Approved Date" }
			]
		},
		{
			title: "Design Details",
			icon: "pencil",
			fields: [
				{ field: "designed_by", label: "Designed By" },
				{ field: "design_completion_date", label: "Design Completion Date" },
				{ field: "design_approved_by", label: "Design Approved By" },
				{ field: "design_approved_date", label: "Design Approved Date" }
			]
		},
		{
			title: "Location",
			icon: "pin",
			fields: [
				{ field: "county", label: "County" },
				{ field: "constituency", label: "Constituency" },
				{ field: "ward", label: "Ward" }
			]
		}
	]
};
