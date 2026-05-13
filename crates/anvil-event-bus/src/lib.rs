mod ring_bus;

use serde::{Deserialize, Serialize};

pub use ring_bus::RingBus;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrikeEvent {
    pub session_id: String,
    pub sequence_id: u64,
    pub action: ActionType,
    pub telemetry: Telemetry,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActionType {
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
pub struct Telemetry {
    pub pressure: Option<f32>,
    pub velocity: Option<f32>,
    pub duration_ms: u32,
    pub tool_id: String,
    pub coordinates: Option<(f64, f64)>,
    pub input_entropy: f32,
}

#[derive(Debug, thiserror::Error)]
pub enum EventBusError {
    #[error("bus is full, backpressure applied")]
    Full,
    #[error("bus is closed")]
    Closed,
    #[error("no message available")]
    Empty,
}

pub trait EventBus: Send + Sync {
    fn publish(&self, event: StrikeEvent) -> Result<(), EventBusError>;
    fn subscribe(&self) -> Box<dyn EventSubscriber>;
    fn close(&self);
}

pub trait EventSubscriber: Send {
    fn recv(&self) -> Result<StrikeEvent, EventBusError>;
    fn try_recv(&self) -> Result<StrikeEvent, EventBusError>;
}
