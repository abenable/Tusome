// Lab mode: one PC holds the student records, the others use them over the
// school network, so a learner's progress follows them to any PC in the lab.
//
//   standalone  this PC keeps its own records (the default; no network)
//   server      this PC keeps the records and answers the lab's clients
//   client      this PC asks the server for records instead of using its own
//
// Wire format: a TCP connection per query to port 47615. Each message is a
// 4-byte big-endian length then `nonce || ChaCha20-Poly1305(json)`, keyed
// from the lab code (PBKDF2) the teacher types once on each PC. Without the
// code you can't read the traffic or make the server do anything.
//
// A client can only ask for one of the named statements in
// src/db/queries.json (the same file the frontend uses), never arbitrary SQL.
//
// Discovery: clients broadcast "TUSOME-LAB?" to UDP 47616 and servers answer,
// so a teacher can pick the server from a list instead of typing an address.
//
// ponytail: no replay protection; a captured request could be re-sent by
// someone on the LAN who can't read it. Add a timestamp + seen-nonce window if
// labs ever share a network with untrusted devices.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::num::NonZeroU32;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, CHACHA20_POLY1305, NONCE_LEN};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Column, Row};
use tauri::{AppHandle, Manager};

pub const PORT: u16 = 47615;
const DISCOVERY_PORT: u16 = 47616;
const HELLO: &[u8] = b"TUSOME-LAB?";
const REPLY: &str = "TUSOME-LAB!";
const MAX_MESSAGE: usize = 16 * 1024 * 1024;
// Unambiguous characters only: no 0/O, 1/I/L.
const CODE_ALPHABET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";

static QUERIES: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/db/queries.json")).expect("queries.json")
});

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct LabConfig {
    /// "standalone" | "server" | "client"
    pub mode: String,
    /// Lab code, e.g. "7KQM-XR4T-9HWB". Same on the server and every client.
    #[serde(default)]
    pub code: String,
    /// Client only: the server's address (IP or hostname).
    #[serde(default)]
    pub server: String,
}

/// This PC's lab config plus the key derived from its code.
#[derive(Default)]
pub struct LabState(Mutex<Option<(LabConfig, [u8; 32])>>);

#[derive(Deserialize, Serialize)]
struct Request {
    q: String,
    #[serde(default)]
    params: Vec<Value>,
    kind: String,
}

// ── config ────────────────────────────────────────────────────────────────

fn config_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("lab.json"))
}

fn normalize_code(code: &str) -> String {
    code.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

fn derive_key(code: &str) -> [u8; 32] {
    let mut key = [0u8; 32];
    ring::pbkdf2::derive(
        ring::pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(100_000).unwrap(),
        b"tusome-lab-v1",
        normalize_code(code).as_bytes(),
        &mut key,
    );
    key
}

fn new_code() -> String {
    let mut bytes = [0u8; 12];
    SystemRandom::new().fill(&mut bytes).expect("random");
    let chars: String = bytes
        .iter()
        .map(|b| CODE_ALPHABET[*b as usize % CODE_ALPHABET.len()] as char)
        .collect();
    format!("{}-{}-{}", &chars[..4], &chars[4..8], &chars[8..])
}

fn load(app: &AppHandle) -> (LabConfig, [u8; 32]) {
    let state = app.state::<LabState>();
    let mut guard = state.0.lock().unwrap();
    if let Some(loaded) = guard.as_ref() {
        return loaded.clone();
    }
    let cfg = config_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<LabConfig>(&s).ok())
        .filter(|c| matches!(c.mode.as_str(), "server" | "client"))
        .unwrap_or_else(|| LabConfig {
            mode: "standalone".into(),
            ..Default::default()
        });
    let loaded = (cfg.clone(), derive_key(&cfg.code));
    *guard = Some(loaded.clone());
    loaded
}

#[tauri::command]
pub fn lab_config(app: AppHandle) -> LabConfig {
    load(&app).0
}

/// Save a new lab config. Takes effect after a restart (the frontend restarts
/// straight after), which starts or stops the server cleanly.
#[tauri::command]
pub fn save_lab_config(app: AppHandle, mut config: LabConfig) -> Result<LabConfig, String> {
    match config.mode.as_str() {
        "standalone" => {}
        "server" if normalize_code(&config.code).is_empty() => config.code = new_code(),
        "server" => {}
        "client" if config.server.trim().is_empty() => {
            return Err("Enter the lab server's address.".into())
        }
        "client" if normalize_code(&config.code).len() < 12 => {
            return Err("Enter the 12-character lab code.".into())
        }
        "client" => config.server = config.server.trim().to_string(),
        _ => return Err("Unknown lab mode.".into()),
    }
    let path = config_path(&app).ok_or("No config folder")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_vec_pretty(&config).unwrap())
        .map_err(|e| e.to_string())?;
    *app.state::<LabState>().0.lock().unwrap() = Some((config.clone(), derive_key(&config.code)));
    Ok(config)
}

// ── crypto + framing ──────────────────────────────────────────────────────

fn seal(key: &[u8; 32], aad: &[u8], plain: &[u8]) -> Vec<u8> {
    let key = LessSafeKey::new(UnboundKey::new(&CHACHA20_POLY1305, key).unwrap());
    let mut nonce = [0u8; NONCE_LEN];
    SystemRandom::new().fill(&mut nonce).expect("random");
    let mut buf = plain.to_vec();
    key.seal_in_place_append_tag(
        Nonce::assume_unique_for_key(nonce),
        Aad::from(aad),
        &mut buf,
    )
    .expect("seal");
    [nonce.as_slice(), &buf].concat()
}

fn open(key: &[u8; 32], aad: &[u8], data: &[u8]) -> Option<Vec<u8>> {
    if data.len() < NONCE_LEN {
        return None;
    }
    let key = LessSafeKey::new(UnboundKey::new(&CHACHA20_POLY1305, key).ok()?);
    let (nonce, rest) = data.split_at(NONCE_LEN);
    let mut buf = rest.to_vec();
    let plain = key
        .open_in_place(
            Nonce::try_assume_unique_for_key(nonce).ok()?,
            Aad::from(aad),
            &mut buf,
        )
        .ok()?;
    Some(plain.to_vec())
}

fn write_frame(stream: &mut TcpStream, data: &[u8]) -> std::io::Result<()> {
    stream.write_all(&(data.len() as u32).to_be_bytes())?;
    stream.write_all(data)
}

fn read_frame(stream: &mut TcpStream) -> std::io::Result<Vec<u8>> {
    let mut len = [0u8; 4];
    stream.read_exact(&mut len)?;
    let len = u32::from_be_bytes(len) as usize;
    if len > MAX_MESSAGE {
        return Err(std::io::Error::other("message too large"));
    }
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf)?;
    Ok(buf)
}

// ── server ────────────────────────────────────────────────────────────────

/// Start answering clients if this PC is the lab server. Called from setup.
pub fn start_if_server(app: &AppHandle) {
    let (cfg, key) = load(app);
    if cfg.mode != "server" {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let listener = match TcpListener::bind(("0.0.0.0", PORT)) {
            Ok(l) => l,
            Err(e) => return eprintln!("[lab] can't listen on {PORT}: {e}"),
        };
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = serve_one(&app, &key, stream);
            });
        }
    });
    std::thread::spawn(|| {
        let Ok(sock) = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) else {
            return eprintln!("[lab] can't listen for discovery on {DISCOVERY_PORT}");
        };
        let mut buf = [0u8; 64];
        while let Ok((n, from)) = sock.recv_from(&mut buf) {
            if &buf[..n] == HELLO {
                let _ = sock.send_to(format!("{REPLY}{}", hostname()).as_bytes(), from);
            }
        }
    });
}

fn serve_one(app: &AppHandle, key: &[u8; 32], mut stream: TcpStream) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(15)))?;
    let frame = read_frame(&mut stream)?;
    // Wrong code (or garbage): drop the connection without a word.
    let Some(plain) = open(key, b"req", &frame) else {
        return Ok(());
    };
    let reply = match serde_json::from_slice::<Request>(&plain) {
        Ok(req) => match tauri::async_runtime::block_on(run(app, &req)) {
            Ok(v) => json!({ "ok": v }),
            Err(e) => json!({ "err": e }),
        },
        Err(e) => json!({ "err": e.to_string() }),
    };
    write_frame(
        &mut stream,
        &seal(key, b"res", reply.to_string().as_bytes()),
    )
}

async fn run(app: &AppHandle, req: &Request) -> Result<Value, String> {
    if req.q == "ping" {
        return Ok(json!({ "name": hostname() }));
    }
    if !QUERIES.contains_key(&req.q) {
        return Err(format!("unknown query {}", req.q));
    }
    let pool = wait_for_pool(app)
        .await
        .ok_or("The server's records aren't open yet.")?;
    run_on(&pool, req).await
}

/// Run one allowlisted query against a pool and return rows (select) or
/// `{ rowsAffected, lastInsertId }` (execute), shaped like tauri-plugin-sql's
/// results so the frontend can't tell local from lab.
async fn run_on(pool: &sqlx::Pool<sqlx::Sqlite>, req: &Request) -> Result<Value, String> {
    let sql = QUERIES
        .get(&req.q)
        .ok_or_else(|| format!("unknown query {}", req.q))?;
    let mut query = sqlx::query(sql);
    for p in &req.params {
        query = match p {
            Value::Null => query.bind(None::<String>),
            Value::Bool(b) => query.bind(*b),
            Value::Number(n) if n.is_i64() => query.bind(n.as_i64()),
            Value::Number(n) => query.bind(n.as_f64()),
            Value::String(s) => query.bind(s.clone()),
            other => query.bind(other.to_string()),
        };
    }
    if req.kind == "execute" {
        let r = query.execute(pool).await.map_err(|e| e.to_string())?;
        return Ok(
            json!({ "rowsAffected": r.rows_affected(), "lastInsertId": r.last_insert_rowid() }),
        );
    }
    let rows = query.fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(Value::Array(rows.iter().map(row_json).collect()))
}

/// The server's pool opens once its own window loads; wait a little for it.
async fn wait_for_pool(app: &AppHandle) -> Option<sqlx::Pool<sqlx::Sqlite>> {
    for _ in 0..20 {
        if let Some(p) = crate::updates::get_pool(app).await {
            return Some(p);
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    None
}

fn row_json(row: &sqlx::sqlite::SqliteRow) -> Value {
    let mut out = serde_json::Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        let v = if let Ok(v) = row.try_get::<Option<i64>, _>(i) {
            json!(v)
        } else if let Ok(v) = row.try_get::<Option<f64>, _>(i) {
            json!(v)
        } else if let Ok(v) = row.try_get::<Option<String>, _>(i) {
            json!(v)
        } else {
            Value::Null
        };
        out.insert(col.name().to_string(), v);
    }
    Value::Object(out)
}

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .ok()
        .or_else(|| std::fs::read_to_string("/etc/hostname").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Tusome server".into())
}

// ── client ────────────────────────────────────────────────────────────────

fn call(server: &str, key: &[u8; 32], req: &Request) -> Result<Value, String> {
    let unreachable = || {
        format!("Can't reach the lab server at {server}. Check that it's switched on and Tusome is open on it.")
    };
    let addr: SocketAddr = (server, PORT)
        .to_socket_addrs()
        .ok()
        .and_then(|mut a| a.next())
        .ok_or_else(unreachable)?;
    let mut stream =
        TcpStream::connect_timeout(&addr, Duration::from_secs(3)).map_err(|_| unreachable())?;
    stream.set_read_timeout(Some(Duration::from_secs(15))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(15))).ok();
    let body = serde_json::to_vec(req).map_err(|e| e.to_string())?;
    write_frame(&mut stream, &seal(key, b"req", &body)).map_err(|_| unreachable())?;
    let frame = read_frame(&mut stream).map_err(|_| {
        "The lab server didn't accept this PC. Check the lab code matches.".to_string()
    })?;
    let plain = open(key, b"res", &frame).ok_or("The lab server's reply couldn't be read.")?;
    let reply: Value = serde_json::from_slice(&plain).map_err(|e| e.to_string())?;
    match (reply.get("ok"), reply.get("err")) {
        (Some(v), _) => Ok(v.clone()),
        (_, Some(e)) => Err(e.as_str().unwrap_or("lab server error").to_string()),
        _ => Err("lab server error".into()),
    }
}

#[tauri::command]
pub async fn lab_query(
    app: AppHandle,
    q: String,
    params: Vec<Value>,
    kind: String,
) -> Result<Value, String> {
    let (cfg, key) = load(&app);
    if cfg.mode != "client" {
        return Err("This PC isn't a lab client.".into());
    }
    let req = Request { q, params, kind };
    tauri::async_runtime::spawn_blocking(move || call(&cfg.server, &key, &req))
        .await
        .map_err(|e| e.to_string())?
}

/// Check a server address and code work before saving them. Returns the
/// server PC's name.
#[tauri::command]
pub async fn lab_test(server: String, code: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let req = Request {
            q: "ping".into(),
            params: vec![],
            kind: "select".into(),
        };
        let v = call(server.trim(), &derive_key(&code), &req)?;
        Ok(v["name"].as_str().unwrap_or("Lab server").to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct FoundServer {
    address: String,
    name: String,
}

/// Ask the local network for lab servers (about 1.5 seconds).
#[tauri::command]
pub async fn lab_find_servers() -> Vec<FoundServer> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut found: Vec<FoundServer> = Vec::new();
        let Ok(sock) = UdpSocket::bind(("0.0.0.0", 0)) else {
            return found;
        };
        let _ = sock.set_broadcast(true);
        if sock
            .send_to(HELLO, ("255.255.255.255", DISCOVERY_PORT))
            .is_err()
        {
            return found;
        }
        let deadline = Instant::now() + Duration::from_millis(1500);
        let mut buf = [0u8; 256];
        while let Some(left) = deadline.checked_duration_since(Instant::now()) {
            let _ = sock.set_read_timeout(Some(left.max(Duration::from_millis(1))));
            let Ok((n, from)) = sock.recv_from(&mut buf) else {
                break;
            };
            if let Some(name) = std::str::from_utf8(&buf[..n])
                .ok()
                .and_then(|s| s.strip_prefix(REPLY))
            {
                let address = from.ip().to_string();
                if !found.iter().any(|f| f.address == address) {
                    found.push(FoundServer {
                        address,
                        name: name.to_string(),
                    });
                }
            }
        }
        found
    })
    .await
    .unwrap_or_default()
}

/// This PC's name and LAN address, shown on the server so teachers can type
/// it on a client if discovery is blocked.
#[tauri::command]
pub fn lab_this_pc() -> Value {
    // Connecting a UDP socket sends nothing; it just picks the outgoing interface.
    let ip = UdpSocket::bind(("0.0.0.0", 0))
        .and_then(|s| s.connect(("10.255.255.255", 1)).map(|_| s))
        .and_then(|s| s.local_addr())
        .map(|a| a.ip().to_string())
        .ok()
        .filter(|ip| ip != "0.0.0.0");
    json!({ "name": hostname(), "address": ip })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_and_open_round_trip() {
        let key = derive_key("7KQM-XR4T-9HWB");
        let sealed = seal(&key, b"req", b"hello");
        assert_eq!(open(&key, b"req", &sealed).unwrap(), b"hello");
    }

    #[test]
    fn wrong_code_or_direction_cant_open() {
        let sealed = seal(&derive_key("7KQM-XR4T-9HWB"), b"req", b"hello");
        assert!(open(&derive_key("7KQM-XR4T-9HWC"), b"req", &sealed).is_none());
        // A request can't be passed off as a response (or the reverse).
        assert!(open(&derive_key("7KQM-XR4T-9HWB"), b"res", &sealed).is_none());
    }

    #[test]
    fn codes_ignore_case_and_dashes() {
        assert_eq!(derive_key("7kqm xr4t-9hwb"), derive_key("7KQM-XR4T-9HWB"));
        let code = new_code();
        assert_eq!(code.len(), 14);
        assert_eq!(normalize_code(&code).len(), 12);
    }

    #[test]
    fn every_query_is_allowlisted_sql() {
        assert!(QUERIES.contains_key("progress.upsert"));
        assert!(QUERIES.values().all(|sql| !sql.contains(';')));
    }

    fn req(q: &str, params: Vec<Value>, kind: &str) -> Request {
        Request {
            q: q.into(),
            params,
            kind: kind.into(),
        }
    }

    /// The real migrations and queries against an in-memory database: what a
    /// lab server does for a client, minus the network.
    #[tokio::test]
    async fn runs_allowlisted_queries_like_the_plugin() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        for sql in [
            include_str!("../migrations/001_init.sql"),
            include_str!("../migrations/002_settings_and_seed.sql"),
            include_str!("../migrations/004_student_passwords.sql"),
        ] {
            sqlx::raw_sql(sql).execute(&pool).await.unwrap();
        }

        let r = run_on(
            &pool,
            &req(
                "students.insert",
                vec![json!("Nakato"), json!("S2"), json!("aa:bb")],
                "execute",
            ),
        )
        .await
        .unwrap();
        assert_eq!(r["rowsAffected"], 1);
        let id = r["lastInsertId"].as_i64().unwrap();

        run_on(
            &pool,
            &req(
                "progress.upsert",
                vec![
                    json!(id),
                    json!("phy.s1.matter.density"),
                    json!("completed"),
                ],
                "execute",
            ),
        )
        .await
        .unwrap();
        // Never downgrades a completed topic.
        run_on(
            &pool,
            &req(
                "progress.upsert",
                vec![json!(id), json!("phy.s1.matter.density"), json!("started")],
                "execute",
            ),
        )
        .await
        .unwrap();

        let rows = run_on(&pool, &req("students.all", vec![], "select"))
            .await
            .unwrap();
        assert_eq!(rows[0]["display_name"], "Nakato");
        assert_eq!(rows[0]["class_label"], "S2");
        assert_eq!(rows[0]["id"], id);

        let progress = run_on(
            &pool,
            &req("progress.forStudent", vec![json!(id)], "select"),
        )
        .await
        .unwrap();
        assert_eq!(progress[0]["state"], "completed");

        let moved = run_on(
            &pool,
            &req(
                "students.moveClass",
                vec![json!("S2"), json!("S3")],
                "execute",
            ),
        )
        .await
        .unwrap();
        assert_eq!(moved["rowsAffected"], 1);

        assert!(
            run_on(&pool, &req("DROP TABLE students", vec![], "execute"))
                .await
                .is_err()
        );
    }

    #[test]
    fn frames_round_trip_over_tcp() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let t = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let got = read_frame(&mut s).unwrap();
            write_frame(&mut s, &got).unwrap();
        });
        let mut c = TcpStream::connect(addr).unwrap();
        write_frame(&mut c, b"echo").unwrap();
        assert_eq!(read_frame(&mut c).unwrap(), b"echo");
        t.join().unwrap();
    }
}
