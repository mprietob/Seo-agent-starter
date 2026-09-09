"""Offline shape validation only. Does not implement authentication or policy."""
import copy
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'contracts'))
try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    raise SystemExit('Install contracts/requirements-dev.txt into .tools/contracts first.')

folder = ROOT / 'contracts' / 'v1'
schema = json.loads((folder / 'schema.json').read_text(encoding='utf-8'))
Draft202012Validator.check_schema(schema)
checker = FormatChecker()
missing_formats = {'uuid', 'date-time', 'hostname'} - set(checker.checkers)
if missing_formats:
    raise SystemExit(f'Missing format validators: {sorted(missing_formats)}')

# Only internal references are allowed; validation never retrieves schemas.
def check_refs(value):
    if isinstance(value, dict):
        if '$ref' in value and not value['$ref'].startswith('#/'):
            raise ValueError('External reference forbidden in this offline contract bundle')
        for child in value.values():
            check_refs(child)
    elif isinstance(value, list):
        for child in value:
            check_refs(child)

check_refs(schema)
validator = Draft202012Validator(schema, format_checker=checker)
command_schema = {k: v for k, v in schema.items() if k != 'oneOf'}
command_schema['$ref'] = '#/$defs/Command'
command_validator = Draft202012Validator(command_schema, format_checker=checker)
examples = {p.stem: json.loads(p.read_text(encoding='utf-8')) for p in (folder / 'examples').glob('*.json')}
failures = []
checks = 0
for name, example in examples.items():
    checks += 1
    if not validator.is_valid(example):
        failures.append(f'Valid example rejected: {name}')
    # The ingress must validate Command, not the union of server records.
    checks += 1
    if command_validator.is_valid(example) != (example['record_type'] == 'Command'):
        failures.append(f'Incorrect command ingress shape: {name}')

for case in json.loads((folder / 'invalid-cases.json').read_text(encoding='utf-8')):
    instance = copy.deepcopy(examples[case['base']])
    parent = instance
    for key in case['path'][:-1]:
        parent = parent[key]
    if case.get('remove'):
        del parent[case['path'][-1]]
    else:
        parent[case['path'][-1]] = case['value']
    checks += 1
    if validator.is_valid(instance):
        failures.append(f'Invalid example accepted: {case["name"]}')

if failures:
    print('\n'.join(failures))
    raise SystemExit(1)
print(f'PASS: schema self-check, required formats, internal references and {checks} fixture/ingress checks.')
print('Scope: JSON shape only. Ownership, expiry, replay protection and side effects require service tests.')
