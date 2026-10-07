import type { Rule, RuleTree } from "../types";
import { IconClose, IconPlus } from "./icons";
import { SegmentedControl } from "./ui";

type FieldType = "string" | "number" | "boolean";

const FIELDS: { id: string; label: string; type: FieldType }[] = [
  { id: "genre", label: "Genre", type: "string" },
  { id: "artist", label: "Artist", type: "string" },
  { id: "album", label: "Album", type: "string" },
  { id: "title", label: "Title", type: "string" },
  { id: "year", label: "Year", type: "number" },
  { id: "play_count", label: "Play count", type: "number" },
  { id: "is_favorite", label: "Is favorite", type: "boolean" },
];

const OPS_STRING = [
  { id: "contains", label: "contains" },
  { id: "equals", label: "equals" },
  { id: "not_contains", label: "doesn't contain" },
];

const OPS_NUMBER = [
  { id: "equals", label: "=" },
  { id: "gt", label: ">" },
  { id: "lt", label: "<" },
  { id: "gte", label: "≥" },
  { id: "lte", label: "≤" },
];

const OPS_BOOLEAN = [{ id: "equals", label: "is" }];

function fieldMeta(field: string) {
  return FIELDS.find((f) => f.id === field) ?? FIELDS[0];
}

function opsForField(field: string) {
  const { type } = fieldMeta(field);
  if (type === "number") return OPS_NUMBER;
  if (type === "boolean") return OPS_BOOLEAN;
  return OPS_STRING;
}

function blankRule(): Rule {
  return { field: "genre", op: "contains", value: "" };
}

export const EMPTY_RULE_TREE: RuleTree = { match: "all", rules: [blankRule()] };

interface Props {
  value: RuleTree;
  onChange: (tree: RuleTree) => void;
}

export function SmartPlaylistBuilder({ value, onChange }: Props) {
  const setMatch = (match: "all" | "any") => onChange({ ...value, match });

  const updateRule = (i: number, patch: Partial<Rule>) => {
    const rules = value.rules.map((r, idx) => {
      if (idx !== i) return r;
      const updated = { ...r, ...patch };
      if ("field" in patch && patch.field !== undefined) {
        const ops = opsForField(patch.field);
        updated.op = ops[0].id;
        const { type } = fieldMeta(patch.field);
        updated.value = type === "boolean" ? "true" : type === "number" ? 0 : "";
      }
      return updated;
    });
    onChange({ ...value, rules });
  };

  const addRule = () => onChange({ ...value, rules: [...value.rules, blankRule()] });

  const removeRule = (i: number) =>
    onChange({ ...value, rules: value.rules.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">Match</span>
        <SegmentedControl
          value={value.match}
          onChange={setMatch}
          options={[
            { id: "all", label: "All rules" },
            { id: "any", label: "Any rule" },
          ]}
        />
      </div>

      <div className="space-y-2">
        {value.rules.map((rule, i) => {
          const meta = fieldMeta(rule.field);
          const ops = opsForField(rule.field);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                className="input !w-auto"
                value={rule.field}
                onChange={(e) => updateRule(i, { field: e.target.value })}
              >
                {FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>

              <select
                className="input !w-auto"
                value={rule.op}
                onChange={(e) => updateRule(i, { op: e.target.value })}
              >
                {ops.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              {meta.type === "boolean" ? (
                <select
                  className="input !w-auto"
                  value={String(rule.value)}
                  onChange={(e) => updateRule(i, { value: e.target.value })}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : meta.type === "number" ? (
                <input
                  type="number"
                  className="input min-w-20 flex-1"
                  value={rule.value as number}
                  onChange={(e) => updateRule(i, { value: Number(e.target.value) })}
                />
              ) : (
                <input
                  type="text"
                  className="input min-w-24 flex-1"
                  placeholder="Value…"
                  value={rule.value as string}
                  onChange={(e) => updateRule(i, { value: e.target.value })}
                />
              )}

              {value.rules.length > 1 && (
                <button
                  type="button"
                  className="btn-icon !h-8 !w-8 text-muted hover:text-danger"
                  onClick={() => removeRule(i)}
                  title="Remove rule"
                >
                  <IconClose size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn-ghost text-xs" onClick={addRule}>
        <IconPlus size={14} />
        Add rule
      </button>
    </div>
  );
}
