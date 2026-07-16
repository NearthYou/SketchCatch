# Palette-backed Template/Module Resources

## Problem

- Template Resource는 대체로 Palette materializer를 통과하지만, Curated Module 10개의 71개 node는 generated artifact를 그대로 복제해 `iconUrl`이 모두 비어 있다.
- 일부 Template/Module Resource가 `enabled: false`인 catalog item을 사용해 왼쪽 Palette에서 직접 사용할 수 없다.
- Module provenance인 `metadata.moduleSource`를 API의 strict Diagram schema가 허용하지 않아 저장/Terraform 생성 요청이 거절될 수 있다.
- `workspace-seed` Resource를 포함한 Module은 원본 Terraform file을 같이 삽입하지 않으므로, 생성 대상에서 보존 처리만 되고 실제 HCL은 존재하지 않는다.

## Decision

Template와 Module의 Resource node는 모두 같은 Palette contract를 사용한다.

1. Terraform Resource node는 `(terraformBlockType, resourceType)`으로 정확히 하나의 enabled catalog item과 shared ResourceDefinition에 대응한다.
2. Resource node는 catalog item의 실제 public AWS icon asset을 사용한다. generic fallback이나 artifact에 복제한 icon 값은 정답으로 인정하지 않는다.
3. Region, AZ, Group 같은 presentation area는 `presentationCatalogItemId`로 정확한 Design catalog item을 사용한다.
4. `text`, `brainboard_shape` 같은 순수 시각 주석은 Terraform Resource가 아니며 Resource logo/deployment contract에서 제외한다.
5. Curated Module materialization은 Template와 같은 Palette node factory를 호출하되, source Terraform file이 없는 `workspace-seed` node는 Palette default parameters로 전환한다. authored label, geometry, 관계, containment와 해결된 parameter 값은 보존한다.
6. Module provenance는 Web, save API, Terraform API에서 동일하게 허용한다.

## Rejected alternatives

- Module에서 type별 icon만 덧붙이기: Palette node defaults와 parameter contract가 계속 분리된다.
- generated knowledge artifact에 icon/catalog 정보를 복제하기: catalog 변경 때 artifact가 쉽게 stale해진다.
- `workspace-seed` Module에 빈 Resource를 그대로 두기: 화면만 고치고 배포 불가 상태를 유지한다.

## Verification

- 모든 available Template와 Curated Module Resource가 enabled Palette item, 실제 icon file, Terraform preview/sync definition을 가진다.
- Module 삽입 후 API Diagram schema가 `moduleSource`를 보존한다.
- 모든 Module에서 생성한 Terraform에 각 Resource address가 존재하고 unresolved reference가 없다.
- repository Template 6개와 available Brainboard Template 전체의 Terraform file을 `terraform init -backend=false`와 `terraform validate`로 검사한다.
- 순수 시각 주석은 배포 Resource 수와 검증 대상에 포함하지 않는다.
