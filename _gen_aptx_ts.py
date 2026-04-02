import csv, json

rows = []
with open('exported_data.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter='|')
    for r in reader:
        cat = r.get('Work_category','').strip().strip('"')
        grp = r.get('Product_group','').strip().strip('"')
        if cat in ('Warranty','Investigation') and grp in ('HUB','Powertrain'):
            rows.append({
                'r': r['Report_no'].strip(),
                'a': r['Assign_date'].strip(),
                'f': r['Finish_date'].strip(),
                'c': cat[0],  # 'I' or 'W'
                'g': grp[0],  # 'H' or 'P'
            })

rows.sort(key=lambda x: x['a'], reverse=True)

# Build TS file
lines = []
lines.append("export interface AptxRecord { r: string; a: string; f: string; c: 'I'|'W'; g: 'H'|'P'; }")
lines.append("")
lines.append("const DATA: AptxRecord[] = [")
for row in rows:
    f_val = f'"{row["f"]}"' if row['f'] else '""'
    lines.append(f'  {{r:"{row["r"]}",a:"{row["a"]}",f:{f_val},c:"{row["c"]}",g:"{row["g"]}"}},')
lines.append("];")
lines.append("")
lines.append("export default DATA;")

with open('frontend/src/pages/aptxData.ts', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(f"Generated {len(rows)} records -> frontend/src/pages/aptxData.ts")
