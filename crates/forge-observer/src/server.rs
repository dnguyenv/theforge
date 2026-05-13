use std::sync::Arc;

use prost::Message;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status, Streaming};
use tracing::info;

use anvil_event_bus::{ActionType, EventBus, StrikeEvent, Telemetry};
use forge_session::SessionManager;

use crate::proto::common;
use crate::proto::observer::forge_observer_server::ForgeObserver;
use crate::proto::observer::{
    EndSessionRequest, EndSessionResponse, GetSessionRequest, PauseSessionRequest,
    PauseSessionResponse, ResumeSessionRequest, ResumeSessionResponse, StartSessionRequest,
    StartSessionResponse, StrikeAck,
};

pub struct ObserverService {
    session_manager: Arc<SessionManager>,
    event_bus: Arc<dyn EventBus>,
}

impl ObserverService {
    pub fn new(session_manager: Arc<SessionManager>, event_bus: Arc<dyn EventBus>) -> Self {
        Self {
            session_manager,
            event_bus,
        }
    }
}

#[tonic::async_trait]
impl ForgeObserver for ObserverService {
    type StreamStrikesStream = ReceiverStream<Result<StrikeAck, Status>>;

    async fn stream_strikes(
        &self,
        request: Request<Streaming<common::StrikeEvent>>,
    ) -> Result<Response<Self::StreamStrikesStream>, Status> {
        let mut stream = request.into_inner();
        let (tx, rx) = tokio::sync::mpsc::channel(128);
        let session_mgr = self.session_manager.clone();
        let bus = self.event_bus.clone();

        tokio::spawn(async move {
            while let Ok(Some(proto_event)) = stream.message().await {
                let result = process_strike(&session_mgr, bus.as_ref(), &proto_event);
                let ack = match result {
                    Ok(hash) => StrikeAck {
                        sequence_id: proto_event.sequence_id,
                        delta_hash: hash.to_vec(),
                        accepted: true,
                    },
                    Err(_) => StrikeAck {
                        sequence_id: proto_event.sequence_id,
                        delta_hash: Vec::new(),
                        accepted: false,
                    },
                };
                if tx.send(Ok(ack)).await.is_err() {
                    break;
                }
            }
        });

        Ok(Response::new(ReceiverStream::new(rx)))
    }

    async fn record_strike(
        &self,
        request: Request<common::StrikeEvent>,
    ) -> Result<Response<StrikeAck>, Status> {
        let proto_event = request.into_inner();
        let hash = process_strike(&self.session_manager, self.event_bus.as_ref(), &proto_event)
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(StrikeAck {
            sequence_id: proto_event.sequence_id,
            delta_hash: hash.to_vec(),
            accepted: true,
        }))
    }

    async fn start_session(
        &self,
        request: Request<StartSessionRequest>,
    ) -> Result<Response<StartSessionResponse>, Status> {
        let req = request.into_inner();
        let info = self
            .session_manager
            .start_session(&req.chain_code)
            .map_err(|e| Status::internal(e.to_string()))?;

        info!(session_id = %info.session_id, "session started");

        Ok(Response::new(StartSessionResponse {
            session_id: info.session_id,
            started_at: info.started_at,
        }))
    }

    async fn end_session(
        &self,
        request: Request<EndSessionRequest>,
    ) -> Result<Response<EndSessionResponse>, Status> {
        let req = request.into_inner();
        let info = self
            .session_manager
            .get_info(&req.session_id)
            .map_err(|e| Status::not_found(e.to_string()))?;

        let root = self
            .session_manager
            .close(&req.session_id)
            .map_err(|e| Status::internal(e.to_string()))?;

        info!(session_id = %req.session_id, "session ended");

        Ok(Response::new(EndSessionResponse {
            session_id: req.session_id,
            merkle_root: root.map(|r| r.to_vec()).unwrap_or_default(),
            strike_count: info.strike_count,
            purity_grade: 0,
        }))
    }

    async fn pause_session(
        &self,
        request: Request<PauseSessionRequest>,
    ) -> Result<Response<PauseSessionResponse>, Status> {
        let req = request.into_inner();
        self.session_manager
            .pause(&req.session_id)
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(PauseSessionResponse { success: true }))
    }

    async fn resume_session(
        &self,
        request: Request<ResumeSessionRequest>,
    ) -> Result<Response<ResumeSessionResponse>, Status> {
        let req = request.into_inner();
        self.session_manager
            .resume(&req.session_id)
            .map_err(|e| Status::internal(e.to_string()))?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Ok(Response::new(ResumeSessionResponse {
            success: true,
            resumed_at: now,
        }))
    }

    async fn get_session(
        &self,
        request: Request<GetSessionRequest>,
    ) -> Result<Response<common::SessionInfo>, Status> {
        let req = request.into_inner();
        let info = self
            .session_manager
            .get_info(&req.session_id)
            .map_err(|e| Status::not_found(e.to_string()))?;

        let state = match info.state {
            forge_session::SessionState::Active => common::SessionState::Active as i32,
            forge_session::SessionState::Paused => common::SessionState::Paused as i32,
            forge_session::SessionState::Closing => common::SessionState::Closing as i32,
            forge_session::SessionState::Closed => common::SessionState::Closed as i32,
        };

        Ok(Response::new(common::SessionInfo {
            session_id: info.session_id,
            chain_code: info.chain_code,
            started_at: info.started_at,
            strike_count: info.strike_count,
            state,
        }))
    }
}

fn process_strike(
    session_mgr: &SessionManager,
    bus: &dyn EventBus,
    proto_event: &common::StrikeEvent,
) -> Result<[u8; 32], Box<dyn std::error::Error + Send + Sync>> {
    let data = proto_event.encode_to_vec();
    let receipt = session_mgr.record_strike(
        &proto_event.session_id,
        proto_event.sequence_id,
        proto_event.timestamp_ms,
        &data,
    )?;

    let telemetry = proto_event.telemetry.as_ref();
    let event = StrikeEvent {
        session_id: proto_event.session_id.clone(),
        sequence_id: proto_event.sequence_id,
        action: map_action(proto_event.action()),
        telemetry: Telemetry {
            pressure: telemetry.and_then(|t| t.pressure),
            velocity: telemetry.and_then(|t| t.velocity),
            duration_ms: telemetry.map(|t| t.duration_ms).unwrap_or(0),
            tool_id: telemetry.map(|t| t.tool_id.clone()).unwrap_or_default(),
            coordinates: telemetry
                .and_then(|t| t.coordinates.as_ref())
                .map(|c| (c.x, c.y)),
            input_entropy: telemetry.map(|t| t.input_entropy).unwrap_or(0.0),
        },
        timestamp_ms: proto_event.timestamp_ms,
    };

    let _ = bus.publish(event);
    Ok(receipt.delta_hash)
}

fn map_action(action: common::ActionType) -> ActionType {
    match action {
        common::ActionType::BrushStroke => ActionType::BrushStroke,
        common::ActionType::VertexMove => ActionType::VertexMove,
        common::ActionType::CodeEdit => ActionType::CodeEdit,
        common::ActionType::LayerOperation => ActionType::LayerOperation,
        common::ActionType::Transform => ActionType::Transform,
        common::ActionType::Selection => ActionType::Selection,
        common::ActionType::ToolChange => ActionType::ToolChange,
        common::ActionType::UndoRedo => ActionType::UndoRedo,
        _ => ActionType::BrushStroke,
    }
}
