"""Verificar HTML de la pagina admin en Vercel."""
import urllib.request, ssl, re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

r = urllib.request.urlopen("https://sigerfi-dashboard.vercel.app/admin", timeout=15, context=ctx)
html = r.read().decode("utf-8", errors="replace")

searches = ["Administración", "Cachear", "Proyecto", "Seleccionar", "placeholder", "Formulario"]
print("=== Buscando en HTML de /admin ===")
for s in searches:
    count = html.lower().count(s.lower())
    print(f"  {'✅' if count > 0 else '❌'} '{s}': {count} ocurrencias")

# Buscar chunks de JS
chunks = re.findall(r'(/_next/static/chunks/[^"\']+)', html)
print(f"\nChunks JS: {len(chunks)}")
for c in chunks[:5]:
    print(f"  {c}")

# Ver tamanio del HTML
print(f"\nHTML size: {len(html)} bytes")
print(f"Primeros 300 chars: {html[:300]}")
