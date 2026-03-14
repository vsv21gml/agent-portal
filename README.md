# agent-portal

`plane` 요구사항 기준으로 확장 구현한 Node.js 24 + Turbo monorepo 입니다.

## 구성
- `apps/api`: NestJS + TypeORM(sqlite) 기반 API
- `apps/web`: Next.js + Mantine + Zustand 기반 유저 포탈
- `apps/admin-web`: Next.js + Mantine 기반 어드민 포탈(모듈 분리)
- `helm`: 웹/API + GitLab/LiteLLM 서브차트 의존을 포함한 엄브렐라 차트

## 주요 기능 스캐폴딩
- RBAC: 글로벌 역할(`admin`, `user`) + 프로젝트 역할(`manager`, `member`) + PermissionGuard
- 권한: `READ_USER`, `WRITE_USER_ROLE`, `READ_PROJECT`, `READ_RESOURCE`, `READ_GITLAB`, `READ_AUDIT_LOG` 등
- 인증: JWT 로그인/회원가입 + OIDC 콜백 + SAML ACS 지원
- 프로젝트: 생성, 멤버관리, 프로젝트 자원리밋(cpu/memoryGi) 관리
- 노트북: 프로젝트/유저별 endpoint path + k8s 배포/ingress(subpath) 프로비저닝
- GitLab: 프로젝트 그룹/레포 연계 + 멤버 권한 sync 상태 관리
- LiteLLM: 프로젝트 팀 자동 생성 + 키 발급 + 사용 모델 조회
- 로그: 오딧로그 + 엑세스로그 수집 및 어드민 조회
- 프론트: 유저/어드민 포탈 분리, 테이블 페이지네이션, 우측 Drawer, 우측상단 toast

## 실행
1. `corepack enable`
2. `npm install`
3. `npm run dev`

기본 포트:
- web: `http://localhost:3000`
- admin-web: `http://localhost:3100`
- api: `http://localhost:4000`

개발 편의 인증 우회:
- API 실행 시 `AUTH_BYPASS=true` 설정하면 JWT 없이 개발 가능

## 환경 변수
전체 샘플은 `.env.sample`에 정리되어 있습니다. 실행 환경에 맞게 필요한 항목만 설정하세요.

### 루트 `.env` 사용
Turborepo 환경에서 루트 `.env`를 공통 소스로 사용하도록 설정되어 있습니다.
- `apps/api`는 `apps/api/src/main.ts`에서 루트 `.env`를 로드합니다.
- `apps/web`, `apps/admin-web`은 `next.config.ts`에서 루트 `.env`를 로드합니다.

API 주요 항목:
- `PORT`: API 포트 (기본 4000)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`: PostgreSQL 접속 정보
- `TYPEORM_SYNC`: 개발 편의용 자동 스키마 sync
- `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`: 초기 관리자 계정 자동 생성 (비밀번호 미설정 시 서버 시작 시 랜덤 생성 후 로그 출력)
- `JWT_SECRET`, `JWT_EXPIRES_IN_SECONDS`: JWT 설정
- `AUTH_BYPASS`, `AUTH_BYPASS_USER_ID`, `AUTH_BYPASS_EMAIL`, `AUTH_BYPASS_ROLE`: 개발용 인증 우회
- `OIDC_*`: OIDC 로그인/콜백 설정
- `GITLAB_BASE_URL`, `GITLAB_TOKEN`: GitLab 연동
- `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`: LiteLLM 연동
- `OPENSEARCH_URL`, `OPENSEARCH_ADMIN_USERNAME`, `OPENSEARCH_ADMIN_PASSWORD`, `OPENSEARCH_INDEX_PREFIX`: OpenSearch(벡터DB) 연동 및 프로젝트별 인덱스 접두사
- `K8S_NOTEBOOK_*`, `NOTEBOOK_*`, `ALB_OIDC_*`: 노트북 프로비저닝 설정

Web/Admin Web:
- `BACKEND_URL`: API 베이스 URL
- `NEXT_PUBLIC_ADMIN_WEB_URL`: 웹에서 어드민 포탈 링크

Helm 배포 시에는 `helm/values.yaml`의 `api.env`에 동일 항목을 주입하도록 구성되어 있습니다.

## 배포
- API Dockerfile: `apps/api/Dockerfile`
- Web Dockerfile: `apps/web/Dockerfile`
- Admin Web Dockerfile: `apps/admin-web/Dockerfile`
- Helm: `helm/`
