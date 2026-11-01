import { KeyrigError } from "@keyrig/shared";

/**
 * The 3D scene format.
 *
 * The model sends scene data. keyrig renders the data with three.js in the
 * browser. The model never runs a renderer, so a scene cannot start code.
 * Every number, colour and count is checked before the render.
 */

export const SCENE_KIND = "keyrig.scene";
export const SCENE_VERSION = 1;
export const MAX_SCENE_NODES = 200;
export const MAX_SCENE_LIGHTS = 8;
export const MAX_SCENE_NUMBER = 1000;

export const SCENE_NODE_TYPES = ["box", "sphere", "cylinder", "cone", "torus", "plane"] as const;
export type SceneNodeType = (typeof SCENE_NODE_TYPES)[number];

export type Vector3 = [number, number, number];

export interface SceneNode {
  id: string;
  type: SceneNodeType;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  color: string;
  metalness: number;
  roughness: number;
}

export interface SceneLight {
  type: "ambient" | "directional" | "point";
  color: string;
  intensity: number;
  position?: Vector3;
}

export interface SceneCamera {
  position: Vector3;
  lookAt: Vector3;
  fov: number;
}

export interface KeyrigScene {
  kind: typeof SCENE_KIND;
  version: typeof SCENE_VERSION;
  title: string;
  background: string;
  camera: SceneCamera;
  nodes: SceneNode[];
  lights: SceneLight[];
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function invalid(message: string): never {
  throw KeyrigError.fromCategory("invalid_request", {
    code: "scene_invalid",
    message,
    action: "none",
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function vector(value: unknown, fallback: Vector3, limit = MAX_SCENE_NUMBER): Vector3 {
  if (value === undefined) {
    return fallback;
  }
  if (!Array.isArray(value) || value.length !== 3) {
    invalid("Every position, rotation and scale needs three numbers.");
  }
  return (value as unknown[]).map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item) || Math.abs(item) > limit) {
      invalid(`A scene number is missing, not finite, or larger than ${limit}.`);
    }
    return round(item as number);
  }) as Vector3;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return round(Math.min(max, Math.max(min, value)));
}

function readNode(value: unknown, index: number, ids: Set<string>): SceneNode {
  if (!isPlainObject(value)) {
    invalid(`Node ${index + 1} must be an object.`);
  }
  const type = value.type;
  if (typeof type !== "string" || !(SCENE_NODE_TYPES as readonly string[]).includes(type)) {
    invalid(`Node ${index + 1} needs a type from: ${SCENE_NODE_TYPES.join(", ")}.`);
  }
  let id = typeof value.id === "string" && value.id.trim().length > 0 ? value.id.trim().slice(0, 40) : `node_${index + 1}`;
  if (ids.has(id)) {
    id = `${id}_${index + 1}`;
  }
  ids.add(id);
  return {
    id,
    type: type as SceneNodeType,
    position: vector(value.position, [0, 0, 0]),
    rotation: vector(value.rotation, [0, 0, 0], Math.PI * 8),
    scale: vector(value.scale, [1, 1, 1], 100),
    color: color(value.color, "#f5b83d"),
    metalness: numberInRange(value.metalness, 0.1, 0, 1),
    roughness: numberInRange(value.roughness, 0.55, 0, 1),
  };
}

function readLight(value: unknown, index: number): SceneLight {
  if (!isPlainObject(value)) {
    invalid(`Light ${index + 1} must be an object.`);
  }
  const type = value.type;
  if (type !== "ambient" && type !== "directional" && type !== "point") {
    invalid(`Light ${index + 1} needs the type ambient, directional or point.`);
  }
  return {
    type,
    color: color(value.color, "#ffffff"),
    intensity: numberInRange(value.intensity, 1, 0, 20),
    ...(type === "ambient" ? {} : { position: vector(value.position, [4, 6, 5]) }),
  };
}

/** Read one scene. A broken value is an error with a message for the model. */
export function parseScene(input: unknown): KeyrigScene {
  if (!isPlainObject(input)) {
    invalid("The scene must be one object.");
  }
  const rawNodes = input.nodes;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    invalid("The scene needs at least one node.");
  }
  if (rawNodes.length > MAX_SCENE_NODES) {
    invalid(`The scene has more than ${MAX_SCENE_NODES} nodes.`);
  }

  const ids = new Set<string>();
  const nodes = (rawNodes as unknown[]).map((node, index) => readNode(node, index, ids));

  const rawLights = input.lights;
  const lights =
    rawLights === undefined
      ? ([
          { type: "ambient", color: "#ffffff", intensity: 0.6 },
          { type: "directional", color: "#ffffff", intensity: 1.6, position: [4, 6, 5] },
          { type: "directional", color: "#3dd6c6", intensity: 0.5, position: [-5, 3, -4] },
        ] as SceneLight[])
      : Array.isArray(rawLights)
        ? (rawLights as unknown[]).map((light, index) => readLight(light, index))
        : invalid("The lights must be a list.");

  if (lights.length > MAX_SCENE_LIGHTS) {
    invalid(`The scene has more than ${MAX_SCENE_LIGHTS} lights.`);
  }

  const rawCamera = isPlainObject(input.camera) ? input.camera : {};
  const camera: SceneCamera = {
    position: vector(rawCamera.position, [5, 4, 7]),
    lookAt: vector(rawCamera.lookAt, [0, 0, 0]),
    fov: numberInRange(rawCamera.fov, 45, 10, 100),
  };

  return {
    kind: SCENE_KIND,
    version: SCENE_VERSION,
    title: typeof input.title === "string" && input.title.trim().length > 0 ? input.title.trim().slice(0, 120) : "Scene",
    background: color(input.background, "#0e1116"),
    camera,
    nodes,
    lights,
  };
}

/** A small scene, used by a preview and by a test. */
export function emptyScene(title = "Scene"): KeyrigScene {
  return parseScene({
    title,
    nodes: [{ type: "box", position: [0, 0.5, 0], color: "#f5b83d" }],
    camera: { position: [4, 3, 6] },
  });
}
