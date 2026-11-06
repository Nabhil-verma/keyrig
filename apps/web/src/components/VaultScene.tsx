import { useEffect, useRef, useState } from "react";
import { shouldAnimateVaultScene, vaultScenePixelRatio } from "../lib/vaultScene";

const AMBER = 0xf5b83d;
const CYAN = 0x3dd6c6;

/**
 * Backlog #10: the first-run and vault-unlock scene.
 *
 * The scene is a small WebGL canvas with low-segment geometry and no shadows.
 * It renders only while the tab is visible and the canvas is on screen. With
 * reduced motion it draws one still frame. three.js loads on demand, so a
 * person who skips the scene pays for no renderer.
 */
export function VaultScene({ onSkip }: { onSkip: () => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = host.current;
    if (mount === null) {
      return;
    }
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      try {
        const THREE = await import("three");
        if (disposed) {
          return;
        }

        const measure = (): { width: number; height: number } => ({
          width: Math.max(mount.clientWidth, 240),
          height: Math.max(mount.clientHeight, 160),
        });
        const size = measure();
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
        });
        renderer.setPixelRatio(vaultScenePixelRatio(window.devicePixelRatio || 1));
        renderer.setSize(size.width, size.height, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        mount.appendChild(renderer.domElement);

        const world = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, size.width / size.height, 0.1, 60);
        camera.position.set(0, 0.15, 7.4);
        camera.lookAt(0, 0, 0);

        const geometries: import("three").BufferGeometry[] = [];
        const materials: import("three").Material[] = [];
        const trackGeometry = <T extends import("three").BufferGeometry,>(geometry: T): T => {
          geometries.push(geometry);
          return geometry;
        };
        const trackMaterial = <T extends import("three").Material,>(material: T): T => {
          materials.push(material);
          return material;
        };

        const amber = trackMaterial(
          new THREE.MeshStandardMaterial({ color: AMBER, metalness: 0.6, roughness: 0.28 }),
        );
        const cyan = trackMaterial(
          new THREE.MeshStandardMaterial({
            color: CYAN,
            emissive: new THREE.Color(CYAN),
            emissiveIntensity: 0.55,
            metalness: 0.2,
            roughness: 0.4,
          }),
        );

        const rig = new THREE.Group();
        world.add(rig);

        // The key head, the hub and three links. Amber is the key, cyan the link.
        const head = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(1.3, 0.18, 16, 48)), amber);
        head.position.x = -1.55;
        rig.add(head);

        const hub = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(0.16, 16, 12)), cyan);
        hub.position.x = -1.55;
        rig.add(hub);

        for (let index = 0; index < 3; index += 1) {
          const angle = (index / 3) * Math.PI * 2;
          const length = 1.3;
          const link = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.02, 0.02, length, 6)), cyan);
          link.position.set(-1.55 + Math.cos(angle) * (length / 2), Math.sin(angle) * (length / 2), 0);
          link.rotation.z = angle - Math.PI / 2;
          rig.add(link);

          const node = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(0.055, 10, 8)), cyan);
          node.position.set(-1.55 + Math.cos(angle) * length, Math.sin(angle) * length, 0);
          rig.add(node);
        }

        const shaft = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 12)), amber);
        shaft.rotation.z = Math.PI / 2;
        shaft.position.x = 1;
        rig.add(shaft);

        const toothGeometry = trackGeometry(new THREE.BoxGeometry(0.16, 0.58, 0.16));
        const toothA = new THREE.Mesh(toothGeometry, amber);
        toothA.position.set(1.72, -0.38, 0);
        rig.add(toothA);

        const toothB = new THREE.Mesh(toothGeometry, amber);
        toothB.scale.y = 0.74;
        toothB.position.set(2.04, -0.3, 0);
        rig.add(toothB);

        // Centre the key on the camera target.
        const box = new THREE.Box3().setFromObject(rig);
        const centre = box.getCenter(new THREE.Vector3());
        for (const child of rig.children) {
          child.position.sub(centre);
        }

        const orbit = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(2.35, 0.006, 4, 96)),
          trackMaterial(new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.24 })),
        );
        orbit.rotation.set(1.1, 0.2, 0.4);
        world.add(orbit);

        world.add(new THREE.AmbientLight(0x8b93a1, 0.85));
        const keyLight = new THREE.DirectionalLight(0xf2f4f8, 2.1);
        keyLight.position.set(3.5, 5, 4);
        world.add(keyLight);

        rig.rotation.set(-0.08, -0.42, 0.02);

        let frame = 0;
        let running = false;
        let visible = true;
        const motionQuery =
          typeof window.matchMedia === "function"
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : null;
        let reduced = motionQuery?.matches ?? false;
        const startedAt = performance.now();

        const setRunning = (next: boolean): void => {
          mount.dataset.running = String(next);
        };
        const render = (): void => renderer.render(world, camera);
        // Read the document state each time. A tab that was hidden during load
        // sends no later event, so a snapshot can leave the scene paused.
        const shouldAnimate = (): boolean =>
          !disposed &&
          shouldAnimateVaultScene({ reducedMotion: reduced, hidden: document.hidden, visible });

        const tick = (): void => {
          if (!shouldAnimate()) {
            running = false;
            setRunning(false);
            return;
          }
          const time = (performance.now() - startedAt) / 1000;
          rig.rotation.y = -0.42 + Math.sin(time * 0.24) * 0.22;
          rig.rotation.x = -0.08 + Math.cos(time * 0.18) * 0.04;
          rig.position.y = Math.sin(time * 0.6) * 0.04;
          orbit.rotation.z = 0.4 + time * 0.05;
          render();
          frame = window.requestAnimationFrame(tick);
        };

        const start = (): void => {
          // A sync while the loop runs must not mark the scene as stopped.
          if (running) {
            return;
          }
          if (!shouldAnimate()) {
            setRunning(false);
            return;
          }
          running = true;
          setRunning(true);
          frame = window.requestAnimationFrame(tick);
        };

        const stop = (): void => {
          running = false;
          if (frame !== 0) {
            window.cancelAnimationFrame(frame);
            frame = 0;
          }
          setRunning(false);
        };

        const sync = (): void => {
          if (shouldAnimate()) {
            start();
            return;
          }
          stop();
          if (!document.hidden) {
            render();
          }
        };

        mount.dataset.motion = reduced ? "still" : "full";
        render();
        sync();

        const onVisibility = (): void => {
          sync();
        };
        document.addEventListener("visibilitychange", onVisibility);

        const intersection = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (entry === undefined) {
              return;
            }
            visible = entry.isIntersecting;
            sync();
          },
          { threshold: 0.02 },
        );
        intersection.observe(mount);

        const onMotion = (): void => {
          reduced = motionQuery?.matches ?? false;
          mount.dataset.motion = reduced ? "still" : "full";
          sync();
        };
        motionQuery?.addEventListener("change", onMotion);

        const onResize = (): void => {
          const next = measure();
          renderer.setSize(next.width, next.height, false);
          camera.aspect = next.width / next.height;
          camera.updateProjectionMatrix();
          if (!running) {
            render();
          }
        };
        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(mount);

        cleanup = () => {
          stop();
          resizeObserver.disconnect();
          intersection.disconnect();
          document.removeEventListener("visibilitychange", onVisibility);
          motionQuery?.removeEventListener("change", onMotion);
          for (const geometry of geometries) {
            geometry.dispose();
          }
          for (const material of materials) {
            material.dispose();
          }
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!disposed) {
          setFailed(true);
        }
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <figure className="vault-scene" aria-labelledby="vault-scene-title">
      <div className="vault-scene-head">
        <span className="eyebrow eyebrow--amber">The vault</span>
        <strong id="vault-scene-title">Your key. Your link.</strong>
        <button type="button" className="btn btn--quiet btn--sm vault-scene-skip" onClick={onSkip}>
          Skip the scene
        </button>
      </div>
      <div className="vault-scene-canvas" ref={host} data-failed={failed} aria-hidden="true" />
      <figcaption>Amber is the key. Cyan is the link. The scene stays in this browser.</figcaption>
    </figure>
  );
}
