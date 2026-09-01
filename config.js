/* ---------------------------------------------------------------------------
 * config.js — settings for the Mapping & Cartography Administration UI.
 *
 * The cartography workflow admin for the electrification pipeline. Three pages
 * share one engine (page.js):
 *   • Unassigned  — Cartography stage, no cartographer yet. Row → assign one.
 *   • In progress — cartographer assigned, not completed/approved. Row → map
 *                   (read-only, no action).
 *   • Completed   — cartography completed, awaiting approval. Row → map + Approve.
 *
 * The table + detail/map panels read the electrification_projects layer directly;
 * assignments/approvals are written to the base electrification_projects layer.
 * Approving advances the project to the next stage (Wayleave Acquisition).
 * The user signs in with their own portal account (oauth.js).
 * ------------------------------------------------------------------------- */

window.APP_CONFIG = {
	portalUrl: "https://development.esriea.com/portal",
	serverRestUrl: "https://development.esriea.com/server/rest/services",

	// OAuth 2.0 app id (client_id) for named-user sign-in. The signed-in user is
	// recorded as the approver (cartography_approved_by). Reuses the same
	// registered browser app as mapping-and-cartography (redirect URIs must
	// include this app's serving origin).
	oauthAppId: "Bw7pOoS2ENJjQ6uj",

	// Base Projects table — source for the tables + detail/map panels, and the
	// target for assignments/approvals. (The joined view was removed; county /
	// constituency / ward are facility fields and no longer shown here.)
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

	// The cartographer <select> in the Unassigned assign sheet is populated from
	// this field's coded-value domain (codes are portal usernames).
	designerField: "cartography_by",

	// The stage a project advances to once its cartography is approved.
	nextStatus: "Wayleave Acquisition",

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
			// Reached the Cartography stage but no cartographer assigned yet.
			where: "implementation_status = 'Cartography' AND cartography_by IS NULL",
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{
					field: "project_reference_number",
					label: "Reference No.",
					width: 150
				},
				{
					field: "survey_approved_by",
					label: "Survey Approved By",
					width: 170
				}			]
		},
		{
			id: "in-progress",
			label: "In progress",
			action: "view", // open the map, no action
			// Cartographer assigned; cartography not completed or approved.
			where:
				"implementation_status = 'Cartography' AND cartography_by IS NOT NULL AND " +
				"cartography_completion_date IS NULL AND cartography_approved_by IS NULL AND " +
				"cartography_approval_date IS NULL",
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{
					field: "project_reference_number",
					label: "Reference No.",
					width: 150
				},
				{ field: "cartography_by", label: "Cartographer", width: 150 }			]
		},
		{
			id: "completed",
			label: "Completed",
			action: "approve", // open the map + Approve
			// Cartography completed, awaiting approval.
			where:
				"implementation_status = 'Cartography' AND cartography_completion_date IS NOT NULL AND " +
				"cartography_approval_date IS NULL AND cartography_approved_by IS NULL",
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{
					field: "project_reference_number",
					label: "Reference No.",
					width: 150
				},
				{ field: "cartography_by", label: "Cartographer", width: 150 },
				{
					field: "cartography_completion_date",
					label: "Cartography Completed",
					width: 170,
					filterable: false,
					dateFormat: "short-date"
				}			]
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
			title: "Cartography Details",
			icon: "map",
			fields: [
				{ field: "cartography_by", label: "Cartographer" },
				{ field: "cartography_completion_date", label: "Cartography Completion Date" },
				{ field: "cartography_approved_by", label: "Cartography Approved By" },
				{ field: "cartography_approval_date", label: "Cartography Approved Date" }
			]
		}
	]
};
