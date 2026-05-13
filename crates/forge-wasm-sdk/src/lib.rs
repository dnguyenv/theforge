use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginStrikeEvent {
    pub action: StrikeAction,
    pub pressure: Option<f32>,
    pub velocity: Option<f32>,
    pub duration_ms: u32,
    pub tool_id: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub metadata: Vec<(String, String)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrikeAction {
    BrushStroke,
    VertexMove,
    CodeEdit,
    LayerOperation,
    Transform,
    Selection,
    ToolChange,
    UndoRedo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrikeAck {
    pub sequence_id: u64,
    pub delta_hash: Vec<u8>,
    pub accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionHandle {
    pub session_id: String,
}

pub trait ForgePlugin {
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    fn on_init(&mut self, session: &SessionHandle);
    fn on_shutdown(&mut self);
}

pub trait ForgeHost {
    fn emit_strike(&self, event: PluginStrikeEvent) -> Result<StrikeAck, PluginError>;
    fn get_session_id(&self) -> Result<String, PluginError>;
    fn log(&self, level: LogLevel, message: &str);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("host communication failed: {0}")]
    HostError(String),
    #[error("session not active")]
    NoSession,
    #[error("serialization error: {0}")]
    Serialization(String),
}

pub fn encode_strike(event: &PluginStrikeEvent) -> Result<Vec<u8>, PluginError> {
    serde_json::to_vec(event).map_err(|e| PluginError::Serialization(e.to_string()))
}

pub fn decode_ack(bytes: &[u8]) -> Result<StrikeAck, PluginError> {
    serde_json::from_slice(bytes).map_err(|e| PluginError::Serialization(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_strike_event() {
        let event = PluginStrikeEvent {
            action: StrikeAction::BrushStroke,
            pressure: Some(0.7),
            velocity: Some(150.0),
            duration_ms: 32,
            tool_id: "round-brush-5".into(),
            x: Some(100.5),
            y: Some(200.3),
            metadata: vec![("layer".into(), "foreground".into())],
        };

        let bytes = encode_strike(&event).unwrap();
        let decoded: PluginStrikeEvent = serde_json::from_slice(&bytes).unwrap();

        assert_eq!(decoded.action, StrikeAction::BrushStroke);
        assert_eq!(decoded.tool_id, "round-brush-5");
        assert_eq!(decoded.pressure, Some(0.7));
    }

    #[test]
    fn roundtrip_ack() {
        let ack = StrikeAck {
            sequence_id: 42,
            delta_hash: vec![0xAB; 32],
            accepted: true,
        };

        let bytes = serde_json::to_vec(&ack).unwrap();
        let decoded = decode_ack(&bytes).unwrap();

        assert_eq!(decoded.sequence_id, 42);
        assert!(decoded.accepted);
        assert_eq!(decoded.delta_hash.len(), 32);
    }

    #[test]
    fn all_actions_serializable() {
        let actions = [
            StrikeAction::BrushStroke,
            StrikeAction::VertexMove,
            StrikeAction::CodeEdit,
            StrikeAction::LayerOperation,
            StrikeAction::Transform,
            StrikeAction::Selection,
            StrikeAction::ToolChange,
            StrikeAction::UndoRedo,
        ];

        for action in &actions {
            let event = PluginStrikeEvent {
                action: *action,
                pressure: None,
                velocity: None,
                duration_ms: 0,
                tool_id: String::new(),
                x: None,
                y: None,
                metadata: vec![],
            };
            let bytes = encode_strike(&event).unwrap();
            assert!(!bytes.is_empty());
        }
    }
}
