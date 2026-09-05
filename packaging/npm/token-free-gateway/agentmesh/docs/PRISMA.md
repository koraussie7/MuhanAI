# Prisma DB 연동 가이드 (MuhanAI)

## 1. 한눈에 보는 구조

```
App / Personal MCP
        │
        ▼
getKnowledgeStore()          ← store-factory.ts
        │
   ┌────┴────┐
   │ memory  │  PERSONAL_MCP_STORE=memory (기본)
   │ prisma  │  PERSONAL_MCP_STORE=prisma
   └────┬────┘
        ▼
PrismaUserKnowledgeStore     ← prisma-store.ts
        │
        ▼
@muhanai/db (PrismaClient)   ← packages/db
        │
        ▼
PostgreSQL (+ pgvector)
```

## 2. 사전 준비

### 2.1 의존성

```bash
cd muhanai
npm install
npm install @prisma/client
npm install -D prisma
```

### 2.2 환경 변수

```bash
cp .env.example .env
```

`.env` 예시:

```env
DATABASE_URL="postgresql://muhanai:muhanai@localhost:5432/muhanai?schema=public"
PERSONAL_MCP_STORE=prisma
NODE_ENV=development
```

### 2.3 PostgreSQL 실행 (Docker)

```bash
docker compose up -d postgres
```

`pgvector/pgvector:pg16` 이미지를 쓰므로 embedding 컬럼(`vector`)을 쓸 수 있습니다.

## 3. 마이그레이션

```bash
# 스키마 → DB 적용 + Prisma Client 생성
npx prisma migrate dev --name init

# Client만 재생성
npx prisma generate

# DB GUI
npx prisma studio
```

성공 시 `prisma/migrations/` 아래에 SQL이 생기고, `node_modules/@prisma/client`가 갱신됩니다.

### pgvector 확장

스키마에 `extensions = [vector]`가 있습니다.  
최초 마이그레이션에서 확장이 안 켜지면 DB에서 한 번 실행하세요:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## 4. Personal MCP에서 Prisma 사용

### 방법 A — 환경변수 스위치 (권장)

```ts
import { getKnowledgeStore } from "./packages/personal-mcp/src/store-factory";

const store = await getKnowledgeStore();
// PERSONAL_MCP_STORE=prisma 이면 PrismaUserKnowledgeStore
const uko = await store.getOrCreate("user_001", {
  profile: { name: "Minh", languages: ["vi", "ko", "en"] },
});
```

### 방법 B — 직접 주입

```ts
import { prisma } from "./packages/db/src/client";
import { PrismaUserKnowledgeStore } from "./packages/personal-mcp/src/prisma-store";

const store = new PrismaUserKnowledgeStore(prisma);

await store.getOrCreate("user_001", {
  profile: { name: "Minh", languages: ["vi", "ko"] },
});

await store.upsertKnowledge("user_001", {
  title: "다낭 보증금",
  content: "...",
  categoryId: "real-estate.rental",
});
```

### service.ts 와 함께

`createPersonalMcpForUser` 는 현재 in-memory `userKnowledgeStore`를 기본으로 씁니다.  
Prisma로 바꾸려면 `service.ts` / `server.ts` 에서 store를 `getKnowledgeStore()` 결과로 교체하면 됩니다.

예시:

```ts
// service.ts (개념)
const store = await getKnowledgeStore();
const uko = await store.getOrCreate(userId, options);
```

## 5. package.json scripts 추가 예시

```json
{
  "scripts": {
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio",
    "db:push": "prisma db push"
  }
}
```

## 6. 핵심 테이블 ↔ UKO 매핑

| UKO 필드 | Prisma 모델 |
|----------|-------------|
| profile | `UserProfile` |
| knowledge[] | `KnowledgeNode` + `KnowledgePermission` |
| memories[] | `UserMemory` |
| expertise[] | `UserExpertise` |
| skills[] | `UserSkill` |
| tools[] | `UserTool` |
| agents[] | `UserAgentLink` |
| stats | `UserStatsRow` |
| (MCP meta) | `PersonalMcp` |

`User.id` 는 앱의 `userId` 문자열을 그대로 씁니다 (외부 auth id 호환).

## 7. 개발 워크플로

```bash
# 1) DB 기동
npm run db:up

# 2) 마이그레이션
npm run db:migrate

# 3) Prisma 모드로 데모
PERSONAL_MCP_STORE=prisma npx tsx scripts/create-personal-mcp.ts

# 4) 데이터 확인
npm run db:studio
```

## 8. 주의사항

1. **Connection pooling**  
   Serverless(Vercel 등)에서는 PgBouncer + `?pgbouncer=true` 또는 Prisma Accelerate를 검토하세요.

2. **vector 컬럼**  
   `KnowledgeChunk.embedding` 은 `Unsupported("vector(1536)")` 입니다.  
   실제 유사도 검색은 raw SQL 또는 Prisma `$queryRaw` 로 합니다.

   ```ts
   await prisma.$queryRaw`
     SELECT id, content
     FROM "KnowledgeChunk"
     ORDER BY embedding <-> ${vector}::vector
     LIMIT 8
   `;
   ```

3. **트랜잭션**  
   `getOrCreate` 는 User + Profile + PersonalMcp + Stats 를 한 트랜잭션으로 만듭니다.

4. **메모리 스토어와의 차이**  
   Prisma 스토어는 프로세스 재시작 후에도 데이터가 유지됩니다.  
   테스트는 `PERSONAL_MCP_STORE=memory` 로 두는 것이 편합니다.

## 9. 다음 단계

- [ ] `service.ts` / `server.ts` 를 `getKnowledgeStore()` 기반으로 통합
- [ ] Knowledge chunk + embedding 파이프라인 (`$queryRaw` + pgvector)
- [ ] AgentRun 영속화
- [ ] 읽기 전용 replica / connection pool 분리
