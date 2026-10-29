import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@keyrig/shared";
import { MAX_SKILLS, addSkill, listSkills, removeSkill } from "./skills";

describe("a skill is a saved prompt", () => {
  it("adds a skill and reads it back", () => {
    const storage = createMemoryStorage();
    const skill = addSkill({ name: "  Review  ", prompt: "  Check this diff.  " }, storage);
    expect(skill.name).toBe("Review");
    expect(skill.prompt).toBe("Check this diff.");
    expect(listSkills(storage)).toEqual([skill]);
  });

  it("keeps the newest skill first", () => {
    const storage = createMemoryStorage();
    addSkill({ name: "First", prompt: "one" }, storage);
    addSkill({ name: "Second", prompt: "two" }, storage);
    expect(listSkills(storage).map((skill) => skill.name)).toEqual(["Second", "First"]);
  });

  it("rejects an empty name or an empty prompt", () => {
    const storage = createMemoryStorage();
    expect(() => addSkill({ name: "  ", prompt: "text" }, storage)).toThrow("Give the skill a name.");
    expect(() => addSkill({ name: "Name", prompt: "  " }, storage)).toThrow("Write the prompt.");
  });

  it("removes one skill", () => {
    const storage = createMemoryStorage();
    const first = addSkill({ name: "First", prompt: "one" }, storage);
    addSkill({ name: "Second", prompt: "two" }, storage);
    expect(removeSkill(first.id, storage).map((skill) => skill.name)).toEqual(["Second"]);
  });

  it("stops at the limit", () => {
    const storage = createMemoryStorage();
    for (let index = 0; index < MAX_SKILLS; index += 1) {
      addSkill({ name: `Skill ${index}`, prompt: "text" }, storage);
    }
    expect(() => addSkill({ name: "One more", prompt: "text" }, storage)).toThrow(
      "keyrig holds 100 skills. Delete one first.",
    );
  });

  it("ignores a broken record", () => {
    const storage = createMemoryStorage();
    storage.setItem("keyrig.skills.v1", "not json");
    expect(listSkills(storage)).toEqual([]);
  });
});
