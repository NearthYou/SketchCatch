# 템플릿 보드 캡처

카드에 표시할 템플릿 이미지를 보관합니다. 로그인한 `DiagramEditor`에서 실제 `DiagramJson`을 ReactFlow로 렌더링한 화면을 캡처합니다. 축약도나 합성 SVG는 사용하지 않습니다.

## 갱신 절차

1. `/workspace/new?mode=template&templateId={templateId}`에서 Template을 실제 Board로 연다.
2. Board viewport를 `1280 × 720`, device scale factor를 `1`로 고정한다. 좌우 panel을 접고
   `Fit view`를 한 번 실행한다.
3. `document.fonts.ready`, 모든 Board icon의 `complete`, 연속 두 번의 animation frame을 기다려
   font, icon, edge routing이 안정된 뒤 캡처한다.
4. `[data-architecture-board-capture-source="true"]`인 ReactFlow root만 캡처한다. 브라우저 chrome,
   sidebar, 임시 selection, hover, tooltip은 포함하지 않는다.
5. `board-thumbnail-capture-contract.ts`와 동일하게 `1280 × 720`, `#f8fafc`, WebP로 저장한다.
6. 카드와 큰 미리보기에서 여섯 장을 확인한 다음 manifest의 해당 `diagramHash`를 현재
   materialized `DiagramJson` SHA-256으로 갱신한다.

Template 전용 자동 회귀 테스트는 유지하지 않는다. 갱신 시 위 계약을 수동으로 확인하고
`pnpm build`로 정적 asset 참조와 빌드 유효성을 확인한다.
