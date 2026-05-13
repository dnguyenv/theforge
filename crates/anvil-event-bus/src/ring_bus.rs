use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::{EventBus, EventBusError, EventSubscriber, StrikeEvent};

pub struct RingBus {
    sender: Sender<StrikeEvent>,
    receiver: Receiver<StrikeEvent>,
    closed: Arc<AtomicBool>,
}

impl RingBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, receiver) = bounded(capacity);
        Self {
            sender,
            receiver,
            closed: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn len(&self) -> usize {
        self.sender.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sender.is_empty()
    }

    pub fn capacity(&self) -> usize {
        self.sender.capacity().unwrap_or(0)
    }
}

impl EventBus for RingBus {
    fn publish(&self, event: StrikeEvent) -> Result<(), EventBusError> {
        if self.closed.load(Ordering::Relaxed) {
            return Err(EventBusError::Closed);
        }
        match self.sender.try_send(event) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(_)) => Err(EventBusError::Full),
            Err(TrySendError::Disconnected(_)) => Err(EventBusError::Closed),
        }
    }

    fn subscribe(&self) -> Box<dyn EventSubscriber> {
        Box::new(RingSubscriber {
            receiver: self.receiver.clone(),
            closed: self.closed.clone(),
        })
    }

    fn close(&self) {
        self.closed.store(true, Ordering::Relaxed);
    }
}

struct RingSubscriber {
    receiver: Receiver<StrikeEvent>,
    closed: Arc<AtomicBool>,
}

impl EventSubscriber for RingSubscriber {
    fn recv(&self) -> Result<StrikeEvent, EventBusError> {
        match self.receiver.recv() {
            Ok(event) => Ok(event),
            Err(_) => {
                if self.closed.load(Ordering::Relaxed) {
                    Err(EventBusError::Closed)
                } else {
                    Err(EventBusError::Empty)
                }
            }
        }
    }

    fn try_recv(&self) -> Result<StrikeEvent, EventBusError> {
        match self.receiver.try_recv() {
            Ok(event) => Ok(event),
            Err(crossbeam_channel::TryRecvError::Empty) => Err(EventBusError::Empty),
            Err(crossbeam_channel::TryRecvError::Disconnected) => Err(EventBusError::Closed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ActionType, Telemetry};

    fn make_event(seq: u64) -> StrikeEvent {
        StrikeEvent {
            session_id: "test-session".into(),
            sequence_id: seq,
            action: ActionType::BrushStroke,
            telemetry: Telemetry {
                pressure: Some(0.5),
                velocity: Some(100.0),
                duration_ms: 16,
                tool_id: "brush-1".into(),
                coordinates: Some((10.0, 20.0)),
                input_entropy: 0.8,
            },
            timestamp_ms: 1000 + seq,
        }
    }

    #[test]
    fn publish_and_receive() {
        let bus = RingBus::new(16);
        let sub = bus.subscribe();

        bus.publish(make_event(1)).unwrap();
        bus.publish(make_event(2)).unwrap();

        let e1 = sub.try_recv().unwrap();
        let e2 = sub.try_recv().unwrap();

        assert_eq!(e1.sequence_id, 1);
        assert_eq!(e2.sequence_id, 2);
    }

    #[test]
    fn backpressure_when_full() {
        let bus = RingBus::new(2);
        bus.publish(make_event(1)).unwrap();
        bus.publish(make_event(2)).unwrap();

        let result = bus.publish(make_event(3));
        assert!(matches!(result, Err(EventBusError::Full)));
    }

    #[test]
    fn close_prevents_publish() {
        let bus = RingBus::new(16);
        bus.close();

        let result = bus.publish(make_event(1));
        assert!(matches!(result, Err(EventBusError::Closed)));
    }

    #[test]
    fn try_recv_empty() {
        let bus = RingBus::new(16);
        let sub = bus.subscribe();

        let result = sub.try_recv();
        assert!(matches!(result, Err(EventBusError::Empty)));
    }

    #[test]
    fn multiple_subscribers_share_events() {
        let bus = RingBus::new(16);
        let sub1 = bus.subscribe();
        let sub2 = bus.subscribe();

        bus.publish(make_event(1)).unwrap();

        // crossbeam bounded channel: only one receiver gets the message
        let got1 = sub1.try_recv();
        let got2 = sub2.try_recv();

        // One should succeed, one should be empty
        assert!(got1.is_ok() || got2.is_ok());
    }

    #[test]
    fn capacity_and_len() {
        let bus = RingBus::new(64);
        assert_eq!(bus.capacity(), 64);
        assert!(bus.is_empty());

        bus.publish(make_event(1)).unwrap();
        assert_eq!(bus.len(), 1);
        assert!(!bus.is_empty());
    }

    #[test]
    fn high_throughput_sequential() {
        let bus = RingBus::new(1024);
        let sub = bus.subscribe();

        for i in 0..1000 {
            bus.publish(make_event(i)).unwrap();
        }

        for i in 0..1000 {
            let event = sub.try_recv().unwrap();
            assert_eq!(event.sequence_id, i);
        }
    }
}
