import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import {
  MOBILE_ORBIT_GLYPH_COUNT,
  type DecorativeOrbitComposition
} from "./option-resource-presentation";
import styles from "./workspace-ai.module.css";

export function DecorativeAwsOrbit({
  composition,
  isExiting = false
}: {
  readonly composition: DecorativeOrbitComposition;
  readonly isExiting?: boolean | undefined;
}) {
  const sceneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const reactingClassName = styles.orbitSceneReacting;
    if (!scene || !reactingClassName) return;

    scene.classList.remove(reactingClassName);
    if (composition.responseGlyphIndex === null) return;

    void scene.offsetWidth;
    scene.classList.add(reactingClassName);

    return () => scene.classList.remove(reactingClassName);
  }, [composition.fingerprint, composition.responseGlyphIndex]);

  return (
    <div
      aria-hidden="true"
      className={styles.orbitScene}
      data-exiting={isExiting ? "true" : "false"}
      data-orbit-fingerprint={composition.fingerprint}
      data-reacting={composition.responseGlyphIndex === null ? "false" : "true"}
      inert
      ref={sceneRef}
    >
      <span className={styles.orbitCore} />
      {[0, 1, 2].map((layer) => (
        <span className={styles.orbitLayerFrame} data-layer={layer} key={layer}>
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
