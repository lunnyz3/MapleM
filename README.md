# MapleM Character Explorer

Node.js + Express web app for MapleStory M Open API with MongoDB log storage.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Project Structure

```text
server.js
src/
  app.js
  config/
    env.js
    mongo.js
  controllers/
  models/
  routes/
  services/
public/
  index.html
  css/
  js/
  assets/
```

- Add new API endpoint in this order:
1. `src/routes/*.routes.js`
2. `src/controllers/*.controller.js`
3. `src/services/*.service.js`
4. Optional Mongo schema in `src/models`
- Add page styles in `public/css`
- Add page behavior in `public/js`
- Add images/graphics in `public/assets`

## Environment Variables

Example `.env`:

```env
PORT=3000
NEXON_OPEN_API_KEY=your_nexon_open_api_key
NEXON_API_BASE_URL=https://open.api.nexon.com
MONGODB_URI=mongodb+srv://<db_username>:<db_password>@maplem.gmvdmys.mongodb.net/maplem?retryWrites=true&w=majority&appName=mapleM
```

## UI Flow

1. Search page (`/`)
  - Select `world_name`: `스카니아`, `루나`, `엘리시움`, `유니온`, `제니스`, `아케인`
  - Input `character_name`
2. Character page (`/character/:world_name/:character_name`)
  - Profile: 직업, 랭킹(미지원 시 `-`), 이름, 이미지, 레벨, 길드, 경험치
  - Tabs: 장비, 경험치 그래프, 쥬얼/심볼/V매트릭스, 헥사매트릭스, 하이퍼스탯, 스킬셋/링크, 길드

## API Routes

- Health: `GET /api/health`
- Character OCID: `GET /api/maplestorym/id?character_name=...&world_name=...`
- All details (legacy-compatible): `GET /api/maplestorym/character/all?character_name=...&world_name=...`
- Character page data: `GET /api/maplestorym/character/page-data?character_name=...&world_name=...`
- EXP history (Mongo): `GET /api/maplestorym/character/exp-history?ocid=...&limit=30`

If MongoDB is connected, API request/response logs are stored and EXP history is rendered from saved snapshots.
