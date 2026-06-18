"""Debug de config."""
import sys
sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')
from config import ODK_DEFAULT_URL
print(f"URL = {repr(ODK_DEFAULT_URL)}")
print(f"Email = {repr(ODK_DEFAULT_EMAIL)}")
