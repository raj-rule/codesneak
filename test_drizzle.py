import sys
sys.path.insert(0, '.')
from core.parser import parse_file
import re

filepath = r'C:\Users\raj\OneDrive\Desktop\syncbold\syncbold-app\server\src\db\schema.ts'
tree, code, lang = parse_file(filepath)
code_str = code.decode('utf-8', errors='ignore')

tables = []
lines_raw = code_str.splitlines()
in_table = False
table_name = ''
columns = []

for raw_line in lines_raw:
    line_str = raw_line.strip()
    if not line_str or line_str.startswith('//'):
        continue
    if not in_table:
        tbl_match = re.match(r'export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:pg|mysql|sqlite)Table\(', line_str)
        if tbl_match:
            in_table = True
            table_name = tbl_match.group(1)
            columns = []
            continue
    if in_table:
        if line_str.startswith('});') or line_str.startswith('},'):
            tables.append({'table': table_name, 'columns': columns})
            in_table = False
            continue
        if ':' in line_str and '(' in line_str:
            col_name = line_str.split(':')[0].strip()
            is_pk = '.primaryKey()' in line_str
            is_fk = '.references(' in line_str
            columns.append({'name': col_name, 'isPrimaryKey': is_pk, 'isForeignKey': is_fk})

print("Extracted", len(tables), "tables:")
for t in tables:
    cols = t['columns']
    print(" ", t['table'], "->", len(cols), "cols:", [c['name'] for c in cols[:5]])
