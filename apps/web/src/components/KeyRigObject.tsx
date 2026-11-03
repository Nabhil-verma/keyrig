import { useEffect, useRef, useState } from "react";

const AMBER = 0xf5b83d;
const CYAN = 0x3dd6c6;

/**
 * The hero object: the key rig as a 3D sculpture. The rig turns with the
 * pointer. three.js loads on demand, so a browser that does not support WebGL
 * shows the CSS fallback and pays nothing for the download.
 *
 * BR-09 applies to the brand mark, not to this object. BrandMark stays flat.
 */
export function KeyRigObject() {
  const host = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = host.current;
    if (mount === null) {
      return;
    }

    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      try {
        const THREE = await import("three");
        if (disposed) {
          return;
        }

        const measure = (): { width: number; height: number } => ({
          width: Math.max(mount.clientWidth, 220),
          height: Math.max(mount.clientHeight, 220),
        });

        const size = measure();
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(size.width, size.height, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        mount.appendChild(renderer.domElement);

        const world = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, size.width / size.height, 0.1, 120);
        camera.position.set(0, 0.2, 7.6);
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

        const amberMetal = trackMaterial(
          new THREE.MeshStandardMaterial({ color: AMBER, metalness: 0.62, roughness: 0.26 }),
        );
        const cyanGlow = trackMaterial(
          new THREE.MeshStandardMaterial({
            color: CYAN,
            emissive: new THREE.Color(CYAN),
            emissiveIntensity: 0.65,
            metalness: 0.2,
            roughness: 0.35,
          }),
        );

        const rig = new THREE.Group();
        world.add(rig);

        // The key head. The brand geometry uses a ring, a hub and three links.
        const head = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(1.38, 0.19, 28, 96)), amberMetal);
        head.position.x = -1.6;
        rig.add(head);

        const hub = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(0.17, 24, 18)), cyanGlow);
        hub.position.x = -1.6;
        rig.add(hub);

        for (let index = 0; index < 3; index += 1) {
          const angle = (index / 3) * Math.PI * 2;
          const length = 1.38;
          const link = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.02, 0.02, length, 8)), cyanGlow);
          link.position.set(-1.6 + Math.cos(angle) * (length / 2), Math.sin(angle) * (length / 2), 0);
          link.rotation.z = angle - Math.PI / 2;
          rig.add(link);

          const node = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(0.055, 16, 12)), cyanGlow);
          node.position.set(-1.6 + Math.cos(angle) * length, Math.sin(angle) * length, 0);
          rig.add(node);
        }

        // The shaft and the two teeth.
        const shaft = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.11, 0.11, 2.5, 24)), amberMetal);
        shaft.rotation.z = Math.PI / 2;
        shaft.position.x = 1.02;
        rig.add(shaft);

        const toothGeometry = trackGeometry(new THREE.BoxGeometry(0.17, 0.62, 0.17));
        const toothA = new THREE.Mesh(toothGeometry, amberMetal);
        toothA.position.set(1.78, -0.4, 0);
        rig.add(toothA);

        const toothB = new THREE.Mesh(toothGeometry, amberMetal);
        toothB.scale.y = 0.74;
        toothB.position.set(2.12, -0.31, 0);
        rig.add(toothB);

        // Centre the sculpture on the orbit origin.
        const box = new THREE.Box3().setFromObject(rig);
        const centre = box.getCenter(new THREE.Vector3());
        for (const child of rig.children) {
          child.position.sub(centre);
        }

        // Two thin orbits mark the link. Cyan is always the link (BR-02).
        const orbitMaterial = trackMaterial(
          new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.26 }),
        );
        const orbitGeometry = trackGeometry(new THREE.TorusGeometry(2.55, 0.007, 6, 180));
        const orbitA = new THREE.Mesh(orbitGeometry, orbitMaterial);
        orbitA.rotation.set(1.15, 0.2, 0.4);
        world.add(orbitA);

        const orbitB = new THREE.Mesh(orbitGeometry, orbitMaterial);
        orbitB.rotation.set(0.35, 1.05, -0.3);
        world.add(orbitB);

        // A small field of dust gives the depth that a flat page cannot show.
        const count = 220;
        const positions = new Float32Array(count * 3);
        for (let index = 0; index < count; index += 1) {
          const radius = 2.2 + Math.random() * 2.6;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
          positions[index * 3 + 1] = radius * Math.cos(phi);
          positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }
        const dustGeometry = trackGeometry(new THREE.BufferGeometry());
        dustGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const dustMaterial = trackMaterial(
          new THREE.PointsMaterial({
            color: 0xc6ced9,
            size: 0.038,
            transparent: true,
            opacity: 0.55,
            sizeAttenuation: true,
          }),
        );
        const dust = new THREE.Points(dustGeometry, dustMaterial);
        world.add(dust);

        world.add(new THREE.AmbientLight(0x8b93a1, 0.75));
        const keyLight = new THREE.DirectionalLight(0xf2f4f8, 2.1);
        keyLight.position.set(3.5, 5, 4);
        world.add(keyLight);
        const amberLight = new THREE.PointLight(AMBER, 26, 0, 2);
        amberLight.position.set(-4.5, -2.5, 3);
        world.add(amberLight);
        const cyanLight = new THREE.PointLight(CYAN, 18, 0, 2);
        cyanLight.position.set(4, 1.5, -3);
        world.add(cyanLight);

        const pointer = { x: 0, y: 0 };
        const onPointer = (event: PointerEvent): void => {
          pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
          pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
        };

        const render = (): void => renderer.render(world, camera);

        if (!reduced) {
          rig.rotation.set(-0.06, -0.4, 0.02);
          render();
        }

        let frame = 0;
        let running = false;
        const clock = new THREE.Clock();

        const draw = (): void => {
          const time = clock.getElapsedTime();
          rig.rotation.y = Math.sin(time * 0.22) * 0.28 + pointer.x * 0.42;
          rig.rotation.x = -0.06 + pointer.y * 0.18;
          rig.position.y = Math.sin(time * 0.75) * 0.06;
          orbitA.rotation.z = time * 0.06;
          orbitB.rotation.x = 1.05 + time * 0.05;
          dust.rotation.y = time * 0.02;
          camera.position.x = pointer.x * 0.22;
          camera.position.y = 0.2 - pointer.y * 0.16;
          camera.lookAt(0, 0, 0);
          render();
          frame = window.requestAnimationFrame(draw);
        };

        const start = (): void => {
          if (running || reduced || disposed) {
            return;
          }
          running = true;
          frame = window.requestAnimationFrame(draw);
        };

        const stop = (): void => {
          running = false;
          if (frame !== 0) {
            window.cancelAnimationFrame(frame);
            frame = 0;
          }
        };

        if (reduced) {
          rig.rotation.set(-0.08, -0.42, 0.02);
          render();
        } else {
          start();
          window.addEventListener("pointermove", onPointer, { passive: true });
        }

        const visible = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (!entry) {
              return;
            }
            if (entry.isIntersecting) {
              start();
            } else {
              stop();
            }
          },
          { threshold: 0.02 },
        );
        visible.observe(mount);

        const onVisibility = (): void => {
          if (document.hidden) {
            stop();
          } else {
            start();
          }
        };
        document.addEventListener("visibilitychange", onVisibility);

        const onResize = (): void => {
          const next = measure();
          renderer.setSize(next.width, next.height, false);
          camera.aspect = next.width / next.height;
          camera.updateProjectionMatrix();
          render();
        };
        const observer = new ResizeObserver(onResize);
        observer.observe(mount);

        cleanup = () => {
          stop();
          observer.disconnect();
          visible.disconnect();
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("pointermove", onPointer);
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

  return <div className="hp-object" ref={host} data-failed={failed} aria-hidden="true" />;
}
