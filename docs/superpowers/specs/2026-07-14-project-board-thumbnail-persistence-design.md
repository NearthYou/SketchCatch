# Project Board 캡처 영속화 설계

## 목적

Dashboard의 프로젝트 카드에는 임의로 다시 그린 도식이 아니라 Workspace에서 실제로 렌더링된 Board 캡처를 표시한다. 로컬 개발 환경에서는 AWS 자격 증명 없이도 캡처가 저장되어야 하며, 프로덕션은 기존 S3 저장 계약을 유지한다.

## 확인된 실패 원인

- 현재 Project asset 저장 인터페이스와 route가 `S3_BUCKET_NAME`에 직접 결합되어 있다.
- 로컬 API에 S3 자격 증명이 없으면 thumbnail PUT이 실패한다.
- 실패한 pending asset은 abort에서 제거되고, Workspace는 capture Promise의 오류를 버린다.
- Template 등으로 시작한 프로젝트는 Board가 mount되기 전에 server draft가 저장되므로 최초 캡처 기회가 없다.
- 기존 server draft를 다시 열어도 누락된 thumbnail을 보충하지 않는다.
- Dashboard는 최초 404 이후 다시 조회하지 않아, 업로드와 화면 이동이 경합하면 계속 빈 상태로 남는다.

## 저장소 경계

`ProjectAssetStorage`는 provider-neutral deep module로 분리한다.

```ts
type ProjectAssetStorage = {
  putObject(input: {
    objectKey: string;
    contentType: string;
    body: Buffer | string;
  }): Promise<void>;
  getObject(input: { objectKey: string }): Promise<Buffer>;
  deleteObject(input: { objectKey: string }): Promise<void>;
  objectExists(input: {
    objectKey: string;
    byteSize: number | null;
  }): Promise<boolean>;
};
```

- S3 bucket은 S3 adapter 생성 시 주입하고 route에는 노출하지 않는다.
- 현재 호출되지 않는 `createUploadUrl`은 제거한다. 브라우저 업로드는 기존 same-origin `upload-content` API를 유지한다.
- `NODE_ENV=production` 기본값은 S3이고 `S3_BUCKET_NAME`이 반드시 필요하다.
- development/test 기본값은 filesystem이다. `PROJECT_ASSET_STORAGE_BACKEND`와 `PROJECT_ASSET_STORAGE_ROOT`로 로컬 테스트와 운영 구성을 명시할 수 있다.
- production에서 filesystem 선택은 거부해 배포 환경이 로컬 디스크에 조용히 저장되는 일을 막는다.
- 프로젝트 삭제도 동일한 asset adapter를 사용해 filesystem object가 orphan으로 남지 않게 한다.
- DB metadata의 `contentType`을 응답에 사용하므로 filesystem sidecar metadata는 만들지 않는다.

Filesystem adapter는 object key의 절대 경로, 역슬래시, NUL, `.`과 `..` segment를 거부하고 root containment를 재검증한다. symlink를 통한 root 이탈도 거부한다. write는 같은 디렉터리의 임시 파일에 쓴 뒤 rename하고, delete는 멱등이며 빈 상위 디렉터리를 root 전까지만 정리한다. 기본 root는 API 실행 위치의 `.local-data/project-assets`이며 저장 파일은 Git에 포함하지 않는다.

## 캡처 생명주기

- 실제 캡처 대상은 기존 `data-architecture-board-capture-source="true"` ReactFlow DOM이다.
- `DiagramEditor`는 ReactFlow 초기화 시 정확한 capture element를 `onBoardReady`로 전달한다. 전역 selector에만 의존해 다른 화면의 Board를 잘못 캡처하지 않는다.
- server draft를 로드한 Workspace는 Board가 준비된 뒤 thumbnail 존재 여부를 확인한다. 없으면 실제 Board를 한 번 캡처해 신규 Template 프로젝트와 기존 누락 프로젝트를 보충한다.
- local-only 또는 empty draft는 server 저장 전 canonical thumbnail을 만들지 않는다.
- 안정된 server save 성공 후 thumbnail upload를 await한다. draft 저장 성공과 thumbnail 실패는 의미상 분리하되, 실패를 숨기지 않고 짧은 실패 상태와 재시도 동작을 노출한다.
- 같은 프로젝트의 동시 capture는 기존 직렬화 계약을 유지하고, 전달된 최신 capture element를 사용한다.
- Dashboard로 이동하는 일반 링크는 server save와 capture가 끝난 뒤 이동한다. pagehide는 보장 가능한 저장 수단으로 취급하지 않으며, 다음 Workspace mount의 누락 보충을 복구 경로로 둔다.

## Dashboard 조회

Dashboard 카드는 인증된 thumbnail endpoint가 404 또는 일시 오류를 반환하면 제한된 횟수만 다시 조회한다. 무한 polling은 하지 않는다. 캡처가 끝난 뒤 Dashboard가 mount되면 즉시 최신 object를 읽으며, 이전 object URL은 cleanup에서 해제한다.

## 사용자 표시

- 정상 저장은 기존 `저장되었습니다.` 표시를 유지한다.
- thumbnail만 실패한 경우에만 `미리보기 저장 실패`와 `다시 시도`를 표시한다.
- 저장 상태 자체를 실패로 바꾸거나 긴 설명 문구를 추가하지 않는다.
- Dashboard의 실제 캡처가 없는 상태 문구는 유지하되, 합성 preview로 대체하지 않는다.

## 범위와 제약

- DB schema와 migration은 변경하지 않는다.
- 기존 thumbnail asset에는 draft revision이 없으므로 세션을 넘어 이미지와 revision의 완전한 일치까지 증명하지 않는다.
- 이미 누락된 프로젝트는 실제 Board를 열었을 때 보충된다. Dashboard에서 draft를 합성 렌더링해 가짜 캡처를 만들지 않는다.

## 검증

- filesystem adapter의 binary/string round-trip, size 검사, traversal/symlink 거부, atomic write cleanup, 멱등 delete를 검증한다.
- storage factory의 development/test filesystem 기본값과 production S3 fail-closed를 검증한다.
- route에서 thumbnail PUT/GET/confirm/abort/prune와 프로젝트 삭제가 같은 adapter를 사용하는지 검증한다.
- actual element capture, server-draft 최초 backfill, save await, 실패 노출과 retry, Dashboard bounded retry를 검증한다.
- Web/API test, typecheck, lint, harness, `git diff --check`를 실행한다.
