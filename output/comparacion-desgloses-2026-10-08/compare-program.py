import collections
import datetime
import difflib
import json
import pathlib
import unicodedata
from zoneinfo import ZoneInfo
import openpyxl

ROOT = pathlib.Path(__file__).parent
DOWNLOADS = pathlib.Path('C:/Users/felix/Downloads')
TARGET = DOWNLOADS / 'PROGRAMA LARENA TORRE H_2026.xlsx'

def normalize(value):
    value = str(value or '')
    return ' '.join(unicodedata.normalize('NFC', value).upper().split())

def key(row):
    return (normalize(row['partida']), normalize(row['familia']))

def date(value):
    return value.isoformat()[:10] if isinstance(value, (datetime.datetime, datetime.date)) else value

def extract(path):
    workbook = openpyxl.load_workbook(path, data_only=True)
    sheet = workbook['Torre I']
    headers = {normalize(cell.value): cell.column for cell in sheet[1] if cell.value}
    parent = ''
    rows = []
    parents = []
    for cells in sheet.iter_rows(min_row=2):
        level = cells[0].value
        if level == 1:
            parent = cells[1].value or ''
            parents.append({'row': cells[0].row, 'partida': parent})
        elif level == 2 and cells[2].value:
            rows.append({
                'row': cells[0].row, 'partida': cells[1].value or parent, 'familia': cells[2].value,
                'fecha_inicio': date(cells[headers['FECHA INICIO'] - 1].value),
                'fecha_fin': date(cells[headers['FECHA FIN'] - 1].value),
            })
    return {'file': str(path), 'sheet': sheet.title, 'parents': parents, 'rows': rows}

target = extract(TARGET)
reference = json.loads((ROOT / 'program-reference.json').read_text(encoding='utf-8'))
comparisons = []

def compare(label, source, rows):
    source_keys = {key(r) for r in rows}
    target_keys = {key(r) for r in target['rows']}
    new = [r for r in target['rows'] if key(r) not in source_keys]
    absent = [r for r in rows if key(r) not in target_keys]
    aliases = []
    for row in new:
        similar = [(difflib.SequenceMatcher(None, normalize(row['familia']), normalize(old['familia'])).ratio(), old) for old in absent if normalize(row['partida']) == normalize(old['partida'])]
        similar.sort(key=lambda x: -x[0])
        if similar and similar[0][0] >= 0.65:
            aliases.append({'current': row, 'previous': similar[0][1], 'similarity': round(similar[0][0], 3)})
    comparisons.append({'label': label, 'source': source, 'source_count': len(rows), 'matched': len(target['rows']) - len(new), 'new': new, 'absent': absent, 'possible_renames': aliases})

for project in reference['projects']:
    rows = [r for r in project['details'] if r.get('nivel') == 2 and not r.get('archived') and r.get('orden') is not None]
    compare(project['name'] + ' (dashboard)', reference['deployment'], rows)
    batches = collections.defaultdict(list)
    for row in rows:
        created = datetime.datetime.fromtimestamp(row['_creationTime'] / 1000, ZoneInfo('America/Mexico_City')).isoformat(timespec='seconds')
        batches[created[:10]].append({'partida': row['partida'], 'familia': row['familia'], 'created': created})
    print(project['name'], 'active schedule details', len(rows), 'creation days', {d: len(rs) for d, rs in sorted(batches.items())})
    if project['name'].endswith('Torre H'):
        print('Most recent H creations', sorted(batches.items())[-1])
for path in sorted(DOWNLOADS.glob('PRESUPUESTO LARENA TORRE I _PROGRAMA [67]*.xlsx')):
    source = extract(path)
    compare(path.name, source['file'], source['rows'])
result = {'target': target, 'reference_read_at': reference['readAt'], 'comparisons': comparisons}
(ROOT / 'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('Target:', len(target['parents']), 'partidas,', len(target['rows']), 'desgloses')
for comparison in comparisons:
    print('\nBASELINE', comparison['label'], 'previous', comparison['source_count'], 'matched', comparison['matched'], 'new', len(comparison['new']), 'absent', len(comparison['absent']))
    print('New:', [(r['row'], r['partida'], r['familia']) for r in comparison['new']])
    print('Possible renames:', [(r['current']['familia'], r['previous']['familia'], r['similarity']) for r in comparison['possible_renames']])
