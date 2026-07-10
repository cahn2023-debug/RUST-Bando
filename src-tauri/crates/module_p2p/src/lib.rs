use libp2p::{
    gossipsub, identify, mdns, noise,
    swarm::{NetworkBehaviour, SwarmEvent},
    tcp, yamux, Swarm,
};
use serde::{Serialize, Deserialize};
use std::time::Duration;
use tokio::sync::mpsc;
use anyhow::Result;
use futures::StreamExt;

#[derive(NetworkBehaviour)]
pub struct AntigravityBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub mdns: mdns::tokio::Behaviour,
    pub identify: identify::Behaviour,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum SyncMessage {
    LogHead {
        peer_id: String,
        last_seq: i64,
    },
    RequestEvents {
        from_seq: i64,
    },
    EventBatch {
        events: Vec<serde_json::Value>, // Generic JSON for events
    },
}

pub struct P2PService {
    swarm: Swarm<AntigravityBehaviour>,
    topic: gossipsub::IdentTopic,
}

impl P2PService {
    pub async fn new() -> Result<Self> {
        let topic = gossipsub::IdentTopic::new("antigravity-sync");

        let mut swarm = libp2p::SwarmBuilder::with_new_identity()
            .with_tokio()
            .with_tcp(
                tcp::Config::default(),
                noise::Config::new,
                yamux::Config::default,
            )?
            .with_behaviour(|key| {
                let gossipsub_config = gossipsub::ConfigBuilder::default()
                    .heartbeat_interval(Duration::from_secs(1))
                    .validation_mode(gossipsub::ValidationMode::Strict)
                    .build()
                    .map_err(|e| anyhow::anyhow!("Gossipsub config error: {}", e))?;

                let mut gossipsub = gossipsub::Behaviour::new(
                    gossipsub::MessageAuthenticity::Signed(key.clone()),
                    gossipsub_config,
                )?;

                // Subscribe to sync topic
                gossipsub.subscribe(&topic)?;

                Ok(AntigravityBehaviour {
                    gossipsub,
                    mdns: mdns::tokio::Behaviour::new(mdns::Config::default(), key.public().to_peer_id())?,
                    identify: identify::Behaviour::new(identify::Config::new(
                        "/antigravity/1.0.0".into(),
                        key.public(),
                    )),
                })
            })?
            .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(60)))
            .build();

        // Listen on all interfaces
        swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;

        Ok(Self { swarm, topic })
    }

    pub async fn broadcast_head(&mut self, last_seq: i64) -> Result<()> {
        let msg = SyncMessage::LogHead {
            peer_id: self.swarm.local_peer_id().to_string(),
            last_seq,
        };
        let data = serde_json::to_vec(&msg)?;
        self.swarm.behaviour_mut().gossipsub.publish(self.topic.clone(), data)?;
        Ok(())
    }

    pub async fn run(mut self, mut event_rx: mpsc::Receiver<i64>) -> Result<()> {
        loop {
            tokio::select! {
                // Listen for local events to broadcast
                Some(last_seq) = event_rx.recv() => {
                    let _ = self.broadcast_head(last_seq).await;
                }
                
                event = self.swarm.select_next_some() => match event {
                    SwarmEvent::NewListenAddr { address, .. } => {
                        log::info!("Local node is listening on {:?}", address);
                    }
                    SwarmEvent::Behaviour(AntigravityBehaviourEvent::Mdns(mdns::Event::Discovered(list))) => {
                        for (peer_id, multiaddr) in list {
                            log::info!("mDNS discovered a new peer: {:?}", peer_id);
                            let _ = self.swarm.dial(multiaddr);
                        }
                    }
                    SwarmEvent::Behaviour(AntigravityBehaviourEvent::Gossipsub(gossipsub::Event::Message {
                        propagation_source: peer_id,
                        message,
                        ..
                    })) => {
                        if let Ok(sync_msg) = serde_json::from_slice::<SyncMessage>(&message.data) {
                            match sync_msg {
                                SyncMessage::LogHead { last_seq, .. } => {
                                    log::info!("Peer {} is at seq {}", peer_id, last_seq);
                                    // TODO: Emit event to trigger comparison and potential Pull
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

