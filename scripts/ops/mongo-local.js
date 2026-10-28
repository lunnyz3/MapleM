// 이 서버에서 Docker로 MongoDB 7.0을 운영하기 위한 도구.
//
//   node scripts/ops/mongo-local.js init         # 컨테이너 생성(127.0.0.1:27027), 관리자·앱 계정 생성
//   node scripts/ops/mongo-local.js dump-atlas   # 운영 .env 의 Atlas DB를 압축 아카이브로 덤프(읽기 전용)
//   node scripts/ops/mongo-local.js restore <아카이브>  # 아카이브를 로컬 DB에 복원
//   node scripts/ops/mongo-local.js verify       # Atlas와 로컬의 컬렉션별 문서 수·인덱스 비교(읽기 전용)
//   node scripts/ops/mongo-local.js backup       # 로컬 DB를 백업 폴더에 덤프하고 오래된 백업 정리
//   node scripts/ops/mongo-local.js status       # 컨테이너 상태와 접속 확인
//
// 비밀번호는 출력하지 않고 $MAPLEM_MONGO_HOME/secrets.env(권한 600)에만 저장한다.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HOME = process.env.MAPLEM_MONGO_HOME || "/home/jhc/maplem-mongo";
const PROD_ENV_FILE = process.env.MAPLEM_PROD_ENV_FILE || "/home/jhc/mapleM/.env";
const CONTAINER = "maplem-mongo";
const IMAGE = "mongo:7.0";
const DB_NAME = "maplem";
// 27017은 이 서버의 Rocket.Chat(snap) MongoDB가 쓰고 있어 다른 포트를 쓴다.
const HOST_PORT = Number(process.env.MAPLEM_MONGO_PORT || 27027);
// 다시 모으면 되는 수집 데이터(아이템·스펙 랭킹)는 백업하지 않는다. 수십만~수백만 건이라 매일 백업 14개가 디스크를 채운다.
const BACKUP_EXCLUDE = ["equipment_items", "character_specs"];
const BACKUP_KEEP_DAYS = Number(process.env.MAPLEM_MONGO_BACKUP_KEEP_DAYS || 14);
const dirs = {
  data: path.join(HOME, "data"),
  backups: path.join(HOME, "backups"),
  migration: path.join(HOME, "migration")
};
const secretsFile = path.join(HOME, "secrets.env");

function fail(message) {
  console.error(`[mongo-local] ${message}`);
  process.exit(1);
}

function run(command, args, { env, input, stdout = "pipe", allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...env },
    input,
    stdio: [input === undefined ? "ignore" : "pipe", stdout, "pipe"],
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error) {
    fail(`${command} 실행 실패: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    fail(`${command} ${args[0]} 실패(코드 ${result.status}): ${String(result.stderr || "").trim().slice(-800)}`);
  }
  return result;
}

function parseEnvFile(file) {
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) {
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return values;
}

function loadSecrets() {
  if (!fs.existsSync(secretsFile)) {
    fail(`${secretsFile} 이 없습니다. 먼저 init 을 실행하세요.`);
  }
  return parseEnvFile(secretsFile);
}

function atlasUri() {
  const uri = parseEnvFile(PROD_ENV_FILE).MONGODB_URI;
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri)) {
    fail(`${PROD_ENV_FILE} 에 MONGODB_URI 가 없습니다.`);
  }
  return uri;
}

function containerState() {
  const result = run("docker", ["inspect", "-f", "{{.State.Status}}", CONTAINER], { allowFailure: true });
  return result.status === 0 ? String(result.stdout).trim() : "missing";
}

// 컨테이너는 호스트 네트워크를 쓰므로(이 서버는 브리지 포트 공개가 동작하지 않음)
// 컨테이너 안의 도구도 127.0.0.1:HOST_PORT 로 접속한다.
const rootAuthArgs = `--host 127.0.0.1 --port ${HOST_PORT} -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin`;

function mongosh(secrets, script) {
  return run("docker", [
    "exec", "-e", "MONGO_ROOT_USER", "-e", "MONGO_ROOT_PASSWORD", CONTAINER,
    "sh", "-c", `mongosh --quiet ${rootAuthArgs} --eval "$0"`,
    script
  ], { env: { MONGO_ROOT_USER: secrets.MONGO_ROOT_USER, MONGO_ROOT_PASSWORD: secrets.MONGO_ROOT_PASSWORD } });
}

function waitForMongo(secrets) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = run("docker", [
      "exec", "-e", "MONGO_ROOT_USER", "-e", "MONGO_ROOT_PASSWORD", CONTAINER,
      "sh", "-c", `mongosh --quiet ${rootAuthArgs} --eval "db.runCommand({ping:1}).ok"`
    ], {
      env: { MONGO_ROOT_USER: secrets.MONGO_ROOT_USER, MONGO_ROOT_PASSWORD: secrets.MONGO_ROOT_PASSWORD },
      allowFailure: true
    });
    if (result.status === 0 && String(result.stdout).trim().endsWith("1")) {
      return;
    }
    spawnSync("sleep", ["1"]);
  }
  fail("MongoDB가 60초 안에 응답하지 않습니다. docker logs maplem-mongo 를 확인하세요.");
}

function init() {
  Object.values(dirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true, mode: 0o700 }));
  if (!fs.existsSync(secretsFile)) {
    const secret = () => crypto.randomBytes(24).toString("base64url");
    const appPassword = secret();
    const lines = [
      "MONGO_ROOT_USER=maplem_root",
      `MONGO_ROOT_PASSWORD=${secret()}`,
      "MONGO_APP_USER=maplem_app",
      `MONGO_APP_PASSWORD=${appPassword}`,
      `LOCAL_MONGODB_URI=mongodb://maplem_app:${appPassword}@127.0.0.1:${HOST_PORT}/${DB_NAME}?authSource=${DB_NAME}`
    ];
    fs.writeFileSync(secretsFile, `${lines.join("\n")}\n`, { mode: 0o600 });
    console.log(`비밀값을 ${secretsFile} 에 만들었습니다(권한 600, 내용은 출력하지 않음).`);
  }
  const secrets = loadSecrets();

  const state = containerState();
  if (state === "missing") {
    run("docker", [
      "run", "-d", "--name", CONTAINER, "--restart", "unless-stopped",
      "--network", "host",
      "-v", `${dirs.data}:/data/db`,
      "-e", "MONGO_INITDB_ROOT_USERNAME", "-e", "MONGO_INITDB_ROOT_PASSWORD",
      IMAGE, "--wiredTigerCacheSizeGB", "1", "--bind_ip", "127.0.0.1", "--port", String(HOST_PORT)
    ], {
      env: { MONGO_INITDB_ROOT_USERNAME: secrets.MONGO_ROOT_USER, MONGO_INITDB_ROOT_PASSWORD: secrets.MONGO_ROOT_PASSWORD }
    });
    console.log(`컨테이너 ${CONTAINER}(${IMAGE})를 만들었습니다. 127.0.0.1:${HOST_PORT} 에서만 접속됩니다.`);
  } else if (state !== "running") {
    run("docker", ["start", CONTAINER]);
  }
  waitForMongo(secrets);

  const appUserScript = `
    const target = db.getSiblingDB(${JSON.stringify(DB_NAME)});
    if (!target.getUser(${JSON.stringify(secrets.MONGO_APP_USER)})) {
      target.createUser({ user: ${JSON.stringify(secrets.MONGO_APP_USER)}, pwd: ${JSON.stringify(secrets.MONGO_APP_PASSWORD)}, roles: [{ role: "readWrite", db: ${JSON.stringify(DB_NAME)} }] });
      print("app user created");
    } else {
      print("app user exists");
    }`;
  console.log(String(mongosh(secrets, appUserScript).stdout).trim());
  status();
}

function dumpAtlas() {
  fs.mkdirSync(dirs.migration, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archive = path.join(dirs.migration, `atlas-${DB_NAME}-${stamp}.archive.gz`);
  const fd = fs.openSync(archive, "w", 0o600);
  try {
    run("docker", [
      "run", "--rm", "--network", "host", "-e", "SOURCE_URI", IMAGE,
      "sh", "-c", `mongodump --uri="$SOURCE_URI" --db=${DB_NAME} --archive --gzip --quiet`
    ], { env: { SOURCE_URI: atlasUri() }, stdout: fd });
  } finally {
    fs.closeSync(fd);
  }
  const sizeMb = (fs.statSync(archive).size / 1024 / 1024).toFixed(1);
  console.log(`Atlas 덤프 완료: ${archive} (${sizeMb}MB)`);
}

function restore(archive) {
  if (!archive || !fs.existsSync(archive)) {
    fail("복원할 아카이브 경로를 지정하세요.");
  }
  const secrets = loadSecrets();
  const result = run("docker", [
    "exec", "-i", "-e", "MONGO_ROOT_USER", "-e", "MONGO_ROOT_PASSWORD", CONTAINER,
    "sh", "-c", `mongorestore ${rootAuthArgs} --archive --gzip --nsInclude="${DB_NAME}.*"`
  ], {
    env: { MONGO_ROOT_USER: secrets.MONGO_ROOT_USER, MONGO_ROOT_PASSWORD: secrets.MONGO_ROOT_PASSWORD },
    input: fs.readFileSync(archive)
  });
  console.log(String(result.stderr).trim().split("\n").slice(-3).join("\n"));
}

const countScript = `
  const target = db.getSiblingDB(${JSON.stringify(DB_NAME)});
  const out = {};
  for (const name of target.getCollectionNames().sort()) {
    out[name] = {
      count: target.getCollection(name).countDocuments({}),
      indexes: target.getCollection(name).getIndexes().map((i) => i.name).sort()
    };
  }
  print(JSON.stringify(out));`;

function verify() {
  const secrets = loadSecrets();
  const local = JSON.parse(String(mongosh(secrets, countScript).stdout).trim().split("\n").pop());
  const atlasResult = run("docker", [
    "run", "--rm", "--network", "host", "-e", "SOURCE_URI", IMAGE, "sh", "-c", 'mongosh "$SOURCE_URI" --quiet --eval "$0"', countScript
  ], { env: { SOURCE_URI: atlasUri() } });
  const atlas = JSON.parse(String(atlasResult.stdout).trim().split("\n").pop());

  let ok = true;
  for (const name of new Set([...Object.keys(atlas), ...Object.keys(local)])) {
    const a = atlas[name];
    const l = local[name];
    const sameCount = a && l && a.count === l.count;
    const sameIndexes = a && l && JSON.stringify(a.indexes) === JSON.stringify(l.indexes);
    ok = ok && sameCount && sameIndexes;
    console.log(
      `${sameCount && sameIndexes ? "OK  " : "DIFF"} ${name}: atlas=${a ? a.count : "-"} local=${l ? l.count : "-"} indexes ${sameIndexes ? "일치" : `불일치 atlas=[${a?.indexes}] local=[${l?.indexes}]`}`
    );
  }
  console.log(ok ? "검증 통과: 문서 수와 인덱스가 모두 같습니다." : "검증 실패: 위 DIFF 항목을 확인하세요.");
  if (!ok) {
    process.exitCode = 1;
  }
}

function backup() {
  const secrets = loadSecrets();
  fs.mkdirSync(dirs.backups, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const archive = path.join(dirs.backups, `${DB_NAME}-${stamp}.archive.gz`);
  const fd = fs.openSync(archive, "w", 0o600);
  try {
    run("docker", [
      "exec", "-e", "MONGO_ROOT_USER", "-e", "MONGO_ROOT_PASSWORD", CONTAINER,
      "sh", "-c", `mongodump ${rootAuthArgs} --db=${DB_NAME} ${BACKUP_EXCLUDE.map((name) => `--excludeCollection=${name}`).join(" ")} --archive --gzip --quiet`
    ], { env: { MONGO_ROOT_USER: secrets.MONGO_ROOT_USER, MONGO_ROOT_PASSWORD: secrets.MONGO_ROOT_PASSWORD }, stdout: fd });
  } finally {
    fs.closeSync(fd);
  }
  const cutoff = Date.now() - BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const removed = fs
    .readdirSync(dirs.backups)
    .filter((name) => name.endsWith(".archive.gz"))
    .map((name) => path.join(dirs.backups, name))
    .filter((file) => file !== archive && fs.statSync(file).mtimeMs < cutoff);
  removed.forEach((file) => fs.unlinkSync(file));
  const sizeMb = (fs.statSync(archive).size / 1024 / 1024).toFixed(1);
  console.log(`${new Date().toISOString()} 백업 완료: ${archive} (${sizeMb}MB), 오래된 백업 ${removed.length}개 삭제`);
}

function status() {
  const state = containerState();
  console.log(`컨테이너 ${CONTAINER}: ${state}`);
  if (state === "running" && fs.existsSync(secretsFile)) {
    const secrets = loadSecrets();
    const version = String(mongosh(secrets, "db.version()").stdout).trim();
    const stats = String(
      mongosh(secrets, `const s = db.getSiblingDB(${JSON.stringify(DB_NAME)}).stats(1024*1024); print(JSON.stringify({ objects: Number(s.objects), dataSizeMB: Math.round(s.dataSize), storageSizeMB: Math.round(s.storageSize) }))`).stdout
    ).trim();
    console.log(`MongoDB ${version} / ${DB_NAME}: ${stats}`);
  }
}

const [command, arg] = process.argv.slice(2);
const commands = { init, "dump-atlas": dumpAtlas, restore: () => restore(arg), verify, backup, status };
if (!commands[command]) {
  fail(`사용법: node scripts/ops/mongo-local.js <${Object.keys(commands).join("|")}>`);
}
commands[command]();
