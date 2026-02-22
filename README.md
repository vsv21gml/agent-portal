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
2. `pnpm install`
3. `pnpm dev`

기본 포트:
- web: `http://localhost:3000`
- admin-web: `http://localhost:3100`
- api: `http://localhost:4000`

개발 편의 인증 우회:
- API 실행 시 `AUTH_BYPASS=true` 설정하면 JWT 없이 개발 가능

## 배포
- API Dockerfile: `apps/api/Dockerfile`
- Web Dockerfile: `apps/web/Dockerfile`
- Admin Web Dockerfile: `apps/admin-web/Dockerfile`
- Helm: `helm/`
