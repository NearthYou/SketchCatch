import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import {
  MOBILE_ORBIT_GLYPH_COUNT,
  type DecorativeOrbitComposition
} from "./option-resource-presentation";
import styles from "./workspace-ai.module.css";

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
      {[0, 1, 2].map((layer) => (
        <span
          className={styles.orbitLayerFrame}
          data-layer={layer}
          data-ring-visible={layer < visibleRingCount ? "true" : "false"}
          key={layer}
        >
          <span className={styles.orbitLayer}>
            <span className={styles.orbitRing} />
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
