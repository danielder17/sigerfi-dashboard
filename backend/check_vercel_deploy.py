"""Verificar deploy de Vercel."""
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

r = urllib.request.urlopen("https://sigerfi-dashboard.vercel.app/admin", timeout=15, context=ctx)
html = r.read().decode("utf-8", errors="replace")

# Buscar señales del código nuevo
checks = {
    "Select inteligente proyecto": "Seleccionar proyecto" in html,
    "Select inteligente formulario": "Seleccionar formulario" in html,
    "Label Proyecto": "Proyecto" in html and "Formulario" in html,
    "Texto viejo (Cachear nuevo)": "Cachear nuevo formulario" in html,
    "Texto viejo (inputs)": 'id="projectId"' in html or 'id="formId"' in html,
}

print("=== Estado del frontend en Vercel ===")
for k, v in checks.items():
    print(f"  {'✅' if v else '❌'} {k}")

if checks["Select inteligente proyecto"]:
    print("\n🎉 Los selectores inteligentes ya están desplegados!")
else:
    print("\n⚠️  Vercel aún no despliega los cambios nuevos.")
    print("  Los deploys automáticos de Vercel tardan 1-2 minutos después del push.")
