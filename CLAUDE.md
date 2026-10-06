# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:dev          # watch mode (default dev loop)
npm run build              # nest build -> dist/
npm run start:prod         # node dist/main
npm run lint               # eslint --fix over src, apps, libs, test
npm run format             # prettier over src and test

npm test                   # jest, rootDir=src, matches *.spec.ts
npm test -- user.service    # run one test file by path pattern
npm test -- -t "creates"    # run tests matching a name
npm run test:e2e           # jest --config ./test/jest-e2e.json
```

`.env` is loaded via `import 'dotenv/config'` at the top of both `src/main.ts` and `src/data-source.ts` (not `@nestjs/config`) — anything that reads `process.env` outside the Nest lifecycle must be reachable from one of those two entrypoints. See `.env.example` for the required variables.

## Architecture

NestJS 11 + TypeORM + MySQL REST API for managing event invitations. Every feature lives in `src/modules/<name>/` as the standard set: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`, `*.entity.ts`. Controllers only delegate; all rules live in services.

### Domain hierarchy

`Category → Event → Invitation`, a strict three-level chain. Both edges are `@ManyToOne(..., { eager: true })` with an explicit FK column (`categoryId`, `eventId`) alongside the relation object. Two invariants are enforced in services, not by database constraints:

- **Parent must exist on write** — `ensureCategoryExists` / `ensureEventExists` run on create and on update, throwing `BadRequestException` (400).
- **Parent cannot be deleted while referenced** — `CategoryService.remove` counts events, `EventService.remove` counts invitations, and each throws `ConflictException` (409) with the dependent count. This is why `CategoryModule` registers the `Event` repository and `EventModule` registers `Invitation`: a module imports the repositories of its _children_ purely to guard deletes.

An invitation has no `categoryId`; filtering by category goes through the relation (`where: { event: { categoryId } }` in `InvitationService.findAll`).

### The eager-relation update trap

Never `save()` a loaded Event or Invitation entity to apply changes. Because the parent relation is eager, the loaded entity carries a populated `category` / `event` object, and `save()` re-derives the FK from it, silently overwriting the new `categoryId` / `eventId`. Both services instead build a `Partial<Entity>` of only the changed columns and call `repository.update(id, changes)`, then re-read via `findOne`. Follow this pattern for any new entity with an eager parent.

### Image uploads

`S3Service` (`src/modules/upload/`) is the single upload path, exported by `UploadModule` and imported by Event and Invitation. Entities store the **full public S3 URL**, not the key; `deleteFile` recovers the key by stripping a prefix built from the bucket name and region, and returns silently when the URL does not match. Changing the URL format in `uploadFile` without matching `extractKeyFromUrl` will orphan every object in the bucket. Services delete the old object before uploading a replacement, and on entity delete.

Uploads arrive as `multipart/form-data` on the field name `image`, handled with `FileInterceptor('image')`. Image is required on create, optional on update.

### DTO coercion

Multipart and query-string values are always strings, so DTOs must coerce explicitly: `@Type(() => Number)` for numeric fields and a local `toBoolean` transform (`'true'`/`'false'` → boolean) for booleans, before the matching `class-validator` decorator. Controllers additionally apply `@UsePipes(new ValidationPipe({ transform: true }))` per route even though a global pipe is registered in `main.ts` — keep that in place on new upload/query routes. Pagination defaults (`page = 1`, `limit = 10`) are DTO field initializers, and list endpoints return `{ data, total, page, limit, totalPages }`.

### Auth

JWT bearer via Passport. `JwtAuthGuard` is applied **per route** with `@UseGuards(JwtAuthGuard)`; there is no global guard, so a new route is public unless it opts in. Deliberately public: `POST /user` (registration), `POST /auth/login`, `GET /`. Passwords are bcrypt-hashed in `UserService.create`; the JWT payload is `{ sub, email }` and `JwtStrategy.validate` passes it straight through to `request.user`. `JWT_SECRET` is read from `process.env` in two places — `auth.module.ts` and `jwt.strategy.ts` — and both fall back to `'dev-secret'`; keep them in sync.

Note that `User` entities are returned from controllers with the `password` field intact.

### Realtime chart stats (Socket.IO)

`GET /invitations/stats/by-event` returns invitation counts per event (`total` / `active` / `inactive`, plus `eventName` and `categoryId`) for a column chart. It starts from `events` with a LEFT JOIN, so events with no invitations appear as 0; mysql2 returns COUNT/SUM as strings, so `countByEvent` casts them with `Number()`.

`InvitationGateway` (default namespace, CORS from `FRONTEND_URL`) pushes the same data on the `invitation:stats-by-event` event as `{ source: 'invitation' | 'event', action: 'created' | 'updated' | 'deleted', id, stats }`. `stats` is always unfiltered; the FE filters by `categoryId` itself. Auth is a handshake middleware in `afterInit` that verifies the JWT from `auth.token` or the `Authorization` header using the `JwtService` exported by `AuthModule` — `JwtAuthGuard` does not apply to sockets.

Any write that changes what the chart shows must call `InvitationService.notifyStatsChanged(source, action, id)` after the DB write succeeds. Today that is invitation create/delete and updates to `eventId`/`active`, and event create/delete and updates to `name`/`categoryId`; name- or image-only invitation edits and image-only event edits skip it. The call is fire-and-forget and only logs on failure, so it never fails the REST request. `EventModule` imports `InvitationModule` (which exports `InvitationService`) for this — keep that edge one-way to avoid a module cycle.

### Schema management

`dataSourceOptions` in `src/data-source.ts` sets `synchronize: true`, so TypeORM reshapes tables to match entities on every boot. There are no migrations. Renaming an entity column reads as drop-plus-add and destroys that column's data — rename in the database first, or accept the loss. New entities must be added to the `entities` array there as well as to their module's `TypeOrmModule.forFeature`.

## Conventions

Explanatory comments in this codebase are written in Vietnamese; match the surrounding language when editing a file that has them.
