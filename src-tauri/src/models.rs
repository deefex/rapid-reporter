use serde::{Deserialize, Serialize};

/// A single session note sent from the frontend for export/report generation.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Note {
    pub(crate) text: String,

    #[serde(rename = "type")]
    pub(crate) note_type: String,
}

/// Session payload sent by the frontend when exporting a report.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Session {
    #[serde(default)]
    pub(crate) tester_name: Option<String>,
    pub(crate) charter: String,
    pub(crate) duration_minutes: Option<i64>,
    pub(crate) started_at: i64,
    pub(crate) notes: Vec<Note>,
}

/// A selected screen region used for cropping screenshots and overlay events.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegionSelection {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: i32,
    pub(crate) height: i32,
    pub(crate) device_pixel_ratio: f64,

    // Optional for forward-compat (current TS payload does not send it)
    #[serde(default)]
    pub(crate) monitor_id: Option<i32>,
}
