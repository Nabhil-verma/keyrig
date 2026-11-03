import { useEffect, useRef, useState } from "react";
import type { KeyrigScene } from "@keyrig/core";
import { Icon } from "./ui/Icon";

/**
 * keyrig renders the scene. The model sends data only, so a scene cannot run
 * code. three.js loads on demand, so a chat without a scene pays nothing.
 */
export function SceneView({ scene }: { scene: KeyrigScene }) {
  const host = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        const measure = (): { width: number; height: number } => {
          const width = Math.max(mount.clientWidth, 240);
          return { width, height: Math.min(Math.max(Math.round(width * 0.62), 220), 420) };
        };
        const size = measure();
        // The buffer stays, so the user can save the scene as an image.
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(size.width, size.height, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = `${size.height}px`;
        renderer.domElement.style.touchAction = "none";
        mount.appendChild(renderer.domElement);

        const world = new THREE.Scene();
        world.background = new THREE.Color(scene.background);
        const camera = new THREE.PerspectiveCamera(scene.camera.fov, size.width / size.height, 0.1, 2000);

        const target = new THREE.Vector3(...scene.camera.lookAt);
        const start = new THREE.Vector3(...scene.camera.position);
        let radius = Math.max(start.length(), 2);
        let theta = Math.atan2(start.x, start.z);
        let phi = Math.acos(Math.min(1, Math.max(-1, start.y / radius)));
        const place = (): void => {
          const x = radius * Math.sin(phi) * Math.sin(theta);
          const y = radius * Math.cos(phi);
          const z = radius * Math.sin(phi) * Math.cos(theta);
          camera.position.set(target.x + x, target.y + y, target.z + z);
          camera.lookAt(target);
        };
        place();

        const geometries: import("three").BufferGeometry[] = [];
        const materials: import("three").Material[] = [];
        for (const node of scene.nodes) {
          const geometry =
            node.type === "box"
              ? new THREE.BoxGeometry(1, 1, 1)
              : node.type === "sphere"
                ? new THREE.SphereGeometry(0.5, 32, 20)
                : node.type === "cylinder"
                  ? new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
                  : node.type === "cone"
                    ? new THREE.ConeGeometry(0.5, 1, 32)
                    : node.type === "torus"
                      ? new THREE.TorusGeometry(0.5, 0.2, 16, 48)
                      : new THREE.PlaneGeometry(1, 1);
          const material = new THREE.MeshStandardMaterial({
            color: node.color,
            metalness: node.metalness,
            roughness: node.roughness,
            ...(node.type === "plane" ? { side: THREE.DoubleSide } : {}),
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(node.position[0], node.position[1], node.position[2]);
          mesh.rotation.set(
            node.rotation[0],
            node.rotation[1],
            node.rotation[2] + (node.type === "plane" ? -Math.PI / 2 : 0),
          );
          mesh.scale.set(node.scale[0], node.scale[1], node.scale[2]);
          world.add(mesh);
          geometries.push(geometry);
          materials.push(material);
        }

        for (const light of scene.lights) {
          if (light.type === "ambient") {
            world.add(new THREE.AmbientLight(light.color, light.intensity));
          } else if (light.type === "directional") {
            const item = new THREE.DirectionalLight(light.color, light.intensity);
            const at = light.position ?? [4, 6, 5];
            item.position.set(at[0], at[1], at[2]);
            world.add(item);
          } else {
            const item = new THREE.PointLight(light.color, light.intensity, 0, 2);
            const at = light.position ?? [0, 3, 0];
            item.position.set(at[0], at[1], at[2]);
            world.add(item);
          }
        }

        const grid = new THREE.GridHelper(24, 24, 0x272e3b, 0x1d2430);
        world.add(grid);

        const draw = (): void => renderer.render(world, camera);
        draw();

        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        const canvas = renderer.domElement;
        canvasRef.current = canvas;
        setReady(true);

        const onDown = (event: PointerEvent): void => {
          dragging = true;
          lastX = event.clientX;
          lastY = event.clientY;
          canvas.setPointerCapture(event.pointerId);
        };
        const onMove = (event: PointerEvent): void => {
          if (!dragging) {
            return;
          }
          theta -= (event.clientX - lastX) * 0.01;
          phi = Math.min(Math.PI - 0.08, Math.max(0.08, phi - (event.clientY - lastY) * 0.01));
          lastX = event.clientX;
          lastY = event.clientY;
          place();
          draw();
        };
        const onUp = (event: PointerEvent): void => {
          dragging = false;
          if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
          }
        };
        const onWheel = (event: WheelEvent): void => {
          event.preventDefault();
          radius = Math.min(80, Math.max(1.5, radius + event.deltaY * 0.01));
          place();
          draw();
        };
        const onResize = (): void => {
          const next = measure();
          renderer.setSize(next.width, next.height, false);
          renderer.domElement.style.height = `${next.height}px`;
          camera.aspect = next.width / next.height;
          camera.updateProjectionMatrix();
          draw();
        };

        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointercancel", onUp);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        const observer = new ResizeObserver(onResize);
        observer.observe(mount);

        cleanup = () => {
          observer.disconnect();
          canvas.removeEventListener("pointerdown", onDown);
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp);
          canvas.removeEventListener("pointercancel", onUp);
          canvas.removeEventListener("wheel", onWheel);
          for (const geometry of geometries) {
            geometry.dispose();
          }
          for (const material of materials) {
            material.dispose();
          }
          renderer.dispose();
          canvas.remove();
          canvasRef.current = null;
        };
      } catch {
        if (!disposed) {
          setError("keyrig cannot start the 3D renderer. This browser may block WebGL.");
        }
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [scene]);

  /** Save one frame of the scene. The file stays on this device. */
  const saveImage = (): void => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    canvas.toBlob((blob) => {
      if (blob === null) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "keyrig-scene.png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <figure className="scene">
      <figcaption className="scene-head">
        <span className="eyebrow eyebrow--cyan">3D scene</span>
        <strong>{scene.title}</strong>
        <span className="chip">
          {scene.nodes.length} {scene.nodes.length === 1 ? "node" : "nodes"}
        </span>
        <button
          type="button"
          className="btn btn--quiet btn--sm scene-save"
          disabled={!ready}
          onClick={saveImage}
        >
          <Icon name="download" size={12} />
          Save image
        </button>
      </figcaption>
      <div className="scene-canvas" ref={host} />
      {error !== null ? <p className="hint">{error}</p> : <p className="hint">Drag to turn the scene. Use the wheel to zoom.</p>}
    </figure>
  );
}
