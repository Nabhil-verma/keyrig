import { describe, expect, it } from "vitest";
import { CUSTOM_MODEL_VALUE, modelOptions } from "./modelOptions";

describe("PV-11 the model picker lists the provider and catalog names", () => {
  it("puts the current model first and keeps the provider names before the catalog names", () => {
    expect(modelOptions(["catalog-a", "catalog-b"], ["provider-b", "provider-a"], "provider-a")).toEqual([
      "provider-a",
      "provider-b",
      "catalog-a",
      "catalog-b",
    ]);
  });

  it("keeps one entry for a name that the provider and the catalog both hold", () => {
    expect(modelOptions(["shared", "catalog-a"], ["shared"], "")).toEqual(["shared", "catalog-a"]);
  });

  it("leaves out an empty name and trims the spaces", () => {
    expect(modelOptions(["  "], ["  model-a  "], "")).toEqual(["model-a"]);
    expect(modelOptions([], [], "")).toEqual([]);
  });

  it("keeps the value of the custom option out of the model names", () => {
    expect(modelOptions([], ["model-a"], "")).not.toContain(CUSTOM_MODEL_VALUE);
  });
});
