# providers

This package owns the provider layer (PV-01 to PV-10).

## Add a provider

1. Add one manifest to `src/builtins.ts`. Fill every field: id, display name, auth type, base URL,
   default model, abilities, wire format and reasoning format (PV-02).
2. Add one request rule to `src/rules.ts` when the wire format is new. Name the rule.
3. Do not change `core` and do not change the UI.

The data path has three steps (PV-03):

```text
request intent -> named rule -> wire format adapter
```

## Quirks

Put a provider quirk in the manifest or in one named rule. Do not put a quirk in the UI.
Do not put a quirk in the agent loop.

## Model names

Read model names and prices from the catalog (PV-01). Do not add a large hand-made table.
The bundled catalog is a boot fallback only. It holds a few default models.

## Tests

Use the recorded traffic in `src/tests/fixtures`. The tests need no key and no network (TS-01).
Each fallback rule needs a negative test (TS-03).
