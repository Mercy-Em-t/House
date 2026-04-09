use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    Router,
    extract::{
        Query, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::{RwLock, mpsc};
use tracing::{error, info};
use uuid::Uuid;

const PROTOCOL_VERSION: &str = "house-protocol-v1";

#[derive(Clone)]
struct AppState {
    world: Arc<WorldState>,
    bridge_key: String,
}

struct WorldState {
    avatars: RwLock<HashMap<String, Avatar>>,
    intents: RwLock<HashMap<String, Intent>>,
    clients: RwLock<HashMap<Uuid, mpsc::UnboundedSender<Message>>>,
    client_users: RwLock<HashMap<Uuid, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Avatar {
    id: String,
    #[serde(rename = "userId")]
    user_id: String,
    username: String,
    #[serde(rename = "avatarColor")]
    avatar_color: String,
    x: f64,
    y: f64,
    z: f64,
    #[serde(rename = "roomId")]
    room_id: Option<String>,
    state: String,
    #[serde(rename = "isAI")]
    is_ai: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Intent {
    mode: String,
    active: bool,
    direction: Option<Vector2>,
    speed: Option<f64>,
    target: Option<Vector2>,
    sequence: Option<u64>,
    #[serde(rename = "clientTime")]
    client_time: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Vector2 {
    x: f64,
    y: f64,
}

#[derive(Debug, Deserialize)]
struct WsEnvelope {
    event: String,
    #[serde(default)]
    data: Value,
}

#[derive(Debug, Deserialize)]
struct ConnectQuery {
    #[serde(rename = "userId")]
    user_id: Option<String>,
    username: Option<String>,
    #[serde(rename = "avatarColor")]
    avatar_color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SpawnAgentRequest {
    #[serde(rename = "userId")]
    user_id: String,
    username: String,
    #[serde(rename = "avatarColor")]
    avatar_color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DespawnAgentRequest {
    #[serde(rename = "userId")]
    user_id: String,
}

#[derive(Debug, Deserialize)]
struct BridgeCommandRequest {
    #[serde(rename = "userId")]
    user_id: String,
    command: Value,
}

#[derive(Debug, Deserialize)]
struct BridgeMessageRequest {
    #[serde(rename = "userId")]
    user_id: String,
    content: String,
    #[serde(default = "default_room_type")]
    r#type: String,
}

fn default_room_type() -> String {
    "room".to_string()
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "realtime_rs=info,axum=info,tower_http=info".to_string()),
        )
        .init();

    let tick_rate = std::env::var("REALTIME_TICK_RATE")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|v| *v >= 1 && *v <= 120)
        .unwrap_or(20);
    let tick_ms = std::cmp::max(1, 1000 / tick_rate);
    let bridge_key =
        std::env::var("REALTIME_BRIDGE_KEY").unwrap_or_else(|_| "house-bridge-dev-key".to_string());

    let state = AppState {
        world: Arc::new(WorldState {
            avatars: RwLock::new(HashMap::new()),
            intents: RwLock::new(HashMap::new()),
            clients: RwLock::new(HashMap::new()),
            client_users: RwLock::new(HashMap::new()),
        }),
        bridge_key,
    };

    start_tick_loop(state.clone(), tick_ms);

    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws_upgrade))
        .route("/bridge/spawn-agent", post(bridge_spawn_agent))
        .route("/bridge/despawn-agent", post(bridge_despawn_agent))
        .route("/bridge/command", post(bridge_command))
        .route("/bridge/message", post(bridge_message))
        .with_state(state);

    let port = std::env::var("REALTIME_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(4100);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind realtime listener");
    info!("realtime-rs listening on {}", addr);
    axum::serve(listener, app).await.expect("server failed");
}

async fn health() -> impl IntoResponse {
    axum::Json(json!({
        "status": "ok",
        "mode": "rust",
        "protocolVersion": PROTOCOL_VERSION
    }))
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    Query(query): Query<ConnectQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state, query))
}

async fn handle_ws(socket: WebSocket, state: AppState, query: ConnectQuery) {
    let client_id = Uuid::new_v4();
    let user_id = query
        .user_id
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| format!("guest-{}", client_id));
    let username = query.username.unwrap_or_else(|| user_id.clone());
    let avatar_color = query.avatar_color.unwrap_or_else(|| "#3498db".to_string());

    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    state.world.clients.write().await.insert(client_id, tx);
    state
        .world
        .client_users
        .write()
        .await
        .insert(client_id, user_id.clone());

    let avatar = {
        let mut avatars = state.world.avatars.write().await;
        let avatar = avatars.entry(user_id.clone()).or_insert_with(|| Avatar {
            id: user_id.clone(),
            user_id: user_id.clone(),
            username: username.clone(),
            avatar_color: avatar_color.clone(),
            x: 600.0,
            y: 100.0,
            z: 0.0,
            room_id: Some("lobby".to_string()),
            state: "idle".to_string(),
            is_ai: false,
        });
        avatar.clone()
    };

    send_to_client(
        &state,
        client_id,
        Message::Text(
            json!({
                "event": "world:init",
                "data": {
                    "world": default_world_json(),
                    "avatars": state.world.avatars.read().await.values().cloned().collect::<Vec<_>>(),
                    "myUserId": user_id
                }
            })
            .to_string()
            .into(),
        ),
    )
    .await;
    emit_event(&state, "avatar:joined", json!(avatar)).await;

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_rx.next().await {
        if let Message::Text(text) = msg {
            match serde_json::from_str::<WsEnvelope>(&text) {
                Ok(envelope) => handle_event(&state, client_id, envelope).await,
                Err(err) => {
                    error!("invalid ws event payload: {}", err);
                }
            }
        }
    }

    state.world.clients.write().await.remove(&client_id);
    let disconnected_user_id = state.world.client_users.write().await.remove(&client_id);
    if let Some(uid) = disconnected_user_id {
        state.world.intents.write().await.remove(&uid);
        state.world.avatars.write().await.remove(&uid);
        emit_event(&state, "avatar:left", json!({ "userId": uid })).await;
    }
    let _ = send_task.await;
}

async fn handle_event(state: &AppState, client_id: Uuid, envelope: WsEnvelope) {
    let session_user_id = state.world.client_users.read().await.get(&client_id).cloned();
    match envelope.event.as_str() {
        "avatar:intent" => {
            if let (Some(user_id), Ok(intent)) = (
                envelope
                    .data
                    .get("userId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                serde_json::from_value::<Intent>(envelope.data.clone()),
            ) {
                state.world.intents.write().await.insert(user_id, intent);
            } else if let (Some(user_id), Ok(intent)) =
                (session_user_id, serde_json::from_value::<Intent>(envelope.data.clone()))
            {
                state.world.intents.write().await.insert(user_id, intent);
            }
        }
        "avatar:idle" => {
            let user_id = envelope
                .data
                .get("userId")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string())
                .or(session_user_id);
            if let Some(user_id) = user_id {
                state.world.intents.write().await.remove(&user_id);
                if let Some(avatar) = state.world.avatars.write().await.get_mut(&user_id) {
                    avatar.state = "idle".to_string();
                }
            }
        }
        "chat:send" => {
            let user_id = session_user_id.unwrap_or_else(|| "unknown".to_string());
            let sender_name = state
                .world
                .avatars
                .read()
                .await
                .get(&user_id)
                .map(|a| a.username.clone())
                .unwrap_or_else(|| user_id.clone());
            let content = envelope
                .data
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if !content.is_empty() {
                let message = json!({
                    "id": Uuid::new_v4().to_string(),
                    "type": envelope.data.get("type").and_then(|v| v.as_str()).unwrap_or("room"),
                    "senderId": user_id,
                    "senderName": sender_name,
                    "content": content,
                    "timestamp": chrono_like_iso()
                });
                emit_event(state, "chat:message", message).await;
            }
        }
        _ => {}
    }
}

fn start_tick_loop(state: AppState, tick_ms: u64) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(tick_ms));
        loop {
            interval.tick().await;
            apply_intents(&state, tick_ms as f64 / 1000.0).await;
            broadcast_snapshot(&state).await;
        }
    });
}

async fn apply_intents(state: &AppState, dt: f64) {
    let intents = state.world.intents.read().await.clone();
    let mut avatars = state.world.avatars.write().await;

    for (user_id, intent) in intents {
        if !intent.active {
            continue;
        }
        let speed = intent.speed.unwrap_or(220.0).clamp(0.0, 380.0);
        let avatar = avatars.entry(user_id.clone()).or_insert_with(|| Avatar {
            id: user_id.clone(),
            user_id: user_id.clone(),
            username: user_id.clone(),
            avatar_color: "#3498db".to_string(),
            x: 600.0,
            y: 100.0,
            z: 0.0,
            room_id: Some("lobby".to_string()),
            state: "idle".to_string(),
            is_ai: false,
        });

        if let Some(direction) = intent.direction {
            avatar.x = (avatar.x + direction.x * speed * dt).clamp(0.0, 1200.0);
            avatar.y = (avatar.y + direction.y * speed * dt).clamp(0.0, 800.0);
            avatar.state = "moving".to_string();
        }
    }
}

async fn broadcast_snapshot(state: &AppState) {
    let avatars = state.world.avatars.read().await.values().cloned().collect::<Vec<_>>();
    let payload = json!({
        "event": "world:snapshot",
        "data": {
            "serverTime": chrono_like_now_ms(),
            "avatars": avatars
        }
    })
    .to_string();
    broadcast(state, Message::Text(payload.into())).await;
}

async fn bridge_spawn_agent(
    headers: HeaderMap,
    State(state): State<AppState>,
    axum::Json(req): axum::Json<SpawnAgentRequest>,
) -> impl IntoResponse {
    if !bridge_allowed(&headers, &state.bridge_key) {
        return (StatusCode::UNAUTHORIZED, axum::Json(json!({ "error": "Invalid bridge key" })));
    }

    let avatar = Avatar {
        id: req.user_id.clone(),
        user_id: req.user_id.clone(),
        username: req.username,
        avatar_color: req.avatar_color.unwrap_or_else(|| "#9b59b6".to_string()),
        x: 600.0,
        y: 100.0,
        z: 0.0,
        room_id: Some("lobby".to_string()),
        state: "idle".to_string(),
        is_ai: true,
    };

    state
        .world
        .avatars
        .write()
        .await
        .insert(req.user_id.clone(), avatar.clone());
    emit_event(&state, "avatar:joined", json!(avatar)).await;
    (StatusCode::CREATED, axum::Json(json!({ "avatar": avatar })))
}

async fn bridge_despawn_agent(
    headers: HeaderMap,
    State(state): State<AppState>,
    axum::Json(req): axum::Json<DespawnAgentRequest>,
) -> impl IntoResponse {
    if !bridge_allowed(&headers, &state.bridge_key) {
        return (StatusCode::UNAUTHORIZED, axum::Json(json!({ "error": "Invalid bridge key" })));
    }

    state.world.avatars.write().await.remove(&req.user_id);
    emit_event(&state, "avatar:left", json!({ "userId": req.user_id })).await;
    (StatusCode::OK, axum::Json(json!({ "success": true })))
}

async fn bridge_command(
    headers: HeaderMap,
    State(state): State<AppState>,
    axum::Json(req): axum::Json<BridgeCommandRequest>,
) -> impl IntoResponse {
    if !bridge_allowed(&headers, &state.bridge_key) {
        return (StatusCode::UNAUTHORIZED, axum::Json(json!({ "error": "Invalid bridge key" })));
    }

    let mut avatars = state.world.avatars.write().await;
    let Some(avatar) = avatars.get_mut(&req.user_id) else {
        return (StatusCode::NOT_FOUND, axum::Json(json!({ "error": "Avatar not found" })));
    };

    if let Some(command_type) = req.command.get("type").and_then(|v| v.as_str()) {
        match command_type {
            "MOVE" => {
                if let Some(payload) = req.command.get("payload") {
                    if let Some(x) = payload.get("x").and_then(|v| v.as_f64()) {
                        avatar.x = x.clamp(0.0, 1200.0);
                    }
                    if let Some(y) = payload.get("y").and_then(|v| v.as_f64()) {
                        avatar.y = y.clamp(0.0, 800.0);
                    }
                    avatar.state = "moving".to_string();
                }
            }
            "SET_STATE" => {
                if let Some(state_name) = req
                    .command
                    .get("payload")
                    .and_then(|v| v.get("state"))
                    .and_then(|v| v.as_str())
                {
                    avatar.state = state_name.to_string();
                }
            }
            "TELEPORT" => {
                avatar.x = 600.0;
                avatar.y = 100.0;
                avatar.room_id = req
                    .command
                    .get("payload")
                    .and_then(|v| v.get("roomId"))
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string());
            }
            _ => {}
        }
    }

    let updated = avatar.clone();
    drop(avatars);
    emit_event(&state, "avatar:update", json!(updated.clone())).await;
    (StatusCode::OK, axum::Json(json!({ "avatar": updated })))
}

async fn bridge_message(
    headers: HeaderMap,
    State(state): State<AppState>,
    axum::Json(req): axum::Json<BridgeMessageRequest>,
) -> impl IntoResponse {
    if !bridge_allowed(&headers, &state.bridge_key) {
        return (StatusCode::UNAUTHORIZED, axum::Json(json!({ "error": "Invalid bridge key" })));
    }

    let message = json!({
        "id": Uuid::new_v4().to_string(),
        "type": req.r#type,
        "senderId": req.user_id,
        "senderName": "AI",
        "content": req.content,
        "timestamp": chrono_like_iso()
    });
    emit_event(&state, "chat:message", message.clone()).await;
    (StatusCode::OK, axum::Json(json!({ "message": message })))
}

fn bridge_allowed(headers: &HeaderMap, expected: &str) -> bool {
    headers
        .get("x-bridge-key")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v == expected)
}

async fn emit_event(state: &AppState, event: &str, data: Value) {
    let payload = json!({ "event": event, "data": data }).to_string();
    broadcast(state, Message::Text(payload.into())).await;
}

async fn broadcast(state: &AppState, message: Message) {
    let clients = state.world.clients.read().await;
    for sender in clients.values() {
        let _ = sender.send(message.clone());
    }
}

async fn send_to_client(state: &AppState, client_id: Uuid, message: Message) {
    let clients = state.world.clients.read().await;
    if let Some(sender) = clients.get(&client_id) {
        let _ = sender.send(message);
    }
}

fn default_world_json() -> Value {
    json!({
      "bounds": { "width": 1200, "height": 800 },
      "rooms": [
        { "id": "lobby", "name": "Main Lobby", "type": "lobby", "bounds": { "x": 0, "y": 0, "width": 1200, "height": 200 }, "spawnPoint": { "x": 600, "y": 100, "z": 0 }, "maxCapacity": 100, "color": "#e8f4f8", "aiEnabled": false },
        { "id": "open-office", "name": "Open Office", "type": "office", "bounds": { "x": 0, "y": 200, "width": 600, "height": 300 }, "spawnPoint": { "x": 300, "y": 350, "z": 0 }, "maxCapacity": 30, "color": "#f0f7e6", "aiEnabled": true },
        { "id": "meeting-room-a", "name": "Meeting Room A", "type": "meeting", "bounds": { "x": 600, "y": 200, "width": 300, "height": 300 }, "spawnPoint": { "x": 750, "y": 350, "z": 0 }, "maxCapacity": 10, "color": "#fff3e0", "aiEnabled": true },
        { "id": "meeting-room-b", "name": "Meeting Room B", "type": "meeting", "bounds": { "x": 900, "y": 200, "width": 300, "height": 300 }, "spawnPoint": { "x": 1050, "y": 350, "z": 0 }, "maxCapacity": 10, "color": "#fce4ec", "aiEnabled": true },
        { "id": "lounge", "name": "Lounge", "type": "lounge", "bounds": { "x": 0, "y": 500, "width": 400, "height": 300 }, "spawnPoint": { "x": 200, "y": 650, "z": 0 }, "maxCapacity": 20, "color": "#f3e5f5", "aiEnabled": false },
        { "id": "ai-hub", "name": "AI Hub", "type": "ai-hub", "bounds": { "x": 400, "y": 500, "width": 800, "height": 300 }, "spawnPoint": { "x": 800, "y": 650, "z": 0 }, "maxCapacity": 50, "color": "#e3f2fd", "aiEnabled": true }
      ]
    })
}

fn chrono_like_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn chrono_like_iso() -> String {
    format!("{}", chrono_like_now_ms())
}
