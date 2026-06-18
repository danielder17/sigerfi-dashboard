import re

with open(r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\frontend\src\components\charts-section.tsx', 'r', encoding='utf-8') as f:
    txt = f.read()

txt = txt.replace(
    'const echarts = (await import("echarts")).default;',
    'const {init: eInit} = (await import("echarts"));'
)

txt = txt.replace('echarts.init(', 'eInit(')

with open(r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\frontend\src\components\charts-section.tsx', 'w', encoding='utf-8') as f:
    f.write(txt)

print('Fixed')
