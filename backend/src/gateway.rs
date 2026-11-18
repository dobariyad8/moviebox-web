//! Optional HTTPS bridge for operator-approved *direct movie files*.
//! Deliberately disabled unless MEDIA_PROXY_ALLOWED_HOSTS is configured.
//! Not an unrestricted proxy; not an HLS rewriter or transcoder.
use std::{collections::{HashMap,HashSet},env,net::{IpAddr,SocketAddr},sync::Arc,time::{Duration,Instant}};
use axum::{body::Body,extract::{Path,State},http::{header,HeaderMap,HeaderValue,StatusCode},response::{IntoResponse,Response},Json};
use futures_util::TryStreamExt;
use serde::{Deserialize,Serialize};
use tokio::{net::lookup_host,sync::{Mutex,Semaphore}};
use uuid::Uuid;

#[derive(Clone)]
pub struct Gateway {
    pub allow: Arc<HashSet<String>>,
    sessions: Arc<Mutex<HashMap<String,Lease>>>,
    traffic: Arc<Semaphore>,
    pub bearer: Option<String>,
}
#[derive(Clone)]
struct Lease { url: String, expires: Instant }
#[derive(Deserialize)]
pub struct Prepare { pub url: String, pub direct_file: bool, pub needs_headers: bool }
#[derive(Serialize)]
struct Prepared { playback_url: String, expires_in_seconds: u64 }
const LEASE_SECONDS:u64=4*60*60;

fn error(code:StatusCode,message:&str)->Response {
    (code,Json(serde_json::json!({"error":{"message":message}}))).into_response()
}
fn valid_dns_name(host:&str)->bool {
    host.len()<=253&&!host.is_empty()&&host.split('.').count()>=2
        &&host.bytes().all(|c| c.is_ascii_alphanumeric()||c==b'-'||c==b'.')
        &&host.split('.').all(|label| !label.is_empty()&&label.len()<=63&&!label.starts_with('-')&&!label.ends_with('-'))
        &&host.parse::<IpAddr>().is_err()
}
fn public_address(ip:IpAddr)->bool {
    match ip {
        IpAddr::V4(v)=>{
            let a=v.octets();
            !(v.is_private()||v.is_loopback()||v.is_link_local()||v.is_multicast()
                ||v.is_unspecified()||v.is_broadcast()||v.is_documentation()
                ||a[0]==0||a[0]>=224||(a[0]==100&&(64..=127).contains(&a[1]))
                ||(a[0]==198&&(18..=19).contains(&a[1]))
                ||(a[0]==192&&a[1]==0&&a[2]==0))
        },
        IpAddr::V6(v)=>{
            !(v.is_loopback()||v.is_unspecified()||v.is_multicast()||v.is_unique_local()
                ||v.is_unicast_link_local()||v.to_ipv4_mapped().is_some()
                ||(v.segments()[0]&0xffc0)==0xfe80)
        }
    }
}
impl Gateway {
    pub fn new(bearer:Option<String>)->Self {
        let allow=env::var("MEDIA_PROXY_ALLOWED_HOSTS").unwrap_or_default()
            .split(',').map(|s|s.trim().to_ascii_lowercase())
            .filter(|s|valid_dns_name(s)).collect();
        Self {allow:Arc::new(allow),sessions:Arc::new(Mutex::new(HashMap::new())),
            traffic:Arc::new(Semaphore::new(10)),bearer}
    }
    fn parse_url(&self,input:&str)->Result<reqwest::Url,Response> {
        if self.allow.is_empty(){return Err(error(StatusCode::SERVICE_UNAVAILABLE,"Approved media hosts are not configured"))}
        let url=reqwest::Url::parse(input).map_err(|_|error(StatusCode::BAD_REQUEST,"Invalid video URL"))?;
        if !["http","https"].contains(&url.scheme())||!url.username().is_empty()||url.password().is_some()
            ||url.fragment().is_some()||input.len()>4096 {
            return Err(error(StatusCode::BAD_REQUEST,"Unsupported or unsafe video URL"))
        }
        let host=url.host_str().unwrap_or("").to_ascii_lowercase();
        if !valid_dns_name(&host)||!self.allow.contains(&host) {
            return Err(error(StatusCode::FORBIDDEN,"This media host has not been approved by the operator"))
        }
        let port=url.port_or_known_default().unwrap_or(0);
        if !((url.scheme()=="http"&&port==80)||(url.scheme()=="https"&&port==443)) {
            return Err(error(StatusCode::BAD_REQUEST,"Nonstandard ports are disabled"))
        }
        if url.path().to_ascii_lowercase().ends_with(".m3u8") {
            return Err(error(StatusCode::UNPROCESSABLE_ENTITY,"HTTP HLS requires manifest/segment support, not available in this file gateway"))
        }
        Ok(url)
    }
    async fn client_for(&self,url:&reqwest::Url)->Result<reqwest::Client,Response>{
        let host=url.host_str().unwrap_or("");
        let port=url.port_or_known_default().unwrap_or(80);
        let addresses:Vec<SocketAddr>=lookup_host((host,port)).await
            .map_err(|_|error(StatusCode::BAD_GATEWAY,"Media host DNS lookup failed"))?
            .filter(|a|public_address(a.ip())).collect();
        if addresses.is_empty(){return Err(error(StatusCode::FORBIDDEN,"Media server resolves to a restricted network"))}
        reqwest::Client::builder().redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(host,&addresses)
            .connect_timeout(Duration::from_secs(8))
            .no_proxy().build().map_err(|_|error(StatusCode::BAD_GATEWAY,"Could not configure media connection"))
    }
}

pub async fn prepare(State(g):State<Gateway>,headers:HeaderMap,Json(body):Json<Prepare>)->Response {
    let auth=headers.get(header::AUTHORIZATION).and_then(|h|h.to_str().ok()).and_then(|s|s.strip_prefix("Bearer "));
    if g.bearer.as_deref().is_none()||auth!=g.bearer.as_deref(){
        return error(StatusCode::UNAUTHORIZED,"A valid private API token is required")
    }
    if !body.direct_file||body.needs_headers {
        return error(StatusCode::UNPROCESSABLE_ENTITY,"Only direct, header-free media files can be bridged")
    }
    let url=match g.parse_url(&body.url){Ok(u)=>u,Err(e)=>return e};
    // Do not ingest or resolve the source while issuing a lease.
    let key=format!("{}{}",Uuid::new_v4().simple(),Uuid::new_v4().simple());
    let mut sessions=g.sessions.lock().await;
    sessions.retain(|_,lease|lease.expires>Instant::now());
    if sessions.len()>=256{return error(StatusCode::TOO_MANY_REQUESTS,"Too many active playback sessions")}
    sessions.insert(key.clone(),Lease{url:url.to_string(),expires:Instant::now()+Duration::from_secs(LEASE_SECONDS)});
    let mut response=Json(Prepared{
        playback_url:format!("/api/playback/file/{key}"),
        expires_in_seconds:LEASE_SECONDS,
    }).into_response();
    response.headers_mut().insert(header::CACHE_CONTROL,HeaderValue::from_static("no-store"));
    response
}

pub async fn file(State(g):State<Gateway>,Path(token):Path<String>,headers:HeaderMap)->Response {
    if token.len()!=64||!token.bytes().all(|x|x.is_ascii_hexdigit()) {
        return error(StatusCode::NOT_FOUND,"Playback session unavailable")
    }
    let lease={
        let sessions=g.sessions.lock().await;
        sessions.get(&token).filter(|l|l.expires>Instant::now()).cloned()
    };
    let Some(lease)=lease else{return error(StatusCode::NOT_FOUND,"Playback session has expired")};
    let _permit=match g.traffic.clone().try_acquire_owned(){
        Ok(x)=>x,Err(_)=>return error(StatusCode::TOO_MANY_REQUESTS,"Too many simultaneous video streams")
    };
    let url=match g.parse_url(&lease.url){Ok(u)=>u,Err(e)=>return e};
    let client=match g.client_for(&url).await{Ok(c)=>c,Err(e)=>return e};
    let mut request=client.get(url);
    if let Some(range)=headers.get(header::RANGE){
        let Ok(text)=range.to_str() else{return error(StatusCode::BAD_REQUEST,"Invalid byte range")};
        // A single byte range for browser seeking. No multipart ranges.
        if text.len()>96||!text.starts_with("bytes=")||text.contains(',')||!text[6..].chars().all(|c|c.is_ascii_digit()||c=='-') {
            return error(StatusCode::RANGE_NOT_SATISFIABLE,"Only single byte ranges are accepted")
        }
        request=request.header(header::RANGE,text);
    }
    let upstream=match request.send().await {
        Ok(x)=>x,Err(_)=>return error(StatusCode::BAD_GATEWAY,"Media server did not respond")
    };
    let status=upstream.status();
    if status.is_redirection(){return error(StatusCode::BAD_GATEWAY,"Media redirects are not followed; approve the final direct host separately")}
    if !status.is_success(){return error(StatusCode::BAD_GATEWAY,"Media host rejected the stream request")}
    let content_type=upstream.headers().get(header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).unwrap_or("").to_ascii_lowercase();
    let allowed_type=content_type.starts_with("video/")||content_type.starts_with("application/octet-stream");
    if !allowed_type{return error(StatusCode::UNSUPPORTED_MEDIA_TYPE,"Upstream response is not a direct video file")}
    if upstream.content_length().unwrap_or(0)>12*1024*1024*1024 {
        return error(StatusCode::PAYLOAD_TOO_LARGE,"Media file exceeds the configured safety limit")
    }
    let forward=[header::CONTENT_TYPE,header::CONTENT_LENGTH,header::CONTENT_RANGE,header::ACCEPT_RANGES,header::ETAG,header::LAST_MODIFIED];
    let mut response=Response::builder().status(status);
    for h in &forward{if let Some(v)=upstream.headers().get(h){response=response.header(h,v)}}
    // Permit is held until the final video byte or disconnect using a wrapped stream.
    let stream=upstream.bytes_stream().map_ok(move |chunk|{let _keep=&_permit;chunk});
    let body=Body::from_stream(stream);
    response.header(header::CACHE_CONTROL,"private, no-store")
        .header(header::REFERRER_POLICY,"no-referrer")
        .header(header::X_CONTENT_TYPE_OPTIONS,"nosniff")
        .body(body).unwrap_or_else(|_|error(StatusCode::BAD_GATEWAY,"Could not create playback response"))
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]fn dns_validation(){
  assert!(valid_dns_name("media.example.com"));
  assert!(!valid_dns_name("127.0.0.1"));
  assert!(!valid_dns_name("localhost"));
  assert!(!valid_dns_name("media.example.com:80"));
 }
 #[test]fn public_address_validation(){
  assert!(!public_address("127.0.0.1".parse().unwrap()));
  assert!(!public_address("10.0.0.5".parse().unwrap()));
  assert!(!public_address("169.254.169.254".parse().unwrap()));
  assert!(!public_address("::1".parse().unwrap()));
  assert!(public_address("1.1.1.1".parse().unwrap()));
 }
}
