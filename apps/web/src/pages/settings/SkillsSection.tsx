import { useState } from "react";
import { navigate } from "../../app/router";
import { requestPromptUse } from "../../lib/pendingPrompt";
import { addSkill, listSkills, removeSkill, SKILL_NAME_LIMIT, SKILL_PROMPT_LIMIT } from "../../stores/skills";
import { Icon } from "../../components/ui/Icon";
import { Section } from "./Section";

export function SkillsSection() {
  const [skills, setSkills] = useState(() => listSkills());
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = (): void => {
    try {
      addSkill({ name, prompt });
      setSkills(listSkills());
      setName("");
      setPrompt("");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "keyrig cannot save the skill.");
    }
  };

  return (
    <Section
      id="skills"
      eyebrow="Skills"
      title="Saved prompts"
      text="Write a prompt once. Then send it from any chat."
    >
      <div className="field">
        <label htmlFor="skill-name">Name</label>
        <input
          id="skill-name"
          className="input"
          value={name}
          maxLength={SKILL_NAME_LIMIT}
          placeholder="For example: review a pull request"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="skill-prompt">Prompt</label>
        <textarea
          id="skill-prompt"
          className="textarea"
          rows={3}
          value={prompt}
          maxLength={SKILL_PROMPT_LIMIT}
          placeholder="Write the instruction that the chat sends."
          onChange={(event) => setPrompt(event.target.value)}
        />
        <p className="hint">
          {prompt.length} of {SKILL_PROMPT_LIMIT} characters.
        </p>
      </div>

      {error ? <p className="inline-error callout">{error}</p> : null}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={add}>
          <Icon name="plus" size={14} />
          Add the skill
        </button>
      </div>

      {skills.length === 0 ? (
        <p className="settings-empty">No skills yet.</p>
      ) : (
        <ul className="settings-list">
          {skills.map((skill) => (
            <li key={skill.id} className="settings-item">
              <div className="settings-item-main">
                <strong>{skill.name}</strong>
                <p>{skill.prompt}</p>
              </div>
              <div className="settings-item-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    requestPromptUse(skill.prompt);
                    navigate("/app");
                  }}
                >
                  <Icon name="arrow" size={12} />
                  Use in chat
                </button>
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  onClick={() => setSkills(removeSkill(skill.id))}
                >
                  <Icon name="trash" size={12} />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
