# OAuth Setup-Anleitung

## Supabase Dashboard Konfiguration

### 1. Google OAuth Provider aktivieren

1. Gehe zu deinem Supabase Dashboard
2. Navigiere zu **Authentication** → **Providers**
3. Aktiviere **Google**
4. Trage deine Google OAuth Credentials ein (Client ID & Client Secret)
5. **WICHTIG**: Füge folgende Redirect URLs hinzu:

#### Redirect URLs (alle müssen eingetragen werden):

```
https://DEIN-PROJEKT-ID.supabase.co/auth/v1/callback
https://deine-domain.com/auth/callback
http://localhost:5173/auth/callback
```

Ersetze dabei:
- `DEIN-PROJEKT-ID` mit deiner echten Supabase Projekt-ID
- `deine-domain.com` mit deiner Produktions-Domain (z.B. `tuli-app.vercel.app`)

### 2. Google Cloud Console Konfiguration

1. Gehe zu https://console.cloud.google.com
2. Navigiere zu **APIs & Services** → **Credentials**
3. Wähle deine OAuth 2.0 Client ID aus
4. Unter **Authorized redirect URIs** füge hinzu:

```
https://DEIN-PROJEKT-ID.supabase.co/auth/v1/callback
```

### 3. Test

Nach der Konfiguration:

1. Öffne deine App
2. Klicke auf "Mit Google anmelden"
3. Nach erfolgreicher Anmeldung bei Google solltest du automatisch in der App eingeloggt sein
4. Falls du kein Profil hattest, wird automatisch eins erstellt

## Wie es funktioniert

1. **User klickt auf Google-Button** → Redirect zu Google OAuth
2. **Google authentifiziert** → Redirect zurück zu `/auth/callback` mit `code` Parameter
3. **OAuthCallbackHandler** fängt den Callback ab
4. **exchangeCodeForSession** tauscht den Code gegen eine Session
5. **Profil-Erstellung** (falls neuer User)
6. **Redirect zur App** → User ist eingeloggt

## Debugging

Falls Probleme auftreten, prüfe die Browser-Console. Alle OAuth-Schritte werden mit `[OAuth]` geloggt:

- `[OAuth] Processing callback with code:...` → Callback wird verarbeitet
- `[OAuth] Session established successfully` → Session erfolgreich erstellt
- `[OAuth] Creating profile for new user` → Profil wird erstellt
- `[OAuth] Exchange error:...` → Fehler beim Code-Austausch

## Häufige Fehler

### "redirect_uri_mismatch"
→ Die Redirect URL in Google Cloud Console stimmt nicht mit der konfigurierten URL überein.
→ Lösung: Überprüfe, dass alle URLs exakt übereinstimmen (inkl. Trailing Slashes)

### "User bleibt auf Login Screen"
→ Der OAuth Callback wurde nicht korrekt verarbeitet
→ Lösung: Prüfe Browser Console Logs und stelle sicher dass `OAuthCallbackHandler` korrekt eingebunden ist

### "Session not found" 
→ Die Session wurde nicht korrekt erstellt
→ Lösung: Stelle sicher dass `exchangeCodeForSession` erfolgreich durchläuft
