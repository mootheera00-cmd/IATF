import csv
from collections import defaultdict

rows = []
with open('exported_data.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter='|')
    for r in reader:
        cat = r.get('Work_category','').strip().strip('"')
        grp = r.get('Product_group','').strip().strip('"')
        if cat in ('Warranty','Investigation') and grp in ('HUB','Powertrain'):
            elapsed = r.get('Elapsed_days','').strip()
            assign = r.get('Assign_date','').strip()
            finish = r.get('Finish_date','').strip()
            if elapsed and finish and assign:
                try:
                    days = float(elapsed)
                    rows.append({'assign': assign, 'elapsed': days})
                except:
                    pass

# Group by fiscal month (Apr=start)
month_data = defaultdict(list)
for r in rows:
    m = int(r['assign'].split('-')[1])
    y = int(r['assign'].split('-')[0])
    # FY2025: Apr 2025 - Mar 2026
    if (y == 2025 and m >= 4) or (y == 2026 and m <= 3):
        month_names = {4:'Apr',5:'May',6:'Jun',7:'Jul',8:'Aug',9:'Sep',10:'Oct',11:'Nov',12:'Dec',1:'Jan',2:'Feb',3:'Mar'}
        month_data[month_names[m]].append(r['elapsed'])

order = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
for mo in order:
    vals = month_data.get(mo, [])
    if vals:
        avg = sum(vals)/len(vals)
        print(f'{mo}: avg={avg:.2f} ({len(vals)} reports)')
    else:
        print(f'{mo}: no data')
