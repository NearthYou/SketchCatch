# Template Board captures

이 폴더에는 카드용으로 다시 그린 축약도나 합성 SVG를 두지 않는다. 모든 파일은 로그인된
`DiagramEditor`가 실제 Template `DiagramJson`을 ReactFlow에 렌더링한 화면에서 만든 Board
캡처다.

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

`template-thumbnail-manifest.test.ts`가 모든 Template의 파일 존재, WebP 형식, 실제 해상도,
capture contract version, 현재 materialized layout hash를 함께 검사한다. Template layout을
바꾸고 캡처를 다시 만들지 않으면 이 테스트는 실패해야 한다.
