import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import {
  MOBILE_ORBIT_GLYPH_COUNT,
  type DecorativeOrbitComposition
} from "./option-resource-presentation";
import styles from "./workspace-ai.module.css";

const ORBIT_LAYER_GEOMETRY = [
  { aspect: 1, layer: 0, tilt: 0 },
  { aspect: 1, layer: 1, tilt: -11 },
  { aspect: 1.55, layer: 2, tilt: 8 }
] as const;

/** 실제 AWS icon을 원본 목업의 비원형 궤도 위에서 장식적으로 공전시킵니다. */
export function DecorativeAwsOrbit({
  composition,
  convergenceLevel,
  isConverging = false,
  reactionKey,
  visibleRingCount
}: {
  readonly composition: DecorativeOrbitComposition;
  readonly convergenceLevel: 0 | 1 | 2 | 3;
  readonly isConverging?: boolean | undefined;
  readonly reactionKey: string;
  readonly visibleRingCount: 0 | 1 | 2 | 3;
}) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const previousFingerprintRef = useRef(composition.fingerprint);
  const previousReactionKeyRef = useRef(reactionKey);

  useEffect(() => {
    const scene = sceneRef.current;
    const reactingClassName = styles.orbitSceneReacting;
    const optionReactingClassName = styles.orbitSceneOptionReacting;
    if (!scene || !reactingClassName || !optionReactingClassName) return;

    const didReactionChange = previousReactionKeyRef.current !== reactionKey;
    const didOptionCompositionChange =
      previousFingerprintRef.current !== composition.fingerprint;
    previousReactionKeyRef.current = reactionKey;
    previousFingerprintRef.current = composition.fingerprint;

    scene.classList.remove(reactingClassName);
    scene.classList.remove(optionReactingClassName);
    if (!didReactionChange || isConverging) return;

    void scene.offsetWidth;
    scene.classList.add(reactingClassName);
    if (didOptionCompositionChange) {
      scene.classList.add(optionReactingClassName);
    }

    return () => {
      scene.classList.remove(reactingClassName);
      scene.classList.remove(optionReactingClassName);
    };
  }, [composition.fingerprint, isConverging, reactionKey]);

  return (
    <div
      aria-hidden="true"
      className={styles.orbitScene}
      data-convergence={convergenceLevel}
      data-exiting={isConverging ? "true" : "false"}
      data-orbit-fingerprint={composition.fingerprint}
      inert
      ref={sceneRef}
    >
      <span className={styles.orbitCore} />
      {ORBIT_LAYER_GEOMETRY.map(({ aspect, layer, tilt }) => (
        <span
          className={styles.orbitLayerFrame}
          data-layer={layer}
          data-orbit-aspect={aspect}
          data-orbit-tilt={tilt}
          data-ring-visible={layer < visibleRingCount ? "true" : "false"}
          key={layer}
          style={
            {
              "--orbit-tilt": `${tilt}deg`,
              "--orbit-y-scale": 1 / aspect,
              "--orbit-y-scale-inverse": aspect
            } as CSSProperties
          }
        >
          <span className={styles.orbitRing} data-orbit-ring="true" />
          <span className={styles.orbitLayer} data-orbit-track="true">
            {composition.glyphs
              .map((glyph, index) => ({ glyph, index }))
              .filter(({ glyph }) => glyph.orbitLayer === layer)
              .map(({ glyph, index }) => (
                <span
                  className={styles.orbitGlyphPosition}
                  data-mobile-hidden={index >= MOBILE_ORBIT_GLYPH_COUNT ? "true" : "false"}
                  data-response-glyph={composition.responseGlyphIndex === index ? "true" : "false"}
                  key={`${glyph.resourceId}-${index}`}
                  style={
                    {
                      "--glyph-angle": `${glyph.angle}deg`,
                      "--glyph-scale": glyph.sizeScale
                    } as CSSProperties
                  }
                >
                  <span className={styles.orbitGlyphCounter}>
                    <span className={styles.orbitGlyphPlate}>
                      <img alt="" draggable={false} src={glyph.iconUrl} />
                    </span>
                  </span>
                </span>
              ))}
          </span>
        </span>
      ))}
    </div>
  );
}
