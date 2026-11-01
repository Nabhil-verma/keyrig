import { describe, expect, it } from "vitest";
import { MAX_SCENE_NODES, emptyScene, parseScene } from "../chat/scene";

describe("the 3D scene reader", () => {
  it("reads a node and rounds the numbers", () => {
    const scene = parseScene({ nodes: [{ type: "box", position: [1.23456, 2, 3] }] });
    expect(scene.kind).toBe("keyrig.scene");
    expect(scene.version).toBe(1);
    expect(scene.nodes[0]?.position).toEqual([1.235, 2, 3]);
    expect(scene.nodes[0]?.rotation).toEqual([0, 0, 0]);
  });

  it("keeps a hex colour and replaces a word", () => {
    expect(parseScene({ nodes: [{ type: "sphere", color: "#3DD6C6" }] }).nodes[0]?.color).toBe("#3dd6c6");
    expect(parseScene({ nodes: [{ type: "sphere", color: "red" }] }).nodes[0]?.color).toBe("#f5b83d");
  });

  it("clamps a value that is outside the range", () => {
    const scene = parseScene({ nodes: [{ type: "box", scale: [8, 1, 1], metalness: 9, roughness: -2 }] });
    expect(scene.nodes[0]?.scale[0]).toBe(8);
    expect(scene.nodes[0]?.metalness).toBe(1);
    expect(scene.nodes[0]?.roughness).toBe(0);
  });

  it("refuses a scale that is far too large", () => {
    expect(() => parseScene({ nodes: [{ type: "box", scale: [200, 1, 1] }] })).toThrow(/larger than 100/);
  });

  it("gives an id to a node and one id to each of two equal ids", () => {
    const scene = parseScene({ nodes: [{ type: "box", id: "a" }, { type: "box", id: "a" }] });
    expect(scene.nodes[0]?.id).toBe("a");
    expect(scene.nodes[1]?.id).toBe("a_2");
  });

  it("adds a light when the model sends none", () => {
    expect(parseScene({ nodes: [{ type: "box" }] }).lights.length).toBe(3);
  });

  it("refuses a scene with no node", () => {
    expect(() => parseScene({ nodes: [] })).toThrow();
    expect(() => parseScene({})).toThrow();
  });

  it("refuses an unknown node type", () => {
    expect(() => parseScene({ nodes: [{ type: "dragon" }] })).toThrow(/type/);
  });

  it("refuses a number that is not finite", () => {
    expect(() => parseScene({ nodes: [{ type: "box", position: [0, Number.POSITIVE_INFINITY, 0] }] })).toThrow();
  });

  it("refuses a vector with two numbers", () => {
    expect(() => parseScene({ nodes: [{ type: "box", position: [0, 1] }] })).toThrow(/three numbers/);
  });

  it("refuses more nodes than the limit", () => {
    const nodes = Array.from({ length: MAX_SCENE_NODES + 1 }, () => ({ type: "box" }));
    expect(() => parseScene({ nodes })).toThrow(/200/);
  });

  it("builds the small scene for a preview", () => {
    expect(emptyScene("Preview").nodes).toHaveLength(1);
    expect(emptyScene("Preview").title).toBe("Preview");
  });
});
