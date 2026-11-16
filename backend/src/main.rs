use std::{env, net::SocketAddr, sync::Arc};
use axum::{
    extract::{Query, State},
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use moviebox_tui::{
    providers::{ProviderKind, ReleaseProvider},
    service::MovieBoxService,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::{info, warn};

#[derive(Clone)]
struct AppState {
    service: Arc<MovieBoxService>,
    stream_access_token: Option<String>,
}

#[derive(Deserialize)]
struct SearchQuery {
    query: String,
    provider: Option<String>,
    page: Option<usize>,
}

#[derive(Deserialize)]
struct ItemQuery {
    id: String,
    provider: Option<String>,
}

#[derive(Deserialize)]
struct StreamQuery {
    id: String,
    provider: Option<String>,
    season: Option<usize>,
    episode: Option<usize>,
    token: Option<String>,
}

#[derive(Debug)]
struct ApiError(StatusCode, &'static str, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": { "code": self.1, "message": self.2 }}))).into_response()
    }
}

type ApiResult = Result<Json<Value>, ApiError>;

fn bad_request(msg: impl Into<String>) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, "bad_request", msg.into())
}

fn provider_from(value: Option<&str>) -> Result<ProviderKind, ApiError> {
    let name = value.unwrap_or("moviebox");
    ProviderKind::parse(name).ok_or_else(|| bad_request("Unknown provider. See GET /api/providers."))
}

fn validate_id(id: &str) -> Result<(), ApiError> {
    if id.is_empty() || id.len() > 256 || id.chars().any(|c| c.is_control()) {
        return Err(bad_request("id must contain 1-256 printable characters"));
    }
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "name": "moviebox-web-api",
        "upstream": "mesamirh/MovieBox-Tui",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn providers(State(state): State<AppState>) -> Json<Value> {
    let names = ["moviebox", "fourkhdhub", "dramachi", "bdix_circleftp", "bdix_dhakaflix"];
    let providers: Vec<Value> = names
        .into_iter()
        .filter_map(|name| ProviderKind::parse(name))
        .map(|kind| json!({
            "id": kind.cache_key(),
            "name": kind.label(),
            "capabilities": state.service.capabilities(kind)
        }))
        .collect();
    Json(json!({"providers": providers}))
}

async fn search(
    State(state): State<AppState>,
    Query(q): Query<SearchQuery>,
) -> ApiResult {
    let query = q.query.trim();
    if query.chars().count() < 2 || query.chars().count() > 100 {
        return Err(bad_request("query must be 2-100 characters"));
    }
    let page = q.page.unwrap_or(1);
    if !(1..=100).contains(&page) {
        return Err(bad_request("page must be between 1 and 100"));
    }
    let provider = provider_from(q.provider.as_deref())?;
    let items = state.service.search_typed(provider, query, page)
        .await.map_err(|e| {
            warn!(provider = provider.cache_key(), "search provider error: {e}");
            ApiError(StatusCode::BAD_GATEWAY, "provider_error", e.to_string())
        })?;
    Ok(Json(json!({
        "query": query,
        "page": page,
        "provider": provider.cache_key(),
        "items": items
    })))
}

async fn details(
    State(state): State<AppState>,
    Query(q): Query<ItemQuery>,
) -> ApiResult {
    validate_id(&q.id)?;
    let provider = provider_from(q.provider.as_deref())?;
    let item = state.service.details_typed(provider, &q.id)
        .await.map_err(|e| {
            warn!(provider = provider.cache_key(), "details provider error: {e}");
            ApiError(StatusCode::BAD_GATEWAY, "provider_error", e.to_string())
        })?;
    Ok(Json(json!({"provider": provider.cache_key(), "item": item})))
}

async fn streams(
    State(state): State<AppState>,
    Query(q): Query<StreamQuery>,
) -> ApiResult {
    validate_id(&q.id)?;
    // Stream discovery is disabled unless the operator explicitly enables it.
    // A server-side token is required; don't put the token in browser JavaScript.
    let Some(expected) = state.stream_access_token.as_deref() else {
        return Err(ApiError(StatusCode::NOT_IMPLEMENTED, "stream_resolution_disabled",
            "Set STREAM_ACCESS_TOKEN on a private deployment to enable release lookup.".into()));
    };
    if q.token.as_deref() != Some(expected) {
        return Err(ApiError(StatusCode::UNAUTHORIZED, "unauthorized",
            "A valid stream access token is required.".into()));
    }
    let provider = provider_from(q.provider.as_deref())?;
    let season = q.season.unwrap_or(1);
    let episode = q.episode.unwrap_or(1);
    if season == 0 || episode == 0 || season > 100 || episode > 10000 {
        return Err(bad_request("season/episode must be positive and within supported limits"));
    }
    let result = match provider {
        ProviderKind::MovieBox => ReleaseProvider::episode_streams(
            &state.service.client, &q.id, season, episode).await,
        ProviderKind::FourKHdHub => {
            let client = state.service.fourk_client.as_ref().ok_or_else(|| {
                ApiError(StatusCode::SERVICE_UNAVAILABLE, "unavailable", "4KHDHub is unavailable".into())
            })?;
            ReleaseProvider::episode_streams(client, &q.id, season, episode).await
        },
        ProviderKind::Dramachi => ReleaseProvider::episode_streams(
            &state.service.dramachi_client, &q.id, season, episode).await,
        ProviderKind::BdixCircleFtp => ReleaseProvider::episode_streams(
            &state.service.circleftp_client, &q.id, season, episode).await,
        ProviderKind::BdixDhakaFlix => ReleaseProvider::episode_streams(
            &state.service.dhakaflix_client, &q.id, season, episode).await,
        ProviderKind::Addons => return Err(ApiError(StatusCode::NOT_IMPLEMENTED,
            "unsupported", "Addon release lookup requires a configured addon manifest.".into())),
    };
    let releases = result.map_err(|e| {
        warn!(provider = provider.cache_key(), "stream lookup failed: {e}");
        ApiError(StatusCode::BAD_GATEWAY, "provider_error", e.to_string())
    })?;
    // Release objects may include cookies, signed URLs or private request headers.
    // Never return them from a public, unauthenticated endpoint.
    Ok(Json(json!({
        "provider": provider.cache_key(),
        "id": q.id,
        "season": season,
        "episode": episode,
        "releases": releases,
        "note": "Release entries are provider information, not verified browser-compatible playback URLs."
    })))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter(
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "moviebox_web_api=info,tower_http=info".into())
    ).init();
    let port = env::var("PORT").ok()
        .and_then(|s| s.parse::<u16>().ok()).unwrap_or(8080);
    let origin = env::var("FRONTEND_ORIGIN")
        .unwrap_or_else(|_| "https://moviebox-web-d7u.pages.dev".into());
    let allow_origin = match origin.parse::<HeaderValue>() {
        Ok(value) => AllowOrigin::exact(value),
        Err(_) => panic!("FRONTEND_ORIGIN must be a valid origin"),
    };
    let stream_access_token = env::var("STREAM_ACCESS_TOKEN").ok()
        .filter(|token| token.len() >= 24);
    let state = AppState {
        service: Arc::new(MovieBoxService::new()),
        stream_access_token,
    };
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/providers", get(providers))
        .route("/api/search", get(search))
        .route("/api/details", get(details))
        .route("/api/streams", get(streams))
        .layer(CorsLayer::new().allow_origin(allow_origin)
            .allow_methods([axum::http::Method::GET]))
        .with_state(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("MovieBox API listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await
        .expect("Cannot bind API port");
    axum::serve(listener, app).await.expect("API server stopped");
}
